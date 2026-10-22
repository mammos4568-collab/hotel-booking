// ============================================================
// หัวใจของระบบจอง: "ห้องว่าง" กับ "ราคา" ของประเภทห้องในช่วง [checkIn, checkOut)
// หน้าค้นหา หน้าโรงแรม และตอนจองจริง ใช้ logic จากไฟล์นี้ที่เดียว — ห้ามเขียนซ้ำที่อื่น
// ============================================================
//
// ในฐานข้อมูลของทีม 1 แถวใน `rooms` = 1 ประเภทห้อง (เช่น Deluxe King) ที่มีห้องจริง total_rooms ห้อง
//
//   ห้องว่างของคืน d  = ความจุของคืน d − จำนวน "ห้อง" ที่ถูกจองในคืน d
//     ความจุของคืน d   = total_rooms (หรือน้อยกว่า ถ้า room_inventories.available_rooms ของวันนั้นกำหนดไว้)
//     ห้องที่ถูกจอง     = SUM(num_rooms) ของการจองที่ครอบคืน d (การจองหนึ่งจองได้หลายห้อง จึงใช้ COUNT ไม่ได้)
//     การจองครอบคืน d   เมื่อ check_in_date <= d < check_out_date  (ไม่นับคืนวันเช็กเอาต์
//                       → คนหนึ่งเช็กเอาต์วันที่ 12 อีกคนเช็กอินวันที่ 12 ได้)
//   ห้องว่างทั้งทริป   = ค่าน้อยที่สุดของทุกคืน (ต้องว่างครบทุกคืนถึงจะจองได้)
//   ราคารวม           = ผลรวมราคารายคืน (room_inventories.price ถ้ามี ไม่งั้น base_price_per_night)

// การจองที่ยังไม่จ่ายเงิน ถือห้องไว้ได้กี่นาที (เหมือน Agoda ที่ล็อกราคาไว้ให้ระหว่างกรอกบัตร)
export const HOLD_MINUTES = 15;

// การจองที่ยัง "กินห้อง" อยู่ = ไม่ถูกยกเลิก และไม่ใช่การจองค้างชำระที่หมดเวลาแล้ว
// (ใช้ alias `b` ของตาราง bookings)
export const ACTIVE_BOOKING_SQL = `
  LOWER(b.booking_status) <> 'cancelled'
  AND NOT (LOWER(b.payment_status) = 'pending'
           AND b.created_at < now() - make_interval(mins => ${HOLD_MINUTES}))`;

// แถวละ 1 (ประเภทห้อง, คืน) พร้อมราคาและจำนวนห้องว่างของคืนนั้น
// ci/co = เลข parameter ($1, $2, ...) ของวันเช็กอิน/เช็กเอาต์
// ถ้าส่งวันเป็น NULL → generate_series ไม่คืนแถวเลย = "ไม่ได้ระบุวัน"
//   capacity = ห้องที่เปิดขายคืนนั้น · booked = ห้องที่ถูกจองแล้ว · available = capacity − booked
//   override_* = ค่าที่หลังบ้านตั้งพิเศษใน room_inventories (ไม่มี = NULL)
export function nightlyRowsSql(ci, co) {
  return `
    SELECT nightly_raw.*, nightly_raw.capacity - nightly_raw.booked AS available
      FROM (
        SELECT r.room_id,
               r.property_id,
               n.night,
               COALESCE(inv.price, r.base_price_per_night) AS price,
               inv.price AS override_price,
               inv.available_rooms AS override_rooms,
               LEAST(r.total_rooms, COALESCE(inv.available_rooms, r.total_rooms)) AS capacity,
               (SELECT COALESCE(SUM(b.num_rooms), 0)
                  FROM bookings b
                 WHERE b.room_id = r.room_id
                   AND b.check_in_date <= n.night
                   AND b.check_out_date > n.night
                   AND ${ACTIVE_BOOKING_SQL}) AS booked
          FROM rooms r
         CROSS JOIN (SELECT $${ci}::date + i AS night
                       FROM generate_series(0, $${co}::date - $${ci}::date - 1) AS i) n
          LEFT JOIN room_inventories inv ON inv.room_id = r.room_id AND inv.date = n.night
      ) nightly_raw`;
}

