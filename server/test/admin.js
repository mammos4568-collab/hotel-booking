// ============================================================
// ทดสอบหลังบ้าน (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/admin.js
//   (อ่าน DATABASE_URL จาก server/.env เอง — ใช้ตั้ง admin คนแรกด้วยสคริปต์ และล้างข้อมูลทดสอบตอนจบ)
//
//   - สิทธิ์: ไม่ล็อกอิน 401 · ลูกค้า 403 · owner เห็น/แก้ได้เฉพาะโรงแรมตัวเอง · เมนู admin-only
//   - ตั้ง admin คนแรกด้วย server/scripts/set-role.js · admin ตั้ง owner ผ่าน API (มีผลทันที)
//   - owner เพิ่มโรงแรม + ประเภทห้อง → ลูกค้าเห็นและจองได้จริง
//   - ลดจำนวนห้อง / ปิดขาย ต่ำกว่าที่ถูกจองไว้ → 409 · ตั้งราคารายวันแล้วราคาที่ลูกค้าเห็นเปลี่ยนตาม
//   - หลังบ้านยกเลิกการจองที่จ่ายแล้ว → คืนเงิน · สถิตินับเฉพาะโรงแรมของตัวเอง ไม่นับเงินที่คืนแล้ว
//   - ลบรีวิวได้เฉพาะ admin · บันทึกการทำงานไม่มีข้อความรีวิว
//   - admin สองคนลดสิทธิ์กันเองพร้อมกัน → สำเร็จคนเดียว ระบบต้องเหลือ admin
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วลบทุกอย่างที่สร้างตอนจบ
// ============================================================
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const SET_ROLE = fileURLToPath(new URL('../scripts/set-role.js', import.meta.url));
const API = process.env.API_URL || 'http://localhost:3000/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `  -> ${detail}` : ''}`);
};

async function call(path, method = 'GET', body, cookie = '') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), res };
}

async function register(name) {
  const email = `admin-test-${randomUUID().slice(0, 8)}@example.test`;
  const { status, data, res } = await call('/auth/register', 'POST', { name, email, password: randomUUID() });
  if (status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${status}) — เปิด server แล้วหรือยัง?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id: data.user.id, email, call: (path, method, body) => call(path, method, body, cookie) };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const CARD = { method: 'card', cardNumber: '4242424242424242', cardName: 'TEST', expiry: '12/30', cvc: '123' };
const tag = randomUUID().slice(0, 6);
const hotelBody = {
  name: `Admin Test Hotel ${tag}`, propertyType: 'Hotel', city: 'Chiang Mai', address: '99 Test Road, Chiang Mai',
  description: 'โรงแรมทดสอบหลังบ้าน', starRating: 4, amenities: ['wifi', 'pool', 'ไม่มีจริง'],
};
const roomBody = { name: 'Test Deluxe', maxGuests: 2, basePrice: 1500, totalRooms: 2, bedType: 'King' };
const users = [];
const hotelIds = [];

