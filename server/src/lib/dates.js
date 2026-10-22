// ตัวช่วยเรื่องวันที่ — ทั้งระบบรับ/ส่งวันที่เป็น string 'YYYY-MM-DD' (ไม่ใช่ timestamp)
// เปรียบเทียบ string รูปแบบนี้ด้วย < > ได้ตรงๆ เพราะเรียงตัวอักษรตรงกับเรียงวัน

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_NIGHTS = 30;

// วันนี้ตามเวลาไทย — ไม่ใช้ new Date().toISOString() เพราะเป็นเวลา UTC
// (ช่วงเที่ยงคืนถึงตี 7 ของไทยจะได้ "เมื่อวาน" ทำให้เช็กวันย้อนหลังผิด)
export function todayInBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // กันวันที่ไม่มีจริง เช่น 2026-02-30 (JS จะปัดไปเป็น 2026-03-02)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// บวก/ลบวันของวันที่ 'YYYY-MM-DD' (คิดแบบ UTC จะได้ไม่เพี้ยนตามเขตเวลาของเครื่อง)
export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / DAY_MS);
}

// ตรวจช่วงเข้าพัก [checkIn, checkOut) → { checkIn, checkOut, nights } หรือ { error }
export function validateStay(checkIn, checkOut, { allowPast = false } = {}) {
  if (!isValidDate(checkIn) || !isValidDate(checkOut)) {
    return { error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' };
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return { error: 'วันเช็กเอาต์ต้องอยู่หลังวันเช็กอินอย่างน้อย 1 คืน' };
  if (nights > MAX_NIGHTS) return { error: `จองได้สูงสุด ${MAX_NIGHTS} คืนต่อครั้ง` };
  if (!allowPast && checkIn < todayInBangkok()) return { error: 'วันเช็กอินต้องไม่ย้อนหลัง' };
  return { checkIn, checkOut, nights };
}
