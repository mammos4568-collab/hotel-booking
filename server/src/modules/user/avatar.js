// ============================================================
// รูปโปรไฟล์ที่อัปจากเครื่อง — ต่อท้าย /api/auth (ตาราง user_avatars · db/10-user-avatars.sql)
//   PUT    /me/avatar       อัปรูปใหม่แทนรูปเดิม — body = ไฟล์ JPEG 400×400 ตรงๆ (Content-Type: image/jpeg)
//   DELETE /me/avatar       ลบรูปโปรไฟล์ (รวมรูปจาก Google/GitHub ที่ติดมาตอนสมัคร)
//   GET    /avatars/:key    ไฟล์รูป (สาธารณะ — แสดงคู่กับรีวิวของเจ้าของรูป)
// เบราว์เซอร์ครอปกลางภาพเป็นสี่เหลี่ยมจัตุรัสแล้วย่อเป็น 400×400 ก่อนส่ง (client/src/lib/imageResize.js)
// → ไฟล์เล็ก และข้อมูลแฝงในไฟล์ (EXIF เช่น พิกัด GPS) หายไปตอนวาดใหม่ · server ตรวจซ้ำด้วย checkJpegImage()
// รูปโปรไฟล์เปลี่ยนได้ทาง endpoint ในไฟล์นี้เท่านั้น (PUT /api/auth/me ไม่รับลิงก์รูปแล้ว)
// ============================================================
import express, { Router } from 'express';
import { pool } from '../../db.js';
import { checkJpegImage } from '../../lib/hotelImages.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
const AVATAR_SIZE = 400;
const MAX_AVATAR_BYTES = 500_000; // 400×400 JPEG ปกติ 20–80 KB · เผื่อรูปรายละเอียดเยอะ
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const avatarUrl = (key) => `/api/auth/avatars/${key}`;
const uploadLimit = rateLimit({ windowMs: 60 * 60_000, max: 20 }); // อัปได้ 20 ครั้ง/ชั่วโมง/คน

// รับไฟล์เป็น "ไบต์ดิบ" (ไม่ต้องแปลง base64 และไม่ต้องลง library รับไฟล์) · ใหญ่เกิน → 413 ภาษาไทย
const parseImage = express.raw({ type: 'image/jpeg', limit: MAX_AVATAR_BYTES });
function readAvatarBody(req, res, next) {
  parseImage(req, res, (error) => {
    if (!error) return next();
    if (error.status === 413) return res.status(413).json({ message: `ไฟล์รูปใหญ่เกิน ${MAX_AVATAR_BYTES / 1000} KB` });
    res.status(400).json({ message: 'อ่านไฟล์รูปไม่ได้' });
  });
}

// ทำงานใน transaction เดียว: รูป (user_avatars) กับ users.avatar_url ต้องเปลี่ยนพร้อมกันเสมอ
async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

router.put('/me/avatar', requireAuth, uploadLimit, readAvatarBody, async (req, res, next) => {
  try {
    const problem = checkJpegImage(req.body, { width: AVATAR_SIZE, height: AVATAR_SIZE, maxBytes: MAX_AVATAR_BYTES });
    if (problem) return res.status(400).json({ message: problem });

    const url = await inTransaction(async (client) => {
      // 1 คน 1 รูป: มีรูปเดิมอยู่แล้ว (ON CONFLICT) → แทนที่ และได้รหัสสุ่มใหม่ → ลิงก์รูปเดิมใช้ไม่ได้ทันที
      const { rows: [avatar] } = await client.query(
        `INSERT INTO user_avatars (user_id, avatar_key, data, byte_size)
         VALUES ($1, gen_random_uuid(), $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET avatar_key = EXCLUDED.avatar_key, data = EXCLUDED.data, byte_size = EXCLUDED.byte_size, updated_at = now()
         RETURNING avatar_key`,
        [req.user.id, req.body, req.body.length],
      );
      const newUrl = avatarUrl(avatar.avatar_key);
      await client.query('UPDATE users SET avatar_url = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id, newUrl]);
      return newUrl;
    });
    res.json({ avatarUrl: url });
  } catch (error) {
    next(error);
  }
});

router.delete('/me/avatar', requireAuth, async (req, res, next) => {
  try {
    await inTransaction(async (client) => {
      await client.query('DELETE FROM user_avatars WHERE user_id = $1', [req.user.id]);
      await client.query('UPDATE users SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id]);
    });
    res.json({ avatarUrl: null });
  } catch (error) {
    next(error);
  }
});

// ไฟล์รูป: ค้นด้วยรหัสสุ่มเท่านั้น (ไม่มีทางดึงรูปตามเลขผู้ใช้)
//   Cache-Control: private = เก็บ cache ได้แค่ในเบราว์เซอร์ของคนดู ไม่ให้ proxy/CDN กลางทางเก็บไว้
//   max-age 1 วัน = ลบรูปแล้ว รูปหายจากเครื่องคนอื่นภายในไม่เกิน 1 วัน (อัปรูปใหม่ได้ลิงก์ใหม่อยู่แล้ว)
router.get('/avatars/:key', async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.key)) return res.status(404).json({ message: 'ไม่พบรูปนี้' });
    const { rows: [avatar] } = await pool.query(
      'SELECT mime_type, data FROM user_avatars WHERE avatar_key = $1',
      [req.params.key],
    );
    if (!avatar) return res.status(404).json({ message: 'ไม่พบรูปนี้' });
    res.set({ 'Content-Type': avatar.mime_type, 'Cache-Control': 'private, max-age=86400' });
    res.send(avatar.data);
  } catch (error) {
    next(error);
  }
});

export default router;
