-- ============================================================
-- 10) รูปโปรไฟล์ที่ผู้ใช้อัปโหลดเอง (1 คน 1 รูป) — รันซ้ำได้ ไม่ลบข้อมูล
--
--   เบราว์เซอร์ครอปเป็นสี่เหลี่ยมจัตุรัสแล้วย่อเป็น 400×400 JPEG ก่อนส่ง (ข้อมูลแฝงในไฟล์ เช่น พิกัด GPS หายไปตอนวาดใหม่)
--   แล้ว server ตรวจซ้ำ (server/src/modules/user/avatar.js)
--   users.avatar_url ชี้มาที่ /api/auth/avatars/<avatar_key> → โค้ดเดิมที่อ่าน avatar_url (รีวิว, /api/auth/me) ใช้ได้เลย
--   avatar_key = รหัสสุ่ม (UUID) เดาไม่ได้ และเปลี่ยนทุกครั้งที่อัปรูปใหม่ — ไม่ใช้ user_id ใน URL
--   เพื่อไม่ให้ใครไล่ดึงรูปของผู้ใช้ทุกคนตามเลข id ได้ (PDPA)
--   ลบรูปเอง = ลบแถวนี้ · ลบบัญชี = ลบตาม (ON DELETE CASCADE)
--
--   อัปเดตฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/10-user-avatars.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id      INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE, -- 1 คน 1 รูป · ลบบัญชี = ลบรูปตาม
  avatar_key   UUID NOT NULL UNIQUE,                                         -- ใช้เป็นชื่อไฟล์ใน URL (สุ่มใหม่ทุกครั้งที่อัป)
  mime_type    VARCHAR(20) NOT NULL DEFAULT 'image/jpeg',
  data         BYTEA NOT NULL,
  byte_size    INT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_avatars_type CHECK (mime_type IN ('image/jpeg'))
);
