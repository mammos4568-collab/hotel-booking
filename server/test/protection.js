// ============================================================
// ทดสอบการป้องกันการใช้งานในทางที่ผิดของระบบจอง
//   1) คำขอพิเศษที่มีถ้อยคำไม่สุภาพ หรือพิมพ์ซ้ำๆ (สแปม) → 400 (แต่คำปกติอย่าง "สัดส่วน" ต้องผ่าน)
//   2) จองค้างชำระพร้อมกันเกิน 3 รายการ → 429
//   3) จ่ายเงินไม่สำเร็จครบ 5 ครั้ง → 429 และการจองถูกยกเลิก
//   4) ยิงคำขอเกิน 10 ครั้งใน 1 นาที → 429 (rate limit)
//   5) ความคิดเห็นรีวิวที่มีถ้อยคำไม่สุภาพ หรือเป็นสแปม (ทั้งเขียนใหม่และแก้ไข) → 400
//   6) รายการรีวิวสาธารณะแสดงชื่อแบบย่อ และไม่ส่ง user id (PDPA)
//   7) ตัวกรองสแปม: "กกกก", "asdasd", "55555" ถูกบล็อก · ยืดเสียง/หัวเราะแบบปกติ ("มากกกก", "555") ผ่าน
//
// วิธีรัน (เปิด server ก่อน):  node server/test/protection.js
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) ตอนจบยกเลิกการจองที่สร้างทั้งหมดและลบบัญชีทดสอบ
// ============================================================
import { randomUUID } from 'node:crypto';
import { findSpam } from '../src/lib/moderation.js';

const API = process.argv.find((a) => a.startsWith('--api='))?.slice(6) || 'http://localhost:3000/api';
const DECLINED_CARD = { method: 'card', cardNumber: '4000000000000002', cardName: 'TEST', expiry: '12/30', cvc: '123' };
let failures = 0;
const testers = []; // { cookie, password } — ไว้ลบบัญชีทดสอบตอนจบ

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), res };
}

