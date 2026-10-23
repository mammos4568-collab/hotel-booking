-- ============================================================
-- 08) อนุมัติโรงแรมก่อนเผยแพร่ — รันซ้ำได้ ไม่ลบข้อมูล
--
--   approval_status:  pending  = รอ admin ตรวจ (ลูกค้ายังไม่เห็น จองไม่ได้)
--                     approved = เผยแพร่แล้ว
--                     rejected = ไม่อนุมัติ / ถูกระงับ (ลูกค้าไม่เห็น) · เจ้าของแก้แล้วบันทึก = ส่งตรวจใหม่
--   - เจ้าของโรงแรมเพิ่มโรงแรม → pending · admin เพิ่มเอง → approved ทันที (server ตั้งให้ ไม่เชื่อค่าจากหน้าเว็บ)
--   - อนุมัติครั้งเดียวตอนสร้าง: หลังอนุมัติแล้ว เจ้าของแก้ข้อมูลได้เลย (ข้อความทุกช่องผ่านตัวกรองคำไม่สุภาพ)
--   - การจองเดิมของโรงแรมที่ถูกระงับยังอยู่ครบ — แค่จองใหม่ไม่ได้
--
--   โรงแรมที่มีอยู่แล้ว (ข้อมูลตัวอย่าง) = approved: เพิ่มคอลัมน์ด้วยค่าเริ่มต้น approved ก่อน (แถวเดิมได้ค่านี้)
--   แล้วค่อยเปลี่ยนค่าเริ่มต้นเป็น pending → แถวที่เพิ่มหลังจากนี้ ถ้าไม่ระบุ = ต้องรออนุมัติเสมอ (ปลอดภัยไว้ก่อน)
--
--   อัปเดตฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/08-hotel-approval.sql
-- ============================================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE properties ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approval_note VARCHAR(300);      -- เหตุผลที่ไม่อนุมัติ/ระงับ (admin เขียน เจ้าของเห็น)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;        -- ส่งให้ตรวจล่าสุด
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;         -- admin ตัดสินล่าสุด
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_by INT REFERENCES users(user_id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_approval_status_valid') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_approval_status_valid
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- คิวรออนุมัติ (เรียงตามเวลาที่ส่ง) — index เฉพาะแถวที่รอ เล็กและเร็ว
CREATE INDEX IF NOT EXISTS idx_properties_pending ON properties (submitted_at) WHERE approval_status = 'pending';
