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
