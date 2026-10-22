// ============================================================
// สิทธิของเจ้าของข้อมูลตาม PDPA — ขอสำเนาข้อมูล และลบบัญชี
// ============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';
import { clearAuthCookie, requireAuth } from '../../middleware/auth.js';
import { ACTIVE_BOOKING_SQL } from '../../lib/availability.js';
import { todayInBangkok } from '../../lib/dates.js';
import { rateLimit } from '../../lib/rateLimit.js';

const router = Router();
const exportLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5 });
const deleteLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });
export const DELETE_CONFIRM_TEXT = 'ลบบัญชี';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ---------------------------------------------------------------------------
// GET /api/privacy/export — ข้อมูลส่วนบุคคลทั้งหมดของผู้ใช้ เป็น JSON (สิทธิขอรับสำเนา / โอนย้ายข้อมูล)
// ---------------------------------------------------------------------------
router.get('/export', requireAuth, exportLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [profile, accounts, bookings, payments, reviews, favorites, ownedHotels, adminActions] = await Promise.all([
      pool.query(
        `SELECT first_name, last_name, email, phone_number, avatar_url, role, membership_tier,
                created_at, updated_at
           FROM users WHERE user_id = $1`,
        [userId]
      ),
      pool.query('SELECT provider, created_at FROM oauth_accounts WHERE user_id = $1 ORDER BY provider', [userId]),
      pool.query(
        `SELECT b.booking_reference AS reference, p.name AS hotel, r.room_type_name AS room,
                b.check_in_date::text AS check_in, b.check_out_date::text AS check_out,
                b.num_guests AS guests, b.total_amount::float AS total_amount,
                b.payment_status, b.booking_status, b.guest_name, b.guest_email, b.guest_phone,
                b.special_requests, b.created_at
           FROM bookings b
           LEFT JOIN properties p ON p.property_id = b.property_id
           LEFT JOIN rooms r ON r.room_id = b.room_id
          WHERE b.user_id = $1
          ORDER BY b.created_at`,
        [userId]
      ),
      pool.query(
        `SELECT b.booking_reference AS reference, pay.method, pay.card_last4, pay.amount::float AS amount,
                pay.status, pay.paid_at
           FROM payments pay JOIN bookings b ON b.booking_id = pay.booking_id
          WHERE b.user_id = $1
          ORDER BY pay.paid_at`,
        [userId]
      ),
      pool.query(
        `SELECT p.name AS hotel, rv.rating::float AS rating, rv.comment, rv.created_at, rv.updated_at
           FROM reviews rv LEFT JOIN properties p ON p.property_id = rv.property_id
          WHERE rv.user_id = $1
          ORDER BY rv.created_at`,
        [userId]
      ),
      pool.query(
        `SELECT p.name AS hotel, f.created_at AS saved_at
           FROM favorites f JOIN properties p ON p.property_id = f.property_id
          WHERE f.user_id = $1
          ORDER BY f.created_at`,
        [userId]
      ),
      // หลังบ้าน: โรงแรมที่เป็นเจ้าของ + สิ่งที่ทำในหลังบ้าน (บันทึกการทำงาน)
      pool.query('SELECT property_id AS id, name FROM properties WHERE owner_id = $1 ORDER BY property_id', [userId]),
      pool.query(
        `SELECT action, entity_id, detail, created_at FROM admin_audit_log WHERE user_id = $1 ORDER BY created_at`,
        [userId]
      ),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      note: 'ข้อมูลส่วนบุคคลทั้งหมดที่ระบบเก็บเกี่ยวกับคุณ — ไม่มีรหัสผ่านและเลขบัตรเต็ม เพราะระบบไม่เก็บ',
      profile: profile.rows[0] ?? null,
      linkedSignIns: accounts.rows,
      bookings: bookings.rows,
      payments: payments.rows,
      reviews: reviews.rows,
      favorites: favorites.rows,
      ownedHotels: ownedHotels.rows,
      adminActions: adminActions.rows,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/privacy/account — ลบบัญชี (สิทธิขอให้ลบข้อมูล)
// body: { password } สำหรับบัญชีที่มีรหัสผ่าน · { confirm: 'ลบบัญชี' } เสมอ
//
// สิ่งที่เกิดขึ้น:
//   - ลบแถวผู้ใช้ + บัญชี Google/Facebook/GitHub ที่เชื่อมไว้ + รายการโปรด (ON DELETE CASCADE)
//   - การจองเก่า "ไม่ลบ" เพราะเป็นหลักฐานทางบัญชี แต่ลบข้อมูลที่ระบุตัวตนออก
//     (ชื่อ อีเมล เบอร์ คำขอพิเศษ และตัดความเชื่อมโยงกับบัญชี) → ระบุตัวตนไม่ได้แล้ว
//   - รีวิวยังแสดงอยู่ แต่ไม่ผูกกับบัญชีแล้ว (แสดงเป็น "ผู้เข้าพัก")
//   - เจ้าของโรงแรม: โรงแรมกลับไปให้ admin ดูแล (owner_id → NULL) · บันทึกการทำงานในหลังบ้านไม่ผูกกับบัญชีแล้ว
//   - admin คนสุดท้ายลบบัญชีไม่ได้ (ต้องตั้ง admin คนอื่นก่อน ไม่งั้นไม่เหลือใครจัดการหลังบ้าน)
// ---------------------------------------------------------------------------
router.delete('/account', requireAuth, deleteLimiter, async (req, res, next) => {
  if (String(req.body?.confirm ?? '').trim() !== DELETE_CONFIRM_TEXT) {
    return next(httpError(400, `กรุณาพิมพ์คำว่า "${DELETE_CONFIRM_TEXT}" เพื่อยืนยัน`));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 🔒 admin: ล็อกแถว admin ทุกคนก่อนนับ (ลำดับเดียวกับหน้าเปลี่ยนบทบาท modules/admin/users.js → ไม่เกิด deadlock)
    if (req.user.role === 'admin') {
      const { rows: admins } = await client.query(`SELECT user_id FROM users WHERE role = 'admin' FOR UPDATE`);
      if (admins.length <= 1 && admins[0]?.user_id === req.user.id) {
        throw httpError(409, 'คุณเป็นผู้ดูแลระบบคนสุดท้าย กรุณาตั้งผู้ดูแลระบบคนอื่นก่อนลบบัญชี');
      }
    }
    // 🔒 ล็อกแถวผู้ใช้ — กันไม่ให้มีการจองใหม่แทรกเข้ามาระหว่างลบ (การจองก็ล็อกแถวผู้ใช้ก่อนเหมือนกัน)
    const { rows: [user] } = await client.query(
      'SELECT user_id, password_hash FROM users WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!user) throw httpError(404, 'ไม่พบบัญชีผู้ใช้');

    // บัญชีที่มีรหัสผ่านต้องยืนยันด้วยรหัสผ่าน (กันคนอื่นที่แอบใช้เครื่องที่ล็อกอินค้างไว้)
    if (user.password_hash) {
      const password = req.body?.password;
      if (typeof password !== 'string' || !password) throw httpError(400, 'กรุณากรอกรหัสผ่านเพื่อยืนยัน');
      if (!(await bcrypt.compare(password, user.password_hash))) throw httpError(400, 'รหัสผ่านไม่ถูกต้อง');
    }

    // ยังมีการจองที่ยังไม่จบ → ให้ยกเลิกหรือรอให้เข้าพักเสร็จก่อน (ไม่งั้นที่พักติดต่อผู้เข้าพักไม่ได้)
    const { rows: [{ active }] } = await client.query(
      `SELECT COUNT(*)::int AS active FROM bookings b
        WHERE b.user_id = $1 AND b.check_out_date > $2 AND ${ACTIVE_BOOKING_SQL}`,
      [req.user.id, todayInBangkok()]
    );
    if (active > 0) {
      throw httpError(409, `คุณยังมีการจองที่ยังไม่เข้าพัก ${active} รายการ กรุณายกเลิกหรือรอให้เข้าพักเสร็จก่อนลบบัญชี`);
    }

    await client.query(
      `UPDATE bookings
          SET guest_name = NULL, guest_email = NULL, guest_phone = NULL, special_requests = NULL,
              user_id = NULL, updated_at = now()
        WHERE user_id = $1`,
      [req.user.id]
    );
    await client.query('UPDATE reviews SET user_id = NULL WHERE user_id = $1', [req.user.id]);
    await client.query('DELETE FROM users WHERE user_id = $1', [req.user.id]);
    await client.query('COMMIT');

    clearAuthCookie(res); // ออกจากระบบทันที
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

export default router;
