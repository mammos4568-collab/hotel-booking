// [C] ผู้ใช้ & รีวิว
import { Router } from 'express';

const router = Router();

// TODO(C): POST /api/auth/register, POST /api/auth/login
// TODO(C): GET/PUT /api/auth/me
// TODO(C): POST /api/reviews (เฉพาะ booking ที่ status = 'completed')
router.post('/login', (req, res) => {
  res.status(501).json({ message: 'TODO(C): login' });
});

export default router;
