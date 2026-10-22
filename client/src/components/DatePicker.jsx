import { useState } from 'react';
import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { addDays, nightsBetween, parseISODate, toISODate, todayISO } from '../lib/format.js';

const MAX_NIGHTS = 30;
const WEEKDAYS = {
  th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

function monthLabel(year, month, lang) {
  return new Date(year, month, 1).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric' });
}

// ปฏิทินเลือกช่วงวัน (เช็กอิน → เช็กเอาต์) แสดง 2 เดือนบนจอใหญ่ 1 เดือนบนมือถือ
// คลิกวันแรก = เช็กอิน, คลิกวันถัดไป = เช็กเอาต์ (ห้ามย้อนหลัง และไม่เกิน 30 คืน)
export default function DatePicker({ checkIn, checkOut, onChange, onDone }) {
  const { lang, tx } = useLanguage();
  const today = todayISO();
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState(() => {
    const base = parseISODate(checkIn || today);
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const choosingCheckOut = Boolean(checkIn && !checkOut);
  const maxCheckOut = checkIn ? addDays(checkIn, MAX_NIGHTS) : null;
  const rangeEnd = checkOut || (choosingCheckOut && hovered > checkIn ? hovered : null);
  const nights = nightsBetween(checkIn, checkOut);

  const firstMonthIsCurrent = view.year === new Date().getFullYear() && view.month === new Date().getMonth();

  const shiftMonth = (delta) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const isDisabled = (iso) => {
    if (iso < today) return true;
    if (choosingCheckOut && iso > checkIn && iso > maxCheckOut) return true;
    return false;
  };

  const pick = (iso) => {
    if (isDisabled(iso)) return;
    if (!checkIn || checkOut || iso <= checkIn) {
      onChange(iso, '');
      return;
    }
    onChange(checkIn, iso);
    onDone?.();
  };

  const renderMonth = (offset) => {
    const first = new Date(view.year, view.month + offset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const blanks = first.getDay();

    return (
      <div className={offset === 1 ? 'hidden md:block' : ''}>
        <p className="mb-3 text-center text-sm font-bold text-slate-900">{monthLabel(year, month, lang)}</p>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-slate-400">
          {WEEKDAYS[lang === 'en' ? 'en' : 'th'].map((d) => <span key={d} className="py-1">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: blanks }).map((_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const iso = toISODate(new Date(year, month, i + 1));
            const disabled = isDisabled(iso);
            const isStart = iso === checkIn;
            const isEnd = iso === rangeEnd;
            const inRange = checkIn && rangeEnd && iso > checkIn && iso < rangeEnd;
            const isToday = iso === today;

            return (
              <div
                key={iso}
                className={`relative flex justify-center ${inRange ? 'bg-brand-50' : ''} ${isStart && rangeEnd ? 'rounded-l-full bg-brand-50' : ''} ${isEnd && checkIn ? 'rounded-r-full bg-brand-50' : ''}`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(iso)}
                  onMouseEnter={() => setHovered(iso)}
                  className={`relative h-9 w-9 rounded-full text-sm transition ${
                    isStart || isEnd
                      ? 'bg-brand-600 font-bold text-white shadow-md shadow-brand-600/30'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : inRange
                          ? 'font-semibold text-brand-800 hover:bg-brand-100'
                          : 'font-medium text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {i + 1}
                  {isToday && !isStart && !isEnd && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-500" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-[min(92vw,20rem)] select-none p-4 md:w-[40rem]" onMouseLeave={() => setHovered(null)}>
      <div className="relative">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={firstMonthIsCurrent}
          className="absolute left-0 top-[-4px] rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
          aria-label={tx('เดือนก่อนหน้า', 'Previous month')}
        >
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="absolute right-0 top-[-4px] rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100"
          aria-label={tx('เดือนถัดไป', 'Next month')}
        >
          <Icon name="chevron-right" className="h-5 w-5" />
        </button>
        <div className="grid gap-8 md:grid-cols-2">
          {renderMonth(0)}
          {renderMonth(1)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-500">
          {nights > 0
            ? <><b className="text-slate-900">{nights}</b> {tx('คืน', nights === 1 ? 'night' : 'nights')}</>
            : choosingCheckOut ? tx('เลือกวันเช็กเอาต์', 'Select check-out date') : tx('เลือกวันเช็กอิน', 'Select check-in date')}
        </span>
        <div className="flex items-center gap-2">
          {(checkIn || checkOut) && (
            <button type="button" onClick={() => onChange('', '')} className="rounded-lg px-3 py-1.5 font-semibold text-slate-500 hover:bg-slate-100">
              {tx('ล้าง', 'Clear')}
            </button>
          )}
          <button type="button" onClick={() => onDone?.()} className="rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-black">
            {tx('เสร็จสิ้น', 'Done')}
          </button>
        </div>
      </div>
    </div>
  );
}
