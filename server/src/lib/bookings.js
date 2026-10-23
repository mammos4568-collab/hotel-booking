// ============================================================
// อ่านการจอง + ข้อมูลโรงแรม/ห้อง/การชำระเงิน แล้วแปลงเป็นรูปแบบที่หน้าเว็บใช้
// ใช้ร่วมกันระหว่างฝั่งลูกค้า (modules/booking) และหลังบ้าน (modules/admin) — สถานะจะได้ตรงกันทุกหน้า
// ============================================================
import { HOLD_MINUTES } from './availability.js';
import { todayInBangkok } from './dates.js';
import { hotelCoverSql } from './hotelImages.js';
import { refundCharge, retrieveCharge } from './opn.js';

export const BOOKING_SELECT = `
  SELECT b.booking_id, b.booking_reference, b.user_id,
         b.booking_status, b.payment_status, b.created_at,
         b.check_in_date::text AS check_in, b.check_out_date::text AS check_out,
         (b.check_out_date - b.check_in_date) AS nights, b.num_guests, b.num_rooms,
         b.total_amount::float AS total_amount,
         b.guest_name, b.guest_email, b.guest_phone, b.special_requests,
         b.created_at + make_interval(mins => ${HOLD_MINUTES}) AS hold_expires_at,
         p.property_id, p.name AS hotel_name, p.city, p.address, ${hotelCoverSql('p')} AS hotel_image,
         r.room_id, r.room_type_name, r.image_url AS room_image, r.bed_type, r.max_guests,
         pay.method AS payment_method, pay.card_last4, pay.paid_at,
         (rv.review_id IS NOT NULL) AS has_review
    FROM bookings b
    LEFT JOIN properties p ON p.property_id = b.property_id
    LEFT JOIN rooms r ON r.room_id = b.room_id
    LEFT JOIN LATERAL (
      SELECT method, card_last4, paid_at FROM payments
       WHERE booking_id = b.booking_id AND status IN ('Success', 'Refunded') ORDER BY paid_at DESC LIMIT 1
    ) pay ON TRUE
    LEFT JOIN reviews rv ON rv.booking_id = b.booking_id`;

// สถานะที่หน้าเว็บใช้ — คำนวณจาก booking_status + payment_status + วันที่
//   awaiting_payment · confirmed · completed · cancelled · expired
export function deriveStatus(row, today = todayInBangkok()) {
  const booking = String(row.booking_status).toLowerCase();
  const payment = String(row.payment_status).toLowerCase();
  if (booking === 'cancelled') return payment === 'expired' ? 'expired' : 'cancelled';
  if (payment === 'pending') return new Date(row.hold_expires_at) <= new Date() ? 'expired' : 'awaiting_payment';
  if (booking === 'completed' || row.check_out <= today) return 'completed';
  return 'confirmed';
}

// สถานะเดียวกับ deriveStatus() แต่เขียนเป็น SQL — ใช้กรอง/นับในฐานข้อมูล (หลังบ้าน) ได้โดยไม่ต้องดึงทุกแถวมาคิดใน JS
// (ใช้ alias `b` ของตาราง bookings · "วันนี้" = วันตามเวลาไทย)
export const BOOKING_STATUS_SQL = `
  CASE
    WHEN LOWER(b.booking_status) = 'cancelled' AND LOWER(b.payment_status) = 'expired' THEN 'expired'
    WHEN LOWER(b.booking_status) = 'cancelled' THEN 'cancelled'
    WHEN LOWER(b.payment_status) = 'pending'
         AND b.created_at + make_interval(mins => ${HOLD_MINUTES}) <= now() THEN 'expired'
    WHEN LOWER(b.payment_status) = 'pending' THEN 'awaiting_payment'
    WHEN LOWER(b.booking_status) = 'completed'
         OR b.check_out_date <= (now() AT TIME ZONE 'Asia/Bangkok')::date THEN 'completed'
    ELSE 'confirmed'
  END`;

