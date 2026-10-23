// หลังบ้าน: รายการโรงแรม (owner เห็นเฉพาะของตัวเอง) → กดเข้าไปแก้ข้อมูล/ห้องพัก/ปฏิทินราคา
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import Stars from '../../components/Stars.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { PROPERTY_TYPES, cityLabel } from '../../lib/format.js';
import { PageHeader, buttonPrimary, card, inputClass, useAdminData } from './adminUi.jsx';

export default function HotelsPage() {
  const { user } = useAuth();
  const { lang, tx } = useLanguage();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, error } = useAdminData(`/admin/hotels${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const isAdmin = user.role === 'admin';

  // พิมพ์ค้นหาแล้วรอ 300ms ค่อยยิง API (ไม่ยิงทุกตัวอักษร)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const addButton = (
    <Link to="/admin/hotels/new" className={buttonPrimary}>
      <Icon name="plus" className="h-4 w-4" />{tx('เพิ่มโรงแรม', 'Add hotel')}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title={tx('โรงแรมและห้องพัก', 'Hotels & rooms')}
        description={isAdmin ? tx('ทุกโรงแรมในระบบ', 'Every property on the site') : tx('โรงแรมที่คุณเป็นเจ้าของ', 'Properties you own')}
        actions={addButton}
      />

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={tx('ค้นหาชื่อโรงแรมหรือเมือง', 'Search by name or city')}
        className={`${inputClass} mb-4 sm:max-w-sm`}
        aria-label={tx('ค้นหาโรงแรม', 'Search hotels')}
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      {!data ? (
        !error && <PageLoader />
      ) : data.hotels.length === 0 ? (
        <EmptyState
          icon="building"
          title={query ? tx('ไม่พบโรงแรมที่ค้นหา', 'No matching hotels') : tx('ยังไม่มีโรงแรม', 'No hotels yet')}
          description={query ? '' : tx('เพิ่มโรงแรมแรกของคุณ แล้วตั้งประเภทห้องกับราคาได้เลย', 'Add your first property, then set up room types and prices.')}
          action={!query && addButton}
        />
      ) : (
        <ul className="grid gap-3">
          {data.hotels.map((hotel) => (
            <li key={hotel.id} className={`${card} flex flex-col overflow-hidden sm:flex-row`}>
              <SmartImage src={hotel.coverUrl ?? hotel.imageUrl} alt={hotel.name} width={320} className="h-36 sm:h-auto sm:w-44 sm:shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/hotels/${hotel.id}`} className="truncate text-base font-extrabold text-slate-900 hover:text-brand-700">{hotel.name}</Link>
                    <Stars value={hotel.starRating} />
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
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{tx(`${hotel.roomTypes} ประเภทห้อง · ${hotel.totalRooms} ห้อง`, `${hotel.roomTypes} room types · ${hotel.totalRooms} rooms`)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{tx(`การจองที่ยังไม่เข้าพัก ${hotel.upcomingBookings}`, `${hotel.upcomingBookings} upcoming bookings`)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link to={`/hotels/${hotel.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    <Icon name="external" className="h-4 w-4" />{tx('หน้าเว็บ', 'View')}
                  </Link>
                  <Link to={`/admin/hotels/${hotel.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Icon name="pencil" className="h-4 w-4" />{tx('จัดการ', 'Manage')}
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
