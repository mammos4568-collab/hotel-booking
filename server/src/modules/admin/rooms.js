// หลังบ้าน: ประเภทห้อง + ปฏิทินราคา/ห้องว่างรายวัน
//   POST   /api/admin/hotels/:id/rooms      เพิ่มประเภทห้อง
//   PUT    /api/admin/rooms/:roomId         แก้ประเภทห้อง
//   DELETE /api/admin/rooms/:roomId         ลบ (ได้เฉพาะห้องที่ไม่เคยมีการจอง)
//   GET    /api/admin/rooms/:roomId/calendar?from=&days=
//   PUT    /api/admin/rooms/:roomId/calendar   ตั้งราคา/จำนวนห้องรายวัน หรือคืนค่าปกติ
import { Router } from 'express';
import { pool } from '../../db.js';
import { getRoomCalendar, maxBookedRooms } from '../../lib/availability.js';
import { addDays, isValidDate, todayInBangkok } from '../../lib/dates.js';
import { logAction } from './audit.js';
import { httpError, loadHotel, loadRoom, readId, withTransaction } from './scope.js';
import { changedFields, readNumber, readRoom } from './validate.js';

export const hotelRoomsRouter = Router({ mergeParams: true });
const router = Router();

const ROOM_COLUMNS = {
  name: 'room_type_name',
  description: 'description',
  maxGuests: 'max_guests',
  basePrice: 'base_price_per_night',
  totalRooms: 'total_rooms',
  imageUrl: 'image_url',
  bedType: 'bed_type',
  sizeSqm: 'size_sqm',
  breakfastIncluded: 'breakfast_included',
};

function serializeRoom(row) {
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
  };
}

