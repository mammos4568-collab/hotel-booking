-- ============================================================
-- 06) เชื่อม payment gateway (Opn Payments / Omise) — รันซ้ำได้ ไม่ลบข้อมูล
--
--   payments.gateway_charge_id = รหัสรายการชำระเงินฝั่ง gateway (เช่น chrg_test_...)
--     ใช้ "ถาม gateway" ว่าจ่ายสำเร็จจริงไหม และใช้สั่งคืนเงินตอนยกเลิกการจอง
--   payments.status เพิ่มค่า 'Pending' = ส่งลูกค้าไปยืนยันที่ TrueMoney แล้ว กำลังรอผล
--     (เดิมมี 'Success' | 'Failed' | 'Refunded' — คอลัมน์เป็น VARCHAR ไม่ต้องแก้ constraint)
--
--   อัปเดตฐานข้อมูลเดิม:
--   docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/06-payment-gateway.sql
-- ============================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_charge_id VARCHAR(64);

-- รหัสรายการของ gateway ห้ามซ้ำ (webhook/หน้ากลับจาก gateway จะหาแถวด้วยรหัสนี้)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_charge_id
  ON payments (gateway_charge_id) WHERE gateway_charge_id IS NOT NULL;
