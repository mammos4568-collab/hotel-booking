import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

function Stepper({ label, hint, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="-"
        >
          <Icon name="minus" className="h-4 w-4" />
        </button>
        <span className="w-5 text-center text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="+"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export const MAX_ROOMS = 5; // จองได้ครั้งละไม่เกิน 5 ห้อง (ตรงกับฝั่ง server)

// เลือกจำนวนผู้ใหญ่/เด็ก/ห้อง — หลายห้อง = ห้องประเภทเดียวกัน ระบบแสดงเฉพาะห้องที่ว่างพอและพักรวมกันได้ทุกคน
// จำนวนห้องต้องไม่เกินจำนวนคน (ทุกห้องต้องมีคนพัก)
export default function GuestPicker({ adults, children, rooms = 1, onChange, onDone }) {
  const { tx } = useLanguage();
  const guests = adults + children;
  const update = (next) => {
    const merged = { adults, children, rooms, ...next };
    merged.rooms = Math.min(merged.rooms, merged.adults + merged.children);
    onChange(merged);
  };
  return (
    <div className="w-72 p-4">
      <div className="divide-y divide-slate-100">
        <Stepper
          label={tx('ผู้ใหญ่', 'Adults')}
          hint={tx('อายุ 13 ปีขึ้นไป', 'Ages 13 or above')}
          value={adults}
          min={1}
          max={10}
          onChange={(value) => update({ adults: value })}
        />
        <Stepper
          label={tx('เด็ก', 'Children')}
          hint={tx('อายุ 0–12 ปี', 'Ages 0–12')}
          value={children}
          min={0}
          max={6}
          onChange={(value) => update({ children: value })}
        />
        <Stepper
          label={tx('ห้อง', 'Rooms')}
          hint={tx('ห้องประเภทเดียวกัน', 'Same room type')}
          value={rooms}
          min={1}
          max={Math.min(MAX_ROOMS, guests)}
          onChange={(value) => update({ rooms: value })}
        />
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
        <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {tx('ระบบจะแสดงเฉพาะห้องที่ว่างพอ และพักรวมกันได้ทุกคน (ห้องละไม่เกินจำนวนที่ห้องนั้นรองรับ)', 'Only rooms with enough availability that fit everyone are shown (up to each room’s capacity).')}
      </p>
      <button type="button" onClick={onDone} className="mt-3 w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-black">
        {tx('เสร็จสิ้น', 'Done')}
      </button>
    </div>
  );
}
