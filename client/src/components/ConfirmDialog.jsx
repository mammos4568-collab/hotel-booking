import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (เช่น ยกเลิกการจอง)
export default function ConfirmDialog({ open, title, message, confirmLabel, tone = 'danger', loading, error, onConfirm, onClose }) {
  const { tx } = useLanguage();
  if (!open) return null;
  const danger = tone === 'danger';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={loading ? undefined : onClose} />
      <div className="relative w-full max-w-md animate-pop-in rounded-3xl bg-white p-6 shadow-2xl">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600'}`}>
          <Icon name={danger ? 'alert' : 'info'} className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-extrabold text-slate-900">{title}</h3>
        {message && <div className="mt-1.5 text-sm text-slate-600">{message}</div>}
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {tx('ไม่ใช่ตอนนี้', 'Not now')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-60 ${
              danger ? 'bg-rose-600 shadow-rose-600/25 hover:bg-rose-700' : 'bg-brand-600 shadow-brand-600/25 hover:bg-brand-700'
            }`}
          >
            {loading ? tx('กำลังดำเนินการ…', 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
