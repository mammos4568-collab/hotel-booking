// ============================================================
// เชื่อม Opn Payments (ชื่อเดิม Omise) — เรียก REST API ด้วย fetch ตรงๆ ไม่ต้องลง SDK เพิ่ม
//
//   ตั้ง OMISE_SECRET_KEY ใน server/.env = เปิดใช้ (key ทดสอบขึ้นต้น skey_test_ → ไม่มีการตัดเงินจริง)
//   ไม่ตั้ง = ปิด → ระบบใช้การชำระเงินแบบจำลองเหมือนเดิม
//
// ขั้นตอนจ่ายด้วย TrueMoney:
//   1) server สร้างรายการ (charge) ที่ Opn → ได้ authorize_uri
//   2) หน้าเว็บพาลูกค้าไปยืนยันในแอป TrueMoney (โหมดทดสอบ: หน้าทดสอบให้กด Successful / Failed)
//   3) Opn พาลูกค้ากลับมาที่ return_uri → server "ดึงรายการจาก Opn" มาดูสถานะจริง
//      ห้ามเชื่อ query string หรือข้อมูลที่ส่งมากับ webhook — ใครก็ปลอมได้ ต้องถาม Opn เองเสมอ
//
// ขั้นตอนจ่ายด้วย PromptPay (ตรวจเงินเข้าอัตโนมัติ ไม่ต้องอัปสลิป ไม่ต้องมีคนกดยืนยัน):
//   1) server สร้างรายการที่ Opn → ได้รูป QR ที่ผูกกับรายการนี้รายการเดียว (เงินเข้า Opn แล้ว Opn รู้เองว่าเป็นของรายการไหน)
//   2) ลูกค้าสแกนจ่ายด้วยแอปธนาคาร (โหมดทดสอบ: สแกนจริงไม่ได้ — กด Mark as successful / failed ใน dashboard ของ Opn)
//   3) หน้าเว็บให้ server ถาม Opn ซ้ำทุกไม่กี่วินาที (+ webhook ตอน deploy) → จ่ายแล้วการจองเปลี่ยนเป็น "ชำระแล้ว" เอง
//   ข้อจำกัดของ Opn: PromptPay คืนเงิน/ยกเลิกรายการผ่าน Opn ไม่ได้ → ต้องโอนคืนเอง (ดู opnCanRefund)
// ============================================================

const API_BASE = 'https://api.omise.co';

export const opnEnabled = () => Boolean(process.env.OMISE_SECRET_KEY);
export const opnTestMode = () => String(process.env.OMISE_SECRET_KEY ?? '').startsWith('skey_test_');

// บาท → สตางค์ (API ใช้หน่วยเล็กที่สุดของเงิน) · ปัดเศษกันทศนิยมคลาดเคลื่อน เช่น 2100.10 × 100
export const toSatang = (baht) => Math.round(Number(baht) * 100);

// secret key เป็น username ของ HTTP Basic auth (password ว่าง) — key อยู่ฝั่ง server เท่านั้น ห้ามส่งไปหน้าเว็บ
const authHeader = () => `Basic ${Buffer.from(`${process.env.OMISE_SECRET_KEY}:`).toString('base64')}`;

async function opnRequest(method, path, params) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: params ? new URLSearchParams(params) : undefined,
    });
  } catch (cause) {
    throw Object.assign(new Error(`Opn ${method} ${path}: network error`), { status: 502, opnCode: 'network_error', cause });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.object === 'error') {
    // log แค่รหัส error ของ Opn (ไม่มีข้อมูลลูกค้า) — index.js จะพิมพ์ stack ของ error 5xx ให้เอง
    throw Object.assign(new Error(`Opn ${method} ${path}: ${data?.code ?? res.status}`), { status: 502, opnCode: data?.code ?? String(res.status) });
  }
  return data;
}

