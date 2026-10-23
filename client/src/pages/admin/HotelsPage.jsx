// หลังบ้าน: รายการโรงแรม (owner เห็นเฉพาะของตัวเอง) → กดเข้าไปแก้ข้อมูล/ห้องพัก/ปฏิทินราคา
//   แท็บสถานะการอนุมัติ (รออนุมัติขึ้นก่อนเสมอ) · admin เห็นคำก้ำกึ่งที่ควรตรวจของแต่ละโรงแรม
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import Stars from '../../components/Stars.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { PROPERTY_TYPES, cityLabel } from '../../lib/format.js';
import { APPROVAL_META, ApprovalBadge, PageHeader, SuspiciousWords, buttonPrimary, card, inputClass, useAdminData } from './adminUi.jsx';

const STATUS_TABS = ['', 'pending', 'approved', 'rejected']; // '' = ทั้งหมด

export default function HotelsPage() {
  const { user } = useAuth();
  const { lang, tx } = useLanguage();
  const [params, setParams] = useSearchParams();
  const status = STATUS_TABS.includes(params.get('status')) ? params.get('status') : '';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const apiQuery = new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}) }).toString();
  const { data, error } = useAdminData(`/admin/hotels${apiQuery ? `?${apiQuery}` : ''}`);
  const isAdmin = user.role === 'admin';

  // พิมพ์ค้นหาแล้วรอ 300ms ค่อยยิง API (ไม่ยิงทุกตัวอักษร)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const setStatus = (next) => setParams(next ? { status: next } : {}, { replace: true });
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const addButton = (
    <Link to="/admin/hotels/new" className={buttonPrimary}>
      <Icon name="plus" className="h-4 w-4" />{tx('เพิ่มโรงแรม', 'Add hotel')}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title={tx('โรงแรมและห้องพัก', 'Hotels & rooms')}
        description={isAdmin
          ? tx('ทุกโรงแรมในระบบ — โรงแรมที่เจ้าของเพิ่มต้องผ่านการอนุมัติก่อนลูกค้าจะเห็น', 'Every property — hotels added by owners need approval before guests can see them')
          : tx('โรงแรมที่คุณเป็นเจ้าของ — โรงแรมใหม่ต้องรอผู้ดูแลระบบอนุมัติก่อนลูกค้าจะเห็น', 'Properties you own — new hotels appear to guests after an admin approves them')}
        actions={addButton}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={tx('สถานะการอนุมัติ', 'Approval status')}>
          {STATUS_TABS.map((tab) => {
            const active = tab === status;
            const count = tab ? counts[tab] ?? 0 : total;
            return (
              <button
                key={tab || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(tab)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
              >
                {tab ? tx(APPROVAL_META[tab].th, APPROVAL_META[tab].en) : tx('ทั้งหมด', 'All')}
                {data && (
                  <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : tab === 'pending' && count ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={tx('ค้นหาชื่อโรงแรมหรือเมือง', 'Search by name or city')}
          className={`${inputClass} sm:max-w-xs`}
          aria-label={tx('ค้นหาโรงแรม', 'Search hotels')}
        />
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      {!data ? (
        !error && <PageLoader />
      ) : data.hotels.length === 0 ? (
        <EmptyState
          icon="building"
          title={query || status ? tx('ไม่พบโรงแรมในหมวดนี้', 'No hotels here') : tx('ยังไม่มีโรงแรม', 'No hotels yet')}
          description={query || status ? '' : tx('เพิ่มโรงแรมแรกของคุณ แล้วตั้งประเภทห้องกับราคาได้เลย', 'Add your first property, then set up room types and prices.')}
          action={!query && !status && addButton}
        />
      ) : (
        <ul className="grid gap-3">
          {data.hotels.map((hotel) => (
            <li key={hotel.id} className={`${card} flex flex-col overflow-hidden sm:flex-row ${hotel.approval.status === 'pending' ? 'ring-2 ring-amber-200' : ''}`}>
              <SmartImage src={hotel.coverUrl ?? hotel.imageUrl} alt={hotel.name} width={320} className="h-36 sm:h-auto sm:w-44 sm:shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/hotels/${hotel.id}`} className="truncate text-base font-extrabold text-slate-900 hover:text-brand-700">{hotel.name}</Link>
                    <Stars value={hotel.starRating} />
                    <ApprovalBadge status={hotel.approval.status} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {PROPERTY_TYPES[hotel.propertyType]?.[lang] ?? hotel.propertyType} · {cityLabel(hotel.city, lang)}
                    {hotel.rating !== null && <> · ★ {hotel.rating} ({hotel.reviewCount})</>}
                  </p>
                  {isAdmin && (
                    <p className="mt-1 text-xs text-slate-500">
                      {tx('เจ้าของ', 'Owner')}: {hotel.owner ? <span className="font-semibold text-slate-700">{hotel.owner.name}</span> : <span className="italic">{tx('ยังไม่มี (ผู้ดูแลระบบดูแล)', 'None (managed by admins)')}</span>}
                    </p>
                  )}
                  {hotel.approval.status === 'rejected' && hotel.approval.note && (
                    <p className="mt-1 text-xs text-rose-700">{tx('เหตุผล', 'Reason')}: {hotel.approval.note}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{tx(`${hotel.roomTypes} ประเภทห้อง · ${hotel.totalRooms} ห้อง`, `${hotel.roomTypes} room types · ${hotel.totalRooms} rooms`)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{tx(`การจองที่ยังไม่เข้าพัก ${hotel.upcomingBookings}`, `${hotel.upcomingBookings} upcoming bookings`)}</span>
                    <SuspiciousWords words={hotel.suspiciousWords} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {hotel.approval.status === 'approved' && (
                    <Link to={`/hotels/${hotel.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                      <Icon name="external" className="h-4 w-4" />{tx('หน้าเว็บ', 'View')}
                    </Link>
                  )}
                  <Link to={`/admin/hotels/${hotel.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Icon name={isAdmin && hotel.approval.status === 'pending' ? 'check' : 'pencil'} className="h-4 w-4" />
                    {isAdmin && hotel.approval.status === 'pending' ? tx('ตรวจ', 'Review') : tx('จัดการ', 'Manage')}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
