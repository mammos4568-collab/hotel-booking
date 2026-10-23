// หลังบ้าน: โรงแรม — /api/admin/hotels
import { Router } from 'express';
import { pool } from '../../db.js';
import { ACTIVE_BOOKING_SQL } from '../../lib/availability.js';
import { APPROVAL_STATUSES } from '../../lib/hotelApproval.js';
import { hotelCoverSql, roomCoverSql } from '../../lib/hotelImages.js';
import { findSuspiciousWords } from '../../lib/moderation.js';
import { logAction } from './audit.js';
import { httpError, isAdmin, loadHotel, ownedBy, readId, requireAdmin, withTransaction } from './scope.js';
import { changedFields, readHotel, readText } from './validate.js';

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
    // การอนุมัติ (db/08): pending = รอตรวจ · approved = เผยแพร่ · rejected = ไม่อนุมัติ/ระงับ (+ เหตุผลจาก admin)
    approval: {
      status: row.approval_status,
      note: row.approval_note ?? null,
      submittedAt: row.submitted_at ?? null,
      reviewedAt: row.reviewed_at ?? null,
    },
  };
}

// คำก้ำกึ่งในข้อความที่ลูกค้าจะเห็น (ชื่อ คำอธิบาย ที่อยู่ + ชื่อ/คำอธิบายห้อง) — ให้ admin ดูประกอบการอนุมัติ
// คำหยาบชัดเจนบันทึกไม่ได้ตั้งแต่แรก (validate.js) จึงเหลือแต่คำที่ต้องใช้คนตัดสิน
function suspiciousWordsOf(hotel, rooms = []) {
  const texts = [hotel.name, hotel.description, hotel.address, ...rooms.flatMap((room) => [room.room_type_name, room.description])];
  return [...new Set(texts.flatMap((value) => findSuspiciousWords(value)))];
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
    imageUrl: row.image_url, // ลิงก์รูปสำรอง (ช่องในฟอร์ม)
    coverUrl: row.cover_url ?? null, // รูปหลักที่ลูกค้าเห็น (รูปอัปโหลดลำดับแรก หรือลิงก์รูปสำรอง)
    photoCount: row.photo_count ?? 0,
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
    // ?status=pending|approved|rejected — คิวรออนุมัติ ฯลฯ (จำนวนแต่ละสถานะตอบกลับใน counts เสมอ)
    const countParams = [...params];
    const countScope = `${scope} ${search}`;
    if (APPROVAL_STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      search += ` AND p.approval_status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT p.*, ${hotelCoverSql('p')} AS cover_url,
              o.owner_name, o.owner_email, rm.room_types, rm.total_rooms, bk.upcoming, rv.avg_rating, rv.review_count
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
        ORDER BY (p.approval_status = 'pending') DESC, p.property_id`, // รออนุมัติขึ้นก่อน
      params,
    );
    const { rows: countRows } = await pool.query(
      `SELECT p.approval_status, COUNT(*)::int AS hotels FROM properties p WHERE TRUE ${countScope} GROUP BY p.approval_status`,
      countParams,
    );
    res.json({
      hotels: rows.map((row) => ({
        ...serializeHotelRow(row),
        coverUrl: row.cover_url, // รูปปก (รูปอัปโหลดลำดับแรก หรือลิงก์รูปเดิม)
        roomTypes: row.room_types,
        totalRooms: row.total_rooms,
        upcomingBookings: row.upcoming,
        rating: row.avg_rating,
        reviewCount: row.review_count,
        // admin เห็นคำก้ำกึ่งของทุกโรงแรม (รวมที่อนุมัติไปแล้ว เพราะเจ้าของแก้ข้อมูลได้เองหลังอนุมัติ)
        suspiciousWords: isAdmin(req) ? suspiciousWordsOf(row) : [],
      })),
      counts: Object.fromEntries(APPROVAL_STATUSES.map((status) => [status, countRows.find((r) => r.approval_status === status)?.hotels ?? 0])),
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
        `SELECT r.*, ${roomCoverSql('r')} AS cover_url,
                (SELECT COUNT(*)::int FROM room_images ri WHERE ri.room_id = r.room_id) AS photo_count,
                (SELECT COUNT(*)::int FROM bookings b
                  WHERE b.room_id = r.room_id
                    AND b.check_out_date > (now() AT TIME ZONE 'Asia/Bangkok')::date AND ${ACTIVE_BOOKING_SQL}) AS upcoming_bookings
           FROM rooms r WHERE r.property_id = $1 ORDER BY r.base_price_per_night, r.room_id`,
        [hotel.property_id],
      ),
    ]);
    res.json({
      hotel: {
        ...serializeHotelRow({ ...hotel, ...owner.rows[0] }),
        rooms: rooms.rows.map(serializeRoomRow),
        suspiciousWords: isAdmin(req) ? suspiciousWordsOf(hotel, rooms.rows) : [],
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/hotels — เพิ่มโรงแรม
//   เจ้าของโรงแรมเพิ่ม → รอ admin อนุมัติ (ลูกค้ายังไม่เห็น) · admin เพิ่มเอง → เผยแพร่ทันที
//   สถานะตั้งที่ server จาก role ของคนกด — ส่ง approval มาจากหน้าเว็บก็ไม่มีผล
router.post('/', async (req, res, next) => {
  try {
    const data = readHotel(req.body);
    const approved = isAdmin(req);
    const hotel = await withTransaction(pool, async (client) => {
      const ownerId = await readOwnerId(client, req, req.body?.ownerId);
      const { rows: [created] } = await client.query(
        `INSERT INTO properties (name, property_type, description, country, city, address,
                                 latitude, longitude, star_rating, image_url, amenities, owner_id,
                                 approval_status, submitted_at, reviewed_at, reviewed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14, $15)
         RETURNING *`,
        [data.name, data.propertyType, data.description, data.country, data.city, data.address,
          data.latitude, data.longitude, data.starRating, data.imageUrl, data.amenities, ownerId,
          approved ? 'approved' : 'pending', approved ? new Date() : null, approved ? req.user.id : null],
      );
      await logAction(client, req, 'hotel.create', created.property_id, { ownerId, approval: created.approval_status });
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
      // อนุมัติครั้งเดียวตอนสร้าง: โรงแรมที่อนุมัติแล้ว เจ้าของแก้ได้เลย ไม่ต้องรอใหม่ (ข้อความผ่านตัวกรองคำหยาบแล้ว)
      // ยกเว้นโรงแรมที่ "ไม่อนุมัติ/ถูกระงับ" → เจ้าของแก้แล้วบันทึก = ส่งให้ admin ตรวจใหม่ (กลับเป็นรออนุมัติ)
      const resubmit = !isAdmin(req) && before.approval_status === 'rejected';
      const { rows: [updated] } = await client.query(
        `UPDATE properties
            SET name = $2, property_type = $3, description = $4, country = $5, city = $6, address = $7,
                latitude = $8, longitude = $9, star_rating = $10, image_url = $11, amenities = $12,
                owner_id = $13, updated_at = now(),
                approval_status = CASE WHEN $14 THEN 'pending' ELSE approval_status END,
                submitted_at = CASE WHEN $14 THEN now() ELSE submitted_at END
          WHERE property_id = $1
          RETURNING *`,
        [hotelId, data.name, data.propertyType, data.description, data.country, data.city, data.address,
          data.latitude, data.longitude, data.starRating, data.imageUrl, data.amenities, ownerId, resubmit],
      );
      const fields = changedFields(
        { ...before, latitude: before.latitude === null ? null : Number(before.latitude),
          longitude: before.longitude === null ? null : Number(before.longitude),
          star_rating: before.star_rating === null ? null : Number(before.star_rating) },
        data, HOTEL_COLUMNS,
      );
      if (ownerId !== before.owner_id) fields.push('owner');
      await logAction(client, req, 'hotel.update', hotelId, resubmit ? { fields, resubmitted: true } : { fields });
      return updated;
    });
    res.json({ hotel: serializeHotelRow(hotel) });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/hotels/:id/approve — admin อนุมัติ → ลูกค้าเห็นและจองได้ทันที
// POST /api/admin/hotels/:id/reject  { reason } — ไม่อนุมัติ หรือระงับโรงแรมที่เผยแพร่อยู่ (ซ่อนจากลูกค้า จองใหม่ไม่ได้
//   การจองเดิมยังอยู่ครบ) · เหตุผลแสดงให้เจ้าของเห็น → ห้ามใส่ข้อมูลส่วนตัวของลูกค้า
// 🔒 ล็อกแถวโรงแรมก่อนเปลี่ยนสถานะ — ไม่ชนกับเจ้าของที่กำลังบันทึกแก้ไขพร้อมกัน (คนหลังเห็นสถานะล่าสุดเสมอ)
async function decide(req, hotelId, { status, note }) {
  return withTransaction(pool, async (client) => {
    const before = await loadHotel(client, req, hotelId, { lock: true });
    if (before.approval_status === status) {
      throw httpError(409, status === 'approved' ? 'โรงแรมนี้อนุมัติไปแล้ว' : 'โรงแรมนี้ไม่ได้เผยแพร่อยู่แล้ว');
    }
    const { rows: [updated] } = await client.query(
      `UPDATE properties
          SET approval_status = $2, approval_note = $3, reviewed_at = now(), reviewed_by = $4, updated_at = now()
        WHERE property_id = $1
        RETURNING *`,
      [hotelId, status, note, req.user.id],
    );
    await logAction(client, req, status === 'approved' ? 'hotel.approve' : 'hotel.reject', hotelId,
      status === 'approved' ? { from: before.approval_status } : { from: before.approval_status, reason: note });
    return updated;
  });
}

router.post('/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const hotel = await decide(req, readId(req.params.id, 'รหัสโรงแรม'), { status: 'approved', note: null });
    res.json({ hotel: serializeHotelRow(hotel) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const reason = readText(req.body?.reason, 'เหตุผล', { min: 5, max: 300, required: true });
    const hotel = await decide(req, readId(req.params.id, 'รหัสโรงแรม'), { status: 'rejected', note: reason });
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
