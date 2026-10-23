-- ============================================================
-- 07) รูปโรงแรมที่เจ้าของอัปโหลด (สูงสุด 5 รูปต่อโรงแรม) — รันซ้ำได้ ไม่ลบข้อมูล
--
--   เก็บไฟล์รูปในฐานข้อมูลเลย (BYTEA) → backup ด้วย pg_dump ได้ครบ ไม่ต้องมีโฟลเดอร์/volume แยก
--   รูปทุกรูปถูกครอป + ย่อเป็น 1200×800 JPEG ที่เบราว์เซอร์ก่อนอัป แล้ว server ตรวจซ้ำ (server/src/lib/hotelImages.js)
--   position 1 = รูปปก (หน้าค้นหา / การ์ดโรงแรม) · ยังไม่มีรูปอัปโหลด = ใช้ properties.image_url เดิม
--
--   อัปเดตฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/07-hotel-images.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS property_images (
  image_id     SERIAL PRIMARY KEY,
  property_id  INT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE, -- ลบโรงแรม = ลบรูปตาม
  position     SMALLINT NOT NULL,
  mime_type    VARCHAR(20) NOT NULL DEFAULT 'image/jpeg',
  data         BYTEA NOT NULL,
  byte_size    INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ลำดับ 1–5 และห้ามซ้ำในโรงแรมเดียวกัน → ฐานข้อมูลเองรับประกันว่าโรงแรมหนึ่งมีได้ไม่เกิน 5 รูป
  CONSTRAINT property_images_position_range CHECK (position BETWEEN 1 AND 5),
  CONSTRAINT property_images_type CHECK (mime_type IN ('image/jpeg')),
  -- DEFERRABLE INITIALLY DEFERRED = ตรวจ "ห้ามซ้ำ" ตอน COMMIT → สลับลำดับรูปใน transaction เดียวได้
  -- (PostgreSQL ปกติตรวจทีละแถวทันที สลับ 1↔2 ในคำสั่งเดียวจะชนกันเองระหว่างทาง)
  CONSTRAINT property_images_position_unique UNIQUE (property_id, position) DEFERRABLE INITIALLY DEFERRED
);
