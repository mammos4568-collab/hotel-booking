// ตัวช่วยจัดรูปแบบที่ใช้ร่วมกันทุกหน้า — วันที่ใช้ string 'YYYY-MM-DD' ตามข้อตกลงของทีม

const DAY_MS = 24 * 60 * 60 * 1000;

// วันที่ "ของเครื่องผู้ใช้" เป็น YYYY-MM-DD (ไม่ใช้ toISOString เพราะเป็นเวลา UTC)
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round((parseISODate(checkOut) - parseISODate(checkIn)) / DAY_MS);
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const LOCALES = { th: 'th-TH', en: 'en-US' };

export function formatDate(iso, lang = 'th', options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  return parseISODate(iso.slice(0, 10)).toLocaleDateString(LOCALES[lang] || 'th-TH', options);
}

export function formatDateTime(value, lang = 'th') {
  if (!value) return '';
  return new Date(value).toLocaleString(LOCALES[lang] || 'th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortRange(checkIn, checkOut, lang = 'th') {
  if (!checkIn) return '';
  const opts = { day: 'numeric', month: 'short' };
  return `${formatDate(checkIn, lang, opts)} – ${checkOut ? formatDate(checkOut, lang, opts) : '…'}`;
}

// รูปจาก Unsplash: กำหนดความกว้างตามที่ใช้จริง จะได้ไม่โหลดรูปใหญ่เกินจำเป็น
export function sizedImage(url, width = 800) {
  if (!url) return '';
  if (!url.includes('images.unsplash.com')) return url;
  const next = new URL(url);
  next.searchParams.set('w', String(width));
  if (!next.searchParams.has('auto')) next.searchParams.set('auto', 'format');
  if (!next.searchParams.has('fit')) next.searchParams.set('fit', 'crop');
  return next.toString();
}

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80`;

export const HERO_IMAGE = UNSPLASH('1506665531195-3566af2b4dfa');

const CITY_IMAGES = {
  bangkok: UNSPLASH('1508009603885-50cf7c579365'),
  'chiang mai': UNSPLASH('1528181304800-259b08848526'),
  phuket: UNSPLASH('1537956965359-7573183d1f57'),
  krabi: UNSPLASH('1589394815804-964ed0be2eb5'),
  pattaya: UNSPLASH('1540202404-a2f29016b523'),
  'hua hin': UNSPLASH('1590523741831-ab7e8b8f9c7f'),
  ayutthaya: UNSPLASH('1562602833-0f4ab2fc46e3'),
};

export const CITY_NAMES_TH = {
  bangkok: 'กรุงเทพฯ',
  'chiang mai': 'เชียงใหม่',
  phuket: 'ภูเก็ต',
  krabi: 'กระบี่',
  pattaya: 'พัทยา',
  'hua hin': 'หัวหิน',
  ayutthaya: 'อยุธยา',
};

export function cityImage(city) {
  return CITY_IMAGES[String(city).toLowerCase()] || HERO_IMAGE;
}

export function cityLabel(city, lang = 'th') {
  if (lang !== 'th') return city;
  return CITY_NAMES_TH[String(city).toLowerCase()] || city;
}

// ชื่อที่แสดงต่อสาธารณะ (รีวิว): ชื่อจริง + อักษรแรกของนามสกุล เช่น "Ploy Srisuk" → "Ploy S."
// นามสกุลไทยใช้พยัญชนะตัวแรก ข้ามสระหน้า เ แ โ ใ ไ เช่น "ใจดี" → "จ."
// (PDPA: เปิดเผยข้อมูลส่วนบุคคลเท่าที่จำเป็น)
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const initial = [...parts[parts.length - 1]].find((ch) => /[ก-ฮ]|\p{L}/u.test(ch) && !/[เ-ไ]/.test(ch));
  return initial ? `${parts[0]} ${initial.toUpperCase()}.` : parts[0];
}

// ระยะทาง (กม.) → "700 ม." / "2.9 กม." / "21 กม." — ระยะสั้นปัดเป็นหลักร้อยเมตร
export function formatDistance(km, lang = 'th') {
  if (km === null || km === undefined) return '';
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} ${lang === 'en' ? 'm' : 'ม.'}`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${lang === 'en' ? 'km' : 'กม.'}`;
}

// คะแนนรีวิว (เต็ม 5) → คำบรรยาย
export function ratingLabel(rating, lang = 'th') {
  if (rating === null || rating === undefined) return lang === 'th' ? 'ยังไม่มีรีวิว' : 'No reviews yet';
  if (rating >= 4.7) return lang === 'th' ? 'ยอดเยี่ยมมาก' : 'Exceptional';
  if (rating >= 4.3) return lang === 'th' ? 'ยอดเยี่ยม' : 'Excellent';
  if (rating >= 3.8) return lang === 'th' ? 'ดีมาก' : 'Very good';
  if (rating >= 3.0) return lang === 'th' ? 'ดี' : 'Good';
  return lang === 'th' ? 'พอใช้' : 'Fair';
}

// ประเภทที่พัก: ค่าใน properties.property_type → ชื่อ 2 ภาษา
export const PROPERTY_TYPES = {
  Hotel: { th: 'โรงแรม', en: 'Hotel' },
  Resort: { th: 'รีสอร์ท', en: 'Resort' },
  Villa: { th: 'วิลล่า', en: 'Villa' },
  'Boutique Hotel': { th: 'บูทีคโฮเทล', en: 'Boutique hotel' },
  Apartment: { th: 'อพาร์ตเมนต์', en: 'Apartment' },
  Guesthouse: { th: 'เกสต์เฮาส์', en: 'Guesthouse' },
};

// สิ่งอำนวยความสะดวก: key ในฐานข้อมูล → ไอคอน + ชื่อ 2 ภาษา
export const AMENITIES = {
  wifi: { icon: 'wifi', th: 'Wi-Fi ฟรี', en: 'Free Wi-Fi' },
  pool: { icon: 'pool', th: 'สระว่ายน้ำ', en: 'Swimming pool' },
  breakfast: { icon: 'coffee', th: 'อาหารเช้า', en: 'Breakfast' },
  parking: { icon: 'car', th: 'ที่จอดรถฟรี', en: 'Free parking' },
  gym: { icon: 'dumbbell', th: 'ฟิตเนส', en: 'Fitness center' },
  spa: { icon: 'sparkles', th: 'สปา', en: 'Spa' },
  restaurant: { icon: 'utensils', th: 'ห้องอาหาร', en: 'Restaurant' },
  bar: { icon: 'glass', th: 'บาร์', en: 'Bar' },
  beach: { icon: 'umbrella', th: 'ติดชายหาด', en: 'Beachfront' },
  airport_shuttle: { icon: 'plane', th: 'รถรับส่งสนามบิน', en: 'Airport shuttle' },
  family: { icon: 'family', th: 'เหมาะกับครอบครัว', en: 'Family friendly' },
  kitchen: { icon: 'kitchen', th: 'ครัวในห้อง', en: 'Kitchen' },
};
