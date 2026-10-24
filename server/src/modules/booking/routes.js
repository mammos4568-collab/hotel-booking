// [B] จอง & ชำระเงิน
import { Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { ACTIVE_BOOKING_SQL, HOLD_MINUTES, getNightlyRates, lockRoomType, summarizeStay } from '../../lib/availability.js';
import { BOOKING_SELECT, cancelBooking, deriveStatus, findBooking, serializeBooking } from '../../lib/bookings.js';
import { publicHotelSql } from '../../lib/hotelApproval.js';
import { hotelCoverSql, roomCoverSql } from '../../lib/hotelImages.js';
import { todayInBangkok, validateStay } from '../../lib/dates.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { containsProfanity } from '../../lib/moderation.js';
import { chargeOutcome, createTrueMoneyCharge, opnEnabled, opnTestMode, refundCharge, retrieveCharge } from '../../lib/opn.js';
import { maskPromptpay, promptpayPayload, sitePromptpay } from '../../lib/promptpay.js';

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
      `SELECT r.room_id, r.room_type_name, r.description, r.max_guests, ${roomCoverSql('r')} AS image_url, r.bed_type,
              r.size_sqm, r.breakfast_included,
              p.property_id, p.name, p.city, p.address, p.star_rating::float AS stars, ${hotelCoverSql('p')} AS hotel_image
         FROM rooms r JOIN properties p ON p.property_id = r.property_id
        WHERE r.room_id = $1 AND ${publicHotelSql('p')}`,
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
    // โรงแรมที่ยังไม่อนุมัติ/ถูกระงับ จองไม่ได้ — หน้าเว็บไม่แสดงอยู่แล้ว แต่กันคนยิง API ด้วย roomId ตรงๆ
    // (ตรวจหลังล็อกห้อง: ถ้า admin กดระงับพร้อมกัน ฝั่งใดฝั่งหนึ่งต้องรออีกฝั่ง COMMIT ก่อน)
    const { rows: [hotel] } = await client.query(
      `SELECT ${publicHotelSql('p')} AS bookable FROM properties p WHERE p.property_id = $1`,
      [room.property_id]
    );
    if (!hotel?.bookable) throw httpError(404, 'ไม่พบประเภทห้องนี้');
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
// GET /api/bookings/payment-config — หน้าชำระเงินใช้เลือกว่าจะแสดง TrueMoney แบบไหน
//   'opn' = เชื่อม Opn Payments จริง (พาไปยืนยันในแอป) · 'simulated' = แบบจำลอง (กรอกเบอร์ทดสอบ)
//   promptpayLive = ตั้ง PROMPTPAY_ID แล้ว → ผู้ดูแลระบบลองโอนเงินจริงด้วย PromptPay ได้ (ไม่บอกเบอร์ในนี้)
// ---------------------------------------------------------------------------
router.get('/payment-config', (req, res) => {
  res.json({
    truemoney: opnEnabled() ? 'opn' : 'simulated',
    testMode: !opnEnabled() || opnTestMode(),
    promptpayLive: Boolean(sitePromptpay()),
  });
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
// GET /api/bookings/:id/promptpay-qr — PromptPay QR "เงินจริง" (เฉพาะผู้ดูแลระบบ ใช้กับการจองของตัวเอง)
//   ทำไมเฉพาะ admin: เว็บนี้เป็นโรงแรมสมมติ ถ้าเปิดให้คนทั่วไปโอนเงินจริงจะเสี่ยงเป็นการหลอกรับเงิน
//   ยอดเงิน = ยอดของการจองที่ server คิดไว้แล้ว (ไม่รับยอดจากหน้าเว็บ) · โอนเข้าพร้อมเพย์ที่ตั้งใน PROMPTPAY_ID
//   ธนาคารไม่แจ้งผลกลับมาที่เว็บ → admin ตรวจในแอปธนาคารแล้วกดยืนยันเอง (POST /:id/pay method 'promptpay_live')
// ---------------------------------------------------------------------------
router.get('/:id/promptpay-qr', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') throw httpError(403, 'PromptPay เงินจริงใช้ได้เฉพาะผู้ดูแลระบบ');
    const target = sitePromptpay();
    if (!target) throw httpError(404, 'ยังไม่ได้ตั้งหมายเลขพร้อมเพย์สำหรับรับเงินจริง (PROMPTPAY_ID)');
    const bookingId = toPositiveInt(req.params.id);
    if (!bookingId) throw httpError(400, 'เลขการจองไม่ถูกต้อง');
    const row = await findOwnBooking(pool, bookingId, req.user.id);
    if (deriveStatus(row, todayInBangkok()) !== 'awaiting_payment') throw httpError(409, 'การจองนี้ไม่ได้รอชำระเงินแล้ว');

    const payload = promptpayPayload(target, row.total_amount);
    res.json({
      qr: await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320 }),
      payload, // ข้อความใน QR (ไว้ตรวจ/อธิบาย — admin เห็นได้ เพราะสแกน QR ก็ได้ข้อความเดียวกัน)
      amount: row.total_amount,
      account: maskPromptpay(target),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/pay — ชำระเงิน
// body: { method: 'card', cardNumber, cardName, expiry: 'MM/YY', cvc } · { method: 'promptpay' }  (จำลอง)
//       · { method: 'promptpay_live' } = admin ยืนยันว่าได้รับเงินโอน PromptPay จริงแล้ว (ดู /:id/promptpay-qr)
//       · { method: 'truemoney', walletPhone }
//         - ตั้ง OMISE_SECRET_KEY แล้ว → จ่ายผ่าน Opn Payments จริง: ตอบ { redirectUrl } ให้ไปยืนยันในแอป TrueMoney
//           แล้วหน้าเว็บเรียก /pay/verify ตอนกลับมา (walletPhone ไม่ใช้ — ลูกค้ายืนยันในแอปเอง)
//         - ไม่ได้ตั้ง → แบบจำลอง: ตรวจรูปแบบเบอร์ แล้วถือว่าจ่ายแล้ว
// ---------------------------------------------------------------------------

// การจ่ายด้วยบัตรเป็นการจำลอง → รับเฉพาะเลขบัตรทดสอบเหล่านี้ เลขอื่น (เช่น บัตรจริงที่คนเผลอพิมพ์บนเว็บสาธิต) ปฏิเสธหมด
// หน้าเว็บตรวจก่อนส่งอยู่แล้ว (PaymentPage.jsx ต้องมีรายการตรงกัน) — ที่นี่ตรวจซ้ำเผื่อมีคนยิง API เอง
const TEST_CARDS = new Set([
  '4242424242424242', // Visa — ผ่าน
  '5555555555554444', // Mastercard — ผ่าน
  '4000000000000002', // Visa — ธนาคารปฏิเสธ (ไว้โชว์กรณีจ่ายไม่ผ่าน)
]);
const DECLINED_TEST_CARD = '4000000000000002';
// เบอร์ทดสอบของ TrueMoney Wallet ที่จำลองว่า "ยอดเงินในวอลเล็ทไม่พอ" — เบอร์มือถืออื่นที่ถูกรูปแบบผ่านหมด
const DECLINED_TEST_WALLET = '0800000000';
const PAYMENT_METHODS = ['card', 'promptpay', 'promptpay_live', 'truemoney'];

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
  // promptpay = จำลอง · promptpay_live = เงินจริงที่ admin ยืนยันเอง (ตรวจสิทธิ์ admin แล้วใน route ก่อนมาถึงตรงนี้)
  if (method === 'promptpay' || method === 'promptpay_live') return { method, cardLast4: null };
  if (method === 'truemoney') {
    // จำลองการจ่ายด้วย TrueMoney Wallet: ตรวจแค่รูปแบบเบอร์มือถือไทยที่ผูกกับวอลเล็ต (ไม่มีการตัดเงินจริง)
    // ไม่เก็บเบอร์ลงฐานข้อมูล — ใช้ยืนยันการจ่ายครั้งนี้เท่านั้น (PDPA: เก็บเท่าที่จำเป็น)
    const phone = String(body.walletPhone ?? '').replace(/[\s-]/g, '');
    if (!/^0[689]\d{8}$/.test(phone)) throw httpError(400, 'เบอร์ TrueMoney Wallet ไม่ถูกต้อง (มือถือ 10 หลัก ขึ้นต้นด้วย 06, 08 หรือ 09)');
    if (phone === DECLINED_TEST_WALLET) throw httpError(402, 'ยอดเงินใน TrueMoney Wallet ไม่พอ กรุณาเติมเงินหรือเลือกวิธีชำระอื่น');
    return { method, cardLast4: null };
  }
  if (method !== 'card') throw httpError(400, 'วิธีชำระเงินไม่ถูกต้อง');

  const digits = String(body.cardNumber ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits) || !passesLuhn(digits)) throw httpError(400, 'หมายเลขบัตรไม่ถูกต้อง');
  if (!TEST_CARDS.has(digits)) throw httpError(400, 'เว็บนี้จำลองการชำระเงิน ใช้ได้เฉพาะบัตรทดสอบ เช่น 4242 4242 4242 4242 — ห้ามใส่บัตรจริง');
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
// error จาก Opn (ต่อไม่ติด / key ผิด / ปฏิเสธรายการ) → บอกผู้ใช้เป็นภาษาไทย (error 5xx ทั่วไปจะได้แค่ข้อความกลางๆ)
// log เฉพาะรหัส error ของ Opn ไม่มีข้อมูลลูกค้า
function passError(error, res, next) {
  if (!error.opnCode) return next(error);
  console.warn(`[${new Date().toISOString()}] Opn Payments error: ${error.opnCode}`);
  return res.status(502).json({ message: 'เชื่อมต่อระบบชำระเงิน (Opn Payments) ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
}

const frontendUrl = (path) => new URL(path, process.env.CLIENT_URL || 'http://localhost:5173').toString();

// ยอดที่ TrueMoney (Opn) รับได้ต่อครั้ง — ต่ำ/สูงกว่านี้ Opn ปฏิเสธ จึงตรวจก่อนจะได้บอกผู้ใช้ชัดๆ
const TRUEMONEY_MIN_BAHT = 20;
const TRUEMONEY_MAX_BAHT = 50_000;

// ---------------------------------------------------------------------------
// ผลจาก Opn → อัปเดตการจองของเรา (ใช้ทั้งตอนสร้างรายการซ้ำ, หน้ากลับจาก TrueMoney และ webhook)
// ต้องเรียกใน transaction ที่ 🔒 ล็อกแถวการจองแล้ว (FOR UPDATE) — หน้าเว็บกับ webhook อาจมาพร้อมกัน
// ล็อกแล้วจะทำทีละคน คนที่สองเห็นว่า payment ไม่ใช่ 'Pending' แล้วจึงไม่บันทึก/คืนเงินซ้ำ
// คืน { state: 'paid' | 'pending' | 'failed' | 'refunded', message?, failed? }
// ---------------------------------------------------------------------------
async function countFailedPayments(client, bookingId) {
  const { rows: [{ failed }] } = await client.query(
    `SELECT COUNT(*)::int AS failed FROM payments WHERE booking_id = $1 AND status = 'Failed'`,
    [bookingId]
  );
  return failed;
}

async function applyGatewayCharge(client, row, payment, charge) {
  // จัดการไปแล้ว (เช่น webhook มาถึงก่อนหน้าเว็บ) → ตอบผลเดิม ไม่ทำซ้ำ
  if (payment.status === 'Success') return { state: 'paid' };
  if (payment.status === 'Refunded') return { state: 'refunded', message: 'รายการนี้คืนเงินแล้ว' };
  if (payment.status === 'Failed') {
    return { state: 'failed', message: 'ชำระเงินด้วย TrueMoney ไม่สำเร็จ', failed: await countFailedPayments(client, row.booking_id) };
  }

  const outcome = chargeOutcome(charge);
  if (outcome.state === 'pending') return outcome;

  if (outcome.state === 'failed') {
    await client.query(`UPDATE payments SET status = 'Failed' WHERE payment_id = $1`, [payment.payment_id]);
    const failed = await countFailedPayments(client, row.booking_id);
    if (failed >= MAX_FAILED_PAYMENTS) {
      await client.query(
        `UPDATE bookings SET booking_status = 'Cancelled', payment_status = 'Failed', updated_at = now()
          WHERE booking_id = $1 AND LOWER(booking_status) <> 'cancelled'`,
        [row.booking_id]
      );
    }
    return { ...outcome, failed };
  }

  // Opn บอกว่าจ่ายสำเร็จ — แต่การจองต้องยัง "รอชำระ" อยู่ ถ้าหมดเวลาถือห้อง/ถูกยกเลิก/จ่ายด้วยวิธีอื่นไปแล้ว
  // ห้องอาจถูกคนอื่นจองไปแล้ว → คืนเงินรายการนี้ทันที แทนที่จะรับเงินแต่ไม่มีห้องให้
  const status = deriveStatus(row, todayInBangkok());
  if (status !== 'awaiting_payment') {
    // คืนเงินไปแล้วรอบก่อน (เช่น COMMIT ไม่ผ่านหลังสั่งคืน) → ไม่สั่งคืนซ้ำ
    if ((charge.refunded_amount ?? 0) < charge.amount) await refundCharge(charge.id, payment.amount);
    await client.query(`UPDATE payments SET status = 'Refunded' WHERE payment_id = $1`, [payment.payment_id]);
    if (status === 'expired') {
      await client.query(
        `UPDATE bookings SET booking_status = 'Cancelled', payment_status = 'Expired', updated_at = now() WHERE booking_id = $1`,
        [row.booking_id]
      );
    }
    return {
      state: 'refunded',
      message: status === 'expired'
        ? `หมดเวลาถือห้อง (${HOLD_MINUTES} นาที) ก่อนชำระเงินสำเร็จ ระบบคืนเงินให้แล้ว กรุณาจองใหม่`
        : 'การจองนี้ไม่ได้รอชำระเงินแล้ว ระบบคืนเงินรายการ TrueMoney นี้ให้แล้ว',
    };
  }

  await client.query(`UPDATE payments SET status = 'Success', paid_at = now() WHERE payment_id = $1`, [payment.payment_id]);
  await client.query(`UPDATE bookings SET payment_status = 'Paid', updated_at = now() WHERE booking_id = $1`, [row.booking_id]);
  return { state: 'paid' };
}

// เริ่มจ่ายด้วย TrueMoney ผ่าน Opn → { redirectUrl } ให้หน้าเว็บพาไปยืนยันในแอป
// ถ้ามีรายการเดิมที่ยังรอยืนยันอยู่ ใช้ลิงก์เดิม (กันกดหลายครั้งแล้วเกิดหลายรายการ = อาจโดนตัดเงินซ้ำ)
async function startTrueMoneyCharge(client, row) {
  if (row.total_amount < TRUEMONEY_MIN_BAHT || row.total_amount > TRUEMONEY_MAX_BAHT) {
    throw httpError(400, `TrueMoney รับยอดต่อครั้ง ฿${TRUEMONEY_MIN_BAHT}–฿${TRUEMONEY_MAX_BAHT.toLocaleString()} กรุณาเลือกวิธีชำระอื่น`);
  }
  const { rows: [pending] } = await client.query(
    `SELECT payment_id, gateway_charge_id, amount, status FROM payments
      WHERE booking_id = $1 AND status = 'Pending' AND gateway_charge_id IS NOT NULL
      ORDER BY payment_id DESC LIMIT 1 FOR UPDATE`,
    [row.booking_id]
  );
  if (pending) {
    const charge = await retrieveCharge(pending.gateway_charge_id);
    const result = await applyGatewayCharge(client, row, pending, charge);
    if (result.state === 'pending' && charge.authorize_uri) return { redirectUrl: charge.authorize_uri };
    if (result.state === 'paid') return { paid: true };
    // ไม่ throw ตรงนี้ — ผลของรายการเดิม (คืนเงิน/นับครั้งที่พลาด) ต้องถูก COMMIT ก่อน แล้วค่อยตอบ error
    if (result.state === 'refunded') return { error: { status: 409, message: result.message } };
    if (result.failed >= MAX_FAILED_PAYMENTS) {
      return { error: { status: 429, message: `ชำระเงินไม่สำเร็จครบ ${MAX_FAILED_PAYMENTS} ครั้ง ระบบยกเลิกการจองนี้เพื่อความปลอดภัย กรุณาทำการจองใหม่` } };
    }
    // รายการเดิมไม่สำเร็จ/หมดอายุ → สร้างรายการใหม่ด้านล่าง
  }

  const charge = await createTrueMoneyCharge({
    amount: row.total_amount,
    bookingId: row.booking_id,
    reference: row.booking_reference,
    returnUri: frontendUrl(`/checkout/pay/${row.booking_id}?gateway_return=1`),
  });
  await client.query(
    `INSERT INTO payments (booking_id, amount, method, status, gateway_charge_id)
     VALUES ($1, $2, 'truemoney', 'Pending', $3)`,
    [row.booking_id, row.total_amount, charge.id]
  );
  return { redirectUrl: charge.authorize_uri };
}

async function recordFailedPayment(client, row, body) {
  const method = PAYMENT_METHODS.includes(body?.method) ? body.method : 'unknown';
  const digits = String(body?.cardNumber ?? '').replace(/\D/g, '');
  // เก็บ 4 หลักท้ายเฉพาะบัตรทดสอบ — เลขอื่นอาจเป็นบัตรจริง ไม่เก็บอะไรจากมันเลย (PDPA: เก็บเท่าที่จำเป็น)
  await client.query(
    `INSERT INTO payments (booking_id, amount, method, card_last4, status)
     VALUES ($1, $2, $3, $4, 'Failed')`,
    [row.booking_id, row.total_amount, method, TEST_CARDS.has(digits) ? digits.slice(-4) : null]
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

    // PromptPay เงินจริง: ยืนยันได้เฉพาะ admin (และต้องตั้ง PROMPTPAY_ID) — admin กดหลังเห็นเงินเข้าบัญชีในแอปธนาคาร
    // ผ่านล็อกแถวการจอง + ตรวจว่ายังรอชำระอยู่ เหมือนวิธีอื่น → กดยืนยันซ้ำสองแท็บ/หลังหมดเวลาถือห้อง ไม่ได้
    if (req.body?.method === 'promptpay_live' && (req.user.role !== 'admin' || !sitePromptpay())) {
      throw httpError(403, 'PromptPay เงินจริงใช้ได้เฉพาะผู้ดูแลระบบ');
    }

    // TrueMoney + เชื่อม Opn Payments อยู่ → สร้างรายการที่ gateway แล้วส่งลูกค้าไปยืนยันในแอป
    // (ยังไม่ถือว่าจ่าย — สถานะจ่ายแล้วมาจากการถาม Opn ตอนกลับมา หรือจาก webhook เท่านั้น)
    if (req.body?.method === 'truemoney' && opnEnabled()) {
      const result = await startTrueMoneyCharge(client, row);
      await client.query('COMMIT'); // บันทึกผลของรายการเดิม (ถ้ามี) ก่อนตอบ แม้จะตอบเป็น error
      if (result.error) return next(httpError(result.error.status, result.error.message));
      return res.json(result);
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
    passError(error, res, next);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/:id/pay/verify — กลับมาจากหน้ายืนยันของ TrueMoney → ถาม Opn ว่าจ่ายสำเร็จจริงไหม
//   ไม่เชื่อ query string ที่ติดมากับ URL (ใครก็พิมพ์เองได้) — ดึงรายการจาก Opn ด้วย secret key ของเราเท่านั้น
//   ตอบ { state: 'paid' | 'pending', booking } · ไม่สำเร็จ 402 · ครบ 5 ครั้ง 429 · คืนเงินแล้ว 409
// ---------------------------------------------------------------------------
router.post('/:id/pay/verify', requireAuth, payLimiter, async (req, res, next) => {
  const bookingId = toPositiveInt(req.params.id);
  if (!bookingId) return next(httpError(400, 'เลขการจองไม่ถูกต้อง'));
  if (!opnEnabled()) return next(httpError(400, 'ระบบนี้ยังไม่ได้เชื่อมต่อ Opn Payments'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 🔒 ล็อกการจองก่อน แล้วค่อยล็อกแถว payment — ลำดับเดียวกับหน้าจ่ายเงินและ webhook (กัน deadlock)
    await client.query('SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
    const row = await findOwnBooking(client, bookingId, req.user.id);
    const { rows: [payment] } = await client.query(
      `SELECT payment_id, gateway_charge_id, amount, status FROM payments
        WHERE booking_id = $1 AND gateway_charge_id IS NOT NULL
        ORDER BY payment_id DESC LIMIT 1 FOR UPDATE`,
      [bookingId]
    );
    if (!payment) throw httpError(404, 'ไม่พบรายการชำระเงินผ่าน TrueMoney ของการจองนี้');

    const charge = payment.status === 'Pending' ? await retrieveCharge(payment.gateway_charge_id) : null;
    const result = await applyGatewayCharge(client, row, payment, charge);
    await client.query('COMMIT'); // บันทึกผลก่อนตอบ ไม่ว่าจะสำเร็จหรือไม่

    if (result.state === 'refunded') return next(httpError(409, result.message));
    if (result.state === 'failed') {
      if (result.failed >= MAX_FAILED_PAYMENTS) {
        return next(httpError(429, `ชำระเงินไม่สำเร็จครบ ${MAX_FAILED_PAYMENTS} ครั้ง ระบบยกเลิกการจองนี้เพื่อความปลอดภัย กรุณาทำการจองใหม่`));
      }
      return next(httpError(402, `${result.message} (ลองได้อีก ${MAX_FAILED_PAYMENTS - result.failed} ครั้ง)`));
    }
    res.json({ state: result.state, booking: serializeBooking(await findBooking(pool, bookingId)) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    passError(error, res, next);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/bookings/gateway/webhook — Opn แจ้งว่ารายการจ่ายเงินเสร็จแล้ว (charge.complete)
//   สำคัญตอนลูกค้าจ่ายแล้วปิดแอป/เบราว์เซอร์ไปเลย ไม่ได้กลับมาหน้าเว็บ — ไม่มี webhook = เงินถูกตัดแต่การจองไม่อัปเดต
//   ไม่ต้องล็อกอิน (Opn เป็นคนเรียก) จึงใช้แค่ "รหัสรายการ" จากข้อมูลที่ส่งมา แล้วดึงสถานะจริงจาก Opn เอง
//   → ปลอม webhook มาก็ทำอะไรไม่ได้ นอกจากทำให้ระบบไปถาม Opn ซ้ำ (มี rate limit ต่อ IP)
//   ตั้ง URL นี้ใน dashboard ของ Opn ตอน deploy จริง (localhost รับ webhook จากอินเทอร์เน็ตไม่ได้)
// ---------------------------------------------------------------------------
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 120, key: (req) => `ip:${req.ip}` });

router.post('/gateway/webhook', webhookLimiter, async (req, res, next) => {
  const data = req.body?.data;
  const chargeId = data?.object === 'charge' ? String(data.id ?? '') : '';
  if (!opnEnabled() || !/^chrg_(test_)?[0-9a-z]+$/.test(chargeId)) return res.json({ ok: true, ignored: true });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [found] } = await client.query('SELECT booking_id FROM payments WHERE gateway_charge_id = $1', [chargeId]);
    if (!found) {
      await client.query('ROLLBACK');
      return res.json({ ok: true, ignored: true });
    }
    await client.query('SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE', [found.booking_id]);
    const row = await findBooking(client, found.booking_id);
    const { rows: [payment] } = await client.query(
      'SELECT payment_id, gateway_charge_id, amount, status FROM payments WHERE gateway_charge_id = $1 FOR UPDATE',
      [chargeId]
    );
    const charge = payment.status === 'Pending' ? await retrieveCharge(chargeId) : null;
    const result = await applyGatewayCharge(client, row, payment, charge);
    await client.query('COMMIT');
    res.json({ ok: true, state: result.state });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error); // ตอบ 5xx → Opn จะส่ง webhook มาใหม่ภายหลัง
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
    passError(error, res, next);
  } finally {
    client.release();
  }
});

export default router;
