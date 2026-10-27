// ============================================================
// ทดสอบวิธีชำระเงิน (จำลอง) — บัตร · PromptPay · TrueMoney Wallet (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/payment-methods.js
//   - บัตรทดสอบ 4242… ผ่าน (เก็บแค่ 4 หลักท้าย) · PromptPay ผ่าน · วิธีที่ไม่รองรับ 400
//   - รับเฉพาะบัตรทดสอบ: เลขบัตรอื่นที่ถูกต้องตาม Luhn (อาจเป็นบัตรจริง) → 400 · Mastercard ทดสอบ 5555…4444 ผ่าน
//   - TrueMoney: เบอร์ผิดรูปแบบ 400 (นับเป็นการจ่ายไม่สำเร็จ) · เบอร์ทดสอบ 080-000-0000 = ยอดเงินไม่พอ 402 · เบอร์ปกติผ่าน
//   - รายการชำระเงินของ TrueMoney ไม่เก็บเบอร์วอลเล็ต (PDPA)
//   - ถ้า server ตั้ง OMISE_SECRET_KEY (Opn โหมดทดสอบ): TrueMoney ได้ลิงก์ไปยืนยันที่ Opn · กดจ่ายซ้ำได้ลิงก์เดิม ·
//     ยังไม่ยืนยัน = verify ตอบ pending (ขั้น "กด Successful" ต้องทำมือในหน้าของ Opn)
//   - PromptPay ผ่าน Opn: ได้รูป QR · QR หมดอายุก่อนเวลาถือห้อง · กดซ้ำได้ QR เดิม · ยังไม่จ่าย = pending
//     → สคริปต์จำลองว่าลูกค้าสแกนจ่าย (mark_as_paid ของ Opn — เฉพาะ key ทดสอบ) → การจองเปลี่ยนเป็นชำระแล้วเอง
//     → ยกเลิกได้โดยไม่เรียกคืนเงินที่ Opn (PromptPay คืนผ่าน Opn ไม่ได้ ต้องโอนคืนเอง)
//     (อ่าน DATABASE_URL / OMISE_SECRET_KEY จาก server/.env เอง — ใช้หาเลขรายการของ Opn ในตาราง payments)
//   - ตารางตัดสินผลจาก Opn (chargeOutcome) + เวลาหมดอายุของ QR ทดสอบได้โดยไม่ต้องเปิด server
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) ตอนจบยกเลิกการจองและลบบัญชีทดสอบ
// ============================================================
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { needsManualRefund, serializeBooking } from '../src/lib/bookings.js';
import { chargeOutcome, opnCanRefund, promptpayExpiry, toSatang } from '../src/lib/opn.js';

const API = process.env.API_URL || 'http://localhost:3000/api';
// API ของ Opn ที่ใช้จำลองว่าลูกค้าจ่ายแล้ว (เปลี่ยนได้เผื่อทดสอบกับ Opn จำลองบนเครื่อง)
const OPN_API = process.env.OPN_API_URL || 'https://api.omise.co';
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

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- ตัดสินผลจาก Opn (ไม่ต้องต่อเน็ต) ----------
ok(toSatang(2100.1) === 210010 && toSatang(25740) === 2574000, 'แปลงบาทเป็นสตางค์ถูก (ไม่มีทศนิยมคลาดเคลื่อน)');
ok(chargeOutcome({ status: 'successful', paid: true }).state === 'paid', 'Opn successful + paid → จ่ายแล้ว');
ok(chargeOutcome({ status: 'pending' }).state === 'pending', 'Opn pending → รอผล');
ok(chargeOutcome({ status: 'failed', failure_code: 'insufficient_fund' }).message === 'ยอดเงินใน TrueMoney Wallet ไม่พอ', 'Opn failed (insufficient_fund) → ข้อความไทย');
ok(chargeOutcome({ status: 'expired' }).state === 'failed', 'Opn expired → ไม่สำเร็จ');
ok(chargeOutcome({ status: 'successful', paid: false }).state === 'failed', 'successful แต่ paid = false → ไม่ถือว่าจ่าย');
ok(chargeOutcome({ status: 'expired', source: { type: 'promptpay' } }).message === 'QR PromptPay หมดอายุก่อนชำระเงิน', 'Opn PromptPay expired → QR หมดอายุ');
ok(chargeOutcome({ status: 'failed', failure_code: 'payment_cancelled', source: { type: 'promptpay' } }).message === 'ผู้จ่ายยกเลิกการชำระเงิน',
  'Opn PromptPay failed (payment_cancelled) → ข้อความไทย');
