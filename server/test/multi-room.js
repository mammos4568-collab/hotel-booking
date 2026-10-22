// ============================================================
// ทดสอบ "จองหลายห้องในครั้งเดียว" (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/multi-room.js
//
// ใช้ห้อง Sky Suite ของ Skyline Tower Bangkok (มีจริง 2 ห้อง ห้องละ 3 คน)
//   - จอง 2 ห้องในครั้งเดียว → ราคา = ราคาต่อห้อง × 2 · ห้องเต็มทั้งประเภท
//   - จองพร้อมกัน 6 คำขอ คำขอละ 2 ห้อง → สำเร็จได้แค่ 1 (ล็อกแถวประเภทห้อง + นับด้วย SUM(num_rooms))
//   - ตรวจความจุ: 7 คน 2 ห้องไม่พอ (6 คน) · 6 ห้องเกินเพดาน · ห้องมากกว่าคนไม่ได้
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วยกเลิกการจอง + ลบบัญชีทดสอบตอนจบ
// ============================================================
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL || 'http://localhost:3000/api';
let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `  -> ${detail}` : ''}`);
};

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), res };
}

async function register(index) {
  const password = randomUUID();
  const { status, res } = await call('/auth/register', {
    method: 'POST',
    body: { name: `Multi Room ${index}`, email: `multiroom-${randomUUID().slice(0, 8)}@example.test`, password },
  });
  if (status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${status}) — เปิด server แล้วหรือยัง?`);
  return { password, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const detail = await call('/hotels/7');
const room = detail.data?.rooms?.find((r) => r.name === 'Sky Suite');
if (!room) throw new Error('ไม่พบห้อง Sky Suite ของ Skyline Tower Bangkok — รัน db/04-demo-data.sql แล้วหรือยัง?');

// หาช่วงวันในอนาคตที่ Sky Suite ว่างครบ 2 ห้อง (รันซ้ำได้ไม่ชนรอบก่อน)
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
let checkIn;
for (let offset = 120; offset < 170; offset += 3) {
  const q = await call(`/bookings/quote?roomId=${room.id}&checkIn=${addDays(today, offset)}&checkOut=${addDays(today, offset + 2)}&guests=2`);
  if (q.data?.available === 2) { checkIn = addDays(today, offset); break; }
}
if (!checkIn) throw new Error('หาช่วงวันที่ Sky Suite ว่างครบ 2 ห้องไม่เจอ');
const checkOut = addDays(checkIn, 2);
const stay = { roomId: room.id, checkIn, checkOut };
console.log(`ห้อง Sky Suite (${room.totalRooms} ห้อง ห้องละ ${room.maxGuests} คน) · ${checkIn} → ${checkOut}\n`);

const users = await Promise.all([1, 2, 3].map(register));
const created = []; // [{ id, cookie }] ไว้ยกเลิกตอนจบ

// 1) ใบเสนอราคาหลายห้อง
const quote = await call(`/bookings/quote?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&guests=5&rooms=2`);
ok(quote.status === 200 && quote.data.rooms === 2 && quote.data.totalPrice === Math.round(quote.data.pricePerRoom * 2 * 100) / 100,
  'quote 2 ห้อง: ราคารวม = ราคาต่อห้อง × 2', JSON.stringify({ per: quote.data?.pricePerRoom, total: quote.data?.totalPrice }));

// 2) ตรวจความจุก่อนจอง
const book = (user, body) => call('/bookings', { method: 'POST', cookie: user.cookie, body: { ...stay, guestName: 'Multi Room', ...body } });
ok((await book(users[0], { guests: 7, rooms: 2 })).status === 400, '7 คน 2 ห้อง (รับได้ 6) → 400');
ok((await book(users[0], { guests: 6, rooms: 6 })).status === 400, 'จอง 6 ห้อง (เกินเพดาน 5) → 400');
ok((await book(users[0], { guests: 1, rooms: 2 })).status === 400, 'ห้องมากกว่าคน (1 คน 2 ห้อง) → 400');

// 3) จองพร้อมกัน 6 คำขอ คำขอละ 2 ห้อง (3 ผู้ใช้ × 2) → ห้องมีแค่ 2 สำเร็จได้แค่ 1
const results = await Promise.all(users.flatMap((user) => [1, 2].map(() => book(user, { guests: 6, rooms: 2 }))));
const success = results.filter((r) => r.status === 201);
results.forEach((r, i) => { if (r.status === 201) created.push({ id: r.data.booking.id, cookie: users[Math.floor(i / 2)].cookie }); });
ok(success.length === 1 && results.filter((r) => r.status === 409).length === 5,
  'จองพร้อมกัน 6 คำขอ × 2 ห้อง → สำเร็จ 1 · เต็ม 5', results.map((r) => r.status).join(','));
const booking = success[0]?.data.booking;
ok(booking?.rooms === 2 && booking?.totalAmount === quote.data.totalPrice, 'การจองบันทึก 2 ห้อง ราคาตรงกับใบเสนอราคา',
  JSON.stringify({ rooms: booking?.rooms, total: booking?.totalAmount }));

const after = await call(`/bookings/quote?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
ok(after.data.available === 0, 'หลังจอง 2 ห้อง → ห้องว่างเหลือ 0 (นับด้วย SUM(num_rooms))', `available=${after.data.available}`);
ok((await book(users[1], { guests: 2, rooms: 1 })).status === 409, 'จองเพิ่มอีก 1 ห้อง → 409 เต็ม');

// 4) ยกเลิกแล้วห้องคืนครบทั้ง 2 ห้อง
for (const item of created) await call(`/bookings/${item.id}/cancel`, { method: 'POST', cookie: item.cookie });
const freed = await call(`/bookings/quote?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
ok(freed.data.available === 2, 'ยกเลิกแล้วห้องกลับมาว่างครบ 2 ห้อง', `available=${freed.data.available}`);

for (const user of users) {
  const deleted = await call('/privacy/account', { method: 'DELETE', cookie: user.cookie, body: { password: user.password, confirm: 'ลบบัญชี' } });
  if (deleted.status !== 200) console.log('ลบบัญชีทดสอบไม่สำเร็จ:', deleted.data?.message);
}
console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด (ยกเลิกการจองและลบบัญชีทดสอบแล้ว)');
process.exitCode = failed ? 1 : 0;
