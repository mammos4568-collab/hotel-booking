// ============================================================
// ทดสอบ "จองพร้อมกัน" — หลักฐานว่าระบบกันจองเกินได้จริง (เก็บผลไว้ใส่สไลด์)
//
// ยิง POST /api/bookings ประเภทห้องเดียวกัน ช่วงวันเดียวกัน "พร้อมกัน" หลายคำขอ (คนละผู้ใช้)
// ผลที่ถูกต้อง: สำเร็จ 201 เท่ากับจำนวนห้องว่างจริงพอดี ที่เหลือได้ 409 ทั้งหมด
// แล้วทดสอบต่อ: จองต่อกันพอดี (ต้องได้) · ยกเลิกแล้วห้องต้องกลับมาว่าง
//
// วิธีรัน (เปิด server ก่อน):  node server/test/concurrent-booking.js
//   ตัวเลือก: --requests=10  --hotel="Skyline Tower Bangkok"  --room="Sky Suite"
//             --api=http://localhost:3000/api
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) ตอนจบยกเลิกการจองที่สร้างทั้งหมดและลบบัญชีทดสอบ
// ============================================================
import { randomUUID } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  })
);
const API = args.api || 'http://localhost:3000/api';
const REQUESTS = Number(args.requests || 10);
const HOTEL_NAME = args.hotel || 'Skyline Tower Bangkok';
const ROOM_NAME = args.room || 'Sky Suite';
const testers = []; // { cookie, password } — ไว้ลบบัญชีทดสอบตอนจบ

async function call(path, { method = 'GET', body, cookie } = {}) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms: Math.round(performance.now() - started), res };
}

