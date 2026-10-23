// [A] ค้นหา & หน้าโรงแรม
import { Router } from 'express';
import { pool } from '../../db.js';
import { roomAvailabilitySql } from '../../lib/availability.js';
import { validateStay } from '../../lib/dates.js';
import {
  AMENITY_KEYS, PROPERTY_TYPES, SORTS, parseList, searchHotels, serializeHotel,
} from '../../lib/hotelSearch.js';
import { FEATURES, FEATURE_KEYS } from '../../lib/hotelFeatures.js';
import { publicHotelSql } from '../../lib/hotelApproval.js';
import { hotelImageUrl, roomImageUrl } from '../../lib/hotelImages.js';
import { LANDMARK_BY_KEY } from '../../lib/landmarks.js';

const router = Router();
const MAX_ROOMS = 5; // จองได้ครั้งละไม่เกิน 5 ห้อง (เท่ากับ modules/booking)

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

// รับ checkIn/checkOut (หรือ checkin/checkout แบบตัวเล็ก) — ไม่ส่งมาเลย = ค้นหาแบบไม่ระบุวัน
function readStay(query) {
  const checkIn = query.checkIn ?? query.checkin;
  const checkOut = query.checkOut ?? query.checkout;
  if (!checkIn && !checkOut) return { checkIn: null, checkOut: null, nights: 0 };
  const stay = validateStay(checkIn, checkOut);
  if (stay.error) throw httpError(400, stay.error);
  return stay;
}