try {
  const [admin, owner, rival, guest] = await Promise.all(['Admin Tester', 'Owner Tester', 'Rival Tester', 'Guest Tester'].map(register));
  users.push(admin, owner, rival, guest);

  console.log('=== 1) สิทธิ์ ===');
  ok((await call('/admin/stats')).status === 401, 'ไม่ล็อกอิน → 401');
  ok((await guest.call('/admin/stats')).status === 403, 'ลูกค้าทั่วไปเข้าหลังบ้านไม่ได้ → 403');

  // admin คนแรกตั้งได้ทางเดียว: สคริปต์ที่รันบนเครื่อง server (ไม่มี API ให้ตั้งตัวเอง)
  execFileSync(process.execPath, [SET_ROLE, admin.email, 'admin'], { env: process.env, stdio: 'pipe' });
  ok((await admin.call('/admin/users')).status === 200, 'สคริปต์ตั้ง admin → เข้าเมนูผู้ใช้ได้ทันที ไม่ต้องล็อกอินใหม่');

  const promote = await admin.call(`/admin/users/${owner.id}/role`, 'PATCH', { role: 'owner' });
  await admin.call(`/admin/users/${rival.id}/role`, 'PATCH', { role: 'owner' });
  ok(promote.status === 200 && (await owner.call('/admin/stats')).status === 200, 'admin ตั้ง owner ผ่าน API → เข้าหลังบ้านได้');
  ok((await owner.call('/admin/users')).status === 403, 'owner เข้าเมนูผู้ใช้ไม่ได้ (admin เท่านั้น)');
  ok((await owner.call('/admin/audit')).status === 403, 'owner ดูบันทึกการทำงานไม่ได้');
  ok((await admin.call(`/admin/users/${admin.id}/role`, 'PATCH', { role: 'user' })).status === 400, 'เปลี่ยนบทบาทตัวเองไม่ได้');
  ok((await admin.call(`/admin/users/${guest.id}/role`, 'PATCH', { role: 'superuser' })).status === 400, 'บทบาทที่ไม่มีจริง → 400');

  console.log('\n=== 2) โรงแรม + ประเภทห้อง ===');
  const created = await owner.call('/admin/hotels', 'POST', { ...hotelBody, ownerId: rival.id });
  const hotelId = created.data?.hotel?.id;
  if (hotelId) hotelIds.push(hotelId);
  ok(created.status === 201 && created.data.hotel.owner?.id === owner.id, 'owner เพิ่มโรงแรม → เป็นเจ้าของเอง (ส่ง ownerId คนอื่นมาก็ไม่มีผล)', JSON.stringify(created.data));
  ok(JSON.stringify(created.data?.hotel?.amenities) === '["wifi","pool"]', 'สิ่งอำนวยความสะดวกที่ไม่รู้จักถูกตัดทิ้ง');
  ok((await owner.call('/admin/hotels', 'POST', { ...hotelBody, name: 'x' })).status === 400, 'ชื่อสั้นเกิน → 400');
  ok((await owner.call('/admin/hotels', 'POST', { ...hotelBody, imageUrl: 'javascript:alert(1)' })).status === 400, 'ลิงก์รูป javascript: → 400');
  ok((await owner.call('/admin/hotels', 'POST', { ...hotelBody, latitude: 18.79 })).status === 400, 'พิกัดไม่ครบคู่ → 400');
  ok((await owner.call('/admin/hotels', 'POST', { ...hotelBody, propertyType: 'Castle' })).status === 400, 'ประเภทที่พักนอกรายการ → 400');

  const room = await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', roomBody);
  const roomId = room.data?.room?.id;
  ok(room.status === 201 && room.data.room.totalRooms === 2, 'owner เพิ่มประเภทห้อง (2 ห้อง)');

  const rivalHotel = await rival.call('/admin/hotels', 'POST', { ...hotelBody, name: `Rival Test Hotel ${tag}` });
  if (rivalHotel.data?.hotel?.id) hotelIds.push(rivalHotel.data.hotel.id);
  const rivalList = await rival.call('/admin/hotels');
  ok(rivalList.data.hotels.length === 1 && rivalList.data.hotels[0].id === rivalHotel.data.hotel.id, 'owner อีกคนเห็นเฉพาะโรงแรมของตัวเอง');
  ok((await rival.call(`/admin/hotels/${hotelId}`)).status === 403, 'เปิดโรงแรมคนอื่น → 403');
  ok((await rival.call(`/admin/hotels/${hotelId}`, 'PUT', hotelBody)).status === 403, 'แก้โรงแรมคนอื่น → 403');
  ok((await rival.call(`/admin/hotels/${hotelId}/rooms`, 'POST', roomBody)).status === 403, 'เพิ่มห้องให้โรงแรมคนอื่น → 403');
  ok((await rival.call(`/admin/rooms/${roomId}/calendar`)).status === 403, 'ดูปฏิทินห้องของคนอื่น → 403');
  ok((await rival.call(`/admin/rooms/${roomId}`, 'PUT', roomBody)).status === 403, 'แก้ห้องของคนอื่น → 403');
  ok((await admin.call(`/admin/hotels/${hotelId}`)).status === 200, 'admin เปิดได้ทุกโรงแรม');
  ok((await admin.call(`/admin/hotels/${hotelId}`, 'PUT', { ...hotelBody, ownerId: guest.id })).status === 400, 'admin ยกโรงแรมให้คนที่ไม่ใช่ owner → 400');

  const edited = await owner.call(`/admin/hotels/${hotelId}`, 'PUT', { ...hotelBody, description: 'โรงแรมทดสอบ วิวภูเขา' });
  ok(edited.status === 200 && edited.data.hotel.description === 'โรงแรมทดสอบ วิวภูเขา', 'owner แก้ข้อมูลโรงแรมตัวเองได้');

  console.log('\n=== 3) ลูกค้าจองโรงแรมใหม่ ===');
  const checkIn = addDays(today, 30);
  const checkOut = addDays(today, 32);
  const detail = await call(`/hotels/${hotelId}?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  ok(detail.status === 200 && detail.data.rooms?.some((r) => r.id === roomId), 'หน้าโรงแรมฝั่งลูกค้าเห็นห้องที่เพิ่ม');
  const book = async (stay) => {
    const created = await guest.call('/bookings', 'POST', { roomId, ...stay, guests: 2, rooms: 1, guestName: 'Guest Tester', guestPhone: '0812345678' });
    const paid = await guest.call(`/bookings/${created.data?.booking?.id}/pay`, 'POST', CARD);
    return { id: created.data?.booking?.id, status: created.status, paid: paid.status };
  };
  const bookingA = await book({ checkIn, checkOut });
  const bookingB = await book({ checkIn: addDays(today, 2), checkOut: addDays(today, 3) });
  ok(bookingA.status === 201 && bookingA.paid === 200 && bookingB.paid === 200, 'จอง + จ่ายเงิน 2 รายการ', JSON.stringify({ bookingA, bookingB }));

  console.log('\n=== 4) จำนวนห้อง + ปฏิทิน ===');
  const reduceTo = (totalRooms) => owner.call(`/admin/rooms/${roomId}`, 'PUT', { ...roomBody, totalRooms });
  const quote = () => call(`/bookings/quote?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}&guests=1`);
  ok((await reduceTo(0)).status === 409, 'ลดเหลือ 0 ห้อง ทั้งที่มีคนจองไว้ 1 ห้อง → 409');
  ok((await reduceTo(1)).status === 200 && (await quote()).data.available === 0, 'ลดเหลือ 1 (= ที่จองไว้) ได้ → ลูกค้าเห็นว่าเต็มทันที');
  ok((await reduceTo(2)).status === 200 && (await quote()).data.available === 1, 'เพิ่มกลับเป็น 2 → ว่าง 1');

  const calendar = (body) => owner.call(`/admin/rooms/${roomId}/calendar`, 'PUT', body);
  ok((await calendar({ from: checkIn, to: checkIn, availableRooms: 0 })).status === 409, 'ปิดขายคืนที่มีคนจองแล้ว → 409');
  ok((await calendar({ from: checkIn, to: checkIn, availableRooms: 3 })).status === 400, 'เปิดขายเกินจำนวนห้องจริง → 400');
  ok((await calendar({ from: addDays(today, -1), to: today, price: 999 })).status === 400, 'แก้วันที่ผ่านมาแล้ว → 400');
  ok((await calendar({ from: checkIn, to: checkIn })).status === 400, 'ไม่ระบุราคาหรือจำนวนห้อง → 400');
  const priced = await calendar({ from: checkIn, to: addDays(checkIn, 1), price: 2000 });
  const pricedQuote = await quote();
  ok(priced.data?.updated === 2 && pricedQuote.data.totalPrice === 4000, 'ตั้งราคา 2,000 สองคืน → ลูกค้าเห็นราคารวม 4,000', JSON.stringify(pricedQuote.data));
  const limited = await calendar({ from: checkIn, to: checkIn, availableRooms: 1 });
  ok(limited.status === 200 && (await quote()).data.available === 0, 'เปิดขายคืนแรกแค่ 1 ห้อง (มีคนจองแล้ว 1) → เต็ม');
  const days = (await owner.call(`/admin/rooms/${roomId}/calendar?from=${checkIn}&days=3`)).data?.days ?? [];
  ok(days.length === 3 && days[0].booked === 1 && days[0].overridePrice === 2000 && days[0].available === 0 && days[2].overridePrice === null,
    'ปฏิทินแสดงราคาที่ตั้ง + ห้องที่ถูกจองรายคืน', JSON.stringify(days));
  await calendar({ from: checkIn, to: addDays(checkIn, 1), reset: true });
  const resetQuote = await quote();
  ok(resetQuote.data.totalPrice === 3000 && resetQuote.data.available === 1, 'คืนค่าปกติ → ราคา 1,500 × 2 และว่าง 1 ห้องเหมือนเดิม');
  const saturdays = await calendar({ from: addDays(today, 40), to: addDays(today, 53), weekdays: [6], price: 1800 });
  ok(saturdays.data?.updated === 2, 'ตั้งราคาเฉพาะวันเสาร์ในช่วง 14 วัน → 2 วัน', JSON.stringify(saturdays.data));

  console.log('\n=== 5) การจองในหลังบ้าน ===');
  const listed = await owner.call(`/admin/bookings?hotelId=${hotelId}`);
  const rowA = listed.data?.bookings?.find((b) => b.id === bookingA.id);
  ok(listed.data?.total === 2 && rowA?.guest?.name === 'Guest Tester', 'owner เห็นการจองของโรงแรมตัวเอง พร้อมชื่อผู้เข้าพัก');
  ok(!(await rival.call('/admin/bookings')).data.bookings.some((b) => b.id === bookingA.id), 'owner คนอื่นไม่เห็นการจองนี้');
  ok((await rival.call(`/admin/bookings/${bookingA.id}`)).status === 403, 'owner คนอื่นเปิดการจองนี้ → 403');
  ok((await rival.call(`/admin/bookings/${bookingA.id}/cancel`, 'POST', { reason: 'ลองยกเลิกของคนอื่น' })).status === 403, 'owner คนอื่นยกเลิกการจองนี้ → 403');
  const byStatus = await owner.call(`/admin/bookings?hotelId=${hotelId}&status=confirmed`);
  ok(byStatus.data?.total === 2 && byStatus.data.bookings.every((b) => b.status === 'confirmed'), 'กรองตามสถานะ');
  const byRef = await owner.call(`/admin/bookings?q=${encodeURIComponent(rowA?.reference ?? '-')}`);
  ok(byRef.data?.total === 1, 'ค้นด้วยเลขที่การจอง');
  ok((await owner.call(`/admin/bookings/${bookingA.id}/cancel`, 'POST', { reason: '' })).status === 400, 'ยกเลิกโดยไม่ใส่เหตุผล → 400');
  const cancelled = await owner.call(`/admin/bookings/${bookingA.id}/cancel`, 'POST', { reason: 'ที่พักปิดปรับปรุงฉุกเฉิน' });
  ok(cancelled.status === 200 && cancelled.data.refunded === true && cancelled.data.booking.paymentStatus === 'Refunded',
    'หลังบ้านยกเลิกการจองที่จ่ายแล้ว → คืนเงิน', JSON.stringify(cancelled.data));
  ok((await guest.call(`/bookings/${bookingA.id}`)).data?.booking?.status === 'cancelled', 'ลูกค้าเห็นสถานะ "ยกเลิก" ในการจองของฉัน');
  ok((await owner.call(`/admin/bookings/${bookingA.id}/cancel`, 'POST', { reason: 'ยกเลิกซ้ำอีกรอบ' })).status === 409, 'ยกเลิกซ้ำ → 409');
  const payments = (await owner.call(`/admin/bookings/${bookingA.id}`)).data?.booking?.payments ?? [];
  ok(payments.length === 1 && payments[0].status === 'Refunded' && payments[0].cardLast4 === '4242', 'รายละเอียดแสดงประวัติการชำระเงิน (เลขบัตร 4 ตัวท้ายเท่านั้น)');

  console.log('\n=== 6) ภาพรวม (สถิติ) ===');
  const stats = (await owner.call('/admin/stats?days=7')).data;
  ok(stats?.totals?.hotels === 1 && stats.totals.rooms === 2 && stats.revenueByDay.length === 7, 'owner เห็นสถิติเฉพาะโรงแรมตัวเอง · กราฟครบ 7 วัน', JSON.stringify(stats?.totals));
  ok(stats?.current?.revenue === 1500 && stats.revenueByDay.at(-1).revenue === 1500, 'รายได้นับเฉพาะเงินที่ยังไม่คืน (1,500)', JSON.stringify(stats?.current));
  ok(stats?.statusCounts?.cancelled === 1 && stats.statusCounts.confirmed === 1, 'นับการจองแยกสถานะ', JSON.stringify(stats?.statusCounts));
  ok(stats?.upcoming?.total === 1 && stats.upcoming.bookings[0].id === bookingB.id && !('guestEmail' in stats.upcoming.bookings[0]),
    'เช็กอินใน 7 วัน: เห็นการจองที่ยังไม่ยกเลิก (ส่งแค่ชื่อผู้เข้าพัก)');
  ok(stats?.occupancy?.capacity === 60 && stats.occupancy.booked === 1, 'อัตราเข้าพัก 30 คืนข้างหน้า = 1 / 60 ห้อง-คืน', JSON.stringify({ ...stats?.occupancy, byDay: undefined }));
  const adminStats = (await admin.call('/admin/stats')).data;
  ok(adminStats?.totals?.hotels > 2, 'admin เห็นสถิติทั้งระบบ');

  console.log('\n=== 7) รีวิว ===');
  // รีวิวต้องมาจากการเข้าพักที่จบแล้ว — จำลองด้วยการ INSERT ตรง (หน้าเว็บรีวิวได้หลังเช็กเอาต์เท่านั้น)
  const { rows: [review] } = await db.query(
    `INSERT INTO reviews (booking_id, user_id, property_id, rating, comment) VALUES ($1, $2, $3, 2, 'ห้องเล็กกว่ารูป ทดสอบระบบ') RETURNING review_id`,
    [bookingB.id, guest.id, hotelId],
  );
  const ownerReviews = await owner.call(`/admin/reviews?hotelId=${hotelId}`);
  ok(ownerReviews.data?.reviews?.[0]?.reviewer === 'Guest T.' && ownerReviews.data.canDelete === false, 'owner เห็นรีวิว (ชื่อย่อ) แต่ไม่มีสิทธิ์ลบ', JSON.stringify(ownerReviews.data?.reviews?.[0]));
  ok((await owner.call(`/admin/reviews/${review.review_id}`, 'DELETE', { reason: 'ไม่ชอบรีวิวนี้' })).status === 403, 'owner ลบรีวิวโรงแรมตัวเอง → 403');
  ok((await admin.call(`/admin/reviews/${review.review_id}`, 'DELETE', {})).status === 400, 'admin ลบโดยไม่ใส่เหตุผล → 400');
  ok((await admin.call(`/admin/reviews/${review.review_id}`, 'DELETE', { reason: 'ทดสอบลบรีวิว' })).status === 200, 'admin ลบรีวิวได้');
  ok((await admin.call(`/admin/reviews/${review.review_id}`, 'DELETE', { reason: 'ทดสอบลบรีวิว' })).status === 404, 'ลบซ้ำ → 404');

  console.log('\n=== 8) ลบโรงแรม/ห้อง ===');
  ok((await owner.call(`/admin/hotels/${hotelId}`, 'DELETE')).status === 409, 'โรงแรมที่มีประวัติการจอง ลบไม่ได้ → 409');
  ok((await owner.call(`/admin/rooms/${roomId}`, 'DELETE')).status === 409, 'ห้องที่มีประวัติการจอง ลบไม่ได้ → 409');
  const spare = await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', { ...roomBody, name: 'Spare Room' });
  ok((await owner.call(`/admin/rooms/${spare.data?.room?.id}`, 'DELETE')).status === 200, 'ห้องที่ไม่เคยมีการจอง ลบได้');

  console.log('\n=== 9) เปลี่ยนบทบาท ===');
  const demoted = await admin.call(`/admin/users/${rival.id}/role`, 'PATCH', { role: 'user' });
  ok(demoted.data?.unassignedHotels === 1, 'owner → user: ถอดออกจากโรงแรมที่ดูแล 1 แห่ง');
  ok((await rival.call('/admin/hotels')).status === 403, 'สิทธิ์หายทันที (requireAuth อ่าน role จากฐานข้อมูลทุกคำขอ)');
  const orphan = (await admin.call(`/admin/hotels/${rivalHotel.data.hotel.id}`)).data?.hotel;
  ok(orphan && orphan.owner === null, 'โรงแรมที่ไม่มีเจ้าของ admin ยังดูแลได้');
  ok((await admin.call(`/admin/hotels/${rivalHotel.data.hotel.id}`, 'DELETE')).status === 200, 'โรงแรมที่ไม่เคยมีการจอง ลบได้');

  console.log('\n=== 10) บันทึกการทำงาน ===');
  const logs = [];
  for (const page of [1, 2]) logs.push(...((await admin.call(`/admin/audit?page=${page}`)).data?.logs ?? []));
  const has = (action, entityId) => logs.some((log) => log.action === action && log.entityId === entityId);
  ok(has('hotel.create', hotelId) && has('room.create', roomId) && has('room.update', roomId) && has('room.calendar', roomId)
    && has('booking.cancel', bookingA.id) && has('review.delete', review.review_id) && has('hotel.delete', rivalHotel.data.hotel.id),
  'มีบันทึกทุกการแก้ไข');
  const scriptLog = logs.find((log) => log.action === 'user.role' && log.entityId === admin.id);
  ok(scriptLog?.actor === null && scriptLog.detail.via === 'script', 'การตั้ง admin ด้วยสคริปต์ถูกบันทึกว่าเป็นสคริปต์ระบบ');
  const reviewLog = logs.find((log) => log.action === 'review.delete');
  ok(reviewLog && !JSON.stringify(reviewLog.detail).includes('ห้องเล็ก'), 'บันทึกการลบรีวิวไม่เก็บข้อความรีวิว (PDPA)');
  const failedLog = logs.filter((log) => log.action === 'room.update' && log.entityId === roomId);
  ok(failedLog.length === 2, 'คำขอที่ถูกปฏิเสธ (409) ไม่มีบันทึก — ROLLBACK พร้อมงาน', `room.update = ${failedLog.length}`);

  console.log('\n=== 11) admin สองคนลดสิทธิ์กันเองพร้อมกัน ===');
  await admin.call(`/admin/users/${rival.id}/role`, 'PATCH', { role: 'admin' });
  const { rows: [{ others }] } = await db.query(
    `SELECT COUNT(*)::int AS others FROM users WHERE role = 'admin' AND user_id <> ALL($1::int[])`, [[admin.id, rival.id]],
  );
  const race = await Promise.all([
    admin.call(`/admin/users/${rival.id}/role`, 'PATCH', { role: 'user' }),
    rival.call(`/admin/users/${admin.id}/role`, 'PATCH', { role: 'user' }),
  ]);
  const statuses = race.map((r) => r.status);
  const { rows: [{ admins }] } = await db.query(`SELECT COUNT(*)::int AS admins FROM users WHERE role = 'admin'`);
  if (others === 0) {
    // ไม่มี admin อื่นในระบบ → ถ้าไม่ล็อก ทั้งคู่จะเห็นว่า "มี admin 2 คน" แล้วลดสิทธิ์สำเร็จทั้งคู่ = ไม่เหลือ admin เลย
    ok(statuses.filter((s) => s === 200).length === 1 && statuses.some((s) => s === 409 || s === 403) && admins === 1,
      'สำเร็จคนเดียว อีกคนถูกปฏิเสธ → ยังเหลือ admin 1 คน', `${statuses.join(',')} · admin เหลือ ${admins}`);
  } else {
    console.log(`SKIP  มี admin คนอื่นในระบบ ${others} คน — ทดสอบกรณี "admin คนสุดท้าย" ไม่ได้ (ตรวจแค่ว่ายังมี admin)`);
    ok(admins >= 1, 'ยังมี admin ในระบบ');
  }
} catch (error) {
  failed += 1;
  console.error('ERROR', error);
} finally {
  // ล้างข้อมูลทดสอบ (ตรงในฐานข้อมูล เพราะผ่าน API ลบโรงแรมที่มีประวัติการจองไม่ได้โดยตั้งใจ)
  const userIds = users.map((user) => user.id);
  await db.query('DELETE FROM bookings WHERE property_id = ANY($1::int[]) OR user_id = ANY($2::int[])', [hotelIds, userIds]); // payments/รีวิว ลบตาม (CASCADE)
  await db.query('DELETE FROM properties WHERE property_id = ANY($1::int[])', [hotelIds]); // ห้อง/ปฏิทินลบตาม
  await db.query(`DELETE FROM admin_audit_log WHERE user_id = ANY($1::int[]) OR (user_id IS NULL AND entity_id = ANY($1::int[]) AND action = 'user.role')`, [userIds]);
  await db.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [userIds]);
  await db.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
