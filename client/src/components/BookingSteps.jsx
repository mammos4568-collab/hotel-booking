import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// แถบขั้นตอนการจอง: 1 ข้อมูลผู้เข้าพัก → 2 ชำระเงิน → 3 ยืนยัน
export default function BookingSteps({ current = 0 }) {
  const { tx } = useLanguage();
  const steps = [tx('ข้อมูลผู้เข้าพัก', 'Guest details'), tx('ชำระเงิน', 'Payment'), tx('ยืนยันการจอง', 'Confirmation')];

  return (
    <ol className="flex items-center gap-2 text-sm sm:gap-3">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <Icon name="check" className="h-4 w-4" strokeWidth={3} /> : index + 1}
            </span>
            <span className={`hidden font-semibold sm:inline ${active ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
            {index < steps.length - 1 && <span className={`h-px w-6 sm:w-10 ${done ? 'bg-emerald-400' : 'bg-slate-300'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