// ---------------------------------------------------------------------------
// GET /api/hotels/destinations — เมืองทั้งหมด + จำนวนที่พัก + ราคาเริ่มต้น (หน้าแรกใช้)
// ---------------------------------------------------------------------------
router.get('/destinations', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.city, p.country,
              COUNT(DISTINCT p.property_id)::int AS hotels,
              MIN(r.base_price_per_night)::float AS min_price
         FROM properties p
         LEFT JOIN rooms r ON r.property_id = p.property_id
        WHERE ${publicHotelSql('p')}
        GROUP BY p.city, p.country
        ORDER BY hotels DESC, p.city`
    );
    res.json({
      destinations: rows.map((row) => ({
        city: row.city, country: row.country, hotels: row.hotels, minPrice: row.min_price,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/hotels — ค้นหาโรงแรม
//   q (หรือ city)          ชื่อเมือง / ชื่อโรงแรม / ที่อยู่
//   checkIn, checkOut      ถ้าส่งมา → แสดงเฉพาะโรงแรมที่ยังมีห้องว่างครบทุกคืน
//   guests                 ต้องมีประเภทห้องที่พักได้ตามจำนวนนี้
//   rooms                  จำนวนห้อง 1–5 (ประเภทเดียวกัน) → ต้องว่างพอ และพักรวมกันได้ guests คน
//   minPrice, maxPrice     ราคาเฉลี่ยต่อคืน (บาท)
//   stars                  ดาวขั้นต่ำ
//   amenities              สิ่งอำนวยความสะดวกที่ต้องมีครบ คั่นด้วยจุลภาค เช่น pool,spa
//   type                   ประเภทที่พัก คั่นด้วยจุลภาค เช่น Resort,Villa
//   features               วิว/บรรยากาศ คั่นด้วยจุลภาค เช่น mountain_view,quiet (lib/hotelFeatures.js)
//   near                   key ของจุดอ้างอิง เช่น tha_phae_gate (lib/landmarks.js) → มีระยะทาง + เรียงใกล้สุดก่อน
//   sort                   recommended | price_asc | price_desc | stars_desc | rating_desc | distance
//   page, limit            แบ่งหน้า
// SQL อยู่ที่ lib/hotelSearch.js (ใช้ร่วมกับผู้ช่วยแนะนำที่พัก ผลลัพธ์จะได้ตรงกัน)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const stay = readStay(req.query);
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const landmark = LANDMARK_BY_KEY.get(String(req.query.near ?? '')) ?? null;
    const features = parseList(req.query.features, FEATURE_KEYS);
    let sort = SORTS[req.query.sort] ? req.query.sort : 'recommended';
    if (landmark && !req.query.sort) sort = 'distance'; // ค้นหาแบบ "ใกล้ ..." → ใกล้สุดขึ้นก่อน

    const text = String(req.query.q ?? req.query.city ?? '').trim();

    const { hotels, total } = await searchHotels(pool, {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      guests: clampInt(req.query.guests, 1, 1, 20),
      rooms: clampInt(req.query.rooms, 1, 1, MAX_ROOMS),
      text,
      // "ใกล้ประตูท่าแพ" แต่ไม่ได้พิมพ์เมือง → ค้นในเมืองของจุดนั้น (ไม่เอาโรงแรมที่อยู่ไกลไปอีกจังหวัด)
      city: landmark && !text ? landmark.city : null,
      stars: optionalNumber(req.query.stars),
      minPrice: optionalNumber(req.query.minPrice),
      maxPrice: optionalNumber(req.query.maxPrice),
      amenities: parseList(req.query.amenities, AMENITY_KEYS),
      types: parseList(req.query.type, PROPERTY_TYPES),
      near: landmark,
      features: features.map((key) => FEATURES[key].patterns),
      sort,
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      hotels,
      total,
      // ชื่อจุดอ้างอิง/วิวที่ใช้กรอง ให้หน้าเว็บแสดงเป็นป้ายได้ (ไม่ต้องเก็บรายชื่อซ้ำฝั่งหน้าเว็บ)
      near: landmark && { key: landmark.key, th: landmark.th, en: landmark.en },
      features: features.map((key) => ({ key, th: FEATURES[key].th, en: FEATURES[key].en })),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      nights: stay.nights,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/hotels/:id?checkIn=&checkOut=&guests=&rooms=
// ข้อมูลโรงแรม + ทุกประเภทห้อง พร้อมห้องว่างและราคารวมของช่วงวันที่เลือก
// ---------------------------------------------------------------------------
// GET /api/hotels/images/:imageId · /api/hotels/room-images/:imageId — ไฟล์รูปโรงแรม/รูปห้องที่เจ้าของอัปโหลด
//   (สาธารณะเหมือนหน้าโรงแรม) รูปไม่เคยถูกแก้ทับ (อัปใหม่ = id ใหม่) → ให้เบราว์เซอร์เก็บ cache ได้ 1 ปี
//   ไม่ต้องโหลดซ้ำทุกครั้งที่เปิดหน้า · ชื่อตารางเป็นค่าคงที่ในโค้ด ไม่ได้มาจากผู้ใช้
function sendImage(table) {
  return async (req, res, next) => {
    try {
      const imageId = Number(req.params.imageId);
      if (!Number.isInteger(imageId) || imageId <= 0 || imageId > 2_147_483_647) throw httpError(400, 'รหัสรูปไม่ถูกต้อง');
      const { rows: [image] } = await pool.query(`SELECT mime_type, data FROM ${table} WHERE image_id = $1`, [imageId]);
      if (!image) throw httpError(404, 'ไม่พบรูปนี้');
      res.set({ 'Content-Type': image.mime_type, 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.send(image.data);
    } catch (error) {
      next(error);
    }
  };
}
router.get('/images/:imageId', sendImage('property_images'));
router.get('/room-images/:imageId', sendImage('room_images'));

router.get('/:id', async (req, res, next) => {
  try {
    const hotelId = Number(req.params.id);
    // id เป็น INT ในฐานข้อมูล — เกิน 2,147,483,647 ถือว่าไม่ถูกต้อง (ไม่ปล่อยให้ DB error เป็น 500)
    if (!Number.isInteger(hotelId) || hotelId <= 0 || hotelId > 2_147_483_647) throw httpError(400, 'รหัสโรงแรมไม่ถูกต้อง');
    const stay = readStay(req.query);
    const guests = clampInt(req.query.guests, 1, 1, 20);
    const rooms = clampInt(req.query.rooms, 1, 1, MAX_ROOMS);

    const hotelResult = await pool.query(
      `SELECT p.*, rv.avg_rating, rv.review_count
         FROM properties p
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS review_count
             FROM reviews WHERE property_id = p.property_id
         ) rv ON TRUE
        WHERE p.property_id = $1 AND ${publicHotelSql('p')}`, // ยังไม่อนุมัติ/ถูกระงับ = ไม่พบ (404)
      [hotelId]
    );
    const hotel = hotelResult.rows[0];
    if (!hotel) throw httpError(404, 'ไม่พบข้อมูลโรงแรม');

    const roomsResult = await pool.query(
      `WITH ra AS (${roomAvailabilitySql(2, 3)})
       SELECT r.room_id, r.room_type_name, r.description, r.max_guests, r.total_rooms,
              r.base_price_per_night::float AS base_price, r.image_url, r.bed_type, r.size_sqm,
              r.breakfast_included, ra.available, ra.stay_price, ra.nights
         FROM rooms r
         JOIN ra ON ra.room_id = r.room_id
        WHERE r.property_id = $1
        ORDER BY ra.stay_price, r.room_id`,
      [hotelId, stay.checkIn, stay.checkOut]
    );

    // รูปที่เจ้าของอัปโหลด เรียงตามลำดับ (ตัวแรก = รูปปก) · ยังไม่มีรูปอัปโหลด → ใช้ลิงก์รูปเดิม 1 รูป
    const { rows: imageRows } = await pool.query(
      'SELECT image_id FROM property_images WHERE property_id = $1 ORDER BY position',
      [hotelId]
    );
    const images = imageRows.length
      ? imageRows.map((row) => hotelImageUrl(row.image_id))
      : [hotel.image_url].filter(Boolean);

    // รูปประเภทห้องทุกห้องของโรงแรมนี้ในคำสั่งเดียว (ไม่ยิงทีละห้อง) แล้วจัดกลุ่มตามห้อง เรียงตามลำดับ
    const { rows: roomImageRows } = await pool.query(
      `SELECT ri.room_id, ri.image_id
         FROM room_images ri JOIN rooms r ON r.room_id = ri.room_id
        WHERE r.property_id = $1
        ORDER BY ri.room_id, ri.position`,
      [hotelId]
    );
    const roomImages = new Map();
    for (const row of roomImageRows) {
      if (!roomImages.has(row.room_id)) roomImages.set(row.room_id, []);
      roomImages.get(row.room_id).push(roomImageUrl(row.image_id));
    }

    res.json({
      ...serializeHotel(hotel),
      imageUrl: images[0] ?? null,
      images,
      description: hotel.description,
      latitude: hotel.latitude === null ? null : Number(hotel.latitude),
      longitude: hotel.longitude === null ? null : Number(hotel.longitude),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
      guests,
      roomCount: rooms,
      rooms: roomsResult.rows.map((room) => {
        // รูปห้องที่อัปโหลด (ตัวแรก = รูปหลัก) · ยังไม่มีรูปอัปโหลด → ใช้ลิงก์รูปเดิม 1 รูป
        const photos = roomImages.get(room.room_id) ?? [room.image_url].filter(Boolean);
        return {
          id: room.room_id,
          name: room.room_type_name,
          description: room.description,
          maxGuests: room.max_guests,
          totalRooms: room.total_rooms,
          basePrice: room.base_price,
          imageUrl: photos[0] ?? null,
          images: photos,
          bedType: room.bed_type,
          sizeSqm: room.size_sqm,
          breakfastIncluded: room.breakfast_included,
          // พักได้ไหม: rooms ห้อง × ห้องละ max_guests คน ต้องพอ และต้องมีคนพักทุกห้อง
          fitsGuests: guests <= room.max_guests * rooms && rooms <= guests,
          // ว่างพอไหม (ไม่ระบุวัน = ยังบอกไม่ได้ ถือว่าพอ)
          enoughRooms: !stay.nights || room.available >= rooms,
          // ระบุวันมา → จำนวนห้องว่างจริงของช่วงนั้น / ไม่ระบุวัน → null (ยังบอกไม่ได้)
          available: stay.nights ? room.available : null,
          stayPrice: stay.nights ? room.stay_price : null,
          nightlyPrice: stay.nights ? Math.round(room.stay_price / room.nights) : room.base_price,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
