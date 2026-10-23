// หลังบ้าน: รูปที่เจ้าของอัปโหลด สูงสุด 5 รูป — โค้ดชุดเดียวใช้ทั้งรูปโรงแรมและรูปประเภทห้อง
//   /api/admin/hotels/:id/images   รูปโรงแรม (ตาราง property_images · ล็อกแถวโรงแรม)
//   /api/admin/rooms/:id/images    รูปประเภทห้อง (ตาราง room_images · ล็อกแถวประเภทห้อง)
//     GET    /            รายการรูปตามลำดับ (ตัวแรก = รูปปก / รูปหลักของห้อง)
//     POST   /            อัปรูปใหม่ 1 รูป — body เป็นไฟล์ JPEG ตรงๆ (Content-Type: image/jpeg) ต่อท้ายลำดับสุดท้าย
//     PUT    /order       { imageIds: [...] } เรียงลำดับใหม่ (ต้องครบทุกรูป)
//     DELETE /:imageId    ลบรูป แล้วขยับลำดับที่เหลือให้ต่อกัน
// owner จัดการได้เฉพาะของโรงแรมตัวเอง (loadHotel / loadRoom ตรวจให้)
// ทุกการแก้ไขล็อกแถวแม่ (โรงแรม/ห้อง) ก่อน และบันทึก logAction ใน transaction เดียวกัน (เหมือนส่วนอื่นของหลังบ้าน)
import express, { Router } from 'express';
import { pool } from '../../db.js';
import {
  MAX_HOTEL_IMAGES, MAX_IMAGE_BYTES, MAX_ROOM_IMAGES, checkHotelImage, hotelImageUrl, roomImageUrl,
} from '../../lib/hotelImages.js';
import { logAction } from './audit.js';
import { httpError, loadHotel, loadRoom, readId, withTransaction } from './scope.js';

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

