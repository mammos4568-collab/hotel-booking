import { useLanguage } from '../context/LanguageContext.jsx';
import { ratingLabel } from '../lib/format.js';

// คะแนนรีวิวเฉลี่ย (เต็ม 5) + คำบรรยาย + จำนวนรีวิว
export default function RatingBadge({ rating, count = 0, size = 'md', align = 'left' }) {
  const { lang, tx } = useLanguage();
  if (rating === null || rating === undefined) {
    return <span className="text-xs font-medium text-slate-400">{tx('ยังไม่มีรีวิว', 'No reviews yet')}</span>;
  }
  const box = size === 'lg' ? 'h-11 min-w-11 text-base rounded-xl' : 'h-8 min-w-8 text-sm rounded-lg';
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`${box} px-1.5 inline-flex items-center justify-center bg-brand-600 font-extrabold text-white shadow-sm shadow-brand-600/30`}>
        {Number(rating).toFixed(1)}
      </span>
      <span className="leading-tight">
        <span className={`block font-bold text-slate-900 ${size === 'lg' ? 'text-base' : 'text-sm'}`}>{ratingLabel(rating, lang)}</span>
        <span className="block text-xs text-slate-500">
          {count.toLocaleString()} {tx('รีวิว', count === 1 ? 'review' : 'reviews')}
        </span>
      </span>
    </div>
  );
}
