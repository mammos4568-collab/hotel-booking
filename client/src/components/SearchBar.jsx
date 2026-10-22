import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import DatePicker from './DatePicker.jsx';
import GuestPicker from './GuestPicker.jsx';
import SmartImage from './SmartImage.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { CITY_NAMES_TH, cityImage, cityLabel, formatDate, nightsBetween } from '../lib/format.js';

// โหลดรายชื่อเมืองครั้งเดียว ใช้ร่วมกันทุกกล่องค้นหา
let destinationsPromise;
export function loadDestinations() {
  destinationsPromise ??= api('/hotels/destinations')
    .then((data) => data.destinations || [])
    .catch(() => {
      destinationsPromise = undefined;
      return [];
    });
  return destinationsPromise;
}

export function buildSearchParams({ q, checkIn, checkOut, adults, children, rooms }) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (checkIn && checkOut) {
    params.set('checkIn', checkIn);
    params.set('checkOut', checkOut);
  }
  params.set('adults', String(adults || 1));
  if (children) params.set('children', String(children));
  if (rooms > 1) params.set('rooms', String(rooms));
  return params;
}

// กล่องค้นหา: จุดหมาย + ช่วงวัน + จำนวนผู้เข้าพัก → ไปหน้า /search
// variant="hero" ใช้บนหน้าแรก (ใหญ่), "compact" ใช้บนหน้าผลค้นหา
export default function SearchBar({ initial = {}, variant = 'hero' }) {
  const navigate = useNavigate();
  const { lang, tx } = useLanguage();
  const rootRef = useRef(null);

  const [q, setQ] = useState(initial.q || '');
  const [checkIn, setCheckIn] = useState(initial.checkIn || '');
  const [checkOut, setCheckOut] = useState(initial.checkOut || '');
  const [adults, setAdults] = useState(Number(initial.adults) || 2);
  const [children, setChildren] = useState(Number(initial.children) || 0);
  const [rooms, setRooms] = useState(Number(initial.rooms) || 1);
  const [open, setOpen] = useState(null); // 'dest' | 'dates' | 'guests' | null
  const [destinations, setDestinations] = useState([]);

  useEffect(() => {
    loadDestinations().then(setDestinations);
  }, []);

  // ค่าจาก URL เปลี่ยน (เช่นกดย้อนกลับ) → อัปเดตกล่องค้นหาตาม
  useEffect(() => {
    setQ(initial.q || '');
    setCheckIn(initial.checkIn || '');
    setCheckOut(initial.checkOut || '');
    setAdults(Number(initial.adults) || 2);
    setChildren(Number(initial.children) || 0);
    setRooms(Number(initial.rooms) || 1);
  }, [initial.q, initial.checkIn, initial.checkOut, initial.adults, initial.children, initial.rooms]);

  useEffect(() => {
    const onClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(null);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const keyword = q.trim().toLowerCase();
  const suggestions = destinations.filter((d) => {
    if (!keyword) return true;
    const thName = CITY_NAMES_TH[d.city.toLowerCase()] || '';
    return d.city.toLowerCase().includes(keyword) || thName.includes(q.trim());
  });

  const submit = (event) => {
    event?.preventDefault();
    setOpen(null);
    navigate(`/search?${buildSearchParams({ q, checkIn, checkOut, adults, children, rooms })}`);
  };

  const nights = nightsBetween(checkIn, checkOut);
  const isHero = variant === 'hero';
  const segment = `relative flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 text-left transition ${
    isHero ? 'py-3.5' : 'py-2.5'
  }`;
  const segmentActive = 'bg-white ring-2 ring-brand-500 shadow-sm';
  const segmentIdle = 'hover:bg-slate-100';
  const popover = 'absolute left-0 top-full z-50 mt-2 animate-pop-in rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15';

  return (
    <form
      ref={rootRef}
      onSubmit={submit}
      // z-30: backdrop-blur ทำให้ฟอร์มเป็น stacking context ของตัวเอง ต้องยกทั้งก้อนขึ้น popover จึงไม่ถูกการ์ดด้านล่างทับ
      className={`relative z-30 grid gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/95 p-1.5 shadow-xl shadow-slate-900/10 backdrop-blur md:flex md:items-stretch ${
        isHero ? 'md:rounded-full md:p-2' : ''
      }`}
    >
      {/* จุดหมายปลายทาง */}
      <div className={`${segment} ${open === 'dest' ? segmentActive : segmentIdle} md:flex-[1.3] ${isHero ? 'md:rounded-full' : ''}`}>
        <Icon name="pin" className="h-5 w-5 shrink-0 text-brand-600" />
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('ไปที่ไหน', 'Where to')}</span>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen('dest'); }}
            onFocus={() => setOpen('dest')}
            placeholder={tx('เมือง หรือ ชื่อโรงแรม', 'City or hotel name')}
            className="w-full truncate bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          />
        </label>
        {q && (
          <button type="button" onClick={() => setQ('')} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600" aria-label="clear">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
        {open === 'dest' && suggestions.length > 0 && (
          <div className={`${popover} w-full min-w-72 p-2`}>
            <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {keyword ? tx('จุดหมายที่ตรงกัน', 'Matching destinations') : tx('จุดหมายยอดนิยม', 'Popular destinations')}
            </p>
            {suggestions.slice(0, 6).map((d) => (
              <button
                key={d.city}
                type="button"
                onClick={() => { setQ(d.city); setOpen('dates'); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <SmartImage src={cityImage(d.city)} width={96} className="h-10 w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{cityLabel(d.city, lang)}</span>
                  <span className="block text-xs text-slate-500">
                    {d.hotels} {tx('ที่พัก', d.hotels === 1 ? 'property' : 'properties')} · {d.country}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ช่วงวันเข้าพัก */}
      <div className="relative md:flex-[1.4]">
        <button
          type="button"
          onClick={() => setOpen(open === 'dates' ? null : 'dates')}
          className={`${segment} h-full w-full ${open === 'dates' ? segmentActive : segmentIdle} ${isHero ? 'md:rounded-full' : ''}`}
        >
          <Icon name="calendar" className="h-5 w-5 shrink-0 text-brand-600" />
          <span className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('เช็กอิน', 'Check-in')}</span>
              <span className={`block truncate text-sm font-semibold ${checkIn ? 'text-slate-900' : 'font-normal text-slate-400'}`}>
                {checkIn ? formatDate(checkIn, lang, { weekday: 'short', day: 'numeric', month: 'short' }) : tx('เพิ่มวันที่', 'Add date')}
              </span>
            </span>
            <span className="min-w-0 border-l border-slate-200 pl-3">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {tx('เช็กเอาต์', 'Check-out')}{nights > 0 && <span className="ml-1 normal-case text-brand-600">· {nights} {tx('คืน', 'nt')}</span>}
              </span>
              <span className={`block truncate text-sm font-semibold ${checkOut ? 'text-slate-900' : 'font-normal text-slate-400'}`}>
                {checkOut ? formatDate(checkOut, lang, { weekday: 'short', day: 'numeric', month: 'short' }) : tx('เพิ่มวันที่', 'Add date')}
              </span>
            </span>
          </span>
        </button>
        {open === 'dates' && (
          <div className={`${popover} md:-left-24`}>
            <DatePicker
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={(nextIn, nextOut) => { setCheckIn(nextIn); setCheckOut(nextOut); }}
              onDone={() => setOpen(checkIn ? 'guests' : null)}
            />
          </div>
        )}
      </div>

      {/* ผู้เข้าพัก */}
      <div className="relative md:flex-1">
        <button
          type="button"
          onClick={() => setOpen(open === 'guests' ? null : 'guests')}
          className={`${segment} h-full w-full ${open === 'guests' ? segmentActive : segmentIdle} ${isHero ? 'md:rounded-full' : ''}`}
        >
          <Icon name="users" className="h-5 w-5 shrink-0 text-brand-600" />
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('ผู้เข้าพัก', 'Guests')}</span>
            <span className="block truncate text-sm font-semibold text-slate-900">
              {adults} {tx('ผู้ใหญ่', adults === 1 ? 'adult' : 'adults')}
              {children > 0 && `, ${children} ${tx('เด็ก', children === 1 ? 'child' : 'children')}`}
              {rooms > 1 && ` · ${rooms} ${tx('ห้อง', 'rooms')}`}
            </span>
          </span>
        </button>
        {open === 'guests' && (
          <div className={`${popover} md:left-auto md:right-0`}>
            <GuestPicker
              adults={adults}
              children={children}
              rooms={rooms}
              onChange={(next) => { setAdults(next.adults); setChildren(next.children); setRooms(next.rooms); }}
              onDone={() => setOpen(null)}
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        className={`flex items-center justify-center gap-2 bg-brand-600 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[0.98] ${
          isHero ? 'rounded-xl px-7 py-3.5 text-base md:rounded-full' : 'rounded-xl px-5 py-2.5 text-sm'
        }`}
      >
        <Icon name="search" className="h-5 w-5" />
        <span>{tx('ค้นหา', 'Search')}</span>
      </button>
    </form>
  );
}