// สรุปต่อประเภทห้อง (ใช้เป็น CTE ใน query ค้นหา/หน้าโรงแรม)
//   available  = ห้องว่างทั้งทริป (ถ้าไม่ระบุวัน = total_rooms)
//   stay_price = ราคารวมทั้งทริป (ถ้าไม่ระบุวัน = ราคาพื้นฐาน 1 คืน)
//   nights     = จำนวนคืน (ถ้าไม่ระบุวัน = 0)
export function roomAvailabilitySql(ci, co) {
  return `
    SELECT r.room_id,
           r.property_id,
           r.max_guests,
           COALESCE(a.min_available, r.total_rooms)::int AS available,
           COALESCE(a.stay_price, r.base_price_per_night)::float AS stay_price,
           COALESCE(a.nights, 0)::int AS nights
      FROM rooms r
      LEFT JOIN (
        SELECT room_id,
               GREATEST(MIN(available), 0) AS min_available,
               SUM(price) AS stay_price,
               COUNT(*) AS nights
          FROM (${nightlyRowsSql(ci, co)}) nightly
         GROUP BY room_id
      ) a ON a.room_id = r.room_id`;
}

// ราคาและห้องว่าง "รายคืน" ของประเภทห้องเดียว — ใช้แสดงสรุปราคาและตอนจองจริง
// db เป็นได้ทั้ง pool และ client (ตอนจองต้องส่ง client ที่อยู่ใน transaction)
export async function getNightlyRates(db, roomId, checkIn, checkOut) {
  const { rows } = await db.query(
    `SELECT night::text AS date, price::float AS price, available::int AS available
       FROM (${nightlyRowsSql(2, 3)}) nightly
      WHERE room_id = $1
      ORDER BY night`,
    [roomId, checkIn, checkOut]
  );
  return rows;
}

// ปฏิทินของประเภทห้องเดียวช่วง [from, to) — หลังบ้านใช้แสดง/ตั้งราคาและจำนวนห้องรายวัน
export async function getRoomCalendar(db, roomId, from, to) {
  const { rows } = await db.query(
    `SELECT night::text AS date, price::float AS price, override_price::float AS override_price,
            override_rooms, capacity::int AS capacity, booked::int AS booked, available::int AS available
       FROM (${nightlyRowsSql(2, 3)}) nightly
      WHERE room_id = $1
      ORDER BY night`,
    [roomId, from, to]
  );
  return rows.map((row) => ({
    date: row.date,
    price: row.price,
    overridePrice: row.override_price,
    overrideRooms: row.override_rooms,
    capacity: row.capacity,
    booked: row.booked,
    available: row.available,
  }));
}

// คืนที่มีคนจองประเภทห้องนี้มากที่สุด (ตั้งแต่ fromDate เป็นต้นไป) → หลังบ้านลดจำนวนห้องต่ำกว่านี้ไม่ได้
// ไม่งั้นการจองที่ยืนยันไปแล้วจะไม่มีห้องให้พัก (overbooking)
export async function maxBookedRooms(db, roomId, fromDate) {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(booked), 0)::int AS max_booked
       FROM (
         SELECT night, SUM(b.num_rooms) AS booked
           FROM bookings b
          CROSS JOIN LATERAL generate_series(GREATEST(b.check_in_date, $2::date), b.check_out_date - 1, interval '1 day') AS night
          WHERE b.room_id = $1 AND b.check_out_date > $2::date AND ${ACTIVE_BOOKING_SQL}
          GROUP BY night
       ) per_night`,
    [roomId, fromDate]
  );
  return rows[0].max_booked;
}

export function summarizeStay(nightly) {
  const available = nightly.length ? Math.max(0, Math.min(...nightly.map((n) => n.available))) : 0;
  const totalPrice = Math.round(nightly.reduce((sum, n) => sum + n.price, 0) * 100) / 100;
  return { available, totalPrice, nights: nightly.length };
}

// 🔒 ล็อกแถวประเภทห้องไว้จนกว่า transaction จะ COMMIT/ROLLBACK
//
// ทำไมต้องล็อก: ถ้าสองคนกดจองห้องสุดท้ายพร้อมกัน ทั้งคู่จะนับเห็นว่า "ว่าง 1"
// แล้ว INSERT สำเร็จทั้งคู่ = จองเกิน (race condition แบบเดียวกับ critical section ในวิชา OS)
// FOR UPDATE ทำให้คำขอที่จองประเภทห้องเดียวกันต้องต่อคิวทีละคน (เหมือน mutex)
// คนที่สองจะนับห้องว่าง "หลัง" คนแรก COMMIT แล้ว จึงเห็นว่าเต็มและได้ 409 แทน
//
// ต้องเรียกด้วย client ที่ BEGIN แล้วเท่านั้น (ถ้าใช้ pool.query ล็อกจะหลุดทันทีหลังจบคำสั่ง)
export async function lockRoomType(client, roomId) {
  const { rows } = await client.query(
    `SELECT r.room_id, r.property_id, r.room_type_name, r.max_guests, r.total_rooms
       FROM rooms r
      WHERE r.room_id = $1
        FOR UPDATE`,
    [roomId]
  );
  return rows[0] || null;
}
