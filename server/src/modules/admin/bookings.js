// หลังบ้าน: การจอง — /api/admin/bookings (owner เห็นเฉพาะการจองของโรงแรมตัวเอง)
// ข้อมูลผู้เข้าพัก (ชื่อ อีเมล เบอร์) แสดงให้ที่พักเห็นเพื่อให้บริการการเข้าพัก = ฐาน "ปฏิบัติตามสัญญา" (PDPA)
import { Router } from 'express';
import { pool } from '../../db.js';
import { BOOKING_SELECT, BOOKING_STATUS_SQL, cancelBooking, findBooking, serializeBooking } from '../../lib/bookings.js';
import { isValidDate } from '../../lib/dates.js';
import { logAction } from './audit.js';
import { httpError, isAdmin, ownedBy, readId, withTransaction } from './scope.js';
import { readText } from './validate.js';

const router = Router();
const PAGE_SIZE = 20;
const STATUSES = ['awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired'];

// GET /api/admin/bookings?status=&hotelId=&q=&from=&to=&page=
//   from/to = ช่วงวันเช็กอิน · q = เลขที่การจอง หรือชื่อ/อีเมลผู้เข้าพัก
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [ownedBy(req, params)];
    if (STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      where.push(`AND (${BOOKING_STATUS_SQL}) = $${params.length}`);
    }
    if (req.query.hotelId) {
      params.push(readId(req.query.hotelId, 'รหัสโรงแรม'));
      where.push(`AND b.property_id = $${params.length}`);
    }
    if (isValidDate(req.query.from)) {
      params.push(req.query.from);
      where.push(`AND b.check_in_date >= $${params.length}`);
    }
    if (isValidDate(req.query.to)) {
      params.push(req.query.to);
      where.push(`AND b.check_in_date <= $${params.length}`);
    }
    const q = String(req.query.q ?? '').trim().slice(0, 100);
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      where.push(`AND (b.booking_reference ILIKE $${params.length} OR b.guest_name ILIKE $${params.length} OR b.guest_email ILIKE $${params.length})`);
    }
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 1000);
    params.push((page - 1) * PAGE_SIZE);

    // BOOKING_SELECT ใช้ร่วมกับฝั่งลูกค้า → สถานะ/ข้อมูลตรงกันทุกหน้า · COUNT(*) OVER () = จำนวนทั้งหมดสำหรับแบ่งหน้า
    const { rows } = await pool.query(
      `SELECT listing.*, COUNT(*) OVER () AS total_count
         FROM (${BOOKING_SELECT} WHERE TRUE ${where.join(' ')}) listing
        ORDER BY listing.check_in DESC, listing.booking_id DESC
        LIMIT ${PAGE_SIZE} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      bookings: rows.map(serializeBooking),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (error) {
    next(error);
  }
});

// โหลดการจอง 1 รายการ + ตรวจว่าเป็นของโรงแรมเรา (admin ดูได้ทุกรายการ)
async function loadOwnBooking(db, req, bookingId) {
  const row = await findBooking(db, bookingId);
  if (!row) throw httpError(404, 'ไม่พบการจองนี้');
  if (!isAdmin(req)) {
    const { rows: [hotel] } = await db.query('SELECT owner_id FROM properties WHERE property_id = $1', [row.property_id]);
    if (hotel?.owner_id !== req.user.id) throw httpError(403, 'การจองนี้ไม่ใช่ของโรงแรมคุณ');
  }
  return row;
}

// GET /api/admin/bookings/:id — รายละเอียด + ประวัติการชำระเงินทุกครั้ง (รวมที่ไม่สำเร็จ)
router.get('/:id', async (req, res, next) => {
  try {
    const bookingId = readId(req.params.id, 'เลขการจอง');
    const row = await loadOwnBooking(pool, req, bookingId);
    const { rows: payments } = await pool.query(
      `SELECT payment_id, method, card_last4, amount::float AS amount, status, paid_at,
              gateway_charge_id IS NOT NULL AS via_gateway
         FROM payments WHERE booking_id = $1 ORDER BY paid_at DESC`,
      [bookingId],
    );
    res.json({
      booking: {
        ...serializeBooking(row),
        payments: payments.map((p) => ({
          id: p.payment_id, method: p.method, cardLast4: p.card_last4, amount: p.amount, status: p.status, paidAt: p.paid_at,
          viaGateway: p.via_gateway,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/bookings/:id/cancel  body: { reason }
// หลังบ้านยกเลิกให้ (เช่น ที่พักปิดปรับปรุง) — จ่ายแล้วคืนเงินเต็มจำนวน
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const bookingId = readId(req.params.id, 'เลขการจอง');
    const reason = readText(req.body?.reason, 'เหตุผลการยกเลิก', { min: 5, max: 300, required: true });
    const result = await withTransaction(pool, async (client) => {
      // 🔒 ล็อกแถวการจอง — กันชนกับลูกค้าที่กำลังกดจ่ายเงิน/ยกเลิกเองพร้อมกัน (เหมือนใน modules/booking)
      await client.query('SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
      const row = await loadOwnBooking(client, req, bookingId);
      const status = serializeBooking(row).status;
      if (!['awaiting_payment', 'confirmed'].includes(status)) {
        throw httpError(409, status === 'completed' ? 'การจองนี้เข้าพักเสร็จแล้ว ยกเลิกไม่ได้' : 'การจองนี้ถูกยกเลิกหรือหมดเวลาไปแล้ว');
      }
      const { refunded } = await cancelBooking(client, row);
      // เหตุผลเขียนโดยพนักงาน — แนะนำในหน้าเว็บว่าห้ามใส่ข้อมูลส่วนตัวของลูกค้า
      await logAction(client, req, 'booking.cancel', bookingId, { hotelId: row.property_id, refunded, reason });
      return { refunded };
    });
    res.json({ booking: serializeBooking(await findBooking(pool, bookingId)), ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