ok(chargeOutcome({ status: 'failed', failure_code: 'constructor', source: { type: 'promptpay' } }).message === 'ชำระเงินด้วย PromptPay ไม่สำเร็จ',
  'รหัส error แปลกๆ (constructor) → ข้อความกลางๆ ไม่พัง');
const holdEnd = Date.parse('2026-10-24T10:15:00Z');
ok(promptpayExpiry(new Date(holdEnd), holdEnd - 15 * 60_000)?.toISOString() === '2026-10-24T10:14:00.000Z', 'QR หมดอายุก่อนหมดเวลาถือห้อง 1 นาที');
ok(promptpayExpiry(new Date(holdEnd), holdEnd - 119_000) === null && promptpayExpiry(new Date(holdEnd), holdEnd - 121_000) !== null,
  'เหลือเวลาถือห้องไม่ถึง 2 นาที → ไม่สร้าง QR');
ok(!opnCanRefund('promptpay') && opnCanRefund('truemoney'), 'PromptPay คืนเงินผ่าน Opn ไม่ได้ · TrueMoney คืนได้');
ok(needsManualRefund('promptpay', true) && !needsManualRefund('promptpay', false) && needsManualRefund('promptpay_live', false)
  && !needsManualRefund('truemoney', true), 'ต้องโอนคืนเอง = PromptPay ผ่าน Opn + PromptPay เงินจริง (แบบจำลอง/TrueMoney ไม่ต้อง)');
// ยกเลิกเอง: รอชำระยกเลิกได้ตลอด (แค่ปล่อยห้อง) · จ่ายแล้วยกเลิกได้ถึงวันก่อนเช็กอิน (cancelDeadline ที่หน้าเว็บแสดง)
const todayTh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const stayToday = { booking_status: 'Confirmed', check_in: todayTh, check_out: addDays(todayTh, 1), hold_expires_at: new Date(Date.now() + 10 * 60_000) };
const unpaidToday = serializeBooking({ ...stayToday, payment_status: 'Pending' });
ok(unpaidToday.canCancel === true && unpaidToday.cancelDeadline === null, 'รอชำระ + เข้าพักวันนี้ → ยกเลิกได้ (แค่ปล่อยห้องที่ถือไว้) ไม่มีกำหนดยกเลิก');
const paidToday = serializeBooking({ ...stayToday, payment_status: 'Paid' });
ok(paidToday.canCancel === false && paidToday.cancelDeadline === addDays(todayTh, -1), 'จ่ายแล้ว + เข้าพักวันนี้ → ยกเลิกเองไม่ได้ (กำหนดยกเลิกคือเมื่อวาน)',
  JSON.stringify(paidToday.cancelDeadline));
const paidTomorrow = serializeBooking({ ...stayToday, payment_status: 'Paid', check_in: addDays(todayTh, 1), check_out: addDays(todayTh, 2) });
ok(paidTomorrow.canCancel === true && paidTomorrow.cancelDeadline === todayTh, 'จ่ายแล้ว + เข้าพักพรุ่งนี้ → ยกเลิกได้ถึงวันนี้',
  JSON.stringify(paidTomorrow.cancelDeadline));