export function serializeBooking(row) {
  const today = todayInBangkok();
  const status = deriveStatus(row, today);
  return {
    id: row.booking_id,
    reference: row.booking_reference,
    status,
    bookingStatus: row.booking_status,
    paymentStatus: row.payment_status,
    hotelId: row.property_id,
    hotel: {
      id: row.property_id,
      name: row.hotel_name,
      city: row.city,
      address: row.address,
      imageUrl: row.hotel_image,
    },
    room: {
      id: row.room_id,
      name: row.room_type_name,
      imageUrl: row.room_image,
      bedType: row.bed_type,
      maxGuests: row.max_guests,
    },
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    guests: row.num_guests,
    rooms: row.num_rooms,
    totalAmount: row.total_amount,
    guest: { name: row.guest_name, email: row.guest_email, phone: row.guest_phone },
    specialRequests: row.special_requests,
    createdAt: row.created_at,
    holdExpiresAt: status === 'awaiting_payment' ? row.hold_expires_at : null,
    payment: row.payment_method
      ? { method: row.payment_method, cardLast4: row.card_last4, paidAt: row.paid_at }
      : null,
    hasReview: row.has_review,
    canPay: status === 'awaiting_payment',
    canCancel: ['awaiting_payment', 'confirmed'].includes(status) && row.check_in > today,
    canReview: status === 'completed' && !row.has_review && String(row.payment_status).toLowerCase() === 'paid',
  };
}

export async function findBooking(db, bookingId) {
  const { rows } = await db.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [bookingId]);
  return rows[0] || null;
}

// ยกเลิกการจอง (+ คืนเงินถ้าจ่ายแล้ว) — ต้องเรียกใน transaction ที่ล็อกแถวการจองไว้แล้ว (SELECT ... FOR UPDATE)
// ใช้ทั้งลูกค้ายกเลิกเอง และหลังบ้านยกเลิกให้ (เช่น ที่พักมีปัญหา)
export async function cancelBooking(client, row) {
  const wasPaid = String(row.payment_status).toLowerCase() === 'paid';
  if (wasPaid) {
    // จ่ายผ่าน payment gateway จริง (Opn) → สั่งคืนเงินที่ gateway "ก่อน" แก้ฐานข้อมูล
    // ถ้าคืนเงินไม่สำเร็จจะ throw → ROLLBACK ทั้ง transaction การจองยังไม่ถูกยกเลิก
    // (ไม่มีทางเกิด "ยกเลิกแล้วแต่เงินไม่คืน") — ผู้ใช้ลองกดยกเลิกใหม่ได้
    const { rows: gatewayPayments } = await client.query(
      `SELECT gateway_charge_id, amount FROM payments
        WHERE booking_id = $1 AND status = 'Success' AND gateway_charge_id IS NOT NULL
          FOR UPDATE`,
      [row.booking_id]
    );
    for (const payment of gatewayPayments) {
      // ถาม Opn ก่อนว่าคืนไปแล้วหรือยัง (เช่น รอบก่อนสั่งคืนสำเร็จแต่ COMMIT ไม่ผ่าน) → ไม่สั่งคืนซ้ำ
      const charge = await retrieveCharge(payment.gateway_charge_id);
      if ((charge.refunded_amount ?? 0) < charge.amount) await refundCharge(payment.gateway_charge_id, payment.amount);
    }
  }
  await client.query(
    `UPDATE bookings
        SET booking_status = 'Cancelled',
            payment_status = CASE WHEN $2 THEN 'Refunded' ELSE payment_status END,
            updated_at = now()
      WHERE booking_id = $1`,
    [row.booking_id, wasPaid]
  );
  if (wasPaid) {
    await client.query(`UPDATE payments SET status = 'Refunded' WHERE booking_id = $1 AND status = 'Success'`, [row.booking_id]);
  }
  return { refunded: wasPaid };
}
