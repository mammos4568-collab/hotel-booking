// ============================================================
// ทดสอบการอนุมัติโรงแรม + ตัวกรองคำหยาบในข้อมูลโรงแรม (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/hotel-approval.js
//   (อ่าน DATABASE_URL จาก server/.env เอง — ใช้ตั้ง admin ด้วยสคริปต์ และล้างข้อมูลทดสอบตอนจบ)
//
//   - ตัวกรอง (ไม่ต้องเปิด server): คำหยาบไทย/อังกฤษ/ทับศัพท์ บล็อก · ชื่อจริงอย่าง River Kwai, Phuket, แกงกะหรี่ ไม่โดน
//     · คำก้ำกึ่ง (sus, mung, แม่ง) ไม่บล็อกแต่ถูกส่งให้ admin ดู
//   - เจ้าของเพิ่มโรงแรม → รออนุมัติ: ลูกค้าค้นหาไม่เจอ หน้าโรงแรม 404 จอง/ขอราคา/บันทึกรายการโปรดไม่ได้
//   - เฉพาะ admin อนุมัติ/ไม่อนุมัติได้ (ต้องมีเหตุผล) · อนุมัติแล้วลูกค้าเห็นทันที
//   - อนุมัติครั้งเดียว: เจ้าของแก้หลังอนุมัติ → ยังเผยแพร่อยู่
//   - ระงับโรงแรมที่มีการจอง → ซ่อนจากลูกค้า จองใหม่ไม่ได้ แต่การจองเดิมยังอยู่ · เจ้าของแก้แล้วบันทึก = ส่งตรวจใหม่
//   - admin เพิ่มโรงแรมเอง → เผยแพร่ทันที · บันทึกการทำงานมีการอนุมัติ/ไม่อนุมัติพร้อมเหตุผล
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วลบทุกอย่างที่สร้างตอนจบ
// ============================================================
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { findProfanity, findSuspiciousWords } from '../src/lib/moderation.js';

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const SET_ROLE = fileURLToPath(new URL('../scripts/set-role.js', import.meta.url));
const API = process.env.API_URL || 'http://localhost:3000/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `  -> ${detail}` : ''}`);
};

console.log('=== 1) ตัวกรองคำหยาบ (ไม่ต้องเปิด server) ===');
for (const text of ['Kuay Resort', 'โรงแรมฟัคยู', 'Sh1t Hotel', 'AI SUS Hostel', 'yed mae inn', 'เชี่ยรีสอร์ท', 'k.u.a.y lodge', 'ตอแหลวิลล่า']) {
  ok(findProfanity(text).length > 0, `บล็อก: "${text}"`, JSON.stringify(findProfanity(text)));
}
for (const text of ['River Kwai Resort', 'Mueang Chiang Mai Inn', 'Phuket Paradise', 'Kui Buri Resort', 'ผู้เชี่ยวชาญด้านสปา', 'ข้าวแกงกะหรี่', 'สัดส่วนห้องกว้าง', 'หีบเพลงโบราณ', 'แม่งานจัดเลี้ยง']) {
  ok(findProfanity(text).length === 0, `ไม่บล็อกชื่อ/คำปกติ: "${text}"`, JSON.stringify(findProfanity(text)));
}
ok(findSuspiciousWords('Sus Hostel').includes('sus') && findSuspiciousWords('Mung Bean Hostel').includes('mung'), 'คำก้ำกึ่งอังกฤษ (sus, mung) → ส่งให้ admin ดู');
ok(findSuspiciousWords('แม่งานจัดเลี้ยง').includes('แม่ง') && findSuspiciousWords('ข้าวแกงกะหรี่').includes('กะหรี่'), 'คำก้ำกึ่งไทย (แม่ง, กะหรี่) → ส่งให้ admin ดู');
ok(findSuspiciousWords('River Kwai Resort').length === 0 && findSuspiciousWords('Phuket Paradise').length === 0, 'ชื่อปกติไม่มีคำเตือน');

