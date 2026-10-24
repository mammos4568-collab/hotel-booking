// ============================================================
// PromptPay QR (เงินจริง) — สร้าง "ข้อความใน QR" ตามมาตรฐาน EMVCo (Thai QR Payment) ที่แอปธนาคารไทยทุกแอปอ่านได้
//   ส่วนนี้เขียนเอง (มีแค่ข้อความ + checksum) · การวาดรูป QR จากข้อความใช้ library qrcode
//
//   ข้อความเป็นชุดของ TLV = Tag 2 หลัก + Length 2 หลัก + Value   เช่น "5802TH" = tag 58 ยาว 02 ค่า "TH"
//     00  รูปแบบข้อมูล            "01"
//     01  วิธีใช้ QR              "11" = ใช้ซ้ำได้ ไม่มียอด · "12" = ใช้ครั้งเดียว มียอดเงิน ← ใช้แบบนี้ (ยอดตามการจอง)
//     29  บัญชีพร้อมเพย์ (มี TLV ซ้อนข้างใน)
//           00  รหัสของระบบพร้อมเพย์ "A000000677010111"
//           01  เบอร์มือถือ: 0066 + เบอร์ที่ตัดเลข 0 ตัวหน้าออก (รวม 13 หลัก)
//           02  เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก · 03  e-Wallet ID 15 หลัก
//     58  ประเทศ "TH" · 53  สกุลเงิน "764" (บาท) · 54  ยอดเงิน เช่น "1.00"
//     63  CRC = checksum 4 หลักของข้อความทั้งหมด (รวม "6304") → แอปธนาคารใช้ตรวจว่าอ่าน QR ไม่ผิด
// ============================================================

const PROMPTPAY_AID = 'A000000677010111';

// TLV 1 ช่อง: tag + ความยาว 2 หลัก + ค่า
const field = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

// CRC-16/CCITT (poly 0x1021 เริ่มที่ 0xFFFF) — คิดทีละบิต ข้อความสั้นไม่ต้องใช้ตาราง
// ค่าตรวจมาตรฐาน: crc16('123456789') = '29B1'
export function crc16(text) {
  let crc = 0xFFFF;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// หมายเลขพร้อมเพย์ → { type: tag ข้างใน 29, value: ค่าที่ใส่ใน QR, digits } · รูปแบบไม่ถูก → null
export function promptpayTarget(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return { type: '01', value: `0066${digits.slice(1)}`, digits }; // เบอร์มือถือ
  if (/^\d{13}$/.test(digits)) return { type: '02', value: digits, digits }; // เลขบัตรประชาชน/ผู้เสียภาษี
  if (/^\d{15}$/.test(digits)) return { type: '03', value: digits, digits }; // e-Wallet ID
  return null;
}

// ข้อความใน QR สำหรับโอนเข้าพร้อมเพย์ target ด้วยยอด amount บาท (ยอดมาจาก server เสมอ)
export function promptpayPayload(target, amount) {
  const body = [
    field('00', '01'),
    field('01', '12'),
    field('29', field('00', PROMPTPAY_AID) + field(target.type, target.value)),
    field('58', 'TH'),
    field('53', '764'),
    field('54', Number(amount).toFixed(2)),
  ].join('');
  const withCrcTag = `${body}6304`; // CRC คิดรวม tag+ความยาวของตัวมันเองด้วย ตามมาตรฐาน
  return withCrcTag + crc16(withCrcTag);
}

// พร้อมเพย์ที่รับเงินของเว็บ (ตั้งใน PROMPTPAY_ID · ไม่ตั้ง/รูปแบบผิด = ปิดการรับเงินจริง ใช้แบบจำลองอย่างเดียว)
export const sitePromptpay = () => promptpayTarget(process.env.PROMPTPAY_ID);

// แสดงบนหน้าเว็บแบบปิดบางส่วน เช่น 081-xxx-5678 (แอปธนาคารจะโชว์ชื่อบัญชีจริงให้ตรวจก่อนกดโอนอยู่แล้ว)
export function maskPromptpay(target) {
  const { digits } = target;
  if (target.type === '01') return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
  return `${'x'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
