// [B] จอง & ชำระเงิน
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { ACTIVE_BOOKING_SQL, HOLD_MINUTES, getNightlyRates, lockRoomType, summarizeStay } from '../../lib/availability.js';
import { BOOKING_SELECT, cancelBooking, deriveStatus, findBooking, serializeBooking } from '../../lib/bookings.js';
import { todayInBangkok, validateStay } from '../../lib/dates.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { containsProfanity } from '../../lib/moderation.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// กันการใช้งานในทางที่ผิด
// ---------------------------------------------------------------------------
// การจองที่ "รอชำระเงิน" ได้พร้อมกันสูงสุดต่อคน — กันคนเดียวกดจองค้างไว้เรื่อยๆ จนห้องเต็ม
// (กักห้องไว้ไม่ให้คนอื่นจอง ทั้งที่ไม่ได้ตั้งใจจ่ายจริง)
const MAX_ACTIVE_HOLDS = 3;
// จ่ายเงินไม่สำเร็จได้กี่ครั้งต่อการจอง — ครบแล้วยกเลิกการจอง กันการสุ่มเลขบัตร (card testing)
const MAX_FAILED_PAYMENTS = 5;
// จองได้กี่ห้อง (ประเภทเดียวกัน) ต่อการจองหนึ่งครั้ง — ตรงกับ CHECK bookings_rooms_range ใน db/03-booking.sql
const MAX_ROOMS = 5;
// จำกัดจำนวนคำขอต่อผู้ใช้ (key = req.user.id จึงต้องวางหลัง requireAuth)
const createLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const payLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const cancelLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// id ในฐานข้อมูลเป็น INT (สูงสุด 2,147,483,647) — เกินกว่านี้ถือว่าไม่ถูกต้อง ไม่ส่งไปให้ DB error เป็น 500
const MAX_INT = 2_147_483_647;

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_INT ? number : null;
}

// จำนวนห้อง: ไม่ส่งมา = 1 ห้อง · ต้องเป็น 1–MAX_ROOMS
function readRooms(value) {
  if (value === undefined || value === null || value === '') return 1;
  const rooms = toPositiveInt(value);
  return rooms && rooms <= MAX_ROOMS ? rooms : null;
}

// ห้องหนึ่งพักได้ maxGuests คน → N ห้องพักได้ maxGuests × N และต้องมีคนพักอย่างน้อยห้องละ 1 คน
function capacityError(guests, rooms, maxGuests) {
  if (rooms > guests) return 'จำนวนห้องต้องไม่มากกว่าจำนวนผู้เข้าพัก';
  if (guests > maxGuests * rooms) {
    return rooms === 1
      ? `ห้องนี้พักได้สูงสุด ${maxGuests} คน — เพิ่มจำนวนห้องได้`
      : `${rooms} ห้องพักได้สูงสุด ${maxGuests * rooms} คน (ห้องละ ${maxGuests} คน)`;
  }
  return null;
}

// โหลดการจองของ "ตัวเอง" เท่านั้น — ไม่ใช่ของตัวเองตอบ 403
// (ทุก endpoint ต้องกรองด้วย req.user.id ไม่งั้นใครก็ดู/ยกเลิกการจองคนอื่นได้)
async function findOwnBooking(db, bookingId, userId) {
  const row = await findBooking(db, bookingId);
  if (!row) throw httpError(404, 'ไม่พบการจองนี้');
  if (row.user_id !== userId) throw httpError(403, 'คุณไม่มีสิทธิ์เข้าถึงการจองนี้');
  return row;
}

