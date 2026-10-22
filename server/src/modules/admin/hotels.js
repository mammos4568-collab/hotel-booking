// หลังบ้าน: โรงแรม — /api/admin/hotels
import { Router } from 'express';
import { pool } from '../../db.js';
import { ACTIVE_BOOKING_SQL } from '../../lib/availability.js';
import { logAction } from './audit.js';
import { httpError, isAdmin, loadHotel, ownedBy, readId, withTransaction } from './scope.js';
import { changedFields, readHotel } from './validate.js';

const router = Router();

// ฟิลด์ในฟอร์ม → คอลัมน์ในตาราง properties (ใช้ทั้งตอนบันทึกและตอนหาว่าฟิลด์ไหนเปลี่ยน)
const HOTEL_COLUMNS = {
  name: 'name',
  propertyType: 'property_type',
  description: 'description',
  country: 'country',
  city: 'city',
  address: 'address',
  latitude: 'latitude',
  longitude: 'longitude',
  starRating: 'star_rating',
  imageUrl: 'image_url',
  amenities: 'amenities',
};

function serializeHotelRow(row) {
  return {
    id: row.property_id,
    name: row.name,
    propertyType: row.property_type,
    description: row.description,
    country: row.country,
    city: row.city,
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    starRating: row.star_rating === null ? null : Number(row.star_rating),
    imageUrl: row.image_url,
    amenities: row.amenities ?? [],
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name ?? null, email: row.owner_email ?? null } : null,
  };
}

function serializeRoomRow(row) {
  return {
    id: row.room_id,
    hotelId: row.property_id,
    name: row.room_type_name,
    description: row.description,
    maxGuests: row.max_guests,
    basePrice: Number(row.base_price_per_night),
    totalRooms: row.total_rooms,
    imageUrl: row.image_url,
    bedType: row.bed_type,
    sizeSqm: row.size_sqm,
    breakfastIncluded: row.breakfast_included,
    upcomingBookings: row.upcoming_bookings ?? 0,
  };
}

// เจ้าของที่ admin เลือกให้ต้องมีอยู่จริงและมี role = owner
async function readOwnerId(db, req, value) {
  if (!isAdmin(req)) return req.user.id; // owner สร้างโรงแรม → เป็นของตัวเองเสมอ
  if (value === undefined || value === null || value === '') return null;
  const ownerId = readId(value, 'รหัสเจ้าของ');
  const { rows: [owner] } = await db.query('SELECT role FROM users WHERE user_id = $1', [ownerId]);
  if (!owner || owner.role !== 'owner') throw httpError(400, 'ผู้ใช้ที่เลือกต้องมีบทบาทเป็นเจ้าของโรงแรม (owner)');
  return ownerId;
}