const password = randomUUID();
const registered = await call('/auth/register', {
  method: 'POST',
  body: { name: 'Pay Tester', email: `pay-${randomUUID().slice(0, 8)}@example.test`, password },
});
if (registered.status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${registered.status}) — เปิด server แล้วหรือยัง?`);
const cookie = registered.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

// ห้องที่มีหลายห้อง (Riverside Heritage · Superior Double) ช่วงวันไกลๆ จะได้ไม่ชนกับการทดสอบอื่น
const hotel = (await call('/hotels?q=Riverside%20Heritage')).data.hotels[0];
const room = (await call(`/hotels/${hotel.id}`)).data.rooms.find((r) => r.name === 'Superior Double');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const created = [];
const book = async (offset) => {
  const res = await call('/bookings', {
    method: 'POST',
    cookie,
    body: { roomId: room.id, checkIn: addDays(today, 260 + offset), checkOut: addDays(today, 261 + offset), guests: 1 },
  });
  if (res.status !== 201) throw new Error(`จองไม่สำเร็จ (HTTP ${res.status}) ${res.data?.message}`);
  created.push(res.data.booking.id);
  return res.data.booking.id;
};
const pay = (id, body) => call(`/bookings/${id}/pay`, { method: 'POST', cookie, body });
const verify = (id, method) => call(`/bookings/${id}/pay/verify`, { method: 'POST', cookie, body: { method } });

// PromptPay ผ่าน Opn: จำลองว่าลูกค้าสแกนจ่ายแล้ว = เรียก mark_as_paid ของ Opn ตรงๆ (ทำได้เฉพาะรายการทดสอบ)
// เลขรายการของ Opn ไม่ส่งออกทาง API ของเรา → อ่านจากตาราง payments
let db = null;
async function markPromptPayPaid(bookingId) {
  if (!process.env.DATABASE_URL || !process.env.OMISE_SECRET_KEY) {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); // ไม่ทับค่าที่ตั้งไว้แล้ว
  }
  const key = process.env.OMISE_SECRET_KEY ?? '';
  if (!key.startsWith('skey_test_')) return { skipped: 'ไม่ใช่ key ทดสอบ (skey_test_…) — ไม่จำลองการจ่ายกับรายการจริง' };
  db ??= new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [payment] } = await db.query(
    `SELECT gateway_charge_id FROM payments WHERE booking_id = $1 AND method = 'promptpay' AND status = 'Pending'
      ORDER BY payment_id DESC LIMIT 1`,
    [bookingId]
  );
  if (!payment) return { error: 'ไม่พบรายการ PromptPay ที่รอจ่ายในตาราง payments' };
  const res = await fetch(`${OPN_API}/charges/${payment.gateway_charge_id}/mark_as_paid`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
  });
  const data = await res.json().catch(() => null);
  return res.ok ? { charge: data } : { skipped: `Opn ไม่รองรับ mark_as_paid กับรายการนี้ (${data?.code ?? res.status}) — กด Mark as successful ใน dashboard ของ Opn แทน` };
}

try {
  const cardBooking = await book(0);
  const card = await pay(cardBooking, { method: 'card', cardNumber: '4242424242424242', cardName: 'TEST', expiry: '12/30', cvc: '123' });
  ok(card.status === 200 && card.data.booking.payment?.method === 'card' && card.data.booking.payment.cardLast4 === '4242',
    'บัตรทดสอบ 4242… ผ่าน · เก็บแค่ 4 หลักท้าย', JSON.stringify(card.data));

  const config = (await call('/bookings/payment-config')).data;
  const promptpayBooking = await book(2);
  if (config?.promptpay === 'opn') {
    console.log('— PromptPay ผ่าน Opn (โหมดทดสอบ) — QR ของ Opn + ตรวจเงินเข้าอัตโนมัติ');
    const holdExpiresAt = (await call(`/bookings/${promptpayBooking}`, { cookie })).data.booking.holdExpiresAt;
    const qr = await pay(promptpayBooking, { method: 'promptpay' });
    ok(qr.status === 200 && /^data:image\/(svg\+xml|png);base64,/.test(qr.data?.qr?.image ?? ''), 'PromptPay → ได้รูป QR ของ Opn', JSON.stringify(qr.data)?.slice(0, 300));
    ok(new Date(qr.data?.qr?.expiresAt) <= new Date(holdExpiresAt).getTime() - 60_000 + 1000 && qr.data?.qr?.amount > 0,
      'QR หมดอายุก่อนหมดเวลาถือห้องอย่างน้อย 1 นาที · ยอดมาจาก server', `${qr.data?.qr?.expiresAt} vs ${holdExpiresAt}`);
    const again = await pay(promptpayBooking, { method: 'promptpay' });
    ok(again.status === 200 && again.data?.qr?.expiresAt === qr.data?.qr?.expiresAt, 'กดสร้าง QR ซ้ำ → ได้ QR ของรายการเดิม ไม่สร้างรายการซ้ำ', JSON.stringify(again.data)?.slice(0, 300));
    const waiting = await verify(promptpayBooking, 'promptpay');
    ok(waiting.status === 200 && waiting.data?.state === 'pending' && waiting.data.booking.paymentStatus === 'Pending',
      'ยังไม่สแกนจ่าย → verify ตอบ pending (ยังไม่ถือว่าจ่าย)', JSON.stringify(waiting.data));

    const marked = await markPromptPayPaid(promptpayBooking);
    if (marked.skipped) {
      console.log(`SKIP  จำลองการจ่าย: ${marked.skipped}`);
    } else {
      ok(!marked.error, 'จำลองว่าลูกค้าสแกนจ่าย (mark_as_paid ของ Opn)', marked.error);
      const paid = await verify(promptpayBooking, 'promptpay');
      ok(paid.status === 200 && paid.data?.state === 'paid' && paid.data.booking.paymentStatus === 'Paid',
        'Opn บอกว่าเงินเข้า → การจองเปลี่ยนเป็นชำระแล้วเอง (ไม่มีใครกดยืนยัน/ไม่ต้องอัปสลิป)', JSON.stringify(paid.data));
      ok(paid.data?.booking?.payment?.method === 'promptpay' && paid.data.booking.payment.viaGateway === true
        && paid.data.booking.payment.manualRefund === true, 'บันทึกว่าจ่ายด้วย PromptPay ผ่าน Opn · ยกเลิกแล้วต้องโอนคืนเอง', JSON.stringify(paid.data?.booking?.payment));
      ok((await pay(promptpayBooking, { method: 'promptpay' })).status === 409, 'จ่ายแล้วขอ QR ซ้ำ → 409');
      const cancelled = await call(`/bookings/${promptpayBooking}/cancel`, { method: 'POST', cookie });
      ok(cancelled.status === 200 && cancelled.data.booking.paymentStatus === 'Refunded',
        'ยกเลิกได้โดยไม่เรียกคืนเงินที่ Opn (PromptPay คืนผ่าน Opn ไม่ได้) → บันทึกว่าคืนเงิน', JSON.stringify(cancelled.data));
    }
  } else {
    const promptpay = await pay(promptpayBooking, { method: 'promptpay' });
    ok(promptpay.status === 200 && promptpay.data.booking.payment?.method === 'promptpay', 'PromptPay ผ่าน', JSON.stringify(promptpay.data));
  }

  const walletBooking = await book(4);
  if (config?.truemoney === 'opn') {
    console.log('— เชื่อม Opn Payments อยู่ (โหมดทดสอบ) — ทดสอบขั้นสร้างรายการ/ตรวจผล');
    const start = await pay(walletBooking, { method: 'truemoney' });
    ok(start.status === 200 && /^https:\/\//.test(start.data?.redirectUrl ?? ''), 'TrueMoney → ได้ลิงก์ไปยืนยันที่ Opn', JSON.stringify(start.data));
    const again = await pay(walletBooking, { method: 'truemoney' });
    ok(again.data?.redirectUrl === start.data?.redirectUrl, 'กดจ่ายซ้ำ → ได้ลิงก์เดิม ไม่สร้างรายการซ้ำ');
    const verify = await call(`/bookings/${walletBooking}/pay/verify`, { method: 'POST', cookie });
    ok(verify.status === 200 && verify.data?.state === 'pending', 'ยังไม่ยืนยันในแอป → verify ตอบ pending (ยังไม่ถือว่าจ่าย)', JSON.stringify(verify.data));
    ok(verify.data?.booking?.paymentStatus === 'Pending', 'สถานะการจองยังรอชำระ');
  } else {
    const badPhone = await pay(walletBooking, { method: 'truemoney', walletPhone: '12345' });
    ok(badPhone.status === 400 && /ลองได้อีก 4 ครั้ง/.test(badPhone.data?.message), 'TrueMoney เบอร์ผิดรูปแบบ → 400 และนับเป็นการจ่ายไม่สำเร็จ', badPhone.data?.message);
    const noBalance = await pay(walletBooking, { method: 'truemoney', walletPhone: '080-000-0000' });
    ok(noBalance.status === 402 && /ยอดเงิน/.test(noBalance.data?.message), 'TrueMoney เบอร์ทดสอบ 080-000-0000 → ยอดเงินไม่พอ (402)', noBalance.data?.message);
    const wallet = await pay(walletBooking, { method: 'truemoney', walletPhone: '081-234-5678' });
    ok(wallet.status === 200 && wallet.data.booking.paymentStatus === 'Paid' && wallet.data.booking.payment?.method === 'truemoney',
      'TrueMoney เบอร์ปกติ → ชำระสำเร็จ', JSON.stringify(wallet.data));
    ok(wallet.data?.booking?.payment?.cardLast4 === null, 'ไม่เก็บเบอร์วอลเล็ตหรือเลขใดๆ ในรายการชำระเงิน (PDPA)');
  }

  const otherBooking = await book(6);
  const unknown = await pay(otherBooking, { method: 'bitcoin' });
  ok(unknown.status === 400, 'วิธีชำระที่ไม่รองรับ → 400', String(unknown.status));
  const testCard = { method: 'card', cardName: 'TEST', expiry: '12/30', cvc: '123' };
  const notTestCard = await pay(otherBooking, { ...testCard, cardNumber: '4111111111111111' });
  ok(notTestCard.status === 400 && /บัตรทดสอบ/.test(notTestCard.data?.message),
    'เลขบัตรที่ถูกต้องตาม Luhn แต่ไม่ใช่บัตรทดสอบ → 400 ไม่รับ', notTestCard.data?.message);
  const mastercard = await pay(otherBooking, { ...testCard, cardNumber: '5555 5555 5555 4444' });
  ok(mastercard.status === 200 && mastercard.data.booking.payment?.cardLast4 === '4444',
    'บัตรทดสอบ Mastercard 5555…4444 ผ่าน', JSON.stringify(mastercard.data));

  // จองเข้าพักวันนี้แล้วเปลี่ยนใจก่อนจ่าย → ยกเลิกได้ ห้องกลับไปว่าง (เดิมรอให้หมดเวลา 15 นาทีอย่างเดียว)
  const sameDay = await call('/bookings', { method: 'POST', cookie, body: { roomId: room.id, checkIn: today, checkOut: addDays(today, 1), guests: 1 } });
  if (sameDay.status === 201) {
    created.push(sameDay.data.booking.id);
    const cancelled = await call(`/bookings/${sameDay.data.booking.id}/cancel`, { method: 'POST', cookie });
    ok(sameDay.data.booking.canCancel === true && cancelled.status === 200 && cancelled.data.booking.status === 'cancelled',
      'จองเข้าพักวันนี้ ยังไม่จ่าย → ยกเลิกเองได้', JSON.stringify(cancelled.data));
  } else {
    console.log(`SKIP  จองเข้าพักวันนี้ไม่ได้ (${sameDay.status} ${sameDay.data?.message}) — ข้ามการทดสอบยกเลิกการจองวันนี้`);
  }
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // เก็บกวาด: ยกเลิกการจองทดสอบ (จ่ายแล้วคืนเงิน) แล้วลบบัญชีผ่าน API ลบบัญชี (PDPA)
  await Promise.all(created.map((id) => call(`/bookings/${id}/cancel`, { method: 'POST', cookie })));
  const removed = await call('/privacy/account', { method: 'DELETE', cookie, body: { password, confirm: 'ลบบัญชี' } });
  ok(removed.status === 200, 'ยกเลิกการจองและลบบัญชีทดสอบแล้ว', JSON.stringify(removed.data));
  await db?.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
