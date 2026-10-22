// ============================================================
// สิทธิ์ในหลังบ้าน
//   admin = ผู้ดูแลทั้งระบบ เห็น/แก้ได้ทุกโรงแรม จัดการผู้ใช้และรีวิว
//   owner = เจ้าของโรงแรม เห็น/แก้ได้เฉพาะโรงแรมที่ properties.owner_id = ตัวเอง
// ตรวจที่ server ทุกครั้ง — การซ่อนปุ่มบนหน้าเว็บไม่ใช่การป้องกัน (ยิง API ตรงๆ ก็ต้องโดนกันอยู่ดี)
// ============================================================

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const MAX_INT = 2_147_483_647; // id ในฐานข้อมูลเป็น INT

export function readId(value, label = 'รหัส') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > MAX_INT) throw httpError(400, `${label}ไม่ถูกต้อง`);
  return id;
}

export const isAdmin = (req) => req.user.role === 'admin';

// middleware: เฉพาะ admin (เช่น จัดการผู้ใช้ ลบรีวิว ดูบันทึกการทำงาน)
export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return next(httpError(403, 'เฉพาะผู้ดูแลระบบเท่านั้น'));
  next();
}

// เติมเงื่อนไข "เฉพาะโรงแรมของฉัน" ต่อท้าย WHERE (admin ไม่กรอง)
// ใส่ค่าเป็น parameter เสมอ — คืนแค่ SQL ส่วน "AND p.owner_id = $n"
export function ownedBy(req, params, column = 'p.owner_id') {
  if (isAdmin(req)) return '';
  params.push(req.user.id);
  return `AND ${column} = $${params.length}`;
}

// โหลดโรงแรมที่จะจัดการ: ไม่มี → 404 · ไม่ใช่ของเรา → 403
// lock = true → SELECT ... FOR UPDATE (ใช้ใน transaction ตอนแก้/ลบ กันสองคนแก้ทับกัน)
export async function loadHotel(db, req, hotelId, { lock = false } = {}) {
  const { rows: [hotel] } = await db.query(
    `SELECT * FROM properties WHERE property_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [hotelId],
  );
  if (!hotel) throw httpError(404, 'ไม่พบโรงแรมนี้');
  if (!isAdmin(req) && hotel.owner_id !== req.user.id) throw httpError(403, 'คุณจัดการได้เฉพาะโรงแรมของตัวเอง');
  return hotel;
}

// โหลดประเภทห้องที่จะจัดการ (ตรวจเจ้าของจากโรงแรมแม่)
// lock = true → ล็อกแถว rooms "แถวเดียวกับที่ตอนจองล็อก" (lib/availability.js lockRoomType)
//   → การแก้จำนวนห้อง/ปฏิทิน กับการจองประเภทห้องนี้ จะต่อคิวกัน ไม่มีทางสวนกันจนห้องเกิน
export async function loadRoom(db, req, roomId, { lock = false } = {}) {
  const { rows: [room] } = await db.query(
    `SELECT r.*, p.owner_id, p.name AS hotel_name
       FROM rooms r JOIN properties p ON p.property_id = r.property_id
      WHERE r.room_id = $1${lock ? ' FOR UPDATE OF r' : ''}`,
    [roomId],
  );
  if (!room) throw httpError(404, 'ไม่พบประเภทห้องนี้');
  if (!isAdmin(req) && room.owner_id !== req.user.id) throw httpError(403, 'คุณจัดการได้เฉพาะโรงแรมของตัวเอง');
  return room;
}

// ทำงานใน transaction เดียว: BEGIN → งาน → COMMIT · พังตรงไหน ROLLBACK ทั้งหมด · คืน connection เสมอ
export async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
