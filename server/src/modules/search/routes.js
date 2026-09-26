// [A] ค้นหา & หน้าโรงแรม
import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// 1. GET /api/hotels — ค้นหาโรงแรม พร้อม filter (เมือง, ราคา, ดาว) และ sort
router.get('/', async (req, res, next) => {
  try {
    const { city, minPrice, maxPrice, stars, sort } = req.query;

    let query = `
      SELECT 
        p.property_id AS id, 
        p.name, 
        p.city, 
        p.address,
        p.star_rating AS stars,
        COALESCE(MIN(r.base_price_per_night), 0)::float AS min_price
      FROM properties p
      LEFT JOIN rooms r ON r.property_id = p.property_id
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    // Filter ตามเมือง
    if (city) {
      query += ` AND p.city ILIKE $${paramIndex}`;
      values.push(`%${city}%`);
      paramIndex++;
    }

    // Filter ตามดาว
    if (stars) {
      query += ` AND p.star_rating >= $${paramIndex}`;
      values.push(Number(stars));
      paramIndex++;
    }

    query += ` GROUP BY p.property_id`;

    // Filter ตามราคา
    if (minPrice && maxPrice) {
      query += ` HAVING MIN(r.base_price_per_night) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      values.push(Number(minPrice), Number(maxPrice));
      paramIndex += 2;
    } else if (minPrice) {
      query += ` HAVING MIN(r.base_price_per_night) >= $${paramIndex}`;
      values.push(Number(minPrice));
      paramIndex++;
    } else if (maxPrice) {
      query += ` HAVING MIN(r.base_price_per_night) <= $${paramIndex}`;
      values.push(Number(maxPrice));
      paramIndex++;
    }

    // Sorting
    if (sort === 'price_asc') {
      query += ` ORDER BY min_price ASC`;
    } else if (sort === 'price_desc') {
      query += ` ORDER BY min_price DESC`;
    } else if (sort === 'stars_desc') {
      query += ` ORDER BY p.star_rating DESC`;
    } else {
      query += ` ORDER BY p.property_id ASC`;
    }

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/hotels/:id — ดึงรายละเอียดโรงแรม 1 แห่ง + ห้องพัก
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const hotelResult = await pool.query(
      `SELECT property_id AS id, name, property_type, description, country, city, address, star_rating AS stars 
       FROM properties 
       WHERE property_id = $1`,
      [id]
    );

    if (hotelResult.rows.length === 0) {
      const error = new Error('ไม่พบข้อมูลโรงแรม');
      error.status = 404;
      throw error;
    }

    const roomsResult = await pool.query(
      `SELECT room_id AS id, room_type_name AS name, description, max_guests AS capacity, base_price_per_night AS price_per_night 
       FROM rooms 
       WHERE property_id = $1 
       ORDER BY base_price_per_night ASC`,
      [id]
    );

    const hotelData = {
      ...hotelResult.rows[0],
      rooms: roomsResult.rows,
    };

    res.json(hotelData);
  } catch (err) {
    next(err);
  }
});

export default router;