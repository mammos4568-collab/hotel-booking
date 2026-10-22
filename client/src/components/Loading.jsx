// สถานะกำลังโหลด: spinner ทั่วไป + โครงการ์ดโรงแรม (skeleton) ระหว่างรอผลค้นหา

export function Spinner({ className = 'w-6 h-6' }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={`inline-block animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent ${className}`}
    />
  );
}

export function PageLoader({ label }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="w-8 h-8" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function HotelCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white sm:flex-row">
      <div className="h-52 animate-pulse bg-slate-200 sm:h-auto sm:w-72" />
      <div className="flex-1 space-y-3 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2 pt-2">
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-100 p-5 sm:w-52 sm:border-l sm:border-t-0">
        <div className="ml-auto h-3 w-20 animate-pulse rounded bg-slate-200" />
        <div className="ml-auto h-7 w-28 animate-pulse rounded bg-slate-200" />
        <div className="ml-auto mt-6 h-10 w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
