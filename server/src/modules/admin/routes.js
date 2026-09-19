// [D] หลังบ้านเจ้าของโรงแรม
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin'));

// TODO(D): CRUD /api/admin/hotels, /api/admin/room-types, /api/admin/rooms
// TODO(D): GET /api/admin/bookings, GET /api/admin/stats
router.get('/hotels', (req, res) => {
  res.status(501).json({ message: 'TODO(D): โรงแรมของฉัน' });
});

export default router;