async function registerTester(index) {
  const password = randomUUID(); // รหัสสุ่ม ใช้ครั้งเดียว (เก็บไว้ยืนยันตอนลบบัญชีทดสอบ)
  const { status, res } = await call('/auth/register', {
    method: 'POST',
    body: {
      name: `Load Tester ${index}`,
      email: `loadtest-${Date.now()}-${index}-${randomUUID().slice(0, 6)}@example.test`,
      password,
    },
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

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function quote(roomId, checkIn, checkOut) {
  const { data } = await call(`/bookings/quote?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}&guests=1`);
  return data.available;
}

function line(label, value) {
  console.log(`  ${label.padEnd(42, ' ')}${value}`);
}

async function main() {
  // 1) หาประเภทห้องที่จะทดสอบ
  const search = await call(`/hotels?q=${encodeURIComponent(HOTEL_NAME)}`);
  const hotel = search.data?.hotels?.find((h) => h.name === HOTEL_NAME);
  if (!hotel) throw new Error(`ไม่พบโรงแรม "${HOTEL_NAME}" — รัน db/04-demo-data.sql แล้วหรือยัง?`);
  const detail = await call(`/hotels/${hotel.id}`);
  const room = detail.data.rooms.find((r) => r.name === ROOM_NAME);
  if (!room) throw new Error(`ไม่พบห้อง "${ROOM_NAME}" ใน ${HOTEL_NAME}`);

  // 2) สุ่มช่วงวันในอนาคต (2 คืน) ที่ยังว่างครบ จะได้รันซ้ำกี่รอบก็ไม่ชนกับรอบก่อน
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  let checkIn;
  let available = 0;
  for (let attempt = 0; attempt < 20 && available < room.totalRooms; attempt += 1) {
    checkIn = addDays(today, 30 + Math.floor(Math.random() * 300));
    available = await quote(room.id, checkIn, addDays(checkIn, 2));
  }
  const checkOut = addDays(checkIn, 2);

  console.log('\n=== ทดสอบจองพร้อมกัน (Concurrent booking test) ===');
  line('ห้องที่ทดสอบ', `${HOTEL_NAME} · ${ROOM_NAME} (roomId ${room.id})`);
  line('ช่วงวัน', `${checkIn} → ${checkOut} (2 คืน)`);
  line('ห้องว่างก่อนทดสอบ', `${available} ห้อง`);
  line('จำนวนคำขอที่ยิงพร้อมกัน', `${REQUESTS} คำขอ (ผู้ใช้คนละคน)`);

  const cookies = await Promise.all(Array.from({ length: REQUESTS }, (_, i) => registerTester(i + 1)));

  // 3) ยิงพร้อมกันจริงๆ ด้วย Promise.all — ทุกคำขอออกไปก่อนที่คำขอไหนจะได้คำตอบ
  const body = { roomId: room.id, checkIn, checkOut, guests: 1 };
  const results = await Promise.all(
    cookies.map((cookie) => call('/bookings', { method: 'POST', body, cookie }))
  );

  console.log('\n  #   HTTP   เวลา     ผลลัพธ์');
  results.forEach((r, i) => {
    const outcome = r.status === 201 ? `จองสำเร็จ ${r.data.booking.reference}` : r.data?.message;
    console.log(`  ${String(i + 1).padStart(2)}  ${r.status}   ${String(r.ms).padStart(4)} ms  ${outcome}`);
  });

  const created = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const remaining = await quote(room.id, checkIn, checkOut);
  const passConcurrent = created.length === available && rejected.length === REQUESTS - available && remaining === 0;

  console.log('');
  line('สำเร็จ (201)', `${created.length} (คาดหวัง ${available})`);
  line('เต็ม (409)', `${rejected.length} (คาดหวัง ${REQUESTS - available})`);
  line('ห้องว่างหลังทดสอบ', `${remaining} (คาดหวัง 0)`);
  line('ผล', passConcurrent ? '✅ ผ่าน — ไม่มีการจองเกินจำนวนห้อง' : '❌ ไม่ผ่าน');

  // 4) จองต่อกันพอดี: เช็กอินวันเดียวกับที่คนก่อนเช็กเอาต์ → ต้องจองได้ (ไม่นับคืนวันเช็กเอาต์)
  const backToBack = await call('/bookings', {
    method: 'POST',
    cookie: cookies[0],
    body: { roomId: room.id, checkIn: checkOut, checkOut: addDays(checkOut, 1), guests: 1 },
  });
  // 5) คาบเกี่ยวบางส่วน (คืนที่ 2 ของช่วงที่เต็มแล้ว) → ต้องได้ 409
  const partialOverlap = await call('/bookings', {
    method: 'POST',
    cookie: cookies[1],
    body: { roomId: room.id, checkIn: addDays(checkIn, 1), checkOut: addDays(checkIn, 3), guests: 1 },
  });
  // 6) ยกเลิก 1 รายการ → ห้องต้องกลับมาว่าง 1 ห้อง
  const owner = results.findIndex((r) => r.status === 201);
  const cancel = await call(`/bookings/${created[0].data.booking.id}/cancel`, { method: 'POST', cookie: cookies[owner] });
  const afterCancel = await quote(room.id, checkIn, checkOut);
  // 7) ผู้ใช้อีกคนพยายามยกเลิกการจองที่ไม่ใช่ของตัวเอง → ต้องได้ 403
  const victim = created[1] ?? created[0];
  const victimIndex = results.indexOf(victim);
  const foreignCancel = await call(`/bookings/${victim.data.booking.id}/cancel`, {
    method: 'POST',
    cookie: cookies[(victimIndex + 1) % cookies.length],
  });

  console.log('\n=== ทดสอบเพิ่มเติม ===');
  line('จองต่อกันพอดี (เช็กอิน = วันเช็กเอาต์)', backToBack.status === 201 ? '✅ 201 จองได้' : `❌ ${backToBack.status} ${backToBack.data?.message}`);
  line('คาบเกี่ยวบางส่วนกับช่วงที่เต็ม', partialOverlap.status === 409 ? '✅ 409 ห้องเต็ม' : `❌ ${partialOverlap.status}`);
  line('ยกเลิกแล้วห้องกลับมาว่าง', cancel.status === 200 && afterCancel === 1 ? '✅ ว่างเพิ่มเป็น 1 ห้อง' : `❌ ว่าง ${afterCancel}`);
  line('ยกเลิกการจองของคนอื่น', foreignCancel.status === 403 ? '✅ 403 ไม่มีสิทธิ์' : `❌ ${foreignCancel.status}`);

  // 8) เก็บกวาด — ยกเลิกการจองทดสอบทั้งหมด ห้องจะได้ว่างเหมือนเดิม
  const toCancel = [
    ...results.map((r, i) => ({ r, cookie: cookies[i] })).filter(({ r }) => r.status === 201).slice(1),
    ...(backToBack.status === 201 ? [{ r: backToBack, cookie: cookies[0] }] : []),
  ];
  await Promise.all(toCancel.map(({ r, cookie }) => call(`/bookings/${r.data.booking.id}/cancel`, { method: 'POST', cookie })));
  const removed = await deleteTesters();
  console.log(`\n(ยกเลิกการจองทดสอบทั้งหมดแล้ว · ลบบัญชีทดสอบ ${removed}/${testers.length} บัญชี · ห้องว่างตอนนี้ ${await quote(room.id, checkIn, checkOut)} ห้อง)\n`);

  if (!passConcurrent || removed !== testers.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('ทดสอบล้มเหลว:', error.message);
  console.error('ตรวจว่าเปิด server แล้ว (npm run dev) และฐานข้อมูลมีข้อมูลจาก db/04-demo-data.sql');
  await deleteTesters().catch(() => 0); // พยายามลบบัญชีที่สมัครไปแล้ว (ถ้ายังมีการจองค้าง จะลบไม่ได้)
  process.exitCode = 1;
});
