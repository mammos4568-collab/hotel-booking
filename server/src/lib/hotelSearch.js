// ============================================================
// ค้นหาโรงแรม — SQL ชุดเดียวที่ใช้ร่วมกันระหว่าง
//   • หน้าค้นหา              GET  /api/hotels
//   • ผู้ช่วยแนะนำที่พัก       POST /api/assistant/chat
// ผลลัพธ์ของสองทางจึงตรงกันเสมอ (ห้องว่าง/ราคายังมาจาก lib/availability.js ที่เดียวเหมือนเดิม)
// ============================================================
import { roomAvailabilitySql } from './availability.js';
import { nightsBetween } from './dates.js';

// ORDER BY เลือกจาก whitelist นี้เท่านั้น — ไม่ต่อ string จากผู้ใช้เข้า SQL
export const SORTS = {
  // แนะนำ = คะแนนรีวิวดี + ดาวเยอะก่อน
  recommended: 'rv.avg_rating DESC NULLS LAST, h.star_rating DESC NULLS LAST, h.property_id',
  price_asc: 'h.nightly_from ASC, h.property_id',
  price_desc: 'h.nightly_from DESC, h.property_id',
  stars_desc: 'h.star_rating DESC NULLS LAST, h.nightly_from ASC',
  rating_desc: 'rv.avg_rating DESC NULLS LAST, rv.review_count DESC, h.property_id',
  // ใช้คู่กับ near (จุดอ้างอิง) — ไม่มี near ทุกแถวเป็น NULL ก็จะเรียงตาม id ไปตามปกติ
  distance: 'h.distance_km ASC NULLS LAST, h.property_id',
  distance_desc: 'h.distance_km DESC NULLS LAST, h.property_id',
};

// ค่าที่กรองได้ — ตรงกับข้อมูลใน properties.amenities และ properties.property_type
export const AMENITY_KEYS = [
  'wifi', 'pool', 'breakfast', 'parking', 'gym', 'spa',
  'restaurant', 'bar', 'beach', 'airport_shuttle', 'family', 'kitchen',
];
export const PROPERTY_TYPES = ['Hotel', 'Resort', 'Villa', 'Boutique Hotel', 'Apartment', 'Guesthouse'];

// "pool,beach" (จาก query string) หรือ array → เก็บเฉพาะค่าที่อยู่ใน allowed (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
export function parseList(value, allowed) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(',');
  const lookup = new Map(allowed.map((item) => [item.toLowerCase(), item]));
  return [...new Set(items.map((item) => lookup.get(String(item).trim().toLowerCase())).filter(Boolean))];
}

