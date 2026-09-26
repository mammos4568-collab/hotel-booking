-- 1. สร้างตารางผู้ใช้งาน (Users / Customers)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    membership_tier VARCHAR(50) DEFAULT 'Standard',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. สร้างตารางข้อมูลโรงแรม/ที่พัก (Properties / Hotels)
CREATE TABLE properties (
    property_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    description TEXT,
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    star_rating DECIMAL(2, 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. สร้างตารางประเภทห้องพัก (Rooms / Inventory)
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    property_id INT REFERENCES properties(property_id) ON DELETE CASCADE,
    room_type_name VARCHAR(150) NOT NULL,
    description TEXT,
    max_guests INT NOT NULL,
    base_price_per_night DECIMAL(10, 2) NOT NULL,
    total_rooms INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. สร้างตารางจัดการห้องว่างรายวัน
CREATE TABLE room_inventories (
    inventory_id SERIAL PRIMARY KEY,
    room_id INT REFERENCES rooms(room_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    available_rooms INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    UNIQUE (room_id, date)
);

-- 5. สร้างตารางการจอง (Bookings / Reservations)
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    booking_reference VARCHAR(50) UNIQUE NOT NULL,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    property_id INT REFERENCES properties(property_id) ON DELETE SET NULL,
    room_id INT REFERENCES rooms(room_id) ON DELETE SET NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    num_guests INT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'Pending',
    booking_status VARCHAR(50) DEFAULT 'Confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. สร้างตารางรีวิวและคะแนน (Reviews)
CREATE TABLE reviews (
    review_id SERIAL PRIMARY KEY,
    booking_id INT REFERENCES bookings(booking_id) ON DELETE CASCADE,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    property_id INT REFERENCES properties(property_id) ON DELETE CASCADE,
    rating DECIMAL(2, 1) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_properties_city_country ON properties(city, country);
CREATE INDEX idx_room_inventories_date ON room_inventories(room_id, date);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);

-- 1. เพิ่มข้อมูลผู้ใช้งาน (Users)
INSERT INTO users (first_name, last_name, email, password_hash, phone_number, membership_tier) VALUES
('Somsak', ' ใจดี', 'somsak.j@gmail.com', 'hashed_pass_123', '+66812345678', 'Gold'),
('Nicha', ' พัฒนากุล', 'nicha.p@hotmail.com', 'hashed_pass_456', '+66898765432', 'Silver'),
('John', ' Smith', 'john.smith@gmail.com', 'hashed_pass_789', '+12025550143', 'Standard');

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

-- 4. เพิ่มข้อมูลสต็อกห้องว่างและราคา (Room Inventories - ตัวอย่างช่วงวันที่เข้าพัก)
INSERT INTO room_inventories (room_id, date, available_rooms, price) VALUES
-- Deluxe King Room (Property 1)
(1, '2026-10-01', 8, 2500.00),
(1, '2026-10-02', 7, 2500.00),
(1, '2026-10-03', 5, 2900.00), -- ราคาปรับขึ้นช่วงวันหยุด (Dynamic Pricing)
-- Executive Suite (Property 1)
(2, '2026-10-01', 4, 5500.00),
(2, '2026-10-02', 3, 5500.00),
-- Superior Mountain View (Property 2)
(3, '2026-10-01', 6, 1800.00),
(3, '2026-10-02', 6, 1800.00),
-- Beachfront Pool Villa (Property 3)
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
