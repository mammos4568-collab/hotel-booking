-- ============================================================
-- Schema หลัก (เจ้าของ: D) — แก้ไฟล์นี้ต้องแจ้งทีมทุกครั้ง
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- [C] ผู้ใช้
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'owner', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [D] โรงแรม
CREATE TABLE hotels (
  id          SERIAL PRIMARY KEY,
  owner_id    INT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT,
  description TEXT,
  stars       INT CHECK (stars BETWEEN 1 AND 5),
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [D] ประเภทห้อง (Deluxe, Suite, ...)
CREATE TABLE room_types (
  id              SERIAL PRIMARY KEY,
  hotel_id        INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  max_guests      INT NOT NULL,
  price_per_night NUMERIC(10,2) NOT NULL   -- บาท
);

-- [D] ห้องจริงแต่ละห้อง (booking ผูกกับห้องนี้)
CREATE TABLE rooms (
  id           SERIAL PRIMARY KEY,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  room_number  TEXT NOT NULL
);

-- [B] การจอง — ช่วงวันเป็น [check_in, check_out) คือไม่นับคืนวัน check_out
CREATE TABLE bookings (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  room_id     INT NOT NULL REFERENCES rooms(id),
  check_in    DATE NOT NULL,
  check_out   DATE NOT NULL,
  guests      INT NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'paid', 'cancelled', 'completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  -- ตาข่ายกันจองซ้อนระดับ DB: ห้องเดียวกัน ช่วงวันห้ามทับกัน (ยกเว้นที่ยกเลิกแล้ว)
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);

-- [B] การชำระเงิน
CREATE TABLE payments (
  id         SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id),
  amount     NUMERIC(10,2) NOT NULL,
  method     TEXT NOT NULL,          -- 'mock', 'card', ...
  status     TEXT NOT NULL DEFAULT 'success',
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [C] รีวิว (1 การจอง รีวิวได้ครั้งเดียว)
CREATE TABLE reviews (
  id         SERIAL PRIMARY KEY,
  booking_id INT UNIQUE NOT NULL REFERENCES bookings(id),
  hotel_id   INT NOT NULL REFERENCES hotels(id),
  user_id    INT NOT NULL REFERENCES users(id),
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
