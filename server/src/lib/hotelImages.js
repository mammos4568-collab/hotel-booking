// ============================================================
// รูปที่เจ้าของอัปโหลด: รูปโรงแรม (property_images · db/07) + รูปประเภทห้อง (room_images · db/09)
//   - เบราว์เซอร์ครอปกลางภาพเป็น 3:2 แล้วย่อเป็น 1200×800 JPEG ก่อนส่ง (client/src/lib/imageResize.js)
//     → ทุกรูปขนาดเท่ากัน และข้อมูลแฝงในไฟล์ (EXIF เช่น พิกัด GPS) หายไปตอนวาดลง canvas ใหม่
//   - server ไม่เชื่อหน้าเว็บ: ตรวจซ้ำที่นี่ว่าเป็น JPEG จริง ขนาด 1200×800 พอดี และไฟล์ไม่ใหญ่เกิน
//   - เสิร์ฟที่ GET /api/hotels/images/:id และ /api/hotels/room-images/:id — รูปไม่เคยถูกแก้ทับ
//     (อัปใหม่ = id ใหม่) จึง cache ได้ 1 ปี
// ============================================================

export const MAX_HOTEL_IMAGES = 5;
export const MAX_ROOM_IMAGES = 5;
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 800;
// 1200×800 JPEG คุณภาพ 0.85 ปกติ 100–400 KB · เผื่อรูปรายละเอียดเยอะไว้ที่ 1.5 MB
export const MAX_IMAGE_BYTES = 1_500_000;

export const hotelImageUrl = (imageId) => `/api/hotels/images/${imageId}`;
export const roomImageUrl = (imageId) => `/api/hotels/room-images/${imageId}`;

// รูปปกของโรงแรม = รูปที่อัปโหลดลำดับแรก · ยังไม่มีรูปอัปโหลด → ใช้ลิงก์รูปเดิม (properties.image_url)
// ใช้แทน p.image_url ใน SELECT ทุกที่ที่แสดงรูปโรงแรม (ค้นหา, รายการโปรด, การจอง, หน้า checkout)
// ค้นด้วย UNIQUE (property_id, position) ที่มี index อยู่แล้ว → เร็ว แม้ทำทีละโรงแรม
export function hotelCoverSql(alias = 'p') {
  return `COALESCE(
    '/api/hotels/images/' || (SELECT pi.image_id::text FROM property_images pi
                               WHERE pi.property_id = ${alias}.property_id ORDER BY pi.position LIMIT 1),
    ${alias}.image_url)`;
}

// รูปหลักของประเภทห้อง = รูปที่อัปโหลดลำดับแรก · ยังไม่มีรูปอัปโหลด → ใช้ลิงก์รูปเดิม (rooms.image_url)
// ใช้แทน r.image_url ใน SELECT ทุกที่ที่แสดงรูปห้อง (หน้าโรงแรม, หน้า checkout, การจองของฉัน, หลังบ้าน)
export function roomCoverSql(alias = 'r') {
  return `COALESCE(
    '/api/hotels/room-images/' || (SELECT ri.image_id::text FROM room_images ri
                                    WHERE ri.room_id = ${alias}.room_id ORDER BY ri.position LIMIT 1),
    ${alias}.image_url)`;
}

// อ่านกว้าง×สูงจาก header ของ JPEG โดยไม่ต้องถอดรหัสทั้งภาพ
//   JPEG = ชุดของ "segment" ขึ้นต้นด้วย 0xFF + รหัส marker · ขนาดภาพอยู่ใน segment SOF (0xC0–0xCF)
//   ไม่ใช่ JPEG / ไฟล์ขาด → null
export function readJpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null; // ต้องขึ้นต้นด้วย SOI (FF D8)
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xFF) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xFF) { offset += 1; continue; } // ไบต์เติม (fill) ระหว่าง segment
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { offset += 2; continue; } // marker ที่ไม่มีความยาวต่อท้าย
    if (marker === 0xD9 || marker === 0xDA) return null; // จบไฟล์ / เริ่มข้อมูลภาพ ก่อนเจอขนาด
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    // SOF0–SOF15 ยกเว้น C4 (ตาราง Huffman), C8 (สงวน), CC (ตาราง arithmetic) = segment ที่บอกขนาดภาพ
    // โครงสร้าง: FF Cx | ความยาว 2 ไบต์ | ความละเอียดสี 1 ไบต์ | สูง 2 ไบต์ | กว้าง 2 ไบต์ | ...
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      if (offset + 9 > buffer.length) return null;
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

// ตรวจไฟล์ที่อัปมา (ใช้ทั้งรูปโรงแรมและรูปห้อง — มาตรฐานเดียวกัน) → คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน
// ดูจาก "เนื้อไฟล์" จริง ไม่เชื่อนามสกุลหรือ Content-Type ที่หน้าเว็บบอกมา
export function checkHotelImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'ไม่พบไฟล์รูป';
  if (buffer.length > MAX_IMAGE_BYTES) return `ไฟล์รูปใหญ่เกิน ${MAX_IMAGE_BYTES / 1_000_000} MB`;
  const size = readJpegSize(buffer);
  // ไฟล์ JPEG ที่สมบูรณ์ต้องปิดท้ายด้วย EOI (FF D9) — ไม่มี = อัปโหลดขาดกลางทาง
  const complete = buffer[buffer.length - 2] === 0xFF && buffer[buffer.length - 1] === 0xD9;
  if (!size || !complete) return 'ไฟล์ไม่ใช่รูป JPEG ที่ระบบย่อแล้ว — เลือกรูปใหม่ผ่านหน้าเว็บ';
  if (size.width !== IMAGE_WIDTH || size.height !== IMAGE_HEIGHT) {
    return `รูปต้องมีขนาด ${IMAGE_WIDTH}×${IMAGE_HEIGHT} (หน้าเว็บย่อให้อัตโนมัติ) แต่ได้ ${size.width}×${size.height}`;
  }
  return null;
}
