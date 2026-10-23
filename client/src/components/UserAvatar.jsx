import { useState } from 'react';

// รูปโปรไฟล์วงกลม — ไม่มีรูป / โหลดรูปไม่ได้ → ตัวอักษรแรกของชื่อบนพื้นสีแบรนด์
// ใช้ที่แถบเมนูบน หน้าโปรไฟล์ และรีวิว · className กำหนดขนาด เช่น "h-9 w-9 text-sm"
export default function UserAvatar({ name, src, className = 'h-9 w-9 text-sm' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src; // เปลี่ยนรูปใหม่แล้วลองโหลดใหม่ได้ ไม่ติดสถานะ "พัง" ของรูปเก่า

  if (showImage) {
    return <img src={src} alt="" onError={() => setFailedSrc(src)} className={`${className} shrink-0 rounded-full bg-slate-200 object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white`}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
