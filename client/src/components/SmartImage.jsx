import { useState } from 'react';
import Icon from './Icon.jsx';
import { sizedImage } from '../lib/format.js';

// รูปที่โหลดแบบ lazy และมีภาพสำรอง (กล่องไล่สี) ถ้ารูปโหลดไม่ขึ้น
export default function SmartImage({ src, alt = '', width = 800, className = '', imgClassName = '' }) {
  const [failed, setFailed] = useState(!src);
  // ต้องเป็น relative เพื่อให้ภาพสำรอง (absolute) อยู่ในกรอบ — ยกเว้นผู้เรียกกำหนด absolute มาเอง
  const position = /\b(absolute|fixed)\b/.test(className) ? '' : 'relative';

  return (
    <div className={`${position} overflow-hidden bg-slate-200 ${className}`}>
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-100 via-brand-50 to-sky-100 text-brand-300">
          <Icon name="building" className="h-10 w-10" />
        </div>
      ) : (
        <img
          src={sizedImage(src, width)}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${imgClassName}`}
        />
      )}
    </div>
  );
}
