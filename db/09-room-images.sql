-- ============================================================
-- 09) รูปประเภทห้องที่เจ้าของอัปโหลด (สูงสุด 5 รูปต่อประเภทห้อง) — รันซ้ำได้ ไม่ลบข้อมูล
--
--   โครงเดียวกับรูปโรงแรม (07-hotel-images.sql): เก็บไฟล์ในฐานข้อมูล (BYTEA) · รูป 1200×800 JPEG
--   ที่เบราว์เซอร์ย่อให้ แล้ว server ตรวจซ้ำ (server/src/lib/hotelImages.js)
--   position 1 = รูปหลักของห้อง (การ์ดห้องในหน้าโรงแรม, หน้า checkout, การจองของฉัน)
--   ยังไม่มีรูปอัปโหลด = ใช้ rooms.image_url เดิม (ข้อมูลตัวอย่างยังแสดงรูปได้เหมือนเดิม)
--   ลบประเภทห้อง = รูปหายตาม · ลบโรงแรม → ห้องถูกลบ → รูปห้องหายตามเป็นทอดๆ (ON DELETE CASCADE)
--
--   อัปเดตฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/09-room-images.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS room_images (
  image_id     SERIAL PRIMARY KEY,
  room_id      INT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE, -- ลบประเภทห้อง = ลบรูปตาม
  position     SMALLINT NOT NULL,
  mime_type    VARCHAR(20) NOT NULL DEFAULT 'image/jpeg',
  data         BYTEA NOT NULL,
  byte_size    INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ลำดับ 1–5 และห้ามซ้ำในห้องเดียวกัน → ฐานข้อมูลเองรับประกันว่าประเภทห้องหนึ่งมีได้ไม่เกิน 5 รูป
  CONSTRAINT room_images_position_range CHECK (position BETWEEN 1 AND 5),
  CONSTRAINT room_images_type CHECK (mime_type IN ('image/jpeg')),
  -- DEFERRABLE INITIALLY DEFERRED = ตรวจ "ห้ามซ้ำ" ตอน COMMIT → สลับลำดับรูปใน transaction เดียวได้
  CONSTRAINT room_images_position_unique UNIQUE (room_id, position) DEFERRABLE INITIALLY DEFERRED
);
