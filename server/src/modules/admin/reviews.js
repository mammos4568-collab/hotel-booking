// หลังบ้าน: รีวิว — /api/admin/reviews
//   owner ดูรีวิวของโรงแรมตัวเองได้ แต่ "ลบไม่ได้" (เจ้าของลบรีวิวไม่ดีของตัวเองได้ = ไม่ยุติธรรมกับลูกค้า)
//   admin ลบรีวิวที่ผิดกฎได้ (เช่น ข้อความไม่เหมาะสม สแปม) และมีบันทึกการทำงานไว้ตรวจสอบ
import { Router } from 'express';
import { pool } from '../../db.js';
import { publicDisplayName } from '../../lib/displayName.js';
import { logAction } from './audit.js';
import { httpError, isAdmin, ownedBy, readId, requireAdmin, withTransaction } from './scope.js';
import { readText } from './validate.js';

const router = Router();
const PAGE_SIZE = 20;

// GET /api/admin/reviews?hotelId=&maxRating=&page=
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [ownedBy(req, params)];
    if (req.query.hotelId) {
      params.push(readId(req.query.hotelId, 'รหัสโรงแรม'));
      where.push(`AND rv.property_id = $${params.length}`);
    }
    const maxRating = Number(req.query.maxRating);
    if (Number.isFinite(maxRating) && maxRating >= 1 && maxRating <= 5) {
      params.push(maxRating);
      where.push(`AND rv.rating <= $${params.length}`);
    }
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 1000);
    params.push((page - 1) * PAGE_SIZE);
    const { rows } = await pool.query(
      `SELECT rv.review_id, rv.rating::float AS rating, rv.comment, rv.created_at, rv.property_id,
              p.name AS hotel_name, b.booking_reference, u.first_name, u.last_name,
              COUNT(*) OVER () AS total_count
         FROM reviews rv
         JOIN properties p ON p.property_id = rv.property_id
         LEFT JOIN bookings b ON b.booking_id = rv.booking_id
         LEFT JOIN users u ON u.user_id = rv.user_id
        WHERE TRUE ${where.join(' ')}
        ORDER BY rv.created_at DESC, rv.review_id DESC
        LIMIT ${PAGE_SIZE} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      reviews: rows.map((row) => ({
        id: row.review_id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        hotel: { id: row.property_id, name: row.hotel_name },
        bookingReference: row.booking_reference,
        // ชื่อผู้รีวิว: แสดงแบบย่อเหมือนหน้าเว็บสาธารณะ (เปิดเผยข้อมูลส่วนบุคคลเท่าที่จำเป็น)
        reviewer: row.first_name ? publicDisplayName(row.first_name, row.last_name) : null,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      canDelete: isAdmin(req),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/reviews/:id  body: { reason } — admin เท่านั้น
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const reviewId = readId(req.params.id, 'รหัสรีวิว');
    const reason = readText(req.body?.reason, 'เหตุผลที่ลบ', { min: 5, max: 300, required: true });
    await withTransaction(pool, async (client) => {
      const { rows: [review] } = await client.query(
        'DELETE FROM reviews WHERE review_id = $1 RETURNING property_id, rating::float AS rating', [reviewId],
      );
      if (!review) throw httpError(404, 'ไม่พบรีวิวนี้');
      // ไม่เก็บข้อความรีวิวลงบันทึก (อาจมีข้อมูลส่วนตัว) เก็บแค่โรงแรม คะแนน และเหตุผล
      await logAction(client, req, 'review.delete', reviewId, { hotelId: review.property_id, rating: review.rating, reason });
    });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
