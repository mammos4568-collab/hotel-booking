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
// ============================================================

const API_BASE = 'https://api.omise.co';

export const opnEnabled = () => Boolean(process.env.OMISE_SECRET_KEY);
export const opnTestMode = () => String(process.env.OMISE_SECRET_KEY ?? '').startsWith('skey_test_');

// บาท → สตางค์ (API ใช้หน่วยเล็กที่สุดของเงิน) · ปัดเศษกันทศนิยมคลาดเคลื่อน เช่น 2100.10 × 100
export const toSatang = (baht) => Math.round(Number(baht) * 100);

async function opnRequest(method, path, params) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        // secret key เป็น username ของ HTTP Basic auth (password ว่าง) — key อยู่ฝั่ง server เท่านั้น ห้ามส่งไปหน้าเว็บ
        Authorization: `Basic ${Buffer.from(`${process.env.OMISE_SECRET_KEY}:`).toString('base64')}`,
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

export const retrieveCharge = (chargeId) => opnRequest('GET', `/charges/${encodeURIComponent(chargeId)}`);

// คืนเงินเต็มจำนวน (TrueMoney คืนได้ภายใน 30 วันหลังจ่าย)
export const refundCharge = (chargeId, amount) =>
  opnRequest('POST', `/charges/${encodeURIComponent(chargeId)}/refunds`, { amount: String(toSatang(amount)) });

// สถานะรายการของ Opn → ผลที่ระบบเราใช้ (แยกเป็นฟังก์ชันล้วนๆ เพื่อทดสอบได้โดยไม่ต้องต่อเน็ต)
//   paid    = จ่ายสำเร็จ · pending = ลูกค้ายังไม่ยืนยัน/รอผล · failed = ไม่สำเร็จ (พร้อมเหตุผลภาษาไทย)
const FAILURE_MESSAGES = {
  insufficient_fund: 'ยอดเงินใน TrueMoney Wallet ไม่พอ',
  payment_rejected: 'TrueMoney ปฏิเสธการชำระเงิน',
  invalid_account: 'บัญชี TrueMoney ไม่ถูกต้อง',
  failed_processing: 'TrueMoney ประมวลผลไม่สำเร็จ',
};

export function chargeOutcome(charge) {
  if (charge?.status === 'successful' && charge.paid) return { state: 'paid' };
  if (charge?.status === 'pending') return { state: 'pending' };
  if (charge?.status === 'expired') return { state: 'failed', message: 'หมดเวลายืนยันการชำระเงินในแอป TrueMoney' };
  return { state: 'failed', message: FAILURE_MESSAGES[charge?.failure_code] ?? 'ชำระเงินด้วย TrueMoney ไม่สำเร็จ' };
}
