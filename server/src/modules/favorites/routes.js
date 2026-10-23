// รายการโปรด (กดหัวใจเก็บที่พักไว้ดูทีหลัง) — ต้องล็อกอิน และเห็นได้เฉพาะของตัวเอง (กรองด้วย req.user.id เสมอ)
//   GET    /api/favorites           ที่พักทั้งหมดที่กดหัวใจไว้ (ล่าสุดก่อน)
//   GET    /api/favorites/ids       แค่ id (หน้าเว็บใช้ระบายสีหัวใจบนการ์ดทุกหน้า)
//   PUT    /api/favorites/:hotelId  เพิ่ม — กดซ้ำได้ไม่ error (idempotent)
//   DELETE /api/favorites/:hotelId  เอาออก — ไม่มีอยู่แล้วก็ไม่ error
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { publicHotelSql } from '../../lib/hotelApproval.js';
import { hotelCoverSql } from '../../lib/hotelImages.js';
import { serializeHotel } from '../../lib/hotelSearch.js';
import { rateLimit } from '../../lib/rateLimit.js';

const router = Router();
const MAX_FAVORITES = 100; // กันการยิงเพิ่มไม่สิ้นสุด
const toggleLimiter = rateLimit({ windowMs: 60_000, max: 60 });

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readHotelId(value) {
  const id = Number(value);
  // id เป็น INT ในฐานข้อมูล — เกินช่วงถือว่าไม่ถูกต้อง (ไม่ปล่อยให้ DB error เป็น 500)
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) throw httpError(400, 'รหัสโรงแรมไม่ถูกต้อง');
  return id;
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.property_id, p.name, p.property_type, p.city, p.country, p.address, p.star_rating,
              ${hotelCoverSql('p')} AS image_url, p.amenities, rv.avg_rating, rv.review_count, pr.nightly_from, f.created_at AS saved_at
         FROM favorites f
         JOIN properties p ON p.property_id = f.property_id
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS review_count
             FROM reviews WHERE property_id = p.property_id
         ) rv ON TRUE
         LEFT JOIN LATERAL (
           SELECT MIN(base_price_per_night)::float AS nightly_from FROM rooms WHERE property_id = p.property_id
         ) pr ON TRUE
        WHERE f.user_id = $1 AND ${publicHotelSql('p')} -- โรงแรมที่ถูกระงับไม่แสดง (กลับมาเองเมื่ออนุมัติอีกครั้ง)
        ORDER BY f.created_at DESC`,
      [req.user.id],
    );
    res.json({
      hotels: rows.map((row) => ({
        ...serializeHotel(row),
        nightlyFrom: row.nightly_from === null ? null : Math.round(row.nightly_from),
        stayFrom: null,
        roomsLeft: null,
        savedAt: row.saved_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ids', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT property_id FROM favorites WHERE user_id = $1', [req.user.id]);
    res.json({ ids: rows.map((row) => row.property_id) });
  } catch (error) {
    next(error);
  }
});

router.put('/:hotelId', toggleLimiter, async (req, res, next) => {
  try {
    const hotelId = readHotelId(req.params.hotelId);
    // INSERT เฉพาะเมื่อโรงแรมมีจริงและยังไม่เกินเพดาน · ON CONFLICT = กดซ้ำไม่ error
    const { rowCount } = await pool.query(
      `INSERT INTO favorites (user_id, property_id)
       SELECT $1, p.property_id FROM properties p
        WHERE p.property_id = $2 AND ${publicHotelSql('p')}
          AND (SELECT COUNT(*) FROM favorites WHERE user_id = $1) < $3
       ON CONFLICT (user_id, property_id) DO NOTHING`,
      [req.user.id, hotelId, MAX_FAVORITES],
    );
    if (!rowCount) {
      // ไม่ได้เพิ่ม → ดูว่าเพราะอะไร: มีอยู่แล้ว (ถือว่าสำเร็จ) / ไม่มีโรงแรมนี้ / เต็มเพดาน
      const { rows: [state] } = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM properties p WHERE p.property_id = $2 AND ${publicHotelSql('p')}) AS hotel_exists,
                EXISTS (SELECT 1 FROM favorites WHERE user_id = $1 AND property_id = $2) AS already_saved`,
        [req.user.id, hotelId],
      );
      if (!state.hotel_exists) throw httpError(404, 'ไม่พบข้อมูลโรงแรม');
      if (!state.already_saved) throw httpError(409, `บันทึกรายการโปรดได้สูงสุด ${MAX_FAVORITES} แห่ง`);
    }
    res.json({ hotelId, favorite: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:hotelId', toggleLimiter, async (req, res, next) => {
  try {
    const hotelId = readHotelId(req.params.hotelId);
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND property_id = $2', [req.user.id, hotelId]);
    res.json({ hotelId, favorite: false });
  } catch (error) {
    next(error);
  }
});

export default router;
