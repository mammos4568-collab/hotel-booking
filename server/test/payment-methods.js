// ============================================================
// ทดสอบวิธีชำระเงิน (จำลอง) — บัตร · PromptPay · TrueMoney Wallet (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/payment-methods.js
//   - บัตรทดสอบ 4242… ผ่าน (เก็บแค่ 4 หลักท้าย) · PromptPay ผ่าน · วิธีที่ไม่รองรับ 400
//   - รับเฉพาะบัตรทดสอบ: เลขบัตรอื่นที่ถูกต้องตาม Luhn (อาจเป็นบัตรจริง) → 400 · Mastercard ทดสอบ 5555…4444 ผ่าน
//   - TrueMoney: เบอร์ผิดรูปแบบ 400 (นับเป็นการจ่ายไม่สำเร็จ) · เบอร์ทดสอบ 080-000-0000 = ยอดเงินไม่พอ 402 · เบอร์ปกติผ่าน
//   - รายการชำระเงินของ TrueMoney ไม่เก็บเบอร์วอลเล็ต (PDPA)
//   - ถ้า server ตั้ง OMISE_SECRET_KEY (Opn โหมดทดสอบ): TrueMoney ได้ลิงก์ไปยืนยันที่ Opn · กดจ่ายซ้ำได้ลิงก์เดิม ·
//     ยังไม่ยืนยัน = verify ตอบ pending (ขั้น "กด Successful" ต้องทำมือในหน้าของ Opn)
//   - ตารางตัดสินผลจาก Opn (chargeOutcome) ทดสอบได้โดยไม่ต้องเปิด server
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) ตอนจบยกเลิกการจองและลบบัญชีทดสอบ
// ============================================================
import { randomUUID } from 'node:crypto';
import { chargeOutcome, toSatang } from '../src/lib/opn.js';

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

try {
  const cardBooking = await book(0);
  const card = await pay(cardBooking, { method: 'card', cardNumber: '4242424242424242', cardName: 'TEST', expiry: '12/30', cvc: '123' });
  ok(card.status === 200 && card.data.booking.payment?.method === 'card' && card.data.booking.payment.cardLast4 === '4242',
    'บัตรทดสอบ 4242… ผ่าน · เก็บแค่ 4 หลักท้าย', JSON.stringify(card.data));

  const promptpayBooking = await book(2);
  const promptpay = await pay(promptpayBooking, { method: 'promptpay' });
  ok(promptpay.status === 200 && promptpay.data.booking.payment?.method === 'promptpay', 'PromptPay ผ่าน', JSON.stringify(promptpay.data));

  const config = (await call('/bookings/payment-config')).data;
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
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // เก็บกวาด: ยกเลิกการจองทดสอบ (จ่ายแล้วคืนเงิน) แล้วลบบัญชีผ่าน API ลบบัญชี (PDPA)
  await Promise.all(created.map((id) => call(`/bookings/${id}/cancel`, { method: 'POST', cookie })));
  const removed = await call('/privacy/account', { method: 'DELETE', cookie, body: { password, confirm: 'ลบบัญชี' } });
  ok(removed.status === 200, 'ยกเลิกการจองและลบบัญชีทดสอบแล้ว', JSON.stringify(removed.data));
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
