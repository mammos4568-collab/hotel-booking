// [A] ค้นหา & หน้าโรงแรม
import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// GET /api/hotels?city=Bangkok — ตัวอย่างที่ทำงานได้จริง (walking skeleton)
router.get('/', async (req, res, next) => {
  try {
    const { city } = req.query;
    const { rows } = await pool.query(
      `SELECT h.id, h.name, h.city, h.stars,
              MIN(rt.price_per_night)::float AS min_price
         FROM hotels h
         JOIN room_types rt ON rt.hotel_id = h.id
        WHERE ($1::text IS NULL OR h.city ILIKE $1)
        GROUP BY h.id
        ORDER BY h.id`,
      [city || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// TODO(A): GET /api/hotels/:id — รายละเอียดโรงแรม + ประเภทห้อง
// TODO(A): filter วันที่/จำนวนคน/ราคา/ดาว, sort, pagination

export default router;