// ---------------------------------------------------------------------------
// GET /api/bookings/quote?roomId=&checkIn=&checkOut=&guests=&rooms=
// สรุปราคาก่อนจอง (หน้า checkout ใช้) — ราคาคิดที่ server เสมอ
// ---------------------------------------------------------------------------
router.get('/quote', async (req, res, next) => {
  try {
    const roomId = toPositiveInt(req.query.roomId);
    const guests = toPositiveInt(req.query.guests ?? 1);
    const rooms = readRooms(req.query.rooms);
    if (!roomId) throw httpError(400, 'ต้องระบุ roomId ที่ถูกต้อง');
    if (!guests) throw httpError(400, 'จำนวนผู้เข้าพักต้องเป็นจำนวนเต็มตั้งแต่ 1 คน');
    if (!rooms) throw httpError(400, `จองได้ครั้งละ 1–${MAX_ROOMS} ห้อง`);
    const stay = validateStay(req.query.checkIn, req.query.checkOut);
    if (stay.error) throw httpError(400, stay.error);

    const { rows } = await pool.query(
      `SELECT r.room_id, r.room_type_name, r.description, r.max_guests, r.image_url, r.bed_type,
              r.size_sqm, r.breakfast_included,
              p.property_id, p.name, p.city, p.address, p.star_rating::float AS stars, p.image_url AS hotel_image
         FROM rooms r JOIN properties p ON p.property_id = r.property_id
        WHERE r.room_id = $1`,
      [roomId]
    );
    const room = rows[0];
    if (!room) throw httpError(404, 'ไม่พบประเภทห้องนี้');

    const nightly = await getNightlyRates(pool, roomId, stay.checkIn, stay.checkOut);
    const { available, totalPrice: pricePerRoom } = summarizeStay(nightly);
    res.json({
      hotel: {
        id: room.property_id, name: room.name, city: room.city, address: room.address,
        stars: room.stars, imageUrl: room.hotel_image,
      },
      room: {
        id: room.room_id, name: room.room_type_name, description: room.description,
        maxGuests: room.max_guests, imageUrl: room.image_url, bedType: room.bed_type,
        sizeSqm: room.size_sqm, breakfastIncluded: room.breakfast_included,
      },
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
      guests,
      rooms,
      fitsGuests: !capacityError(guests, rooms, room.max_guests),
      capacityError: capacityError(guests, rooms, room.max_guests),
      available,
      enoughRooms: available >= rooms,
      nightly: nightly.map(({ date, price }) => ({ date, price })), // ราคาต่อห้องต่อคืน
      pricePerRoom,
      totalPrice: Math.round(pricePerRoom * rooms * 100) / 100,
      holdMinutes: HOLD_MINUTES,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/bookings/me — การจองทั้งหมดของผู้ใช้ที่ล็อกอินอยู่
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.check_in_date DESC, b.booking_id DESC`,
      [req.user.id]
    );
    res.json({ bookings: rows.map(serializeBooking) });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings — สร้างการจอง (สถานะรอชำระ ถือห้องไว้ HOLD_MINUTES นาที)
// body: { roomId, checkIn, checkOut, guests, rooms, guestName, guestEmail, guestPhone, specialRequests }
// ---------------------------------------------------------------------------
router.post('/', requireAuth, createLimiter, async (req, res, next) => {
  // 1) ตรวจ input ให้ครบ "ก่อน" เปิด transaction — ไม่ต้องไปล็อกอะไรใน DB ถ้าข้อมูลผิดตั้งแต่ต้น
  const body = req.body || {};
  const roomId = toPositiveInt(body.roomId);
  const guests = toPositiveInt(body.guests);
  const rooms = readRooms(body.rooms);
  if (!roomId) return next(httpError(400, 'ต้องระบุ roomId ที่ถูกต้อง'));
  if (!guests) return next(httpError(400, 'จำนวนผู้เข้าพักต้องเป็นจำนวนเต็มตั้งแต่ 1 คน'));
  if (!rooms) return next(httpError(400, `จองได้ครั้งละ 1–${MAX_ROOMS} ห้อง`));
  const stay = validateStay(body.checkIn, body.checkOut);
  if (stay.error) return next(httpError(400, stay.error));

  const guestName = String(body.guestName ?? req.user.name ?? '').trim();
  const guestEmail = String(body.guestEmail ?? req.user.email ?? '').trim().toLowerCase();
  const guestPhone = String(body.guestPhone ?? '').trim();
  const specialRequests = String(body.specialRequests ?? '').trim();
  if (!guestName || guestName.length > 200) return next(httpError(400, 'กรุณากรอกชื่อผู้เข้าพัก (ไม่เกิน 200 ตัวอักษร)'));
  if (!EMAIL_PATTERN.test(guestEmail) || guestEmail.length > 255) return next(httpError(400, 'อีเมลผู้เข้าพักไม่ถูกต้อง'));
  if (guestPhone.length > 50) return next(httpError(400, 'เบอร์โทรยาวเกินไป'));
  if (specialRequests.length > 500) return next(httpError(400, 'คำขอพิเศษต้องไม่เกิน 500 ตัวอักษร'));
  // คำขอพิเศษจะถูกส่งถึงพนักงานโรงแรม — ไม่รับข้อความที่มีถ้อยคำไม่สุภาพ (ดู lib/moderation.js)
  if (containsProfanity(specialRequests)) {
    return next(httpError(400, 'คำขอพิเศษมีถ้อยคำที่ไม่สุภาพ กรุณาแก้ไขก่อนส่ง'));
  }

  // 2) ทุกคำสั่งต้องวิ่งบน connection เดียวกัน transaction ถึงจะทำงาน
  //    (pool.query แต่ละครั้งอาจได้คนละ connection → BEGIN/COMMIT ไม่ครอบคำสั่งอื่น)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 ล็อกแถวผู้ใช้ก่อน แล้วค่อยนับการจองที่รอชำระของคนนี้
    //    ถ้าไม่ล็อก คนเดียวกันยิงพร้อมกันหลายคำขอจะนับเห็นตัวเลขเดิมทั้งหมดแล้วทะลุเพดานได้
    //    (ล็อกตามลำดับเดิมเสมอ: ผู้ใช้ → ประเภทห้อง ทุกคำขอ จึงไม่เกิด deadlock)
    await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [req.user.id]);
    const { rows: [{ holds }] } = await client.query(
      `SELECT COUNT(*)::int AS holds FROM bookings b
        WHERE b.user_id = $1 AND LOWER(b.payment_status) = 'pending' AND ${ACTIVE_BOOKING_SQL}`,
      [req.user.id]
    );
    if (holds >= MAX_ACTIVE_HOLDS) {
      throw httpError(429, `คุณมีการจองที่รอชำระเงินอยู่ ${holds} รายการ กรุณาชำระเงินหรือยกเลิกก่อนจองเพิ่ม`);
    }

    // 3) 🔒 ล็อกประเภทห้อง — คำขอที่จองประเภทห้องเดียวกันพร้อมกันจะต่อคิวอยู่ตรงนี้
    const room = await lockRoomType(client, roomId);
    if (!room) throw httpError(404, 'ไม่พบประเภทห้องนี้');
    const tooMany = capacityError(guests, rooms, room.max_guests);
    if (tooMany) throw httpError(400, tooMany);

    // 4) นับห้องว่าง "หลังได้ล็อกแล้ว" — ไม่มีใครแทรกจองระหว่างนับกับ INSERT ได้
    //    (READ COMMITTED: คำสั่งนี้เห็นการจองที่คนก่อนหน้าในคิว COMMIT ไปแล้ว)
    const nightly = await getNightlyRates(client, roomId, stay.checkIn, stay.checkOut);
    const { available, totalPrice: pricePerRoom } = summarizeStay(nightly);
    if (available < 1) throw httpError(409, 'ห้องประเภทนี้เต็มในช่วงวันที่เลือก');
    if (available < rooms) throw httpError(409, `ห้องประเภทนี้ว่างไม่พอ (เหลือ ${available} ห้องในช่วงวันที่เลือก)`);
    // ราคาต่อห้อง × จำนวนห้อง (ทุกห้องเป็นประเภทเดียวกัน ราคารายคืนเท่ากัน)
    const totalPrice = Math.round(pricePerRoom * rooms * 100) / 100;

    // 5) เลขที่การจองแบบเดียวกับข้อมูลของทีม (AGD-ปี-เลขลำดับ) — ขอเลขจาก sequence ก่อน
    //    จึงไม่ซ้ำแน่นอนแม้จองพร้อมกันหลายคน
    const { rows: [{ id: bookingId }] } = await client.query(
      `SELECT nextval(pg_get_serial_sequence('bookings', 'booking_id'))::int AS id`
    );
    const reference = `AGD-${todayInBangkok().slice(0, 4)}-${String(bookingId).padStart(5, '0')}`;

    // 6) ราคารวมคำนวณจากราคารายคืนในฐานข้อมูล — ไม่เชื่อราคาที่ client ส่งมาเด็ดขาด
    await client.query(
      `INSERT INTO bookings (booking_id, booking_reference, user_id, property_id, room_id,
                             check_in_date, check_out_date, num_guests, num_rooms, total_amount,
                             payment_status, booking_status,
                             guest_name, guest_email, guest_phone, special_requests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', 'Confirmed', $11, $12, $13, $14)`,
      [bookingId, reference, req.user.id, room.property_id, roomId,
        stay.checkIn, stay.checkOut, guests, rooms, totalPrice,
        guestName, guestEmail, guestPhone || null, specialRequests || null]
    );

    // 7) COMMIT = บันทึกจริง + ปล่อยล็อก คนถัดไปในคิวจะนับรวมการจองนี้แล้ว
    await client.query('COMMIT');
    res.status(201).json({ booking: serializeBooking(await findBooking(pool, bookingId)) });
  } catch (error) {
    // พังตรงไหนก็ตาม ยกเลิกทั้งหมด — ไม่มีการจองครึ่งๆ กลางๆ ค้างในฐานข้อมูล
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release(); // คืน connection ให้ pool เสมอ ไม่งั้น connection จะรั่วจนระบบค้าง
  }
});

// ---------------------------------------------------------------------------
// GET /api/bookings/:id — รายละเอียดการจอง (ของตัวเองเท่านั้น)
// ---------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const bookingId = toPositiveInt(req.params.id);
    if (!bookingId) throw httpError(400, 'เลขการจองไม่ถูกต้อง');
    const row = await findOwnBooking(pool, bookingId, req.user.id);
    res.json({ booking: serializeBooking(row) });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/pay — ชำระเงิน (จำลอง)
// body: { method: 'card', cardNumber, cardName, expiry: 'MM/YY', cvc } หรือ { method: 'promptpay' }
// ---------------------------------------------------------------------------

// เลขบัตรทดสอบที่ระบบจะ "ปฏิเสธ" (ไว้โชว์กรณีจ่ายไม่ผ่าน) — บัตรอื่นที่ถูกต้องตาม Luhn ผ่านหมด
const DECLINED_TEST_CARD = '4000000000000002';

function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function validatePayment(body) {
  const method = body?.method;
  if (method === 'promptpay') return { method, cardLast4: null };
  if (method !== 'card') throw httpError(400, 'วิธีชำระเงินไม่ถูกต้อง');

  const digits = String(body.cardNumber ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits) || !passesLuhn(digits)) throw httpError(400, 'หมายเลขบัตรไม่ถูกต้อง');
  if (!String(body.cardName ?? '').trim()) throw httpError(400, 'กรุณากรอกชื่อบนบัตร');
  if (!/^\d{3,4}$/.test(String(body.cvc ?? ''))) throw httpError(400, 'รหัส CVC ไม่ถูกต้อง');

  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(body.expiry ?? ''));
  const month = match ? Number(match[1]) : 0;
  if (!match || month < 1 || month > 12) throw httpError(400, 'วันหมดอายุบัตรต้องเป็นรูปแบบ MM/YY');
  const [year, nowMonth] = todayInBangkok().split('-').map(Number);
  const expiryKey = (2000 + Number(match[2])) * 12 + month;
  if (expiryKey < year * 12 + nowMonth) throw httpError(400, 'บัตรหมดอายุแล้ว');

  if (digits === DECLINED_TEST_CARD) throw httpError(402, 'ธนาคารปฏิเสธการชำระเงิน กรุณาใช้บัตรใบอื่น');
  // เก็บแค่ 4 หลักท้าย — ห้ามเก็บเลขบัตรเต็มหรือ CVC ลงฐานข้อมูล
  return { method, cardLast4: digits.slice(-4) };
}

