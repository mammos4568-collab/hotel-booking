// หลังบ้าน: รูปโรงแรม — /api/admin/hotels/:id/images (owner จัดการได้เฉพาะโรงแรมตัวเอง · สูงสุด 5 รูป)
//   GET    /            รายการรูปตามลำดับ (ตัวแรก = รูปปก)
//   POST   /            อัปรูปใหม่ 1 รูป — body เป็นไฟล์ JPEG ตรงๆ (Content-Type: image/jpeg) ต่อท้ายลำดับสุดท้าย
//   PUT    /order       { imageIds: [...] } เรียงลำดับใหม่ (ต้องครบทุกรูป)
//   DELETE /:imageId    ลบรูป แล้วขยับลำดับที่เหลือให้ต่อกัน
// ทุกการแก้ไขล็อกแถวโรงแรมก่อน และบันทึก logAction ใน transaction เดียวกัน (เหมือนส่วนอื่นของหลังบ้าน)
import express, { Router } from 'express';
import { pool } from '../../db.js';
import { MAX_HOTEL_IMAGES, MAX_IMAGE_BYTES, checkHotelImage, hotelImageUrl } from '../../lib/hotelImages.js';
import { logAction } from './audit.js';
import { httpError, loadHotel, readId, withTransaction } from './scope.js';

const router = Router({ mergeParams: true });

// รับไฟล์รูปเป็น "ไบต์ดิบ" แทน JSON → ไม่ต้องแปลงเป็น base64 (ใหญ่ขึ้น ~33%) และไม่ต้องลง library รับไฟล์
// express.json() ของทั้งแอปไม่แตะคำขอนี้ เพราะ Content-Type ไม่ใช่ JSON · ใหญ่เกิน limit → ตอบ 413 ภาษาไทย
const parseImage = express.raw({ type: 'image/jpeg', limit: MAX_IMAGE_BYTES });
function readImageBody(req, res, next) {
  parseImage(req, res, (error) => {
    if (!error) return next();
    next(error.status === 413
      ? httpError(413, `ไฟล์รูปใหญ่เกิน ${MAX_IMAGE_BYTES / 1_000_000} MB`)
      : httpError(400, 'อ่านไฟล์รูปไม่ได้'));
  });
}

async function listImages(db, hotelId) {
  const { rows } = await db.query(
    `SELECT image_id, position, byte_size, created_at
       FROM property_images WHERE property_id = $1 ORDER BY position`,
    [hotelId],
  );
  return rows.map((row) => ({
    id: row.image_id, position: row.position, url: hotelImageUrl(row.image_id), bytes: row.byte_size, createdAt: row.created_at,
  }));
}

router.get('/', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    await loadHotel(pool, req, hotelId); // ไม่มี → 404 · ไม่ใช่โรงแรมของเรา → 403
    res.json({ images: await listImages(pool, hotelId), max: MAX_HOTEL_IMAGES });
  } catch (error) {
    next(error);
  }
});

router.post('/', readImageBody, async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    const problem = checkHotelImage(req.body);
    if (problem) throw httpError(400, problem);

    const images = await withTransaction(pool, async (client) => {
      // 🔒 ล็อกแถวโรงแรมก่อนนับรูป — อัปหลายรูปพร้อมกัน (หลายแท็บ/กดรัว) จะต่อคิวกันทีละคำขอ
      //   ถ้าไม่ล็อก สองคำขอนับได้ "4 รูป" พร้อมกัน แล้วต่างคนต่างเพิ่ม → 6 รูป หรือได้ลำดับที่ 5 ซ้ำกัน
      //   (ฐานข้อมูลกันชั้นสุดท้ายอีกทีด้วย CHECK ลำดับ 1–5 + UNIQUE (property_id, position))
      await loadHotel(client, req, hotelId, { lock: true });
      const { rows: [{ count }] } = await client.query(
        'SELECT COUNT(*)::int AS count FROM property_images WHERE property_id = $1',
        [hotelId],
      );
      if (count >= MAX_HOTEL_IMAGES) throw httpError(409, `โรงแรมหนึ่งมีรูปได้สูงสุด ${MAX_HOTEL_IMAGES} รูป — ลบรูปเดิมก่อน`);
      // ลำดับรูปต่อกันเสมอ (1, 2, 3...) → รูปใหม่อยู่ที่ "จำนวนรูป + 1"
      const { rows: [image] } = await client.query(
        `INSERT INTO property_images (property_id, position, data, byte_size)
         VALUES ($1, $2, $3, $4) RETURNING image_id`,
        [hotelId, count + 1, req.body, req.body.length],
      );
      await logAction(client, req, 'hotel.image_add', hotelId, { imageId: image.image_id, position: count + 1, bytes: req.body.length });
      return listImages(client, hotelId);
    });
    res.status(201).json({ images });
  } catch (error) {
    next(error);
  }
});

