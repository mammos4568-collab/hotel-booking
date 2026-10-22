-- ============================================================
-- 03: ส่วนเพิ่มสำหรับระบบจอง / ชำระเงิน / หน้าเว็บ
-- เพิ่มอย่างเดียว ไม่แก้หรือลบของเดิมใน 01-schema.sql
-- รันซ้ำได้ (IF NOT EXISTS) → ใช้ได้ทั้งตอนสร้าง volume ใหม่ และสั่งรันกับฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/03-booking.sql
-- ============================================================

-- ข้อมูลผู้เข้าพักที่กรอกตอน checkout (อาจไม่ใช่คนเดียวกับเจ้าของบัญชี)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name       VARCHAR(200);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_email      VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_phone      VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_requests TEXT;

-- จองหลายห้องของประเภทเดียวกันในการจองเดียว (การจองเดิมทั้งหมด = 1 ห้อง)
--   การนับห้องว่างจึงต้องใช้ SUM(num_rooms) ไม่ใช่ COUNT(*) — ดู server/src/lib/availability.js
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS num_rooms INT NOT NULL DEFAULT 1;

-- ตาข่ายระดับฐานข้อมูล: ข้อมูลที่ผิดแน่ๆ เข้าตารางไม่ได้ แม้โค้ดฝั่ง server จะพลาด
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_dates_valid') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_dates_valid CHECK (check_out_date > check_in_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_guests_positive') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_guests_positive CHECK (num_guests >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_total_rooms_not_negative') THEN
    ALTER TABLE rooms ADD CONSTRAINT rooms_total_rooms_not_negative CHECK (total_rooms >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_rooms_range') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_rooms_range CHECK (num_rooms BETWEEN 1 AND 5);
  END IF;
END $$;

-- ประวัติการชำระเงิน (จำลอง) — ไม่เก็บเลขบัตรเต็มหรือ CVC เก็บแค่ 4 หลักท้าย
CREATE TABLE IF NOT EXISTS payments (
  payment_id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  amount     DECIMAL(10, 2) NOT NULL,
  method     VARCHAR(30) NOT NULL,                     -- 'card' | 'promptpay'
  card_last4 VARCHAR(4),
  status     VARCHAR(30) NOT NULL DEFAULT 'Success',   -- 'Success' | 'Refunded'
  paid_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);

-- รายการโปรด (กดหัวใจเก็บที่พักไว้ดูทีหลัง)
--   PRIMARY KEY (user_id, property_id) = คนหนึ่งกดหัวใจโรงแรมเดียวกันซ้ำไม่ได้ และค้นตาม user_id ได้เร็ว
--   ลบผู้ใช้ (ลบบัญชีตาม PDPA) หรือลบโรงแรม → รายการโปรดหายตาม (ON DELETE CASCADE)
CREATE TABLE IF NOT EXISTS favorites (
  user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  property_id INT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, property_id)
);

-- ใช้นับ "การจองที่ครอบคืนนั้น" ทุกครั้งที่ค้นหา/จอง (ดู server/src/lib/availability.js)
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON bookings(room_id, check_in_date, check_out_date);

-- รูปและรายละเอียดสำหรับแสดงบนหน้าเว็บ
ALTER TABLE properties ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bed_type VARCHAR(100);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS size_sqm INT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN NOT NULL DEFAULT FALSE;