// บันทึกการจ่ายที่ไม่สำเร็จ (ไว้นับจำนวนครั้ง) แล้วคืนจำนวนครั้งที่ผิดทั้งหมดของการจองนี้
async function recordFailedPayment(client, row, body) {
  const method = ['card', 'promptpay'].includes(body?.method) ? body.method : 'unknown';
  const digits = String(body?.cardNumber ?? '').replace(/\D/g, '');
  await client.query(
    `INSERT INTO payments (booking_id, amount, method, card_last4, status)
     VALUES ($1, $2, $3, $4, 'Failed')`,
    [row.booking_id, row.total_amount, method, digits.length >= 4 ? digits.slice(-4) : null]
  );
  const { rows: [{ failed }] } = await client.query(
    `SELECT COUNT(*)::int AS failed FROM payments WHERE booking_id = $1 AND status = 'Failed'`,
    [row.booking_id]
  );
  return failed;
}

router.post('/:id/pay', requireAuth, payLimiter, async (req, res, next) => {
  const bookingId = toPositiveInt(req.params.id);
  if (!bookingId) return next(httpError(400, 'เลขการจองไม่ถูกต้อง'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 🔒 ล็อกแถวการจอง — กันกดจ่ายซ้ำจากสองแท็บพร้อมกันแล้วตัดเงินสองรอบ
    await client.query('SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
    const row = await findOwnBooking(client, bookingId, req.user.id);
    const status = deriveStatus(row, todayInBangkok());

    if (status === 'expired') {
      // หมดเวลาถือห้อง → ปิดการจองนี้ทิ้ง ห้องกลับไปว่างให้คนอื่น แล้วให้ผู้ใช้จองใหม่
      await client.query(
        `UPDATE bookings SET booking_status = 'Cancelled', payment_status = 'Expired', updated_at = now()
          WHERE booking_id = $1`,
        [bookingId]
      );
      await client.query('COMMIT');
      return next(httpError(409, `หมดเวลาชำระเงิน (${HOLD_MINUTES} นาที) กรุณาทำการจองใหม่`));
    }
    if (status !== 'awaiting_payment') {
      throw httpError(409, status === 'cancelled' ? 'การจองนี้ถูกยกเลิกแล้ว' : 'การจองนี้ชำระเงินแล้ว');
    }

    // ตรวจบัตร/วิธีจ่าย — ไม่ผ่านก็ "นับครั้ง" ไว้ในตาราง payments (status = 'Failed')
    // ผิดครบ MAX_FAILED_PAYMENTS ครั้ง → ยกเลิกการจองทันที ปล่อยห้องคืน และต้องจองใหม่
    let payment;
    try {
      payment = validatePayment(req.body);
    } catch (paymentError) {
      const failed = await recordFailedPayment(client, row, req.body);
      if (failed >= MAX_FAILED_PAYMENTS) {
        await client.query(
          `UPDATE bookings SET booking_status = 'Cancelled', payment_status = 'Failed', updated_at = now()
            WHERE booking_id = $1`,
          [bookingId]
        );
        await client.query('COMMIT');
        return next(httpError(429, `ชำระเงินไม่สำเร็จครบ ${MAX_FAILED_PAYMENTS} ครั้ง ระบบยกเลิกการจองนี้เพื่อความปลอดภัย กรุณาทำการจองใหม่`));
      }
      await client.query('COMMIT');
      return next(httpError(paymentError.status, `${paymentError.message} (ลองได้อีก ${MAX_FAILED_PAYMENTS - failed} ครั้ง)`));
    }

    await client.query(
      `INSERT INTO payments (booking_id, amount, method, card_last4, status)
       VALUES ($1, $2, $3, $4, 'Success')`,
      [bookingId, row.total_amount, payment.method, payment.cardLast4]
    );
    await client.query(
      `UPDATE bookings SET payment_status = 'Paid', updated_at = now() WHERE booking_id = $1`,
      [bookingId]
    );
    await client.query('COMMIT');
    res.json({ booking: serializeBooking(await findBooking(pool, bookingId)) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/cancel — ยกเลิกได้ถ้าเป็นของตัวเองและยังไม่ถึงวันเช็กอิน
// จ่ายแล้ว → คืนเงิน (จำลอง) · ห้องกลับมาว่างทันทีเพราะการจองที่ยกเลิกไม่ถูกนับ
// ---------------------------------------------------------------------------
router.post('/:id/cancel', requireAuth, cancelLimiter, async (req, res, next) => {
  const bookingId = toPositiveInt(req.params.id);
  if (!bookingId) return next(httpError(400, 'เลขการจองไม่ถูกต้อง'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 🔒 ล็อกแถวการจอง — กันกดยกเลิกพร้อมกับกดจ่ายเงิน (จะได้ไม่จ่ายเงินให้การจองที่ยกเลิกไปแล้ว)
    await client.query('SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
    const row = await findOwnBooking(client, bookingId, req.user.id);
    const booking = serializeBooking(row);

    if (['cancelled', 'expired'].includes(booking.status)) throw httpError(409, 'การจองนี้ถูกยกเลิกไปแล้ว');
    if (!booking.canCancel) throw httpError(409, 'ยกเลิกได้ก่อนวันเช็กอินเท่านั้น');

    await cancelBooking(client, row); // ยกเลิก + คืนเงินถ้าจ่ายแล้ว (lib/bookings.js — หลังบ้านใช้ตัวเดียวกัน)
    await client.query('COMMIT');
    res.json({ booking: serializeBooking(await findBooking(pool, bookingId)) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

export default router;