router.put('/order', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    if (!Array.isArray(req.body?.imageIds)) throw httpError(400, 'กรุณาส่งลำดับรูป (imageIds)');
    const order = req.body.imageIds.map((id) => readId(id, 'รหัสรูป'));

    const images = await withTransaction(pool, async (client) => {
      await loadHotel(client, req, hotelId, { lock: true });
      // ลำดับใหม่ต้องมีรูปของโรงแรมนี้ครบทุกรูป ไม่ขาด ไม่ซ้ำ ไม่มีรูปของโรงแรมอื่นปน
      const { rows } = await client.query('SELECT image_id FROM property_images WHERE property_id = $1', [hotelId]);
      const current = rows.map((row) => row.image_id).sort((a, b) => a - b);
      const wanted = [...order].sort((a, b) => a - b);
      if (current.length !== wanted.length || current.some((id, i) => id !== wanted[i])) {
        throw httpError(400, 'ลำดับรูปต้องมีรูปของโรงแรมนี้ครบทุกรูป และห้ามซ้ำ');
      }
      // เปลี่ยนลำดับทุกรูปในคำสั่งเดียว: unnest ... WITH ORDINALITY = ได้เลข 1, 2, 3 ตามตำแหน่งใน array
      // ข้อห้าม "ลำดับซ้ำ" ตั้งเป็น DEFERRABLE (db/07) → ตรวจตอน COMMIT ระหว่างสลับกันจึงไม่ชนกันเอง
      await client.query(
        `UPDATE property_images pi SET position = o.position
           FROM unnest($2::int[]) WITH ORDINALITY AS o(image_id, position)
          WHERE pi.image_id = o.image_id AND pi.property_id = $1`,
        [hotelId, order],
      );
      await logAction(client, req, 'hotel.image_reorder', hotelId, { order });
      return listImages(client, hotelId);
    });
    res.json({ images });
  } catch (error) {
    next(error);
  }
});

router.delete('/:imageId', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    const imageId = readId(req.params.imageId, 'รหัสรูป');

    const images = await withTransaction(pool, async (client) => {
      await loadHotel(client, req, hotelId, { lock: true });
      const { rowCount } = await client.query(
        'DELETE FROM property_images WHERE image_id = $1 AND property_id = $2',
        [imageId, hotelId],
      );
      if (!rowCount) throw httpError(404, 'ไม่พบรูปนี้ในโรงแรมนี้');
      // ขยับลำดับรูปที่เหลือให้ต่อกัน 1, 2, 3... ไม่มีช่องว่าง (ลบรูปปก → รูปถัดไปขึ้นเป็นรูปปกแทน)
      await client.query(
        `UPDATE property_images pi SET position = o.rn
           FROM (SELECT image_id, ROW_NUMBER() OVER (ORDER BY position) AS rn
                   FROM property_images WHERE property_id = $1) o
          WHERE pi.image_id = o.image_id AND pi.position <> o.rn`,
        [hotelId],
      );
      await logAction(client, req, 'hotel.image_delete', hotelId, { imageId });
      return listImages(client, hotelId);
    });
    res.json({ images });
  } catch (error) {
    next(error);
  }
});

export default router;