async function newUser(label) {
  const password = randomUUID();
  const { status, res } = await call('/auth/register', {
    method: 'POST',
    body: { name: `Guard ${label}`, email: `guard-${label}-${randomUUID().slice(0, 8)}@example.test`, password },
  });
  if (status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${status})`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  testers.push({ cookie, password });
  return cookie;
}

// ลบบัญชีทดสอบผ่าน API ลบบัญชี (PDPA) แบบเดียวกับผู้ใช้จริง — ต้องยกเลิกการจองก่อน (ยังมีการจองค้าง = 409)
// การจองที่ยกเลิกแล้วยังเก็บไว้แบบระบุตัวตนไม่ได้ (หลักฐานทางบัญชี) · คืนจำนวนบัญชีที่ลบสำเร็จ
async function deleteTesters() {
  const results = await Promise.all(testers.map(({ cookie, password }) => call('/privacy/account', {
    method: 'DELETE', cookie, body: { password, confirm: 'ลบบัญชี' },
  })));
  return results.filter((r) => r.status === 200).length;
}

function check(label, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`  ${pass ? '✅' : '❌'} ${label}${detail ? `  → ${detail}` : ''}`);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // ใช้ห้องที่มีหลายห้อง (Riverside Heritage · Superior Double มี 12 ห้อง) ช่วงวันในอนาคต
  const hotel = (await call('/hotels?q=Riverside%20Heritage')).data.hotels[0];
  const room = (await call(`/hotels/${hotel.id}`)).data.rooms.find((r) => r.name === 'Superior Double');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const stay = (offset) => ({ checkIn: addDays(today, 200 + offset), checkOut: addDays(today, 201 + offset) });
  const created = []; // { id, cookie } — ไว้ยกเลิกตอนจบ

  console.log('\n=== 1) คำหยาบในคำขอพิเศษ ===');
  const a = await newUser('a');
  const rude = await call('/bookings', { method: 'POST', cookie: a, body: { roomId: room.id, ...stay(0), guests: 1, specialRequests: 'ขอห้อง ค.ว.ย ไม่ต้อง' } });
  check('ข้อความมีคำหยาบแบบเลี่ยง (ค.ว.ย) ถูกปฏิเสธ', rude.status === 400, rude.data?.message);
  const english = await call('/bookings', { method: 'POST', cookie: a, body: { roomId: room.id, ...stay(0), guests: 1, specialRequests: 'f*ck this room' } });
  check('คำหยาบภาษาอังกฤษ (f*ck) ถูกปฏิเสธ', english.status === 400, english.data?.message);
  const spamRequest = await call('/bookings', { method: 'POST', cookie: a, body: { roomId: room.id, ...stay(0), guests: 1, specialRequests: 'ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก ก' } });
  check('คำขอพิเศษพิมพ์ซ้ำ "ก ก ก ก…" (สแปม) ถูกปฏิเสธ', spamRequest.status === 400 && /คำขอพิเศษ/.test(spamRequest.data?.message), spamRequest.data?.message);
  const polite = await call('/bookings', { method: 'POST', cookie: a, body: { roomId: room.id, ...stay(0), guests: 1, specialRequests: 'ขอสัดส่วนห้องกว้าง และหีบใส่ของ' } });
  check('คำปกติ ("สัดส่วน", "หีบ") ผ่าน', polite.status === 201, polite.status === 201 ? polite.data.booking.reference : polite.data?.message);
  if (polite.status === 201) created.push({ id: polite.data.booking.id, cookie: a });

  console.log('\n=== 2) จำกัดการจองที่รอชำระพร้อมกัน (สูงสุด 3) ===');
  const b = await newUser('b');
  const holds = [];
  for (let i = 1; i <= 4; i += 1) {
    holds.push(await call('/bookings', { method: 'POST', cookie: b, body: { roomId: room.id, ...stay(i), guests: 1 } }));
  }
  holds.filter((r) => r.status === 201).forEach((r) => created.push({ id: r.data.booking.id, cookie: b }));
  check('จองที่ 1–3 ได้', holds.slice(0, 3).every((r) => r.status === 201), holds.slice(0, 3).map((r) => r.status).join(', '));
  check('จองที่ 4 ถูกปฏิเสธ (429)', holds[3].status === 429, holds[3].data?.message);
  await call(`/bookings/${holds[0].data.booking.id}/cancel`, { method: 'POST', cookie: b });
  const afterCancel = await call('/bookings', { method: 'POST', cookie: b, body: { roomId: room.id, ...stay(5), guests: 1 } });
  if (afterCancel.status === 201) created.push({ id: afterCancel.data.booking.id, cookie: b });
  check('ยกเลิก 1 รายการแล้วจองใหม่ได้', afterCancel.status === 201, String(afterCancel.status));

  // คนเดียวกันยิงพร้อมกัน 6 คำขอ — ถ้าไม่ล็อกแถวผู้ใช้ ทุกคำขอจะนับเห็น 0 แล้วทะลุเพดานได้
  const e = await newUser('e');
  const burstHolds = await Promise.all(
    Array.from({ length: 6 }, (_, i) => call('/bookings', { method: 'POST', cookie: e, body: { roomId: room.id, ...stay(20 + i), guests: 1 } }))
  );
  burstHolds.filter((r) => r.status === 201).forEach((r) => created.push({ id: r.data.booking.id, cookie: e }));
  const ok = burstHolds.filter((r) => r.status === 201).length;
  const blocked = burstHolds.filter((r) => r.status === 429).length;
  check('ยิงพร้อมกัน 6 คำขอจากคนเดียว ได้พอดี 3 ที่เหลือ 429', ok === 3 && blocked === 3, `201 × ${ok}, 429 × ${blocked}`);

  console.log('\n=== 3) จ่ายเงินไม่สำเร็จครบ 5 ครั้ง ===');
  const c = await newUser('c');
  const hold = await call('/bookings', { method: 'POST', cookie: c, body: { roomId: room.id, ...stay(10), guests: 1 } });
  created.push({ id: hold.data.booking.id, cookie: c });
  const attempts = [];
  for (let i = 1; i <= 5; i += 1) {
    attempts.push(await call(`/bookings/${hold.data.booking.id}/pay`, { method: 'POST', cookie: c, body: DECLINED_CARD }));
  }
  check('ครั้งที่ 1–4 บอกจำนวนครั้งที่เหลือ', attempts.slice(0, 4).every((r) => r.status === 402 && /ลองได้อีก/.test(r.data?.message)), attempts[3].data?.message);
  check('ครั้งที่ 5 ถูกบล็อก (429)', attempts[4].status === 429, attempts[4].data?.message);
  const after = await call(`/bookings/${hold.data.booking.id}`, { cookie: c });
  check('การจองถูกยกเลิกและห้องถูกปล่อยคืน', after.data?.booking?.status === 'cancelled', `${after.data?.booking?.bookingStatus}/${after.data?.booking?.paymentStatus}`);
  const goodCard = await call(`/bookings/${hold.data.booking.id}/pay`, { method: 'POST', cookie: c, body: { ...DECLINED_CARD, cardNumber: '4242424242424242' } });
  check('จ่ายด้วยบัตรถูกต้องหลังโดนบล็อกก็ไม่ได้ (409)', goodCard.status === 409, goodCard.data?.message);

  console.log('\n=== 4) Rate limit (10 คำขอ/นาที ต่อผู้ใช้) ===');
  const d = await newUser('d');
  const burst = [];
  for (let i = 1; i <= 11; i += 1) {
    burst.push(await call('/bookings/999999/cancel', { method: 'POST', cookie: d }));
  }
  check('คำขอที่ 1–10 ผ่านเข้าไปถึง API (404 ไม่พบการจอง)', burst.slice(0, 10).every((r) => r.status === 404));
  check('คำขอที่ 11 ถูกบล็อก (429) พร้อมบอกเวลารอ', burst[10].status === 429 && Boolean(burst[10].res.headers.get('retry-after')), burst[10].data?.message);

  console.log('\n=== 5) คำหยาบ/สแปมในความคิดเห็นรีวิว ===');
  // ตัวกรองอยู่หน้า module รีวิว จึงตรวจก่อนเช็กสิทธิ์การรีวิว — ใช้ bookingId ปลอมทดสอบได้โดยไม่สร้างข้อมูลจริง
  const f = await newUser('f');
  const rudeReview = await call('/reviews', { method: 'POST', cookie: f, body: { bookingId: 999999, rating: 1, comment: 'ห้องแย่ ไอ้เหี้ย' } });
  check('รีวิวที่มีคำหยาบถูกปฏิเสธ (400)', rudeReview.status === 400 && /ไม่สุภาพ/.test(rudeReview.data?.message), rudeReview.data?.message);
  const rudeEdit = await call('/reviews/999999', { method: 'PUT', cookie: f, body: { comment: 's h i t service' } });
  check('แก้ไขรีวิวเป็นคำหยาบก็ถูกปฏิเสธ (400)', rudeEdit.status === 400 && /ไม่สุภาพ/.test(rudeEdit.data?.message), rudeEdit.data?.message);
  const spamReview = await call('/reviews', { method: 'POST', cookie: f, body: { bookingId: 999999, rating: 1, comment: 'ก'.repeat(120) } });
  check('รีวิว "กกกก…" ยาวๆ (สแปม) ถูกปฏิเสธ (400)', spamReview.status === 400 && /ติดกันเกิน/.test(spamReview.data?.message), spamReview.data?.message);
  const spamEdit = await call('/reviews/999999', { method: 'PUT', cookie: f, body: { comment: 'asd asd asd asd asd asd asd' } });
  check('แก้ไขรีวิวเป็นคำเดิมซ้ำๆ ก็ถูกปฏิเสธ (400)', spamEdit.status === 400 && /ซ้ำ/.test(spamEdit.data?.message), spamEdit.data?.message);
  const cleanReview = await call('/reviews', { method: 'POST', cookie: f, body: { bookingId: 999999, rating: 5, comment: 'สัดส่วนห้องดี บริการเยี่ยม' } });
  check('รีวิวสุภาพผ่านตัวกรองไปถึง module รีวิว (ได้ 403 เพราะ booking ปลอม)', cleanReview.status === 403, cleanReview.data?.message);
  const excited = await call('/reviews', { method: 'POST', cookie: f, body: { bookingId: 999999, rating: 5, comment: 'ดีมากกกกกกก ห้องสะอาด พนักงานตลก 55555' } });
  check('รีวิวยืดเสียง/หัวเราะแบบปกติ ("มากกกก", "555") ไม่โดนตัวกรองสแปม (ได้ 403)', excited.status === 403, excited.data?.message);

  console.log('\n=== 6) PDPA: รายการรีวิวสาธารณะไม่เปิดเผยชื่อเต็ม ===');
  const publicReviews = (await call(`/reviews?hotelId=${hotel.id}`)).data.reviews;
  const shortNames = publicReviews.every((r) => !r.user || /^\S+( \S\.)?$/u.test(r.user.name));
  const noIds = publicReviews.every((r) => !r.user || r.user.id === undefined);
  check('ชื่อผู้รีวิวเป็นแบบย่อ (เช่น "Ploy S.")', shortNames, publicReviews.map((r) => r.user?.name).join(', '));
  check('ไม่ส่ง user id ของผู้รีวิวออกไป', noIds);

  console.log('\n=== 7) ตัวกรองสแปม: ตัวอย่างข้อความ (เรียก findSpam ตรงๆ) ===');
  const spamSamples = [
    'ก'.repeat(40), 'กกกกกกกกกก', 'ก ก ก ก ก ก ก ก ก ก ก ก', 'asdasdasdasdasdasdasd', 'ดีดีดีดีดีดีดีดีดีดี', '5555555555',
    '!!!!!!!!!!!!', '😂😂😂😂😂😂😂😂😂😂', `ห้องดี ${'asd'.repeat(12)}`, 'กขกขขกกขกขกขขกขกขกขกข',
  ];
  const normalSamples = [
    'ดี', 'ok', '👍👍👍', 'ดีมากกกกกกก ห้องสะอาด พนักงานน่ารัก', 'ชอบบบบบบบบบ', 'โอเคคคคคคคค', 'พนักงานตลกมาก 555555 แต่ห้องดีนะ',
    'ดีมาก ดีมาก ดีมาก', 'ขอบคุณค่ะ ❤️❤️❤️❤️❤️', 'ห้องโอเค..........แต่แอร์เสียงดัง', 'ขอใบกำกับภาษี เลขผู้เสียภาษี 0105555555555',
    '99/9 หมู่ 9 ถนนสุขุมวิท กรุงเทพฯ 10110',
  ];
  const missed = spamSamples.filter((text) => !findSpam(text));
  const blockedWrongly = normalSamples.filter((text) => findSpam(text));
  check(`ข้อความสแปม ${spamSamples.length} แบบถูกบล็อกครบ ("กกกก", "asdasd", "55555", "!!!!", อีโมจิซ้ำ, เว้นวรรคคั่น)`, missed.length === 0, missed.join(' | '));
  check(`ข้อความปกติ ${normalSamples.length} แบบไม่โดนบล็อก (ยืดเสียง, หัวเราะ 555, เลขที่อยู่/เลขภาษี)`, blockedWrongly.length === 0, blockedWrongly.join(' | '));

  // เก็บกวาด — ยกเลิกการจองทดสอบที่ยังค้างอยู่ (ตัวที่ยกเลิกไปแล้วจะได้ 409 ไม่เป็นไร)
  await Promise.all(created.map(({ id, cookie }) => call(`/bookings/${id}/cancel`, { method: 'POST', cookie })));
  const removed = await deleteTesters();
  check(`ลบบัญชีทดสอบครบ ${testers.length} บัญชี`, removed === testers.length, `ลบได้ ${removed}`);
  console.log(`\n${failures === 0 ? '✅ ผ่านทุกข้อ' : `❌ ไม่ผ่าน ${failures} ข้อ`} (ยกเลิกการจองและลบบัญชีทดสอบแล้ว)\n`);
  if (failures) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('ทดสอบล้มเหลว:', error.message);
  console.error('ตรวจว่าเปิด server แล้ว (npm run dev) และฐานข้อมูลมีข้อมูลจาก db/04-demo-data.sql');
  await deleteTesters().catch(() => 0); // พยายามลบบัญชีที่สมัครไปแล้ว (ถ้ายังมีการจองค้าง จะลบไม่ได้)
  process.exitCode = 1;
});
