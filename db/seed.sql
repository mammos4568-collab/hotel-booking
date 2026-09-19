-- ============================================================
-- ข้อมูลปลอมสำหรับ dev (เจ้าของ: D) — ทุกคน test บนข้อมูลชุดนี้
-- password_hash ยังเป็นค่าหลอก: C จะเปลี่ยนเป็น bcrypt ตอนทำ login
-- ============================================================
INSERT INTO users (email, password_hash, full_name, role) VALUES
  ('customer@test.com', 'TODO_HASH', 'สมชาย ลูกค้า',   'customer'),  -- id 1
  ('owner@test.com',    'TODO_HASH', 'สมหญิง เจ้าของ', 'owner'),     -- id 2
  ('admin@test.com',    'TODO_HASH', 'แอดมิน ระบบ',    'admin');     -- id 3

INSERT INTO hotels (owner_id, name, city, address, description, stars) VALUES
  (2, 'Riverside Bangkok Hotel', 'Bangkok',    'ถนนเจริญกรุง',   'วิวแม่น้ำเจ้าพระยา ใกล้ BTS', 4),
  (2, 'Sukhumvit Budget Inn',    'Bangkok',    'สุขุมวิท ซอย 11', 'ราคาประหยัด เดินทางสะดวก',   3),
  (2, 'Nimman Boutique',         'Chiang Mai', 'ถนนนิมมานเหมินท์', 'บูทีคโฮเทล ย่านคาเฟ่',       4),
  (2, 'Old City Guesthouse',     'Chiang Mai', 'ในคูเมือง',       'บรรยากาศล้านนา',             2),
  (2, 'Patong Beach Resort',     'Phuket',     'หาดป่าตอง',       'ติดทะเล มีสระว่ายน้ำ',        5);

INSERT INTO room_types (hotel_id, name, max_guests, price_per_night) VALUES
  (1, 'Deluxe',    2, 2500), (1, 'Suite',  4, 5200),
  (2, 'Standard',  2,  900), (2, 'Family', 4, 1600),
  (3, 'Superior',  2, 1800), (3, 'Loft',   3, 2600),
  (4, 'Fan Room',  2,  500), (4, 'Air Room', 2, 750),
  (5, 'Sea View',  2, 4200), (5, 'Pool Villa', 4, 9800);

-- ประเภทห้องละ 2 ห้อง
INSERT INTO rooms (room_type_id, room_number)
SELECT rt.id, (rt.id * 100 + n)::text
FROM room_types rt CROSS JOIN generate_series(1, 2) AS n;

-- ตัวอย่างการจอง 1 รายการ (ให้ B, C, D มีข้อมูลไว้ test)
INSERT INTO bookings (user_id, room_id, check_in, check_out, guests, total_price, status)
VALUES (1, 1, '2026-10-10', '2026-10-12', 2, 5000, 'paid');