// สร้าง router ของรูปแต่ละชนิด — table / parentColumn มาจากค่าคงที่ข้างล่างเท่านั้น (ไม่ใช่ข้อมูลจากผู้ใช้)
// จึงต่อเข้า SQL ได้ปลอดภัย · ค่าที่มาจากผู้ใช้ (รหัส, ไฟล์) ส่งเป็น parameter ($1, $2) เสมอ
function photoRouter({ table, parentColumn, max, noun, idLabel, load, imageUrl, auditPrefix, auditDetail }) {
  const router = Router({ mergeParams: true });

  async function listImages(db, parentId) {
    const { rows } = await db.query(
      `SELECT image_id, position, byte_size, created_at
         FROM ${table} WHERE ${parentColumn} = $1 ORDER BY position`,
      [parentId],
    );
    return rows.map((row) => ({
      id: row.image_id, position: row.position, url: imageUrl(row.image_id), bytes: row.byte_size, createdAt: row.created_at,
    }));
  }

  router.get('/', async (req, res, next) => {
    try {
      const parentId = readId(req.params.id, idLabel);
      await load(pool, req, parentId); // ไม่มี → 404 · ไม่ใช่โรงแรมของเรา → 403
      res.json({ images: await listImages(pool, parentId), max });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', readImageBody, async (req, res, next) => {
    try {
      const parentId = readId(req.params.id, idLabel);
      const problem = checkHotelImage(req.body);
      if (problem) throw httpError(400, problem);

      const images = await withTransaction(pool, async (client) => {
        // 🔒 ล็อกแถวแม่ (โรงแรม/ห้อง) ก่อนนับรูป — อัปหลายรูปพร้อมกัน (หลายแท็บ/กดรัว) จะต่อคิวกันทีละคำขอ
        //   ถ้าไม่ล็อก สองคำขอนับได้ "4 รูป" พร้อมกัน แล้วต่างคนต่างเพิ่ม → 6 รูป หรือได้ลำดับที่ 5 ซ้ำกัน
        //   (ฐานข้อมูลกันชั้นสุดท้ายอีกทีด้วย CHECK ลำดับ 1–5 + UNIQUE (แม่, position))
        const parent = await load(client, req, parentId, { lock: true });
        const { rows: [{ count }] } = await client.query(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${parentColumn} = $1`,
          [parentId],
        );
        if (count >= max) throw httpError(409, `${noun}หนึ่งมีรูปได้สูงสุด ${max} รูป — ลบรูปเดิมก่อน`);
        // ลำดับรูปต่อกันเสมอ (1, 2, 3...) → รูปใหม่อยู่ที่ "จำนวนรูป + 1"
        const { rows: [image] } = await client.query(
          `INSERT INTO ${table} (${parentColumn}, position, data, byte_size)
           VALUES ($1, $2, $3, $4) RETURNING image_id`,
          [parentId, count + 1, req.body, req.body.length],
        );
        await logAction(client, req, `${auditPrefix}.image_add`, parentId, {
          ...auditDetail(parent), imageId: image.image_id, position: count + 1, bytes: req.body.length,
        });
        return listImages(client, parentId);
      });
      res.status(201).json({ images });
    } catch (error) {
      next(error);
    }
  });

  router.put('/order', async (req, res, next) => {
    try {
      const parentId = readId(req.params.id, idLabel);
      if (!Array.isArray(req.body?.imageIds)) throw httpError(400, 'กรุณาส่งลำดับรูป (imageIds)');
      const order = req.body.imageIds.map((id) => readId(id, 'รหัสรูป'));

      const images = await withTransaction(pool, async (client) => {
        const parent = await load(client, req, parentId, { lock: true });
        // ลำดับใหม่ต้องมีรูปของโรงแรม/ห้องนี้ครบทุกรูป ไม่ขาด ไม่ซ้ำ ไม่มีรูปของที่อื่นปน
        const { rows } = await client.query(`SELECT image_id FROM ${table} WHERE ${parentColumn} = $1`, [parentId]);
        const current = rows.map((row) => row.image_id).sort((a, b) => a - b);
        const wanted = [...order].sort((a, b) => a - b);
        if (current.length !== wanted.length || current.some((id, i) => id !== wanted[i])) {
          throw httpError(400, `ลำดับรูปต้องมีรูปของ${noun}นี้ครบทุกรูป และห้ามซ้ำ`);
        }
        // เปลี่ยนลำดับทุกรูปในคำสั่งเดียว: unnest ... WITH ORDINALITY = ได้เลข 1, 2, 3 ตามตำแหน่งใน array
        // ข้อห้าม "ลำดับซ้ำ" ตั้งเป็น DEFERRABLE (db/07, db/09) → ตรวจตอน COMMIT ระหว่างสลับกันจึงไม่ชนกันเอง
        await client.query(
          `UPDATE ${table} t SET position = o.position
             FROM unnest($2::int[]) WITH ORDINALITY AS o(image_id, position)
            WHERE t.image_id = o.image_id AND t.${parentColumn} = $1`,
          [parentId, order],
        );
        await logAction(client, req, `${auditPrefix}.image_reorder`, parentId, { ...auditDetail(parent), order });
        return listImages(client, parentId);
      });
      res.json({ images });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:imageId', async (req, res, next) => {
    try {
      const parentId = readId(req.params.id, idLabel);
      const imageId = readId(req.params.imageId, 'รหัสรูป');

      const images = await withTransaction(pool, async (client) => {
        const parent = await load(client, req, parentId, { lock: true });
        const { rowCount } = await client.query(
          `DELETE FROM ${table} WHERE image_id = $1 AND ${parentColumn} = $2`,
          [imageId, parentId],
        );
        if (!rowCount) throw httpError(404, `ไม่พบรูปนี้ใน${noun}นี้`);
        // ขยับลำดับรูปที่เหลือให้ต่อกัน 1, 2, 3... ไม่มีช่องว่าง (ลบรูปแรก → รูปถัดไปขึ้นเป็นรูปปก/รูปหลักแทน)
        await client.query(
          `UPDATE ${table} t SET position = o.rn
             FROM (SELECT image_id, ROW_NUMBER() OVER (ORDER BY position) AS rn
                     FROM ${table} WHERE ${parentColumn} = $1) o
            WHERE t.image_id = o.image_id AND t.position <> o.rn`,
          [parentId],
        );
        await logAction(client, req, `${auditPrefix}.image_delete`, parentId, { ...auditDetail(parent), imageId });
        return listImages(client, parentId);
      });
      res.json({ images });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

// รูปโรงแรม — ล็อกแถว properties
export const hotelImagesRouter = photoRouter({
  table: 'property_images', parentColumn: 'property_id', max: MAX_HOTEL_IMAGES, noun: 'โรงแรม', idLabel: 'รหัสโรงแรม',
  load: loadHotel, imageUrl: hotelImageUrl, auditPrefix: 'hotel', auditDetail: () => ({}),
});

// รูปประเภทห้อง — ล็อกแถว rooms (แถวเดียวกับที่ตอนจองล็อก) → การจองห้องประเภทนี้รอแค่ชั่วครู่ระหว่างบันทึกรูป
// บันทึกการทำงานใส่รหัสโรงแรมด้วย เพื่อให้รู้ว่าเป็นห้องของโรงแรมไหน
export const roomImagesRouter = photoRouter({
  table: 'room_images', parentColumn: 'room_id', max: MAX_ROOM_IMAGES, noun: 'ประเภทห้อง', idLabel: 'รหัสประเภทห้อง',
  load: loadRoom, imageUrl: roomImageUrl, auditPrefix: 'room', auditDetail: (room) => ({ hotelId: room.property_id }),
});

export default hotelImagesRouter;