async function call(path, method = 'GET', body, cookie = '') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function register(name) {
  const email = `approval-test-${randomUUID().slice(0, 8)}@example.test`;
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: randomUUID() }),
  });
  if (res.status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${res.status}) — เปิด server แล้วหรือยัง?`);
  const data = await res.json();
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id: data.user.id, email, call: (path, method, body) => call(path, method, body, cookie) };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const stay = { checkIn: addDays(today, 290), checkOut: addDays(today, 291) };
const tag = randomUUID().slice(0, 6);
const hotelBody = (name) => ({
  name, propertyType: 'Hotel', city: 'Chiang Mai', address: '5 Approval Road, Chiang Mai', description: 'โรงแรมทดสอบการอนุมัติ', starRating: 3,
});
const roomBody = { name: 'Approval Room', maxGuests: 2, basePrice: 800, totalRooms: 2 };
const users = [];
const hotelIds = [];

try {
  const [admin, owner, guest] = await Promise.all(['Admin Approval', 'Owner Approval', 'Guest Approval'].map(register));
  users.push(admin, owner, guest);
  execFileSync(process.execPath, [SET_ROLE, admin.email, 'admin'], { env: process.env, stdio: 'pipe' });
  await admin.call(`/admin/users/${owner.id}/role`, 'PATCH', { role: 'owner' });

  console.log('\n=== 2) เจ้าของเพิ่มโรงแรม → รออนุมัติ (ลูกค้ายังไม่เห็น) ===');
  const name = `Approval Test Hotel ${tag}`;
  const created = await owner.call('/admin/hotels', 'POST', { ...hotelBody(name), approval: { status: 'approved' } });
  const hotelId = created.data?.hotel?.id;
  if (!hotelId) throw new Error(`สร้างโรงแรมไม่สำเร็จ: ${JSON.stringify(created.data)}`);
  hotelIds.push(hotelId);
  ok(created.status === 201 && created.data.hotel.approval.status === 'pending', 'เจ้าของเพิ่มโรงแรม → รออนุมัติ (แอบส่ง approved มาก็ไม่มีผล)', JSON.stringify(created.data.hotel.approval));
  const room = await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', roomBody);
  const roomId = room.data?.room?.id;
  const searchPending = await call(`/hotels?q=${encodeURIComponent(name)}`);
  ok(searchPending.data?.hotels?.length === 0, 'ค้นหาชื่อโรงแรมที่รออนุมัติ → ไม่เจอ', JSON.stringify(searchPending.data?.hotels));
  ok((await call(`/hotels/${hotelId}`)).status === 404, 'เปิดหน้าโรงแรมที่รออนุมัติ → 404');
  ok((await call(`/bookings/quote?roomId=${roomId}&checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=1`)).status === 404, 'ขอราคาห้องของโรงแรมที่รออนุมัติ → 404');
  ok((await guest.call('/bookings', 'POST', { roomId, ...stay, guests: 1 })).status === 404, 'ยิง API จองห้องของโรงแรมที่รออนุมัติตรงๆ → 404');
  ok((await guest.call(`/favorites/${hotelId}`, 'PUT')).status === 404, 'บันทึกรายการโปรดโรงแรมที่รออนุมัติ → 404');
  const queue = await owner.call('/admin/hotels?status=pending');
  ok(queue.data?.hotels?.some((h) => h.id === hotelId) && queue.data.counts.pending >= 1, 'เจ้าของเห็นโรงแรมตัวเองในรายการรออนุมัติ + จำนวนแต่ละสถานะ');
  ok((await owner.call('/admin/stats')).data?.totals?.pendingHotels >= 1, 'หน้าภาพรวมนับโรงแรมรออนุมัติ');

  console.log('\n=== 3) ตรวจคำหยาบตอนบันทึก ===');
  const badName = await owner.call('/admin/hotels', 'POST', hotelBody('Kuay Resort'));
  ok(badName.status === 400 && /kuay/.test(badName.data?.message), 'ชื่อ "Kuay Resort" → 400 บอกคำที่เจอ', badName.data?.message);
  const badDescription = await owner.call('/admin/hotels', 'POST', { ...hotelBody(`Clean Name ${tag}`), description: 'บรรยากาศดี ฟัคยู' });
  ok(badDescription.status === 400 && /คำอธิบาย/.test(badDescription.data?.message), 'คำอธิบายมีคำทับศัพท์หยาบ → 400', badDescription.data?.message);
  ok((await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', { ...roomBody, name: 'Sh1t Room' })).status === 400, 'ชื่อห้อง "Sh1t Room" → 400');
  const kwai = await owner.call('/admin/hotels', 'POST', hotelBody(`River Kwai Resort ${tag}`));
  if (kwai.data?.hotel?.id) hotelIds.push(kwai.data.hotel.id);
  ok(kwai.status === 201, 'ชื่อจริง "River Kwai Resort" บันทึกได้ (ไม่บล็อกผิด)', JSON.stringify(kwai.data));
  const sus = await owner.call('/admin/hotels', 'POST', hotelBody(`Sus Hostel ${tag}`));
  const susId = sus.data?.hotel?.id;
  if (susId) hotelIds.push(susId);
  ok(sus.status === 201, 'คำก้ำกึ่ง "Sus Hostel" บันทึกได้');
  ok((await admin.call(`/admin/hotels/${susId}`)).data?.hotel?.suspiciousWords?.includes('sus'), 'admin เห็นคำเตือน "sus" ตอนตรวจ');
  ok((await owner.call(`/admin/hotels/${susId}`)).data?.hotel?.suspiciousWords?.length === 0, 'เจ้าของไม่เห็นรายการคำเตือน (เป็นข้อมูลสำหรับ admin)');

  console.log('\n=== 4) สิทธิ์อนุมัติ ===');
  ok((await owner.call(`/admin/hotels/${hotelId}/approve`, 'POST')).status === 403, 'เจ้าของอนุมัติโรงแรมตัวเองไม่ได้ → 403');
  ok((await guest.call(`/admin/hotels/${hotelId}/approve`, 'POST')).status === 403, 'ลูกค้าอนุมัติไม่ได้ → 403');
  ok((await admin.call(`/admin/hotels/${hotelId}/reject`, 'POST', { reason: 'no' })).status === 400, 'ไม่อนุมัติโดยไม่ใส่เหตุผล (สั้นเกิน) → 400');
  const approve = await admin.call(`/admin/hotels/${hotelId}/approve`, 'POST');
  ok(approve.status === 200 && approve.data.hotel.approval.status === 'approved', 'admin อนุมัติ', JSON.stringify(approve.data));
  ok((await call(`/hotels?q=${encodeURIComponent(name)}`)).data?.hotels?.length === 1, 'อนุมัติแล้ว → ลูกค้าค้นหาเจอทันที');
  ok((await call(`/hotels/${hotelId}`)).status === 200, 'อนุมัติแล้ว → หน้าโรงแรมเปิดได้');
  ok((await admin.call(`/admin/hotels/${hotelId}/approve`, 'POST')).status === 409, 'อนุมัติซ้ำ → 409');

  console.log('\n=== 5) อนุมัติครั้งเดียว: เจ้าของแก้หลังอนุมัติ ===');
  const renamed = await owner.call(`/admin/hotels/${hotelId}`, 'PUT', hotelBody(`${name} Renamed`));
  ok(renamed.status === 200 && renamed.data.hotel.approval.status === 'approved', 'เจ้าของเปลี่ยนชื่อหลังอนุมัติ → ยังเผยแพร่อยู่', JSON.stringify(renamed.data?.hotel?.approval));
  ok((await call(`/hotels/${hotelId}`)).data?.name === `${name} Renamed`, 'ลูกค้าเห็นชื่อใหม่ทันที');
  ok((await owner.call(`/admin/hotels/${hotelId}`, 'PUT', hotelBody('Heea Hotel'))).status === 400, 'แก้ชื่อเป็นคำหยาบ (Heea) หลังอนุมัติ → ยังโดนบล็อก');

  console.log('\n=== 6) ระงับโรงแรมที่มีการจอง / ส่งตรวจใหม่ ===');
  await guest.call(`/favorites/${hotelId}`, 'PUT');
  const booking = await guest.call('/bookings', 'POST', { roomId, ...stay, guests: 1 });
  const bookingId = booking.data?.booking?.id;
  ok(booking.status === 201, 'ลูกค้าจองได้ระหว่างเผยแพร่', JSON.stringify(booking.data));
  const reject = await admin.call(`/admin/hotels/${hotelId}/reject`, 'POST', { reason: 'รูปไม่ตรงกับที่พักจริง กรุณาอัปรูปใหม่' });
  ok(reject.status === 200 && reject.data.hotel.approval.status === 'rejected', 'admin ระงับโรงแรมพร้อมเหตุผล', JSON.stringify(reject.data));
  ok((await call(`/hotels/${hotelId}`)).status === 404 && (await call(`/hotels?q=${encodeURIComponent(name)}`)).data?.hotels?.length === 0, 'ระงับแล้ว → ลูกค้าค้นหาไม่เจอ หน้าโรงแรม 404');
  ok((await guest.call(`/bookings/${bookingId}`)).status === 200, 'การจองเดิมของลูกค้ายังเปิดดูได้');
  ok((await guest.call('/bookings', 'POST', { roomId, ...stay, guests: 1 })).status === 404, 'จองใหม่ไม่ได้ → 404');
  ok(!(await guest.call('/favorites')).data?.hotels?.some((h) => h.id === hotelId), 'รายการโปรดไม่แสดงโรงแรมที่ถูกระงับ');
  const ownerView = await owner.call(`/admin/hotels/${hotelId}`);
  ok(ownerView.data?.hotel?.approval?.note === 'รูปไม่ตรงกับที่พักจริง กรุณาอัปรูปใหม่', 'เจ้าของเห็นเหตุผลที่ถูกระงับ');
  const resubmit = await owner.call(`/admin/hotels/${hotelId}`, 'PUT', hotelBody(`${name} Fixed`));
  ok(resubmit.data?.hotel?.approval?.status === 'pending', 'เจ้าของแก้แล้วบันทึก → ส่งตรวจใหม่ (รออนุมัติ)', JSON.stringify(resubmit.data?.hotel?.approval));
  ok((await admin.call(`/admin/hotels/${hotelId}/approve`, 'POST')).data?.hotel?.approval?.status === 'approved', 'admin อนุมัติอีกครั้ง → กลับมาเผยแพร่');
  await guest.call(`/bookings/${bookingId}/cancel`, 'POST');

  console.log('\n=== 7) admin เพิ่มโรงแรมเอง / บันทึกการทำงาน ===');
  const adminHotel = await admin.call('/admin/hotels', 'POST', hotelBody(`Admin Approved Hotel ${tag}`));
  if (adminHotel.data?.hotel?.id) hotelIds.push(adminHotel.data.hotel.id);
  ok(adminHotel.data?.hotel?.approval?.status === 'approved', 'admin เพิ่มโรงแรมเอง → เผยแพร่ทันที');
  const audit = (await admin.call('/admin/audit')).data?.logs ?? [];
  const mine = audit.filter((log) => log.entityId === hotelId);
  ok(mine.some((log) => log.action === 'hotel.approve') && mine.some((log) => log.action === 'hotel.reject' && log.detail?.reason),
    'บันทึกการทำงานมีการอนุมัติ และการไม่อนุมัติพร้อมเหตุผล', JSON.stringify(mine.map((log) => log.action)));
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // ล้างข้อมูลทดสอบตรงในฐานข้อมูล
  const userIds = users.map((user) => user.id);
  await db.query('DELETE FROM bookings WHERE property_id = ANY($1::int[]) OR user_id = ANY($2::int[])', [hotelIds, userIds]);
  await db.query('DELETE FROM properties WHERE property_id = ANY($1::int[])', [hotelIds]);
  await db.query(`DELETE FROM admin_audit_log WHERE user_id = ANY($1::int[]) OR (user_id IS NULL AND entity_id = ANY($1::int[]) AND action = 'user.role')`, [userIds]);
  await db.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [userIds]);
  await db.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
