// หลังบ้าน: ภาพรวม (dashboard) — GET /api/admin/stats?days=30
// owner เห็นตัวเลขเฉพาะโรงแรมของตัวเอง · admin เห็นทั้งระบบ
// "วัน" คิดตามเวลาไทยทั้งหมด (จ่ายเงินตอนตี 1 ของไทย = วันนี้ ไม่ใช่เมื่อวานแบบ UTC)
import { Router } from 'express';
import { pool } from '../../db.js';
import { nightlyRowsSql } from '../../lib/availability.js';
import { BOOKING_SELECT, BOOKING_STATUS_SQL, serializeBooking } from '../../lib/bookings.js';
import { addDays, todayInBangkok } from '../../lib/dates.js';
import { ownedBy } from './scope.js';

const router = Router();
const RANGES = [7, 30, 90];
const OCCUPANCY_DAYS = 30; // อัตราเข้าพักของ 30 คืนข้างหน้า
const UPCOMING_DAYS = 7;   // รายการเช็กอินภายใน 7 วัน
const localDate = (column) => `(${column} AT TIME ZONE 'Asia/Bangkok')::date`;

// รายได้ = เงินที่ชำระสำเร็จ (payments.status = 'Success') · คืนเงินแล้วสถานะจะเป็น Refunded จึงไม่ถูกนับ
const PAID_IN_RANGE = `
  FROM payments pm
  JOIN bookings b ON b.booking_id = pm.booking_id
  JOIN properties p ON p.property_id = b.property_id
 WHERE pm.status = 'Success' AND ${localDate('pm.paid_at')} BETWEEN $1::date AND $2::date`;

// ยอดรวมของช่วง [from, to] — ใช้ทั้งช่วงปัจจุบันและช่วงก่อนหน้า (ไว้เทียบว่าขึ้นหรือลง)
async function periodTotals(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows: [row] } = await pool.query(
    `SELECT (SELECT COALESCE(SUM(pm.amount), 0) ${PAID_IN_RANGE} ${scope})::float AS revenue,
            (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.property_id = b.property_id
              WHERE ${localDate('b.created_at')} BETWEEN $1::date AND $2::date ${scope})::int AS bookings`,
    params,
  );
  return row;
}

// รายได้รายวัน — generate_series สร้างทุกวันในช่วงก่อน แล้ว LEFT JOIN → วันที่ไม่มีรายได้ได้ 0 (กราฟไม่ขาดช่วง)
async function revenueByDay(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows } = await pool.query(
    `SELECT d::date::text AS date,
            COALESCE(SUM(paid.amount), 0)::float AS revenue,
            COUNT(paid.payment_id)::int AS payments
       FROM generate_series($1::date, $2::date, interval '1 day') AS d
       LEFT JOIN (
         SELECT pm.payment_id, pm.amount, ${localDate('pm.paid_at')} AS paid_date ${PAID_IN_RANGE} ${scope}
       ) paid ON paid.paid_date = d::date
      GROUP BY d
      ORDER BY d`,
    params,
  );
  return rows;
}

// การจองที่ "สร้าง" ในช่วงนี้ แยกตามสถานะ (สถานะคำนวณแบบเดียวกับหน้าลูกค้า)
async function statusCounts(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows } = await pool.query(
    `SELECT (${BOOKING_STATUS_SQL}) AS status, COUNT(*)::int AS count
       FROM bookings b JOIN properties p ON p.property_id = b.property_id
      WHERE ${localDate('b.created_at')} BETWEEN $1::date AND $2::date ${scope}
      GROUP BY 1`,
    params,
  );
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

// อัตราเข้าพักล่วงหน้า = ห้องที่ถูกจอง ÷ ห้องที่เปิดขาย ของทุกคืนในช่วง [from, to)
// ใช้ nightlyRowsSql ตัวเดียวกับหน้าค้นหา/ตอนจอง → ตัวเลข "ห้องที่ถูกจอง" ตรงกันทุกที่
async function occupancy(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows } = await pool.query(
    `SELECT nightly.night::text AS date,
            SUM(LEAST(nightly.booked, nightly.capacity))::int AS booked,
            SUM(nightly.capacity)::int AS capacity
       FROM (${nightlyRowsSql(1, 2)}) nightly
       JOIN properties p ON p.property_id = nightly.property_id
      WHERE TRUE ${scope}
      GROUP BY nightly.night
      ORDER BY nightly.night`,
    params,
  );
  const booked = rows.reduce((sum, row) => sum + row.booked, 0);
  const capacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  return { from, days: OCCUPANCY_DAYS, booked, capacity, rate: capacity ? booked / capacity : null, byDay: rows };
}

