// หลังบ้าน: ปฏิทินราคา/ห้องว่างรายวันของประเภทห้องหนึ่ง
//   ดูได้ทีละเดือน: ราคาแต่ละคืน (ราคาพิเศษมีจุดสีบอก) · ห้องที่เปิดขาย · ห้องที่ถูกจองแล้ว
//   เลือกช่วงวัน (คลิกวันแรก-วันสุดท้าย) + วันในสัปดาห์ → ตั้งราคา / จำนวนห้องที่เปิดขาย / ปิดขาย / คืนค่าปกติ
//   server ตรวจซ้ำทุกอย่าง: ห้ามแก้วันที่ผ่านมา · ปิดขายต่ำกว่าห้องที่ถูกจองไปแล้วไม่ได้ (409)
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { addDays, formatDate, parseISODate, toISODate, todayISO } from '../../lib/format.js';
import { Field, Notice, PageHeader, baht, buttonPrimary, buttonSecondary, card, compactNumber, inputClass, useAdminData } from './adminUi.jsx';

const WEEKDAYS = [
  { th: 'อา', en: 'Sun' }, { th: 'จ', en: 'Mon' }, { th: 'อ', en: 'Tue' }, { th: 'พ', en: 'Wed' },
  { th: 'พฤ', en: 'Thu' }, { th: 'ศ', en: 'Fri' }, { th: 'ส', en: 'Sat' },
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function shiftMonth(monthStart, delta) {
  const date = parseISODate(monthStart);
  date.setMonth(date.getMonth() + delta);
  return toISODate(date);
}

export default function RoomCalendarPage() {
  const { roomId } = useParams();
  const { lang, tx } = useLanguage();
  const today = todayISO();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  // ตารางเริ่มวันอาทิตย์ก่อน (หรือตรงกับ) วันที่ 1 ของเดือน · แสดง 6 สัปดาห์ = 42 วัน
  const gridStart = addDays(month, -parseISODate(month).getDay());
  const { data, error, loading, reload } = useAdminData(`/admin/rooms/${roomId}/calendar?from=${gridStart}&days=42`);

  const [range, setRange] = useState({ from: null, to: null });
  const [weekdays, setWeekdays] = useState(ALL_DAYS);
  const [price, setPrice] = useState('');
  const [rooms, setRooms] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  if (!data) return error ? <Notice>{error}</Notice> : <PageLoader />;
  const { room } = data;
  const to = range.to ?? range.from;
  const inRange = (date) => range.from && date >= range.from && date <= to;
  const dayOf = (date) => parseISODate(date).getDay();

  // คลิกครั้งแรก = วันเริ่ม · คลิกครั้งที่สอง = วันสุดท้าย (คลิกวันก่อนหน้าก็สลับให้) · คลิกอีกครั้ง = เริ่มเลือกใหม่
  const pick = (date) => {
    if (date < today) return;
    setMessage(null);
    if (!range.from || range.to) setRange({ from: date, to: null });
    else if (date < range.from) setRange({ from: date, to: range.from });
    else setRange({ from: range.from, to: date });
  };
  const toggleDay = (day) => setWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort());

  const save = async (reset) => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await api(`/admin/rooms/${roomId}/calendar`, {
        method: 'PUT',
        body: {
          from: range.from,
          to,
          weekdays: weekdays.length === 7 ? undefined : weekdays,
          ...(reset ? { reset: true } : { price, availableRooms: rooms }),
        },
      });
      setMessage({ tone: 'success', text: reset ? tx(`คืนค่าปกติ ${result.updated} วันแล้ว`, `Reset ${result.updated} days`) : tx(`อัปเดต ${result.updated} วันแล้ว`, `Updated ${result.updated} days`) });
      reload();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const canSave = range.from && weekdays.length > 0 && !saving;

  return (
    <div>
      <PageHeader
        back={(
          <Link to={`/admin/hotels/${room.hotelId}`} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <Icon name="arrow-left" className="h-4 w-4" />{room.hotelName}
          </Link>
        )}
        title={tx(`ปฏิทินราคา · ${room.name}`, `Price calendar · ${room.name}`)}
        description={tx(`ราคาปกติ ${baht(room.basePrice)} / คืน · มีทั้งหมด ${room.totalRooms} ห้อง`, `Default ${baht(room.basePrice)} / night · ${room.totalRooms} rooms in total`)}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className={`${card} p-4 sm:p-5`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={tx('เดือนก่อน', 'Previous month')}>
              <Icon name="chevron-left" className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">{formatDate(month, lang, { month: 'long', year: 'numeric' })}</h2>
              {month !== `${today.slice(0, 7)}-01` && (
                <button type="button" onClick={() => setMonth(`${today.slice(0, 7)}-01`)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{tx('เดือนนี้', 'This month')}</button>
              )}
            </div>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={tx('เดือนถัดไป', 'Next month')}>
              <Icon name="chevron-right" className="h-5 w-5" />
            </button>
          </div>

          <div className={`grid grid-cols-7 gap-1 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {WEEKDAYS.map((day) => (
              <div key={day.en} className="pb-1 text-center text-xs font-bold text-slate-400">{tx(day.th, day.en)}</div>
            ))}
            {data.days.map((day) => {
              const past = day.date < today;
              const outside = day.date.slice(0, 7) !== month.slice(0, 7);
              const selected = inRange(day.date);
              const matches = selected && weekdays.includes(dayOf(day.date));
              const closed = day.capacity === 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={past}
                  onClick={() => pick(day.date)}
                  aria-pressed={selected}
                  aria-label={`${formatDate(day.date, lang)} · ${baht(day.price)} · ${closed ? tx('ปิดขาย', 'closed') : tx(`ว่าง ${day.available} จาก ${day.capacity}`, `${day.available} of ${day.capacity} free`)}`}
                  className={`flex min-h-[64px] flex-col rounded-xl border p-1.5 text-left transition sm:min-h-[84px] sm:p-2 ${
                    matches ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : selected ? 'border-brand-200 bg-white'
                        : 'border-slate-100 bg-white hover:border-slate-300'
                  } ${past ? 'cursor-not-allowed opacity-40' : ''} ${outside && !selected ? 'opacity-50' : ''}`}
                >
                  <span className="flex items-center justify-between text-xs font-bold text-slate-700">
                    {Number(day.date.slice(8))}
                    {day.overridePrice !== null && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={tx('ราคาพิเศษ', 'Custom price')} />}
                  </span>
                  {/* จอมือถือช่องแคบ: แสดงแบบย่อ (2.5K · 3/3) · จอใหญ่: แสดงเต็ม */}
                  <span className={`mt-auto truncate text-[11px] font-bold sm:text-xs ${day.overridePrice !== null ? 'text-amber-700' : 'text-slate-900'}`}>
                    <span className="sm:hidden">{compactNumber(day.price)}</span>
                    <span className="hidden sm:inline">{baht(day.price)}</span>
                  </span>
                  <span className={`truncate text-[10px] sm:text-[11px] ${closed ? 'font-bold text-rose-600' : day.available === 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                    {closed ? tx('ปิดขาย', 'Closed') : day.available === 0 ? tx('เต็ม', 'Full') : (
                      <>
                        <span className="sm:hidden">{day.available}/{day.capacity}</span>
                        <span className="hidden sm:inline">{tx(`ว่าง ${day.available}/${day.capacity}`, `${day.available}/${day.capacity} free`)}</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{tx('ราคาพิเศษ (ไม่ใช่ราคาปกติ)', 'Custom price')}</li>
            <li>{tx('ว่าง x/y = ห้องว่าง / ห้องที่เปิดขายคืนนั้น', 'x/y free = free / on sale that night')}</li>
            <li>{tx('ห้องว่างนับรวมการจองที่รอชำระเงิน (กันห้องไว้ 15 นาที)', 'Unpaid holds (15 min) count as booked')}</li>
          </ul>
        </section>

        <aside className={`${card} h-fit p-5`}>
          <h2 className="text-base font-extrabold text-slate-900">{tx('ตั้งค่าช่วงวันที่เลือก', 'Edit selected dates')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{tx('คลิกวันแรกและวันสุดท้ายในปฏิทิน หรือกรอกวันที่ด้านล่าง', 'Click the first and last day on the calendar, or type the dates')}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={tx('ตั้งแต่', 'From')}>
              <input type="date" value={range.from ?? ''} min={today} onChange={(event) => setRange({ from: event.target.value || null, to: range.to && range.to >= event.target.value ? range.to : null })} className={inputClass} />
            </Field>
            <Field label={tx('ถึง (รวมวันนี้)', 'To (inclusive)')}>
              <input type="date" value={to ?? ''} min={range.from ?? today} disabled={!range.from} onChange={(event) => setRange({ ...range, to: event.target.value || null })} className={inputClass} />
            </Field>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-bold text-slate-600">{tx('เฉพาะวัน', 'Only on')}</legend>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day, index) => (
                <button key={day.en} type="button" onClick={() => toggleDay(index)} aria-pressed={weekdays.includes(index)} className={`h-9 rounded-lg text-xs font-bold transition ${weekdays.includes(index) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {tx(day.th, day.en)}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex gap-3 text-xs font-semibold">
              <button type="button" onClick={() => setWeekdays([5, 6])} className="text-brand-700 hover:underline">{tx('ศุกร์–เสาร์', 'Fri–Sat')}</button>
              <button type="button" onClick={() => setWeekdays(ALL_DAYS)} className="text-brand-700 hover:underline">{tx('ทุกวัน', 'Every day')}</button>
            </div>
          </fieldset>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label={tx('ราคาต่อคืน (บาท)', 'Price / night (THB)')} hint={tx('เว้นว่าง = คงเดิม', 'Blank = keep')}>
              <input type="number" value={price} onChange={(event) => setPrice(event.target.value)} min={1} step="0.01" placeholder={String(room.basePrice)} className={inputClass} />
            </Field>
            <Field label={tx('ห้องที่เปิดขาย', 'Rooms on sale')} hint={tx(`0 = ปิดขาย · สูงสุด ${room.totalRooms}`, `0 = closed · max ${room.totalRooms}`)}>
              <input type="number" value={rooms} onChange={(event) => setRooms(event.target.value)} min={0} max={room.totalRooms} step={1} placeholder={String(room.totalRooms)} className={inputClass} />
            </Field>
          </div>

          {range.from && weekdays.length === 0 && <p className="mt-3 text-xs font-semibold text-rose-600">{tx('เลือกวันในสัปดาห์อย่างน้อย 1 วัน', 'Pick at least one weekday')}</p>}
          {message && <div className="mt-3"><Notice tone={message.tone}>{message.text}</Notice></div>}

          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={() => save(false)} disabled={!canSave || (price === '' && rooms === '')} className={buttonPrimary}>
              {saving ? tx('กำลังบันทึก…', 'Saving…') : tx('บันทึกช่วงวันที่เลือก', 'Apply to selected dates')}
            </button>
            <button type="button" onClick={() => save(true)} disabled={!canSave} className={buttonSecondary}>
              <Icon name="refresh" className="h-4 w-4" />{tx('คืนค่าปกติ (ราคาและจำนวนห้อง)', 'Reset to defaults')}
            </button>
            {range.from && (
              <button type="button" onClick={() => setRange({ from: null, to: null })} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                {tx('ล้างช่วงที่เลือก', 'Clear selection')}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
