// ============================================================
// หลังบ้าน /api/admin
//   owner = เจ้าของโรงแรม — จัดการได้เฉพาะโรงแรมที่ properties.owner_id = ตัวเอง
//   admin = ผู้ดูแลระบบ — เห็นทุกโรงแรม + จัดการผู้ใช้ ลบรีวิว ดูบันทึกการทำงาน
// ทุกเส้นทางต้องล็อกอิน และ role ต้องเป็น owner/admin (ตรวจที่ server ทุกคำขอ — requireAuth อ่าน role จาก DB ใหม่ทุกครั้ง)
// ส่วนที่ admin เท่านั้นตรวจซ้ำด้วย requireAdmin ในไฟล์ย่อย · ส่วน "เฉพาะโรงแรมของฉัน" ตรวจด้วย scope.js
// ============================================================
import { Router } from 'express';
import { rateLimit } from '../../lib/rateLimit.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import auditRouter from './audit.js';
import bookingsRouter from './bookings.js';
import hotelImagesRouter, { roomImagesRouter } from './hotelImages.js';
import hotelsRouter from './hotels.js';
import reviewsRouter from './reviews.js';
import roomsRouter, { hotelRoomsRouter } from './rooms.js';
import statsRouter from './stats.js';
import usersRouter from './users.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin'));

// จำกัดคำขอที่ "เขียน" ข้อมูล (POST/PUT/PATCH/DELETE) 60 ครั้ง/นาที/คน — กันสคริปต์ยิงแก้ข้อมูลรัวๆ
const writeLimit = rateLimit({ windowMs: 60_000, max: 60 });
router.use((req, res, next) => (req.method === 'GET' ? next() : writeLimit(req, res, next)));

router.use('/stats', statsRouter);
router.use('/hotels/:id/rooms', hotelRoomsRouter); // เพิ่มประเภทห้องให้โรงแรม (ต้องมาก่อน /hotels)
router.use('/hotels/:id/images', hotelImagesRouter); // รูปโรงแรม สูงสุด 5 รูป (ต้องมาก่อน /hotels)
router.use('/hotels', hotelsRouter);
router.use('/rooms/:id/images', roomImagesRouter); // รูปประเภทห้อง สูงสุด 5 รูป (ต้องมาก่อน /rooms)
router.use('/rooms', roomsRouter);                 // แก้/ลบประเภทห้อง + ปฏิทินราคา/ห้องรายวัน
router.use('/bookings', bookingsRouter);
router.use('/reviews', reviewsRouter);
router.use('/users', usersRouter);                 // admin เท่านั้น
router.use('/audit', auditRouter);                 // admin เท่านั้น

export default router;