// เช็กอินที่กำลังจะมาถึง (ยืนยันแล้ว หรือรอชำระ) — ส่งเฉพาะข้อมูลที่หน้าภาพรวมใช้ (ชื่อผู้เข้าพักอย่างเดียว)
async function upcomingCheckIns(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows } = await pool.query(
    `SELECT listing.*, COUNT(*) OVER () AS total_count
       FROM (${BOOKING_SELECT}
              WHERE b.check_in_date BETWEEN $1::date AND $2::date
                AND (${BOOKING_STATUS_SQL}) IN ('confirmed', 'awaiting_payment') ${scope}) listing
      ORDER BY listing.check_in, listing.booking_id
      LIMIT 8`,
    params,
  );
  return {
    total: rows.length ? Number(rows[0].total_count) : 0,
    bookings: rows.map(serializeBooking).map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      hotel: booking.hotel.name,
      room: booking.room.name,
      checkIn: booking.checkIn,
      nights: booking.nights,
      guests: booking.guests,
      rooms: booking.rooms,
      guestName: booking.guest.name,
    })),
  };
}

async function topHotels(req, from, to) {
  const params = [from, to];
  const scope = ownedBy(req, params);
  const { rows } = await pool.query(
    `SELECT p.property_id, p.name, SUM(pm.amount)::float AS revenue, COUNT(DISTINCT b.booking_id)::int AS bookings
       ${PAID_IN_RANGE} ${scope}
      GROUP BY p.property_id, p.name
      ORDER BY revenue DESC, p.property_id
      LIMIT 5`,
    params,
  );
  return rows.map((row) => ({ id: row.property_id, name: row.name, revenue: row.revenue, bookings: row.bookings }));
}

// จำนวนโรงแรม/ห้อง/รีวิว ณ ตอนนี้ (ไม่ขึ้นกับช่วงวัน)
async function inventoryTotals(req) {
  const params = [];
  const scope = ownedBy(req, params);
  const { rows: [row] } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM properties p WHERE TRUE ${scope})::int AS hotels,
            (SELECT COUNT(*) FROM rooms r JOIN properties p ON p.property_id = r.property_id WHERE TRUE ${scope})::int AS room_types,
            (SELECT COALESCE(SUM(r.total_rooms), 0) FROM rooms r JOIN properties p ON p.property_id = r.property_id WHERE TRUE ${scope})::int AS rooms,
            (SELECT COUNT(*) FROM reviews rv JOIN properties p ON p.property_id = rv.property_id WHERE TRUE ${scope})::int AS reviews,
            (SELECT ROUND(AVG(rv.rating), 2) FROM reviews rv JOIN properties p ON p.property_id = rv.property_id WHERE TRUE ${scope})::float AS avg_rating`,
    params,
  );
  return { hotels: row.hotels, roomTypes: row.room_types, rooms: row.rooms, reviews: row.reviews, avgRating: row.avg_rating };
}

router.get('/', async (req, res, next) => {
  try {
    const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const today = todayInBangkok();
    const from = addDays(today, -(days - 1)); // รวมวันนี้ = ครบ days วัน
    const previousFrom = addDays(from, -days);
    const previousTo = addDays(from, -1);

    // แต่ละส่วนไม่ขึ้นต่อกัน → ยิง query พร้อมกัน (Promise.all) ไม่ต้องรอทีละตัว
    const [current, previous, byDay, statuses, occupancyNext, upcoming, top, totals] = await Promise.all([
      periodTotals(req, from, today),
      periodTotals(req, previousFrom, previousTo),
      revenueByDay(req, from, today),
      statusCounts(req, from, today),
      occupancy(req, today, addDays(today, OCCUPANCY_DAYS)),
      upcomingCheckIns(req, today, addDays(today, UPCOMING_DAYS - 1)),
      topHotels(req, from, today),
      inventoryTotals(req),
    ]);

    res.json({
      range: { days, from, to: today },
      current,
      previous,
      revenueByDay: byDay,
      statusCounts: statuses,
      occupancy: occupancyNext,
      upcoming,
      topHotels: top,
      totals,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
