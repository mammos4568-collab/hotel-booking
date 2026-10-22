// ชื่อที่แสดงต่อสาธารณะ (เช่น ชื่อผู้รีวิว): ชื่อจริง + อักษรแรกของนามสกุล
//   "Ploy" + "Srisuk" → "Ploy S."   ·   "Somsak" + "ใจดี" → "Somsak จ."
// นามสกุลไทยใช้พยัญชนะตัวแรก โดยข้ามสระหน้า เ แ โ ใ ไ (U+0E40–U+0E44)
// PDPA: เปิดเผยข้อมูลส่วนบุคคลต่อสาธารณะเท่าที่จำเป็น — ไม่ส่งนามสกุลเต็มออกไป
export function publicDisplayName(firstName, lastName) {
  const first = String(firstName || '').trim();
  const initial = [...String(lastName || '').trim()].find((ch) => /\p{L}/u.test(ch) && !/[เ-ไ]/.test(ch));
  if (!initial) return first;
  return first ? `${first} ${initial.toUpperCase()}.` : `${initial.toUpperCase()}.`;
}