// สร้างรายการจ่ายด้วย TrueMoney (แบบเด้งไปยืนยันในแอป) — ส่งแค่ยอดเงินกับเลขที่การจอง ไม่ส่งข้อมูลส่วนตัวของลูกค้า
export function createTrueMoneyCharge({ amount, bookingId, reference, returnUri }) {
  return opnRequest('POST', '/charges', {
    amount: String(toSatang(amount)),
    currency: 'THB',
    'source[type]': 'truemoney_jumpapp',
    return_uri: returnUri,
    description: `HotelBooking ${reference}`,
    'metadata[booking_id]': String(bookingId),
  });
}

// สร้างรายการจ่ายด้วย PromptPay — Opn ตอบรูป QR กลับมาใน source.scannable_code (ดู downloadQrImage)
// expiresAt = เวลาที่ QR หมดอายุ (Opn ไม่รับเงินหลังเวลานี้ · ดู promptpayExpiry) · ส่งแค่ยอดเงินกับเลขที่การจองเหมือน TrueMoney
export function createPromptPayCharge({ amount, bookingId, reference, expiresAt }) {
  return opnRequest('POST', '/charges', {
    amount: String(toSatang(amount)),
    currency: 'THB',
    'source[type]': 'promptpay',
    // ขอรูป QR เป็น PNG — ลองกับ Opn โหมดทดสอบแล้ว PNG ~40 KB ส่วน SVG ที่ได้ถ้าไม่ระบุ ~225 KB
    'source[qr_settings][image_type]': 'png',
    expires_at: expiresAt.toISOString().replace(/\.\d{3}Z$/, 'Z'), // ISO 8601 แบบวินาที เช่น 2026-10-24T08:15:00Z
    description: `HotelBooking ${reference}`,
    'metadata[booking_id]': String(bookingId),
  });
}

export const retrieveCharge = (chargeId) => opnRequest('GET', `/charges/${encodeURIComponent(chargeId)}`);

// คืนเงินเต็มจำนวน (TrueMoney คืนได้ภายใน 30 วันหลังจ่าย)
export const refundCharge = (chargeId, amount) =>
  opnRequest('POST', `/charges/${encodeURIComponent(chargeId)}/refunds`, { amount: String(toSatang(amount)) });

// คืนเงินผ่าน Opn ได้ไหม (ตาม payments.method) — เอกสารของ Opn: PromptPay "คืนเงินหรือยกเลิกผ่าน Opn ไม่ได้"
// → การจองที่จ่ายด้วย PromptPay ผ่าน Opn ต้องโอนคืนเอง แบบเดียวกับ PromptPay เงินจริง (promptpay_live)
export const opnCanRefund = (method) => method !== 'promptpay';

// ---------- PromptPay: เวลาหมดอายุของ QR ----------
// QR หมดอายุ "ก่อน" หมดเวลาถือห้อง QR_EXPIRY_BUFFER_MS — ลูกค้าจ่ายวินาทีสุดท้ายของ QR ระบบก็ยังมีเวลารับผล
// ก่อนห้องถูกปล่อยให้คนอื่นจอง (PromptPay คืนเงินผ่าน Opn ไม่ได้ จึงต้องกันไม่ให้มีคนจ่ายหลังหมดเวลาถือห้องตั้งแต่ต้น)
// เหลือเวลาให้สแกนไม่ถึง QR_MIN_SCAN_MS → null = ไม่สร้าง QR (ฟังก์ชันล้วนๆ ทดสอบได้โดยไม่ต้องต่อเน็ต)
export const QR_EXPIRY_BUFFER_MS = 60_000;
export const QR_MIN_SCAN_MS = 60_000;

export function promptpayExpiry(holdExpiresAt, now = Date.now()) {
  const expires = Math.floor((new Date(holdExpiresAt).getTime() - QR_EXPIRY_BUFFER_MS) / 1000) * 1000; // ตัดมิลลิวินาทีทิ้ง
  if (!Number.isFinite(expires) || expires - now < QR_MIN_SCAN_MS) return null;
  return new Date(expires);
}

