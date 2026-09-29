import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
const MAX_COMMENT_LENGTH = 2000;

function validateReview({ rating, comment }) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { error: 'Rating must be between 1 and 5' };
  }
  if (comment !== undefined && comment !== null && (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH)) {
    return { error: `Comment must be under ${MAX_COMMENT_LENGTH} characters` };
  }
  return { rating: numericRating, comment: comment?.trim() || null };
}

function reviewSelect(whereClause) {
  return `SELECT r.review_id AS id, r.booking_id AS "bookingId", r.property_id AS "hotelId",
                 r.rating, r.comment, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
                 u.user_id AS "userId", u.first_name, u.last_name, u.avatar_url AS "avatarUrl"
          FROM reviews r LEFT JOIN users u ON u.user_id = r.user_id
          ${whereClause}`;
}

function serializeReview(row) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    hotelId: row.hotelId,
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: row.userId ? {
      id: row.userId,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      avatarUrl: row.avatarUrl,
    } : null,
  };
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const bookingId = Number(req.body?.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ message: 'A valid bookingId is required' });
    const values = validateReview(req.body || {});
    if (values.error) return res.status(400).json({ message: values.error });

    const booking = await pool.query(
      `SELECT booking_id, property_id FROM bookings
       WHERE booking_id = $1 AND user_id = $2 AND LOWER(payment_status) = 'paid'
         AND check_out_date < CURRENT_DATE`,
      [bookingId, req.user.id]
    );
    if (!booking.rows[0]) return res.status(403).json({ message: 'Reviews are available after your paid stay is complete' });

    const created = await pool.query(
      `INSERT INTO reviews (booking_id, user_id, property_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING review_id`,
      [bookingId, req.user.id, booking.rows[0].property_id, values.rating, values.comment]
    );
    const { rows } = await pool.query(reviewSelect('WHERE r.review_id = $1'), [created.rows[0].review_id]);
    res.status(201).json({ review: serializeReview(rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'This booking already has a review' });
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const hotelId = Number(req.query.hotelId);
    if (!Number.isInteger(hotelId) || hotelId <= 0) return res.status(400).json({ message: 'A valid hotelId is required' });

    const [reviewsResult, statsResult] = await Promise.all([
      pool.query(`${reviewSelect('WHERE r.property_id = $1 ORDER BY r.created_at DESC')}`, [hotelId]),
      pool.query(
        `SELECT
           COUNT(*)::int AS "reviewCount",
           ROUND(AVG(rating), 1) AS "averageRating",
           COUNT(*) FILTER (WHERE ROUND(rating) = 5)::int AS "five",
           COUNT(*) FILTER (WHERE ROUND(rating) = 4)::int AS "four",
           COUNT(*) FILTER (WHERE ROUND(rating) = 3)::int AS "three",
           COUNT(*) FILTER (WHERE ROUND(rating) = 2)::int AS "two",
           COUNT(*) FILTER (WHERE ROUND(rating) = 1)::int AS "one"
         FROM reviews WHERE property_id = $1`,
        [hotelId]
      ),
    ]);

    const stats = statsResult.rows[0];
    res.json({
      averageRating: stats.reviewCount > 0 ? Number(stats.averageRating) : null,
      reviewCount: stats.reviewCount,
      ratingBreakdown: {
        5: stats.five,
        4: stats.four,
        3: stats.three,
        2: stats.two,
        1: stats.one,
      },
      reviews: reviewsResult.rows.map(serializeReview),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(reviewSelect('WHERE r.user_id = $1 ORDER BY r.created_at DESC'), [req.user.id]);
    res.json({ reviews: rows.map(serializeReview) });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return res.status(400).json({ message: 'A valid review id is required' });
    const unknown = Object.keys(req.body || {}).filter((key) => !['rating', 'comment'].includes(key));
    if (unknown.length) return res.status(400).json({ message: `Unsupported review field: ${unknown[0]}` });
    const existing = await pool.query('SELECT rating, comment FROM reviews WHERE review_id = $1 AND user_id = $2', [reviewId, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Review not found' });
    const values = validateReview({
      rating: req.body?.rating ?? existing.rows[0].rating,
      comment: Object.hasOwn(req.body || {}, 'comment') ? req.body.comment : existing.rows[0].comment,
    });
    if (values.error) return res.status(400).json({ message: values.error });

    const updated = await pool.query(
      `UPDATE reviews SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP
       WHERE review_id = $3 AND user_id = $4 RETURNING review_id`,
      [values.rating, values.comment, reviewId, req.user.id]
    );
    const { rows } = await pool.query(reviewSelect('WHERE r.review_id = $1'), [updated.rows[0].review_id]);
    res.json({ review: serializeReview(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return res.status(400).json({ message: 'A valid review id is required' });
    const result = await pool.query('DELETE FROM reviews WHERE review_id = $1 AND user_id = $2', [reviewId, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Review not found' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
