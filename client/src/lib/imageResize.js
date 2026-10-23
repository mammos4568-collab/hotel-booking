// ย่อ/ครอปรูปในเบราว์เซอร์ก่อนอัปโหลด → ได้ JPEG ขนาดเท่ากันทุกรูป
//   รูปโรงแรม/รูปห้อง 1200×800 (สัดส่วน 3:2) · รูปโปรไฟล์ 400×400 (สี่เหลี่ยมจัตุรัส)
//   - ครอป "ตรงกลางภาพ": ตัดขอบส่วนเกินออกเท่าๆ กันสองข้าง ให้ได้สัดส่วนที่ต้องการ แล้วย่อ/ขยายลงผืนผ้าใบ
//   - วาดลง <canvas> ใหม่ = ได้ไฟล์ใหม่ที่ไม่มีข้อมูลแฝง (EXIF เช่น พิกัด GPS ที่ถ่าย รุ่นกล้อง) ติดไปด้วย
//   - ไม่ต้องลง library — ใช้ createImageBitmap + canvas ที่เบราว์เซอร์มีอยู่แล้ว
//   server ตรวจซ้ำว่าได้ JPEG ขนาดนั้นจริง (checkJpegImage() ใน server/src/lib/hotelImages.js)
export const HOTEL_IMAGE = { width: 1200, height: 800, quality: 0.85 };
export const AVATAR_IMAGE = { width: 400, height: 400, quality: 0.85 };
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // ไฟล์ต้นฉบับใหญ่สุด 20 MB (กันเบราว์เซอร์มือถือหน่วยความจำไม่พอ)

// เปิดไฟล์รูปเป็นภาพที่วาดได้ — หมุนตามข้อมูลการถ่าย (รูปมือถือตั้ง/นอน) ให้ถูกทิศก่อน
// คืน { source, release } — เรียก release() หลังวาดเสร็จเพื่อคืนหน่วยความจำ
async function decode(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, release: () => bitmap.close() };
  } catch {
    // บางเบราว์เซอร์ไม่รองรับตัวเลือกนี้ → ใช้ <img> แทน (เบราว์เซอร์ปัจจุบันหมุนตามข้อมูลการถ่ายให้เอง)
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return { source: img, release: () => URL.revokeObjectURL(url) };
  }
}

// คืน Blob JPEG ขนาด width×height · error.message เป็นรหัส: not_image | too_large | unreadable | encode_failed
export async function resizeImage(file, { width, height, quality }) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.size > MAX_INPUT_BYTES) throw new Error('too_large');

  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error('unreadable'); // เช่น HEIC จาก iPhone ที่ Chrome เปิดไม่ได้
  }
  const { source, release } = decoded;

  const sourceWidth = source.naturalWidth ?? source.width;
  const sourceHeight = source.naturalHeight ?? source.height;
  const targetRatio = width / height;
  // ส่วนของภาพต้นฉบับที่จะใช้ (crop): กว้างเกิน → ตัดซ้าย/ขวา · สูงเกิน → ตัดบน/ล่าง
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) cropWidth = Math.round(sourceHeight * targetRatio);
  else cropHeight = Math.round(sourceWidth / targetRatio);
  const cropX = Math.round((sourceWidth - cropWidth) / 2);
  const cropY = Math.round((sourceHeight - cropHeight) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff'; // PNG พื้นโปร่งใส → พื้นขาว (JPEG ไม่มีความโปร่งใส)
  context.fillRect(0, 0, width, height);
  context.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
  release();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('encode_failed');
  return blob;
}

export const resizeHotelImage = (file) => resizeImage(file, HOTEL_IMAGE);
export const resizeAvatar = (file) => resizeImage(file, AVATAR_IMAGE);

// รหัส error จาก resizeHotelImage → ข้อความสองภาษา (error อื่นคือข้อความจาก server อยู่แล้ว)
export function resizeErrorText(error, tx) {
  const messages = {
    not_image: tx('ไม่ใช่ไฟล์รูป', 'Not an image file'),
    too_large: tx('ไฟล์ใหญ่เกิน 20 MB', 'File is larger than 20 MB'),
    unreadable: tx('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG', 'Cannot open this image — try a JPG or PNG'),
    encode_failed: tx('ย่อรูปไม่สำเร็จ', 'Could not resize the image'),
  };
  return messages[error.message] ?? error.message;
}
