// ชิ้นส่วนที่หน้าหลังบ้านใช้ร่วมกัน: โหลดข้อมูล, หัวข้อหน้า, ช่องกรอก, กล่องแจ้ง, หน้าต่าง, แบ่งหน้า
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

// หลังบ้านแสดงเงินเป็น "บาท" เสมอ (ไม่ใช้ formatPrice ที่แปลงตามสกุลเงินที่ลูกค้าเลือก)
// เพราะราคาที่เจ้าของกรอกเป็นบาท และยอดเงินในระบบเก็บเป็นบาท — ถ้าแปลงสกุลเงินจะสับสนตอนตั้งราคา
export function baht(value) {
  return `฿ ${(Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// ตัวเลขแบบย่อสำหรับแกนกราฟ: 1,500 → 1.5K · 2,000,000 → 2M
export function compactNumber(value) {
  const num = Number(value) || 0;
  const short = (n) => String(Math.round(n * 10) / 10);
  if (Math.abs(num) >= 1_000_000) return `${short(num / 1_000_000)}M`;
  if (Math.abs(num) >= 1_000) return `${short(num / 1_000)}K`;
  return String(Math.round(num));
}

// โหลดข้อมูลจาก API ตาม path — เปลี่ยน path (เช่น เปลี่ยนตัวกรอง) แล้วโหลดใหม่เอง
// ระหว่างโหลดใหม่ยังแสดงข้อมูลเดิมไว้ (ไม่กระพริบเป็นหน้าว่าง) · reload() = โหลดซ้ำหลังบันทึก
export function useAdminData(path) {
  const [state, setState] = useState({ data: null, error: '', loading: Boolean(path) });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let active = true; // คำขอเก่าที่ตอบกลับช้า ต้องไม่ทับผลของคำขอใหม่
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    api(path)
      .then((data) => active && setState({ data, error: '', loading: false }))
      .catch((error) => active && setState((prev) => ({ ...prev, error: error.message, loading: false })));
    return () => {
      active = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export const card = 'rounded-3xl border border-slate-200 bg-white';
export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500';
export const buttonPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-60';
export const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60';
export const buttonDanger =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60';

export function PageHeader({ title, description, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const NOTICE_TONES = {
  error: { className: 'bg-rose-50 text-rose-700', icon: 'alert' },
  success: { className: 'bg-emerald-50 text-emerald-800', icon: 'check' },
  info: { className: 'bg-brand-50 text-brand-800', icon: 'info' },
};

export function Notice({ tone = 'error', children }) {
  const meta = NOTICE_TONES[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${meta.className}`}>
      <Icon name={meta.icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// หน้าต่างลอย (ฟอร์มเพิ่ม/แก้ไข, รายละเอียด) — มือถือเลื่อนขึ้นจากด้านล่าง · กด Esc หรือพื้นหลังเพื่อปิด
export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const { tx } = useLanguage();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-pop-in sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tx('ปิด', 'Close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onChange }) {
  const { tx } = useLanguage();
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{tx(`ทั้งหมด ${total.toLocaleString()} รายการ`, `${total.toLocaleString()} total`)}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={tx('หน้าก่อนหน้า', 'Previous page')} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
          <span className="px-2 font-semibold tabular-nums text-slate-700">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={tx('หน้าถัดไป', 'Next page')} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <Icon name="chevron-right" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// บทบาทผู้ใช้ (users.role)
export const ROLE_META = {
  admin: { th: 'ผู้ดูแลระบบ', en: 'Admin', className: 'bg-violet-100 text-violet-800' },
  owner: { th: 'เจ้าของโรงแรม', en: 'Hotel owner', className: 'bg-brand-100 text-brand-800' },
  user: { th: 'ลูกค้า', en: 'Customer', className: 'bg-slate-100 text-slate-700' },
};

export function RoleBadge({ role }) {
  const { tx } = useLanguage();
  const meta = ROLE_META[role] ?? ROLE_META.user;
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.className}`}>{tx(meta.th, meta.en)}</span>;
}

// สถานะการอนุมัติโรงแรม (properties.approval_status · db/08-hotel-approval.sql)
export const APPROVAL_META = {
  pending: { th: 'รออนุมัติ', en: 'Pending review', className: 'bg-amber-100 text-amber-800', icon: 'clock' },
  approved: { th: 'เผยแพร่แล้ว', en: 'Published', className: 'bg-emerald-100 text-emerald-800', icon: 'check' },
  rejected: { th: 'ไม่อนุมัติ/ระงับ', en: 'Not approved', className: 'bg-rose-100 text-rose-700', icon: 'x' },
};

export function ApprovalBadge({ status }) {
  const { tx } = useLanguage();
  const meta = APPROVAL_META[status] ?? APPROVAL_META.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.className}`}>
      <Icon name={meta.icon} className="h-3.5 w-3.5" />{tx(meta.th, meta.en)}
    </span>
  );
}

// คำก้ำกึ่งที่ตัวกรองเจอ (admin เท่านั้น) — ตัวกรองบล็อกคำหยาบชัดเจนไปแล้ว ที่เหลือให้คนตัดสิน
export function SuspiciousWords({ words }) {
  const { tx } = useLanguage();
  if (!words?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
      <Icon name="alert" className="h-3.5 w-3.5" />{tx('คำที่ควรตรวจ', 'Words to check')}: {words.map((word) => `"${word}"`).join(', ')}
    </span>
  );
}

// ตัวเลือกโรงแรม (ตัวกรองในหน้าการจอง/รีวิว) — owner เห็นเฉพาะโรงแรมตัวเองอยู่แล้วจาก API
export function HotelFilter({ value, onChange }) {
  const { tx } = useLanguage();
  const { data } = useAdminData('/admin/hotels');
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} sm:w-56`} aria-label={tx('โรงแรม', 'Hotel')}>
      <option value="">{tx('ทุกโรงแรม', 'All hotels')}</option>
      {(data?.hotels ?? []).map((hotel) => (
        <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
      ))}
    </select>
  );
}
