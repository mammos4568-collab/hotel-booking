import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import HotelCard from '../../components/HotelCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { HotelCardSkeleton } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { AMENITIES, PROPERTY_TYPES, cityLabel, formatShortRange, isISODate } from '../../lib/format.js';

const PAGE_SIZE = 8;
// ตัวกรองที่ส่งต่อให้ API ตรงๆ (ชื่อเดียวกันทั้งใน URL ของหน้าเว็บและ /api/hotels)
//   features (วิว/บรรยากาศ) และ near (ใกล้จุดเที่ยว) มาจากลิงก์ของผู้ช่วยแนะนำที่พัก
const FILTER_KEYS = ['stars', 'minPrice', 'maxPrice', 'amenities', 'type', 'features', 'near'];
const PRICE_PRESETS = [
  { key: 'u1500', max: 1500 },
  { key: '1500-3000', min: 1500, max: 3000 },
  { key: '3000-6000', min: 3000, max: 6000 },
  { key: 'o6000', min: 6000 },
];

// ค่าแบบเลือกได้หลายอัน เก็บใน URL คั่นด้วยจุลภาค เช่น ?amenities=pool,spa
const readList = (params, key) => (params.get(key) || '').split(',').filter(Boolean);

function FiltersPanel({ params, update, onReset }) {
  const { lang, tx, formatPrice } = useLanguage();
  const stars = params.get('stars') || '';
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const amenities = readList(params, 'amenities');
  const types = readList(params, 'type');
  const [draftMin, setDraftMin] = useState(minPrice);
  const [draftMax, setDraftMax] = useState(maxPrice);
  const label = (item) => item[lang === 'en' ? 'en' : 'th'];

  // เลือก/เลิกเลือก แล้วยังเปิดลิ้นชักตัวกรองบนมือถือค้างไว้ (เลือกหลายอันต่อกันได้)
  const toggle = (key, list, value) => {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    update({ [key]: next.join(',') }, { keepOpen: true });
  };

  useEffect(() => { setDraftMin(minPrice); setDraftMax(maxPrice); }, [minPrice, maxPrice]);

  const presetLabel = (p) => {
    if (p.min && p.max) return `${formatPrice(p.min)} – ${formatPrice(p.max)}`;
    if (p.max) return tx(`ต่ำกว่า ${formatPrice(p.max)}`, `Under ${formatPrice(p.max)}`);
    return tx(`${formatPrice(p.min)} ขึ้นไป`, `${formatPrice(p.min)}+`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-extrabold text-slate-900"><Icon name="sliders" className="h-4 w-4" />{tx('ตัวกรอง', 'Filters')}</p>
        <button type="button" onClick={onReset} className="text-sm font-semibold text-brand-600 hover:text-brand-700">{tx('ล้างทั้งหมด', 'Clear all')}</button>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-900">{tx('ราคาต่อคืน', 'Price per night')}</p>
        <div className="space-y-1">
          {PRICE_PRESETS.map((p) => {
            const active = String(p.min || '') === minPrice && String(p.max || '') === maxPrice;
            return (
              <label key={p.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="radio"
                  name="price"
                  checked={active}
                  onChange={() => update({ minPrice: p.min || '', maxPrice: p.max || '' })}
                  className="h-4 w-4 accent-brand-600"
                />
                {presetLabel(p)}
              </label>
            );
          })}
        </div>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); update({ minPrice: draftMin, maxPrice: draftMax }); }}
        >
          <input type="number" min="0" inputMode="numeric" value={draftMin} onChange={(e) => setDraftMin(e.target.value)} placeholder={tx('ต่ำสุด', 'Min')} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-500" />
          <span className="text-slate-400">–</span>
          <input type="number" min="0" inputMode="numeric" value={draftMax} onChange={(e) => setDraftMax(e.target.value)} placeholder={tx('สูงสุด', 'Max')} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-500" />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black" aria-label="apply">
            <Icon name="check" className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1.5 text-xs text-slate-400">{tx('ราคาเป็นบาท (THB)', 'Prices in THB')}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-900">{tx('ระดับดาว', 'Star rating')}</p>
        <div className="flex flex-wrap gap-2">
          {[['', tx('ทั้งหมด', 'Any')], ['3', '3+'], ['4', '4+'], ['4.5', '4.5+'], ['5', '5']].map(([value, text]) => (
            <button
              key={value || 'any'}
              type="button"
              onClick={() => update({ stars: value })}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                stars === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400'
              }`}
            >
              {text}
              {value && <Icon name="star" filled className="h-3.5 w-3.5" strokeWidth={1.5} />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-900">{tx('ประเภทที่พัก', 'Property type')}</p>
        <div className="space-y-1">
          {Object.entries(PROPERTY_TYPES).map(([value, item]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={types.includes(value)} onChange={() => toggle('type', types, value)} className="h-4 w-4 rounded accent-brand-600" />
              {label(item)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-900">{tx('สิ่งอำนวยความสะดวก', 'Amenities')}</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(AMENITIES).map(([value, item]) => {
            const active = amenities.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => toggle('amenities', amenities, value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400'
                }`}
              >
                <Icon name={item.icon} className="h-3.5 w-3.5" />
                {label(item)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const { lang, tx } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ hotels: [], total: 0, totalPages: 1, nights: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get('q') || '';
  const checkIn = isISODate(params.get('checkIn')) ? params.get('checkIn') : '';
  const checkOut = isISODate(params.get('checkOut')) ? params.get('checkOut') : '';
  const adults = Number(params.get('adults')) || 2;
  const children = Number(params.get('children')) || 0;
  const guests = adults + children;
  // จำนวนห้อง 1–5 และต้องไม่เกินจำนวนคน (ตรงกับ GuestPicker / server)
  const rooms = Math.min(Math.max(Number(params.get('rooms')) || 1, 1), 5, guests);
  const near = params.get('near') || '';
  // ค้นหาแบบ "ใกล้ …" เรียงตามระยะทางเป็นค่าเริ่มต้น (server ทำแบบเดียวกัน)
  const defaultSort = near ? 'distance' : 'recommended';
  const sort = params.get('sort') || defaultSort;
  const page = Number(params.get('page')) || 1;
  const queryKey = params.toString();

  useEffect(() => {
    const apiParams = new URLSearchParams();
    if (q) apiParams.set('q', q);
    if (checkIn && checkOut) {
      apiParams.set('checkIn', checkIn);
      apiParams.set('checkOut', checkOut);
    }
    apiParams.set('guests', String(guests));
    if (rooms > 1) apiParams.set('rooms', String(rooms));
    FILTER_KEYS.forEach((key) => params.get(key) && apiParams.set(key, params.get(key)));
    apiParams.set('sort', sort);
    apiParams.set('page', String(page));
    apiParams.set('limit', String(PAGE_SIZE));

    let ignore = false; // กันผลลัพธ์เก่ามาทับผลใหม่ ถ้าผู้ใช้เปลี่ยนตัวกรองเร็วๆ
    setLoading(true);
    setError('');
    api(`/hotels?${apiParams}`)
      .then((data) => { if (!ignore) setResult(data); })
      .catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [queryKey]); // queryKey = URL ทั้งหมด → เปลี่ยนค่าไหนใน URL ก็โหลดใหม่

  const update = (changes, { keepOpen = false } = {}) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value === '' || value === null ? next.delete(key) : next.set(key, String(value))));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
    if (!keepOpen) setFiltersOpen(false);
  };

  const resetFilters = () => update({ stars: '', minPrice: '', maxPrice: '', amenities: '', type: '', features: '', near: '', sort: '' });
  const nearLabel = result.near ? (lang === 'en' ? result.near.en : result.near.th) : '';

  // ส่งวัน/จำนวนคนต่อไปหน้าโรงแรม จะได้เห็นราคาและห้องว่างของช่วงเดียวกัน
  const linkQuery = new URLSearchParams({
    ...(checkIn && checkOut ? { checkIn, checkOut } : {}),
    adults: String(adults),
    ...(children ? { children: String(children) } : {}),
    ...(rooms > 1 ? { rooms: String(rooms) } : {}),
  }).toString();

  const activeFilters = FILTER_KEYS.filter((key) => params.get(key)).length;
  const title = q ? tx(`ที่พักใน "${cityLabel(q, lang)}"`, `Stays in "${q}"`) : tx('ที่พักทั้งหมด', 'All stays');

  return (
    <div className="pb-10">
      {/* แถบค้นหาด้านบน */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <SearchBar variant="compact" initial={{ q, checkIn, checkOut, adults, children, rooms }} />
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[17rem_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl border border-slate-200 bg-white p-5">
            <FiltersPanel params={params} update={update} onReset={resetFilters} />
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {loading ? tx('กำลังค้นหา…', 'Searching…') : tx(`พบ ${result.total} ที่พัก`, `${result.total} properties found`)}
                {checkIn && checkOut && <> · {formatShortRange(checkIn, checkOut, lang)} ({result.nights || '…'} {tx('คืน', 'nights')})</>}
                {' '}· {guests} {tx('ผู้เข้าพัก', 'guests')}
                {rooms > 1 && <> · {rooms} {tx('ห้อง', 'rooms')}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 lg:hidden"
              >
                <Icon name="sliders" className="h-4 w-4" /> {tx('ตัวกรอง', 'Filters')}
                {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeFilters}</span>}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-500">
                <span className="hidden sm:inline">{tx('เรียงตาม', 'Sort by')}</span>
                <select
                  value={sort}
                  onChange={(e) => update({ sort: e.target.value === defaultSort ? '' : e.target.value })}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500"
                >
                  {near && <option value="distance">{tx('ใกล้ที่สุด', 'Nearest first')}</option>}
                  <option value="recommended">{tx('แนะนำ', 'Recommended')}</option>
                  <option value="price_asc">{tx('ราคาต่ำ → สูง', 'Price: low to high')}</option>
                  <option value="price_desc">{tx('ราคาสูง → ต่ำ', 'Price: high to low')}</option>
                  <option value="rating_desc">{tx('คะแนนรีวิวสูงสุด', 'Top reviewed')}</option>
                  <option value="stars_desc">{tx('ระดับดาวสูงสุด', 'Star rating')}</option>
                </select>
              </label>
            </div>
          </div>

          {/* เงื่อนไขพิเศษจากผู้ช่วยแนะนำที่พัก: ใกล้จุดเที่ยว / วิว-บรรยากาศ (ชื่อมาจาก API) */}
          {(result.near || result.features?.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {result.near && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-emerald-800">
                  <Icon name="map" className="h-4 w-4" />
                  {tx(`ใกล้${result.near.th}`, `Near ${result.near.en}`)}
                  <button type="button" onClick={() => update({ near: '', sort: '' })} className="rounded-full p-0.5 hover:bg-emerald-100" aria-label={tx('ลบเงื่อนไข', 'Remove filter')}>
                    <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </span>
              )}
              {result.features?.map((feature) => (
                <span key={feature.key} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-brand-800">
                  <Icon name="sparkles" className="h-4 w-4" />
                  {lang === 'en' ? feature.en : feature.th}
                  <button
                    type="button"
                    onClick={() => update({ features: readList(params, 'features').filter((key) => key !== feature.key).join(',') })}
                    className="rounded-full p-0.5 hover:bg-brand-100"
                    aria-label={tx('ลบเงื่อนไข', 'Remove filter')}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              {result.features?.length > 0 && (
                <span className="text-xs text-slate-500">{tx('วิว/บรรยากาศดูจากคำอธิบายของที่พักและห้องพัก', 'Views & vibe are matched against property and room descriptions')}</span>
              )}
            </div>
          )}

          {!checkIn && !loading && result.total > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Icon name="info" className="h-4 w-4 shrink-0" />
              {tx('เลือกวันเข้าพักเพื่อดูห้องว่างและราคารวมตามวันที่จริง', 'Add your dates to see real availability and total prices.')}
            </p>
          )}

          <div className="mt-5 space-y-4">
            {loading && Array.from({ length: 3 }).map((_, i) => <HotelCardSkeleton key={i} />)}

            {!loading && error && (
              <EmptyState icon="alert" tone="error" title={tx('โหลดผลการค้นหาไม่สำเร็จ', 'Could not load results')} description={error} />
            )}

            {!loading && !error && result.hotels.length === 0 && (
              <EmptyState
                icon="search"
                title={tx('ไม่พบที่พักที่ตรงกับเงื่อนไข', 'No stays match your search')}
                description={checkIn
                  ? tx('ที่พักอาจเต็มในช่วงวันที่เลือก ลองเปลี่ยนวัน ลดจำนวนผู้เข้าพัก หรือล้างตัวกรอง', 'Places may be full on these dates. Try other dates, fewer guests, or clear filters.')
                  : tx('ลองค้นหาด้วยชื่อเมืองอื่น หรือล้างตัวกรอง', 'Try another city or clear the filters.')}
                action={(
                  <div className="flex justify-center gap-2">
                    <button type="button" onClick={resetFilters} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{tx('ล้างตัวกรอง', 'Clear filters')}</button>
                    <Link to="/search" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{tx('ดูที่พักทั้งหมด', 'Show all stays')}</Link>
                  </div>
                )}
              />
            )}

            {!loading && !error && result.hotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} nights={result.nights} rooms={rooms} linkQuery={linkQuery} nearLabel={nearLabel} />
            ))}
          </div>

          {!loading && result.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => { update({ page: page - 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 disabled:opacity-40"
                aria-label={tx('ก่อนหน้า', 'Previous')}
              >
                <Icon name="chevron-left" className="h-4 w-4" />
              </button>
              {Array.from({ length: result.totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { update({ page: i + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-bold transition ${
                    page === i + 1 ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'border border-slate-300 bg-white text-slate-700 hover:border-brand-400'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= result.totalPages}
                onClick={() => { update({ page: page + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 disabled:opacity-40"
                aria-label={tx('ถัดไป', 'Next')}
              >
                <Icon name="chevron-right" className="h-4 w-4" />
              </button>
            </nav>
          )}
        </section>
      </div>

      {/* ตัวกรองแบบลิ้นชักบนมือถือ */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/50 backdrop-blur-sm lg:hidden">
          <div className="flex-1" onClick={() => setFiltersOpen(false)} />
          <div className="h-full w-[85%] max-w-sm animate-slide-in-right overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="close">
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <FiltersPanel params={params} update={update} onReset={resetFilters} />
          </div>
        </div>
      )}
    </div>
  );
}