// ---------- PromptPay: รูป QR ----------
// Opn ให้ลิงก์ดาวน์โหลดรูป QR มากับรายการ → server ดาวน์โหลดเองแล้วส่งเป็น data URL ให้หน้าเว็บแสดงด้วย <img>
// (เบราว์เซอร์ของลูกค้าไม่ต้องต่อ Opn เอง) — รูปเป็นโปสเตอร์ Thai QR Payment แนวตั้ง 740×1050
//   - ลิงก์มีรหัสสุ่มในตัว เปิดได้โดยไม่ต้องใช้ key (Opn ส่งต่อไปที่ไฟล์บน Amazon S3) → ไม่แนบ secret key ไปด้วยเลย
//   - ลิงก์มาจากข้อมูลที่ตอบกลับ → ดาวน์โหลดเฉพาะลิงก์ของ https://api.omise.co
//   - ดูจากไบต์จริงว่าเป็น PNG / SVG (ไม่เชื่อ Content-Type) · แสดงผ่าน <img> → ถ้าเป็น SVG สคริปต์ข้างในก็ทำงานไม่ได้
const MAX_QR_BYTES = 500_000; // PNG ~40 KB · เผื่อ Opn ตอบเป็น SVG (~225 KB)
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function downloadQrImage(charge) {
  const unavailable = (detail, cause) =>
    Object.assign(new Error(`Opn QR image: ${detail}`), { status: 502, opnCode: 'qr_unavailable', cause });
  let url = null;
  try {
    url = new URL(charge?.source?.scannable_code?.image?.download_uri);
  } catch {
    // ไม่มีลิงก์ หรือรูปแบบผิด → ตกไปเช็กด้านล่าง
  }
  if (url?.protocol !== 'https:' || url.host !== new URL(API_BASE).host) throw unavailable('missing or unexpected download_uri');

  let res;
  try {
    res = await fetch(url); // ตาม redirect ไปที่ S3 ให้เอง
  } catch (cause) {
    throw unavailable('network error', cause);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = bytes.subarray(0, 8).equals(PNG_SIGNATURE) ? 'image/png'
    : /<svg[\s>]/i.test(bytes.subarray(0, 2000).toString('utf8')) ? 'image/svg+xml' : null;
  if (!res.ok || !type || bytes.length > MAX_QR_BYTES) throw unavailable(`HTTP ${res.status}, ${bytes.length} bytes`);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

// สถานะรายการของ Opn → ผลที่ระบบเราใช้ (แยกเป็นฟังก์ชันล้วนๆ เพื่อทดสอบได้โดยไม่ต้องต่อเน็ต)
//   paid    = จ่ายสำเร็จ · pending = ลูกค้ายังไม่ยืนยัน/รอผล · failed = ไม่สำเร็จ (พร้อมเหตุผลภาษาไทย)
const SOURCE_LABELS = { truemoney_jumpapp: 'TrueMoney', promptpay: 'PromptPay' };
const FAILURE_MESSAGES = {
  insufficient_fund: 'ยอดเงินใน TrueMoney Wallet ไม่พอ',
  insufficient_balance: 'ยอดเงินในบัญชีของผู้จ่ายไม่พอ',
  payment_rejected: 'TrueMoney ปฏิเสธการชำระเงิน',
  payment_cancelled: 'ผู้จ่ายยกเลิกการชำระเงิน',
  invalid_account: 'บัญชี TrueMoney ไม่ถูกต้อง',
};

export function chargeOutcome(charge) {
  const label = SOURCE_LABELS[charge?.source?.type] ?? 'TrueMoney';
  const code = charge?.failure_code;
  if (charge?.status === 'successful' && charge.paid) return { state: 'paid' };
  if (charge?.status === 'pending') return { state: 'pending' };
  if (charge?.status === 'expired') {
    return { state: 'failed', message: label === 'PromptPay' ? 'QR PromptPay หมดอายุก่อนชำระเงิน' : 'หมดเวลายืนยันการชำระเงินในแอป TrueMoney' };
  }
  if (code === 'failed_processing') return { state: 'failed', message: `${label} ประมวลผลไม่สำเร็จ` };
  // hasOwn: รหัสแปลกๆ อย่าง "constructor" ต้องไม่ไปเจอของใน prototype ของ object
  return { state: 'failed', message: Object.hasOwn(FAILURE_MESSAGES, code ?? '') ? FAILURE_MESSAGES[code] : `ชำระเงินด้วย ${label} ไม่สำเร็จ` };
}