// GET /api/admin/hotels?q= — รายการโรงแรม (owner เห็นเฉพาะของตัวเอง)
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const scope = ownedBy(req, params);
    const q = String(req.query.q ?? '').trim();
    let search = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      search = `AND (p.name ILIKE $${params.length} OR p.city ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT p.*, o.owner_name, o.owner_email, rm.room_types, rm.total_rooms, bk.upcoming, rv.avg_rating, rv.review_count
         FROM properties p
         LEFT JOIN LATERAL (
           SELECT TRIM(first_name || ' ' || last_name) AS owner_name, email AS owner_email FROM users WHERE user_id = p.owner_id
         ) o ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS room_types, COALESCE(SUM(total_rooms), 0)::int AS total_rooms
             FROM rooms WHERE property_id = p.property_id
         ) rm ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS upcoming FROM bookings b
            WHERE b.property_id = p.property_id
              AND b.check_out_date > (now() AT TIME ZONE 'Asia/Bangkok')::date AND ${ACTIVE_BOOKING_SQL}
         ) bk ON TRUE
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(rating), 1)::float AS avg_rating, COUNT(*)::int AS review_count
             FROM reviews WHERE property_id = p.property_id
         ) rv ON TRUE
        WHERE TRUE ${scope} ${search}
        ORDER BY p.property_id`,
      params,
    );
    res.json({
      hotels: rows.map((row) => ({
        ...serializeHotelRow(row),
        roomTypes: row.room_types,
        totalRooms: row.total_rooms,
        upcomingBookings: row.upcoming,
        rating: row.avg_rating,
        reviewCount: row.review_count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/hotels/:id — ข้อมูลสำหรับหน้าแก้ไข + ประเภทห้องทั้งหมด
router.get('/:id', async (req, res, next) => {
  try {
    const hotel = await loadHotel(pool, req, readId(req.params.id, 'รหัสโรงแรม'));
    const [owner, rooms] = await Promise.all([
      hotel.owner_id
        ? pool.query("SELECT TRIM(first_name || ' ' || last_name) AS owner_name, email AS owner_email FROM users WHERE user_id = $1", [hotel.owner_id])
        : { rows: [{}] },
      pool.query(
        `SELECT r.*, (SELECT COUNT(*)::int FROM bookings b
                        WHERE b.room_id = r.room_id
                          AND b.check_out_date > (now() AT TIME ZONE 'Asia/Bangkok')::date AND ${ACTIVE_BOOKING_SQL}) AS upcoming_bookings
           FROM rooms r WHERE r.property_id = $1 ORDER BY r.base_price_per_night, r.room_id`,
        [hotel.property_id],
      ),
    ]);
    res.json({ hotel: { ...serializeHotelRow({ ...hotel, ...owner.rows[0] }), rooms: rooms.rows.map(serializeRoomRow) } });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/hotels — เพิ่มโรงแรม
router.post('/', async (req, res, next) => {
  try {
    const data = readHotel(req.body);
    const hotel = await withTransaction(pool, async (client) => {
      const ownerId = await readOwnerId(client, req, req.body?.ownerId);
      const { rows: [created] } = await client.query(
        `INSERT INTO properties (name, property_type, description, country, city, address,
                                 latitude, longitude, star_rating, image_url, amenities, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [data.name, data.propertyType, data.description, data.country, data.city, data.address,
          data.latitude, data.longitude, data.starRating, data.imageUrl, data.amenities, ownerId],
      );
      await logAction(client, req, 'hotel.create', created.property_id, { ownerId });
      return created;
    });
    res.status(201).json({ hotel: serializeHotelRow(hotel) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/hotels/:id — แก้ข้อมูลโรงแรม (เปลี่ยนเจ้าของได้เฉพาะ admin)
router.put('/:id', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    const data = readHotel(req.body);
    const hotel = await withTransaction(pool, async (client) => {
      const before = await loadHotel(client, req, hotelId, { lock: true });
      const ownerId = isAdmin(req) && 'ownerId' in (req.body ?? {})
        ? await readOwnerId(client, req, req.body.ownerId)
        : before.owner_id;
      const { rows: [updated] } = await client.query(
        `UPDATE properties
            SET name = $2, property_type = $3, description = $4, country = $5, city = $6, address = $7,
                latitude = $8, longitude = $9, star_rating = $10, image_url = $11, amenities = $12,
                owner_id = $13, updated_at = now()
          WHERE property_id = $1
          RETURNING *`,
        [hotelId, data.name, data.propertyType, data.description, data.country, data.city, data.address,
          data.latitude, data.longitude, data.starRating, data.imageUrl, data.amenities, ownerId],
      );
      const fields = changedFields(
        { ...before, latitude: before.latitude === null ? null : Number(before.latitude),
          longitude: before.longitude === null ? null : Number(before.longitude),
          star_rating: before.star_rating === null ? null : Number(before.star_rating) },
        data, HOTEL_COLUMNS,
      );
      if (ownerId !== before.owner_id) fields.push('owner');
      await logAction(client, req, 'hotel.update', hotelId, { fields });
      return updated;
    });
    res.json({ hotel: serializeHotelRow(hotel) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/hotels/:id — ลบได้เฉพาะโรงแรมที่ไม่เคยมีการจอง
// (ประวัติการจองเป็นหลักฐานทางบัญชี ต้องเก็บไว้ — ถ้าจะเลิกขายให้ตั้งจำนวนห้องเป็น 0 แทน)
router.delete('/:id', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    await withTransaction(pool, async (client) => {
      const hotel = await loadHotel(client, req, hotelId, { lock: true });
      const { rows: [{ bookings }] } = await client.query(
        'SELECT COUNT(*)::int AS bookings FROM bookings WHERE property_id = $1', [hotelId],
      );
      if (bookings > 0) {
        throw httpError(409, `โรงแรมนี้มีประวัติการจอง ${bookings} รายการ ลบไม่ได้ — ถ้าจะหยุดขายให้ตั้งจำนวนห้องเป็น 0 แทน`);
      }
      await client.query('DELETE FROM properties WHERE property_id = $1', [hotelId]); // ห้อง/ปฏิทิน/รายการโปรดลบตาม (CASCADE)
      await logAction(client, req, 'hotel.delete', hotelId, { name: hotel.name });
    });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
