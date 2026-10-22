import Icon from './Icon.jsx';

// กล่องข้อความตอนไม่มีข้อมูล (ไม่เจอผลค้นหา / ยังไม่มีการจอง / โหลดไม่สำเร็จ)
export default function EmptyState({ icon = 'search', title, description, action, tone = 'neutral' }) {
  const toneClass = tone === 'error' ? 'bg-rose-50 text-rose-500' : 'bg-brand-50 text-brand-600';
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${toneClass}`}>
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <p className="text-base font-bold text-slate-900">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
