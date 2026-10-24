// ============================================================
// ทดสอบ PromptPay เงินจริง (เฉพาะผู้ดูแลระบบ · admin กดยืนยันรับเงินเอง)
// รัน: node server/test/promptpay.js
//   (อ่าน DATABASE_URL จาก server/.env เอง — ใช้ตั้ง admin ด้วยสคริปต์ และล้างข้อมูลทดสอบตอนจบ)
//   ส่วนที่ 1 ไม่ต้องเปิด server: ข้อความใน QR ตามมาตรฐาน EMVCo / PromptPay
//     - CRC-16 ได้ค่าตรวจมาตรฐาน · ตรงกับตัวอย่างที่เผยแพร่ทั่วไป (000-000-0000 ยอด 4.22 → CRC E469)
//     - เบอร์มือถือ / เลขบัตรประชาชน / e-Wallet แปลงเป็นค่าใน QR ถูก · รูปแบบผิด = ปิดการรับเงินจริง
//   ส่วนที่ 2 ต้องเปิด server: ลูกค้าทั่วไปขอ QR / ยืนยันเงินจริงไม่ได้ (403) และการจองยังรอชำระเหมือนเดิม
//     - ถ้า server ตั้ง PROMPTPAY_ID: admin ได้ QR ยอดตรงกับการจอง → กดยืนยัน = จ่ายแล้ว (promptpay_live) → ขอ QR ซ้ำ 409
//     - ไม่ได้ตั้ง → ข้ามส่วนของ admin (บอกวิธีเปิด)
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วลบการจองและบัญชีทดสอบตอนจบ
// ============================================================
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { crc16, maskPromptpay, promptpayPayload, promptpayTarget } from '../src/lib/promptpay.js';

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const SET_ROLE = fileURLToPath(new URL('../scripts/set-role.js', import.meta.url));
const API = process.env.API_URL || 'http://localhost:3000/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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

