-- 1. เพิ่มข้อมูลผู้ใช้งาน (Users)
INSERT INTO users (first_name, last_name, email, password_hash, phone_number, membership_tier) VALUES
('Somsak', 'ใจดี', 'somsak.j@gmail.com', 'hashed_pass_123', '+66812345678', 'Gold'),
('Nicha', 'พัฒนากุล', 'nicha.p@hotmail.com', 'hashed_pass_456', '+66898765432', 'Silver'),
('John', 'Smith', 'john.smith@gmail.com', 'hashed_pass_789', '+12025550143', 'Standard');

-- 2. เพิ่มข้อมูลโรงแรม/ที่พัก (Properties)
INSERT INTO properties (name, property_type, description, country, city, address, latitude, longitude, star_rating) VALUES
('The Grand Sathorn Hotel', 'Hotel', 'โรงแรมหรูใจกลางย่านธุรกิจ พร้อมสระว่ายน้ำบนดาดฟ้า', 'Thailand', 'Bangkok', '123 ถนนสาทรเหนือ สีลม บางรัก กรุงเทพฯ', 13.721100, 100.528000, 4.8),
('Chiang Mai Mountain Resort', 'Resort', 'รีสอร์ทท่ามกลางธรรมชาติและขุนเขา บรรยากาศเงียบสงบ', 'Thailand', 'Chiang Mai', '45 หมู่ 2 แม่ริม เชียงใหม่', 18.910000, 98.940000, 4.5),
('Phuket Ocean View Villa', 'Villa', 'วิลล่าติดชายหาดส่วนตัว พร้อมวิวทะเลอันดามันแบบพาโนรามา', 'Thailand', 'Phuket', '88 หาดป่าตอง กะทู้ ภูเก็ต', 7.893300, 98.298500, 5.0);

-- 3. เพิ่มข้อมูลประเภทห้องพัก (Rooms)
INSERT INTO rooms (property_id, room_type_name, description, max_guests, base_price_per_night, total_rooms) VALUES
(1, 'Deluxe King Room', 'ห้องพักเตียงเดี่ยวขนาดใหญ่ พร้อมอ่างอาบน้ำ', 2, 2500.00, 10),
(1, 'Executive Suite', 'ห้องสวีทสุดหรู พร้อมห้องนั่งเล่นแยกเป็นสัดส่วน', 3, 5500.00, 5),
(2, 'Superior Mountain View', 'ห้องพักวิวภูเขา พร้อมระเบียงส่วนตัว', 2, 1800.00, 8),
(3, 'Beachfront Pool Villa', 'วิลล่าส่วนตัวพร้อมสระว่ายน้ำส่วนตัวริมหาด', 4, 12000.00, 3);

-- 4. เพิ่มข้อมูลสต็อกห้องว่างและราคา (Room Inventories)
INSERT INTO room_inventories (room_id, date, available_rooms, price) VALUES
(1, '2026-10-01', 8, 2500.00),
(1, '2026-10-02', 7, 2500.00),
(1, '2026-10-03', 5, 2900.00),
(2, '2026-10-01', 4, 5500.00),
(2, '2026-10-02', 3, 5500.00),
(3, '2026-10-01', 6, 1800.00),
(3, '2026-10-02', 6, 1800.00),
(4, '2026-10-01', 2, 12000.00),
(4, '2026-10-02', 1, 13500.00);

-- 5. เพิ่มข้อมูลการจอง (Bookings)
INSERT INTO bookings (booking_reference, user_id, property_id, room_id, check_in_date, check_out_date, num_guests, total_amount, payment_status, booking_status) VALUES
('AGD-2026-001', 1, 1, 1, '2026-10-01', '2026-10-03', 2, 5400.00, 'Paid', 'Confirmed'),
('AGD-2026-002', 2, 2, 3, '2026-10-01', '2026-10-03', 2, 3600.00, 'Paid', 'Confirmed');

-- 6. เพิ่มข้อมูลรีวิว (Reviews)
INSERT INTO reviews (booking_id, user_id, property_id, rating, comment) VALUES
(1, 1, 1, 4.5, 'โรงแรมสวยมาก พนักงานบริการดีเยี่ยม อาหารเช้าหลากหลาย'),
(2, 2, 2, 5.0, 'บรรยากาศดีสุดๆ เงียบสงบ เหมาะกับการมาพักผ่อนหนีความวุ่นวาย');
