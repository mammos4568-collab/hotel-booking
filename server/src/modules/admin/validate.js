// ตรวจข้อมูลที่หลังบ้านส่งมา — รับเฉพาะค่าที่ถูกต้อง แล้วแปลงเป็นค่าที่พร้อมบันทึกลงฐานข้อมูล
// ข้อความที่ลูกค้าจะเห็นบนหน้าเว็บ (ชื่อ คำอธิบาย) ตรวจคำไม่สุภาพด้วย
import { AMENITY_KEYS, PROPERTY_TYPES, parseList } from '../../lib/hotelSearch.js';
import { findProfanity } from '../../lib/moderation.js';
import { httpError } from './scope.js';

// publicText = ข้อความที่ลูกค้าเห็นบนหน้าเว็บ → มีคำหยาบชัดเจนบันทึกไม่ได้ (บอกคำที่เจอ จะได้แก้ถูกจุด)
// คำก้ำกึ่งไม่บล็อกที่นี่ — admin เห็นคำเตือนตอนอนุมัติโรงแรม (findSuspiciousWords ใน hotels.js)
function text(value, label, { min = 0, max, required = false, publicText = false } = {}) {
  const result = String(value ?? '').trim();
  if (!result && required) throw httpError(400, `กรุณากรอก${label}`);
  if (result && result.length < min) throw httpError(400, `${label}ต้องยาวอย่างน้อย ${min} ตัวอักษร`);
  if (result.length > max) throw httpError(400, `${label}ต้องไม่เกิน ${max} ตัวอักษร`);
  if (publicText) {
    const bad = findProfanity(result);
    if (bad.length) throw httpError(400, `${label}มีคำที่ไม่สุภาพ (${bad.map((word) => `"${word}"`).join(', ')}) — แก้แล้วบันทึกใหม่`);
  }
  return result || null;
}

function number(value, label, { min, max, required = false, integer = false, step } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, `กรุณากรอก${label}`);
    return null;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw httpError(400, `${label}ต้องเป็น${integer ? 'จำนวนเต็ม' : 'ตัวเลข'}ระหว่าง ${min}–${max}`);
  }
  if (step && Math.abs(result / step - Math.round(result / step)) > 1e-9) throw httpError(400, `${label}ต้องเพิ่มทีละ ${step}`);
  return result;
}

// รูปต้องเป็นลิงก์ http/https เท่านั้น (กัน javascript: หรือ data: ที่อาจเป็นช่องโหว่)
function imageUrl(value) {
  const result = String(value ?? '').trim();
  if (!result) return null;
  let url;
  try {
    url = new URL(result);
  } catch {
    throw httpError(400, 'ลิงก์รูปภาพไม่ถูกต้อง');
  }
  if (!['http:', 'https:'].includes(url.protocol) || result.length > 1000) throw httpError(400, 'ลิงก์รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://');
  return result;
}

export function readHotel(body = {}) {
  const propertyType = PROPERTY_TYPES.find((type) => type === body.propertyType);
  if (!propertyType) throw httpError(400, `ประเภทที่พักต้องเป็น ${PROPERTY_TYPES.join(', ')}`);
  const latitude = number(body.latitude, 'ละติจูด', { min: -90, max: 90 });
  const longitude = number(body.longitude, 'ลองจิจูด', { min: -180, max: 180 });
  if ((latitude === null) !== (longitude === null)) throw httpError(400, 'กรอกพิกัดให้ครบทั้งละติจูดและลองจิจูด');
  return {
    name: text(body.name, 'ชื่อที่พัก', { min: 2, max: 255, required: true, publicText: true }),
    propertyType,
    description: text(body.description, 'คำอธิบาย', { max: 2000, publicText: true }),
    country: text(body.country, 'ประเทศ', { max: 100, publicText: true }) ?? 'Thailand',
    city: text(body.city, 'เมือง', { min: 2, max: 100, required: true, publicText: true }),
    address: text(body.address, 'ที่อยู่', { min: 5, max: 500, required: true, publicText: true }),
    latitude,
    longitude,
    starRating: number(body.starRating, 'ระดับดาว', { min: 1, max: 5, step: 0.5 }),
    imageUrl: imageUrl(body.imageUrl),
    amenities: parseList(body.amenities ?? [], AMENITY_KEYS),
  };
}

export function readRoom(body = {}) {
  return {
    name: text(body.name, 'ชื่อประเภทห้อง', { min: 2, max: 150, required: true, publicText: true }),
    description: text(body.description, 'คำอธิบายห้อง', { max: 1000, publicText: true }),
    maxGuests: number(body.maxGuests, 'จำนวนผู้เข้าพักสูงสุด', { min: 1, max: 20, integer: true, required: true }),
    basePrice: number(body.basePrice, 'ราคาต่อคืน', { min: 1, max: 1_000_000, required: true, step: 0.01 }),
    totalRooms: number(body.totalRooms, 'จำนวนห้อง', { min: 0, max: 500, integer: true, required: true }),
    imageUrl: imageUrl(body.imageUrl),
    bedType: text(body.bedType, 'ประเภทเตียง', { max: 100, publicText: true }),
    sizeSqm: number(body.sizeSqm, 'ขนาดห้อง', { min: 1, max: 5000, integer: true }),
    breakfastIncluded: body.breakfastIncluded === true,
  };
}

// ชื่อฟิลด์ที่เปลี่ยน (ใส่ในบันทึกการทำงาน — ไม่เก็บค่าจริง กันข้อมูลยาว/ข้อมูลส่วนตัวหลุดเข้า log)
export function changedFields(before, after, mapping) {
  return Object.entries(mapping)
    .filter(([key, column]) => JSON.stringify(before[column] ?? null) !== JSON.stringify(after[key] ?? null))
    .map(([key]) => key);
}

export { number as readNumber, text as readText };
