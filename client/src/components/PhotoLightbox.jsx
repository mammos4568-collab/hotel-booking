import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { sizedImage } from '../lib/format.js';

// ดูรูปเต็มจอ (หน้าโรงแรม): ปุ่มลูกศร / ปัดซ้าย-ขวา / ปุ่ม ← → เปลี่ยนรูป · Esc หรือกดพื้นหลังเพื่อปิด
// รูปแสดงแบบ object-contain = เห็นทั้งรูปไม่ถูกตัด (ต่างจากแกลเลอรีที่ครอปให้เต็มช่อง)
export default function PhotoLightbox({ photos, index, onIndex, onClose, alt = '' }) {
  const { tx } = useLanguage();
  const touchStartX = useRef(null);
  const count = photos.length;
  const go = (delta) => onIndex((index + delta + count) % count);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onIndex((index + 1) % count);
      if (event.key === 'ArrowLeft') onIndex((index - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndex, onClose]);

  // ล็อกการเลื่อนหน้าด้านหลังระหว่างเปิดดูรูป
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const stop = (event) => event.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tx('รูปที่พัก', 'Property photos')}
      onClick={onClose}
      onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(distance) > 50) go(distance < 0 ? 1 : -1);
      }}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95"
    >
      <div onClick={stop} className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/80">
        <span>{index + 1} / {count}</span>
        <button type="button" onClick={onClose} autoFocus className="rounded-full p-2 text-white transition hover:bg-white/10" aria-label={tx('ปิด', 'Close')}>
          <Icon name="x" className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <img
          src={sizedImage(photos[index], 1600)}
          alt={`${alt} — ${tx('รูปที่', 'photo')} ${index + 1}`}
          onClick={stop}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={(event) => { stop(event); go(-1); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 sm:left-6" aria-label={tx('รูปก่อนหน้า', 'Previous photo')}>
              <Icon name="chevron-left" className="h-6 w-6" />
            </button>
            <button type="button" onClick={(event) => { stop(event); go(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 sm:right-6" aria-label={tx('รูปถัดไป', 'Next photo')}>
              <Icon name="chevron-right" className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div onClick={stop} className="flex justify-center gap-2 overflow-x-auto px-4 pb-5">
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={tx(`ดูรูปที่ ${i + 1}`, `Show photo ${i + 1}`)}
              aria-current={i === index}
              className={`h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-lg ring-2 transition sm:h-14 sm:w-20 ${i === index ? 'ring-white' : 'opacity-50 ring-transparent hover:opacity-100'}`}
            >
              <img src={sizedImage(src, 200)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
