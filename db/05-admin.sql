-- ============================================================
-- 05: ส่วนเพิ่มสำหรับหลังบ้าน (แอดมิน / เจ้าของโรงแรม)
-- เพิ่มอย่างเดียว ไม่แก้ของเดิม · รันซ้ำได้ (IF NOT EXISTS) ใช้ได้ทั้งตอนสร้าง volume ใหม่และกับฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/05-admin.sql
-- ============================================================

-- บทบาทผู้ใช้: user = ลูกค้า · owner = เจ้าของโรงแรม (จัดการได้เฉพาะโรงแรมของตัวเอง) · admin = ผู้ดูแลทั้งระบบ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_valid') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'owner', 'admin'));
  END IF;
END $$;

-- โรงแรมนี้เป็นของใคร (เจ้าของที่ role = owner) — NULL = ยังไม่มีเจ้าของ แอดมินดูแลเอง
-- ลบบัญชีเจ้าของ → โรงแรมยังอยู่ แค่ไม่มีเจ้าของ (SET NULL)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_id INT REFERENCES users(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON properties(owner_id);

-- บันทึกการทำงานในหลังบ้าน (ใครทำอะไร เมื่อไร) — ไว้ตรวจสอบย้อนหลังเมื่อข้อมูลถูกแก้/ลบ
--   detail เก็บแค่ชื่อฟิลด์ที่เปลี่ยนและตัวเลขอ้างอิง ไม่เก็บข้อมูลส่วนบุคคลของลูกค้า (PDPA)
--   ลบบัญชีผู้ทำ → บันทึกยังอยู่แต่ไม่ผูกกับบัญชีแล้ว (SET NULL)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  log_id     SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(user_id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,            -- เช่น hotel.update, room.calendar, booking.cancel, user.role
  entity_id  INT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