// escape ตัว % กับ _ ที่ผู้ใช้พิมพ์ จะได้ค้นหาตามตัวอักษรจริง ไม่กลายเป็น wildcard ของ ILIKE
export function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function serializeHotel(row) {
  return {
    id: row.property_id,
    name: row.name,
    type: row.property_type,
    city: row.city,
    country: row.country,
    address: row.address,
    stars: row.star_rating === null ? null : Number(row.star_rating),
    imageUrl: row.image_url,
    amenities: row.amenities || [],
    rating: row.avg_rating === null ? null : Number(row.avg_rating),
    reviewCount: row.review_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// searchHotels(db, filters) → { hotels, total }
//   checkIn, checkOut   ส่งมาทั้งคู่ → เฉพาะโรงแรมที่ยังมีห้องว่างครบทุกคืน (ไม่ส่ง = ไม่เช็กห้องว่าง)
//   guests, rooms       ต้องมีประเภทห้องที่ว่างอย่างน้อย rooms ห้อง และพักรวมกันได้ guests คน
//                       (ห้องละ max_guests คน) — stayFrom เป็นราคารวมของทุกห้อง
//   text                คำค้นในชื่อเมือง / ชื่อโรงแรม / ที่อยู่ (ILIKE)
//   city                ชื่อเมืองตรงตัว (ผู้ช่วยใช้ — แม่นกว่า text)
//   propertyId          เฉพาะโรงแรมนี้ (ผู้ช่วยใช้ตอนถามถึงโรงแรมที่ระบุชื่อ)
//   stars               ดาวขั้นต่ำ
//   minPrice, maxPrice  ราคาเฉลี่ยต่อคืนของห้องที่ถูกที่สุดที่เข้าเงื่อนไข (บาท)
//   amenities           ต้องมีครบทุกอย่าง เช่น ['pool', 'spa']
//   types               ประเภทที่พัก อย่างใดอย่างหนึ่ง เช่น ['Resort', 'Villa']
//   near                { lat, lng } จุดอ้างอิง → คำนวณระยะทางเส้นตรง (distanceKm) และเรียงตามระยะได้
//   features            วิว/บรรยากาศ: [[คำ, คำ], [คำ]] → ต้องเจอคำใดคำหนึ่งของ "ทุกกลุ่ม"
//                       ในชื่อ/คำอธิบายโรงแรมหรือห้องพัก (ดู lib/hotelFeatures.js)
//   sort                key ของ SORTS
// ---------------------------------------------------------------------------
export async function searchHotels(db, {
  checkIn = null, checkOut = null, guests = 1, rooms = 1, text = '', city = null, propertyId = null,
  stars = null, minPrice = null, maxPrice = null, amenities = [], types = [],
  near = null, features = [], sort = 'recommended', limit = 10, offset = 0,
} = {}) {
  const hasDates = Boolean(checkIn && checkOut);
  const params = [hasDates ? checkIn : null, hasDates ? checkOut : null, guests, text ? likePattern(text) : null,
    stars, minPrice, maxPrice, limit, offset, city || null, propertyId || null, amenities, types];
  // ส่วนที่มีหรือไม่มีก็ได้: เพิ่มค่าเข้า params แล้วใช้เลข $n ที่ได้ — SQL มีแต่ตัวแทน ไม่มีค่าจากผู้ใช้ปนอยู่
  const param = (value) => `$${params.push(value)}`;
  const roomsParam = param(rooms);

  // ระยะทางเส้นตรงบนผิวโลก (สูตร Haversine, รัศมีโลก 6371 กม.) — สูตรเดียวกับ distanceKm() ใน lib/landmarks.js
  let distanceSql = 'NULL::float';
  if (near) {
    const lat = param(near.lat);
    const lng = param(near.lng);
    distanceSql = `6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p.latitude - ${lat}::float8) / 2), 2)
        + COS(RADIANS(${lat}::float8)) * COS(RADIANS(p.latitude)) * POWER(SIN(RADIANS(p.longitude - ${lng}::float8) / 2), 2)
      ))`;
  }

  // วิว/บรรยากาศ: แต่ละกลุ่มคำต้องเจออย่างน้อย 1 คำ ในโรงแรมหรือห้องใดห้องหนึ่ง
  const featureSql = features.map((words) => {
    const patterns = param(words.map((word) => likePattern(word)));
    return `AND (p.name ILIKE ANY(${patterns}::text[]) OR p.description ILIKE ANY(${patterns}::text[])
                 OR EXISTS (SELECT 1 FROM rooms fr WHERE fr.property_id = p.property_id
                             AND (fr.room_type_name ILIKE ANY(${patterns}::text[]) OR fr.description ILIKE ANY(${patterns}::text[]))))`;
  }).join('\n          ');

  const { rows } = await db.query(
    `WITH ra AS (${roomAvailabilitySql(1, 2)}),
     eligible AS (
       -- ประเภทห้องที่ว่างพอ (ถ้าไม่ระบุวัน available = จำนวนห้องทั้งหมด) และ rooms ห้องพักรวมกันได้ตามจำนวนคน
       SELECT ra.*, ra.stay_price / GREATEST(ra.nights, 1) AS nightly_price
         FROM ra
        WHERE ra.max_guests * ${roomsParam}::int >= $3 AND ra.available >= ${roomsParam}::int
     ),
     h AS (
       SELECT p.property_id, p.name, p.property_type, p.city, p.country, p.address,
              p.star_rating, p.image_url, p.amenities,
              MIN(e.nightly_price) AS nightly_from,
              MIN(e.stay_price) AS stay_from,
              (ARRAY_AGG(e.available ORDER BY e.nightly_price))[1] AS rooms_left,
              ${distanceSql} AS distance_km
         FROM properties p
         JOIN eligible e ON e.property_id = p.property_id
        WHERE ($4::text IS NULL
               OR p.city ILIKE $4 OR p.name ILIKE $4 OR p.address ILIKE $4 OR p.country ILIKE $4)
          AND ($5::numeric IS NULL OR p.star_rating >= $5)
          AND ($10::text IS NULL OR LOWER(p.city) = LOWER($10))
          AND ($11::int IS NULL OR p.property_id = $11)
          -- @> = "มีครบทุกตัวใน array ขวา" (array ว่าง = ไม่กรอง)
          AND COALESCE(p.amenities, '{}') @> $12::text[]
          AND (cardinality($13::text[]) = 0 OR p.property_type = ANY($13::text[]))
          ${featureSql}
        GROUP BY p.property_id
     )
     SELECT h.*, rv.avg_rating, rv.review_count, COUNT(*) OVER () AS total_count
       FROM h
       LEFT JOIN LATERAL (
         SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS review_count
           FROM reviews WHERE property_id = h.property_id
       ) rv ON TRUE
      WHERE ($6::numeric IS NULL OR h.nightly_from >= $6)
        AND ($7::numeric IS NULL OR h.nightly_from <= $7)
      ORDER BY ${SORTS[sort] ?? SORTS.recommended}
      LIMIT $8 OFFSET $9`,
    params,
  );

  return {
    total: rows.length ? Number(rows[0].total_count) : 0,
    nights: hasDates ? nightsBetween(checkIn, checkOut) : 0,
    hotels: rows.map((row) => ({
      ...serializeHotel(row),
      nightlyFrom: Math.round(Number(row.nightly_from)), // ต่อห้องต่อคืน
      stayFrom: hasDates ? Math.round(Number(row.stay_from) * rooms * 100) / 100 : null, // ทุกห้องทั้งทริป
      roomsLeft: hasDates ? row.rooms_left : null,
      distanceKm: row.distance_km === null ? null : Math.round(row.distance_km * 10) / 10,
    })),
  };
}