// POST /api/admin/hotels/:id/rooms
hotelRoomsRouter.post('/', async (req, res, next) => {
  try {
    const hotelId = readId(req.params.id, 'รหัสโรงแรม');
    const data = readRoom(req.body);
    const room = await withTransaction(pool, async (client) => {
      await loadHotel(client, req, hotelId);
      const { rows: [created] } = await client.query(
        `INSERT INTO rooms (property_id, room_type_name, description, max_guests, base_price_per_night, total_rooms,
                            image_url, bed_type, size_sqm, breakfast_included)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [hotelId, data.name, data.description, data.maxGuests, data.basePrice, data.totalRooms,
          data.imageUrl, data.bedType, data.sizeSqm, data.breakfastIncluded],
      );
      await logAction(client, req, 'room.create', created.room_id, { hotelId });
      return created;
    });
    res.status(201).json({ room: serializeRoom(room) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/rooms/:roomId
router.put('/:roomId', async (req, res, next) => {
  try {
    const roomId = readId(req.params.roomId, 'รหัสประเภทห้อง');
    const data = readRoom(req.body);
    const room = await withTransaction(pool, async (client) => {
      // 🔒 ล็อกแถวประเภทห้อง (แถวเดียวกับที่ตอนจองล็อก) → ระหว่างนี้ไม่มีใครจองห้องประเภทนี้แทรกได้
      const before = await loadRoom(client, req, roomId, { lock: true });

      // ลดจำนวนห้อง → ต้องไม่ต่ำกว่าคืนที่ถูกจองไว้มากที่สุด ไม่งั้นแขกที่จองแล้วจะไม่มีห้องพัก
      if (data.totalRooms < before.total_rooms) {
        const booked = await maxBookedRooms(client, roomId, todayInBangkok());
        if (data.totalRooms < booked) {
          throw httpError(409, `มีบางคืนที่ถูกจองไว้แล้ว ${booked} ห้อง ลดจำนวนห้องให้ต่ำกว่านี้ไม่ได้`);
        }
      }
      // ราคาที่เปลี่ยน มีผลกับการจองใหม่เท่านั้น — การจองเดิมเก็บยอดเงินไว้ตอนจองแล้ว (bookings.total_amount)
      const { rows: [updated] } = await client.query(
        `UPDATE rooms
            SET room_type_name = $2, description = $3, max_guests = $4, base_price_per_night = $5, total_rooms = $6,
                image_url = $7, bed_type = $8, size_sqm = $9, breakfast_included = $10
          WHERE room_id = $1
          RETURNING *`,
        [roomId, data.name, data.description, data.maxGuests, data.basePrice, data.totalRooms,
          data.imageUrl, data.bedType, data.sizeSqm, data.breakfastIncluded],
      );
      // วันที่ในปฏิทินที่เคยตั้ง "เปิดขายทุกห้อง" (= จำนวนห้องเดิม) ให้ตามจำนวนห้องใหม่ด้วย
      if (data.totalRooms !== before.total_rooms) {
        await client.query(
          `UPDATE room_inventories SET available_rooms = $3
            WHERE room_id = $1 AND (available_rooms = $2 OR available_rooms > $3)`,
          [roomId, before.total_rooms, data.totalRooms],
        );
      }
      await logAction(client, req, 'room.update', roomId, {
        hotelId: before.property_id,
        fields: changedFields({ ...before, base_price_per_night: Number(before.base_price_per_night) }, data, ROOM_COLUMNS),
      });
      return updated;
    });
    res.json({ room: serializeRoom(room) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/rooms/:roomId — ห้องที่เคยมีการจองลบไม่ได้ (เก็บประวัติ) ให้ตั้งจำนวนห้องเป็น 0 แทน
router.delete('/:roomId', async (req, res, next) => {
  try {
    const roomId = readId(req.params.roomId, 'รหัสประเภทห้อง');
    await withTransaction(pool, async (client) => {
      const room = await loadRoom(client, req, roomId, { lock: true });
      const { rows: [{ bookings }] } = await client.query('SELECT COUNT(*)::int AS bookings FROM bookings WHERE room_id = $1', [roomId]);
      if (bookings > 0) {
        throw httpError(409, `ห้องประเภทนี้มีประวัติการจอง ${bookings} รายการ ลบไม่ได้ — ถ้าจะหยุดขายให้ตั้งจำนวนห้องเป็น 0 แทน`);
      }
      await client.query('DELETE FROM rooms WHERE room_id = $1', [roomId]);
      await logAction(client, req, 'room.delete', roomId, { hotelId: room.property_id, name: room.room_type_name });
    });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/rooms/:roomId/calendar?from=YYYY-MM-DD&days=42
router.get('/:roomId/calendar', async (req, res, next) => {
  try {
    const roomId = readId(req.params.roomId, 'รหัสประเภทห้อง');
    const room = await loadRoom(pool, req, roomId);
    const from = isValidDate(req.query.from) ? req.query.from : todayInBangkok();
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 42, 1), 120);
    const calendar = await getRoomCalendar(pool, roomId, from, addDays(from, days));
    res.json({ room: { ...serializeRoom(room), hotelName: room.hotel_name }, from, days: calendar });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/rooms/:roomId/calendar
// body: { from, to (รวมวันสุดท้าย), weekdays?: [0–6] (0 = อาทิตย์), price?, availableRooms?, reset? }
//   price           ราคาต่อคืนของวันเหล่านั้น (ไม่ส่ง = คงเดิม)
//   availableRooms  จำนวนห้องที่เปิดขาย (0 = ปิดขาย) — ต้องไม่น้อยกว่าห้องที่ถูกจองไปแล้วในคืนนั้น
//   reset = true    ลบค่าที่ตั้งพิเศษ กลับไปใช้ราคา/จำนวนห้องปกติของประเภทห้อง
router.put('/:roomId/calendar', async (req, res, next) => {
  try {
    const roomId = readId(req.params.roomId, 'รหัสประเภทห้อง');
    const body = req.body ?? {};
    const today = todayInBangkok();
    if (!isValidDate(body.from) || !isValidDate(body.to) || body.to < body.from) throw httpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
    if (body.from < today) throw httpError(400, 'แก้ไขวันที่ผ่านมาแล้วไม่ได้');
    const end = addDays(body.to, 1); // ช่วงแบบ [from, end)
    const span = Math.round((Date.parse(end) - Date.parse(body.from)) / 86_400_000);
    if (span > 366) throw httpError(400, 'ตั้งได้ครั้งละไม่เกิน 366 วัน');
    const weekdays = Array.isArray(body.weekdays) && body.weekdays.length
      ? new Set(body.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      : null;
    const reset = body.reset === true;
    const price = reset ? null : readNumber(body.price, 'ราคาต่อคืน', { min: 1, max: 1_000_000, step: 0.01 });
    const availableRooms = reset ? null : readNumber(body.availableRooms, 'จำนวนห้องที่เปิดขาย', { min: 0, max: 500, integer: true });
    if (!reset && price === null && availableRooms === null) throw httpError(400, 'กรุณาระบุราคา หรือจำนวนห้องที่เปิดขาย');

    const result = await withTransaction(pool, async (client) => {
      // 🔒 ล็อกประเภทห้องก่อนตรวจ "ห้องที่ถูกจองแล้ว" → ระหว่างนี้ไม่มีการจองใหม่แทรกเข้ามาได้
      const room = await loadRoom(client, req, roomId, { lock: true });
      if (availableRooms !== null && availableRooms > room.total_rooms) {
        throw httpError(400, `ประเภทห้องนี้มีทั้งหมด ${room.total_rooms} ห้อง เปิดขายเกินกว่านี้ไม่ได้`);
      }
      const nights = (await getRoomCalendar(client, roomId, body.from, end))
        .filter((night) => !weekdays || weekdays.has(new Date(`${night.date}T00:00:00Z`).getUTCDay()));
      if (!nights.length) throw httpError(400, 'ไม่มีวันที่ตรงกับเงื่อนไขที่เลือก');

      // ปิดขาย/ลดห้องได้ไม่ต่ำกว่าที่ถูกจองไปแล้ว (คืนค่าปกติก็ต้องตรวจ เพราะค่าปกติอาจน้อยกว่าที่ตั้งพิเศษไว้)
      const limit = reset ? room.total_rooms : availableRooms;
      if (limit !== null) {
        const conflicts = nights.filter((night) => night.booked > limit);
        if (conflicts.length) {
          const sample = conflicts.slice(0, 3).map((night) => `${night.date} (จองแล้ว ${night.booked})`).join(', ');
          throw httpError(409, `มี ${conflicts.length} คืนที่ถูกจองไว้มากกว่า ${limit} ห้อง เช่น ${sample}`);
        }
      }

      const dates = nights.map((night) => night.date);
      if (reset) {
        await client.query('DELETE FROM room_inventories WHERE room_id = $1 AND date = ANY($2::date[])', [roomId, dates]);
      } else {
        // room_inventories ต้องมีทั้งราคาและจำนวนห้อง (NOT NULL) → ช่องที่ไม่ได้ส่งมาใช้ค่าเดิม (หรือค่าปกติของห้อง)
        // ON CONFLICT = มีแถวของวันนั้นอยู่แล้วก็แก้ทับ ไม่ต้องเช็กก่อนว่ามีหรือยัง (UNIQUE (room_id, date))
        await client.query(
          `INSERT INTO room_inventories (room_id, date, available_rooms, price)
           SELECT r.room_id, d::date, COALESCE($3::int, r.total_rooms), COALESCE($4::numeric, r.base_price_per_night)
             FROM rooms r, unnest($2::date[]) AS d
            WHERE r.room_id = $1
           ON CONFLICT (room_id, date) DO UPDATE
              SET available_rooms = COALESCE($3::int, room_inventories.available_rooms),
                  price = COALESCE($4::numeric, room_inventories.price)`,
          [roomId, dates, availableRooms, price],
        );
      }
      await logAction(client, req, 'room.calendar', roomId, {
        hotelId: room.property_id, from: body.from, to: body.to, nights: dates.length,
        ...(reset ? { reset: true } : {}), ...(price !== null ? { price } : {}), ...(availableRooms !== null ? { availableRooms } : {}),
      });
      return { updated: dates.length };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
