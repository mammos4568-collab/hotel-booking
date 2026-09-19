// [B] จอง & ชำระเงิน
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// TODO(B): POST /api/bookings — สร้างการจอง
//   ใน transaction เดียว: lock ห้อง (SELECT ... FOR UPDATE) → เช็กช่วงวันทับ → INSERT
// TODO(B): POST /api/bookings/:id/pay — จ่ายเงิน (mock)
// TODO(B): POST /api/bookings/:id/cancel
router.get('/me', requireAuth, (req, res) => {
  res.status(501).json({ message: 'TODO(B): การจองของฉัน', userId: req.user.id });
});

export default router;