async function register(name) {
  const email = `promptpay-test-${randomUUID().slice(0, 8)}@example.test`;
  const res = await call('/auth/register', { method: 'POST', body: { name, email, password: randomUUID() } });
  if (res.status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${res.status}) — เปิด server แล้วหรือยัง?`);
  const cookie = res.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id: res.data.user.id, email, cookie };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- ส่วนที่ 1: ข้อความใน QR (ไม่ต้องเปิด server) ----------
console.log('=== 1) ข้อความใน QR ตามมาตรฐาน ===');
ok(crc16('123456789') === '29B1', 'CRC-16/CCITT ได้ค่าตรวจมาตรฐาน (123456789 → 29B1)');
ok(promptpayPayload(promptpayTarget('000-000-0000'), 4.22)
  === '00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469',
'ตรงกับตัวอย่าง PromptPay ที่เผยแพร่ทั่วไป (000-000-0000 · 4.22 บาท → CRC E469)');
const phone = promptpayTarget('081-234-5678');
ok(phone?.type === '01' && phone.value === '0066812345678', 'เบอร์มือถือ → 0066 + ตัด 0 ตัวหน้า (13 หลัก)', JSON.stringify(phone));
ok(promptpayTarget('1234567890123')?.type === '02' && promptpayTarget('123456789012345')?.type === '03',
  'เลขบัตรประชาชน 13 หลัก → tag 02 · e-Wallet 15 หลัก → tag 03');
ok(promptpayTarget('12345') === null && promptpayTarget('') === null && promptpayTarget(undefined) === null,
  'รูปแบบผิด / ไม่ได้ตั้ง → null (ปิดการรับเงินจริง)');
const onebaht = promptpayPayload(phone, 1);
ok(onebaht.includes('010212') && onebaht.includes('54041.00') && crc16(onebaht.slice(0, -4)) === onebaht.slice(-4),
  'QR ยอด 1 บาท: แบบใช้ครั้งเดียว (12) · ยอด 1.00 · CRC ท้ายข้อความถูกต้อง', onebaht);
ok(maskPromptpay(phone) === '081-xxx-5678', 'แสดงเบอร์บนหน้าเว็บแบบปิดบางส่วน');

// ---------- ส่วนที่ 2: API (ต้องเปิด server) ----------
const users = [];
const bookings = [];
try {
  console.log('\n=== 2) ลูกค้าทั่วไปใช้เงินจริงไม่ได้ ===');
  const config = (await call('/bookings/payment-config')).data;
  ok(typeof config?.promptpayLive === 'boolean' && !/\d{9,}/.test(JSON.stringify(config)),
    'payment-config บอกแค่ว่าเปิดไหม ไม่มีเบอร์พร้อมเพย์', JSON.stringify(config));

  const hotel = (await call('/hotels?q=Riverside%20Heritage')).data.hotels[0];
  const room = (await call(`/hotels/${hotel.id}`)).data.rooms.find((r) => r.name === 'Superior Double');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const book = async (user, offset) => {
    const res = await call('/bookings', {
      method: 'POST',
      cookie: user.cookie,
      body: { roomId: room.id, checkIn: addDays(today, 300 + offset), checkOut: addDays(today, 301 + offset), guests: 1 },
    });
    if (res.status !== 201) throw new Error(`จองไม่สำเร็จ (HTTP ${res.status}) ${res.data?.message}`);
    bookings.push(res.data.booking.id);
    return res.data.booking;
  };

  const customer = await register('PromptPay Customer');
  users.push(customer);
  const customerBooking = await book(customer, 0);
  ok((await call(`/bookings/${customerBooking.id}/promptpay-qr`, { cookie: customer.cookie })).status === 403, 'ลูกค้าขอ QR เงินจริง → 403');
  ok((await call(`/bookings/${customerBooking.id}/pay`, { method: 'POST', cookie: customer.cookie, body: { method: 'promptpay_live' } })).status === 403,
    'ลูกค้ายิง API ยืนยันเงินจริงเอง → 403');
  const stillPending = (await call(`/bookings/${customerBooking.id}`, { cookie: customer.cookie })).data?.booking;
  const { rows: [{ attempts }] } = await db.query('SELECT COUNT(*)::int AS attempts FROM payments WHERE booking_id = $1', [customerBooking.id]);
  ok(stillPending?.status === 'awaiting_payment' && attempts === 0, 'การจองยังรอชำระ · ไม่นับเป็นการจ่ายผิด', `${stillPending?.status} · payments ${attempts}`);

  console.log('\n=== 3) admin โอนเงินจริง + ยืนยันเอง ===');
  if (!config.promptpayLive) {
    console.log('SKIP  server ยังไม่ได้ตั้ง PROMPTPAY_ID — ใส่หมายเลขพร้อมเพย์ใน server/.env แล้วเปิด server ใหม่ เพื่อทดสอบส่วนนี้');
  } else {
    const admin = await register('PromptPay Admin');
    users.push(admin);
    execFileSync(process.execPath, [SET_ROLE, admin.email, 'admin'], { env: process.env, stdio: 'pipe' });
    const adminBooking = await book(admin, 2);

    const qr = await call(`/bookings/${adminBooking.id}/promptpay-qr`, { cookie: admin.cookie });
    const payload = qr.data?.payload ?? '';
    const amountField = adminBooking.totalAmount.toFixed(2);
    ok(qr.status === 200 && qr.data.qr.startsWith('data:image/png;base64,') && qr.data.amount === adminBooking.totalAmount,
      'admin ได้รูป QR + ยอดเท่ากับยอดการจอง', JSON.stringify({ status: qr.status, amount: qr.data?.amount }));
    ok(payload.includes(`54${String(amountField.length).padStart(2, '0')}${amountField}`) && crc16(payload.slice(0, -4)) === payload.slice(-4),
      'ข้อความใน QR มียอดของการจองนี้ และ CRC ถูกต้อง', payload);
    ok(/x/.test(qr.data?.account ?? ''), 'บอกบัญชีปลายทางแบบปิดบางส่วน', qr.data?.account);
    ok((await call(`/bookings/${customerBooking.id}/promptpay-qr`, { cookie: admin.cookie })).status === 403,
      'admin ขอ QR ของการจองคนอื่น → 403 (ใช้ได้กับการจองของตัวเองเท่านั้น)');

    const confirmed = await call(`/bookings/${adminBooking.id}/pay`, { method: 'POST', cookie: admin.cookie, body: { method: 'promptpay_live' } });
    ok(confirmed.status === 200 && confirmed.data.booking.status === 'confirmed' && confirmed.data.booking.payment?.method === 'promptpay_live',
      'admin กดยืนยันว่าได้รับเงิน → การจองจ่ายแล้ว (บันทึกว่า promptpay_live)', JSON.stringify(confirmed.data));
    ok((await call(`/bookings/${adminBooking.id}/promptpay-qr`, { cookie: admin.cookie })).status === 409, 'จ่ายแล้วขอ QR ซ้ำ → 409');
    ok((await call(`/bookings/${adminBooking.id}/pay`, { method: 'POST', cookie: admin.cookie, body: { method: 'promptpay_live' } })).status === 409,
      'กดยืนยันซ้ำ → 409 (ไม่บันทึกเงินเข้าซ้ำ)');
  }
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // ล้างข้อมูลทดสอบตรงในฐานข้อมูล (รายการชำระเงินลบตามการจองด้วย ON DELETE CASCADE)
  const userIds = users.map((user) => user.id);
  await db.query('DELETE FROM bookings WHERE booking_id = ANY($1::int[])', [bookings]);
  await db.query(`DELETE FROM admin_audit_log WHERE user_id = ANY($1::int[]) OR (user_id IS NULL AND entity_id = ANY($1::int[]) AND action = 'user.role')`, [userIds]);
  await db.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [userIds]);
  await db.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
