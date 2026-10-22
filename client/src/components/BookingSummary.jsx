import { useState } from 'react';
import Icon from './Icon.jsx';
import Stars from './Stars.jsx';
import SmartImage from './SmartImage.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDate } from '../lib/format.js';

// การ์ดสรุปการจอง (ใช้ในหน้า checkout / ชำระเงิน / รายละเอียดการจอง)
// nightly = ราคาต่อห้องต่อคืน · total = ยอดรวมทุกห้อง (คิดที่ server)
export default function BookingSummary({ hotel, room, checkIn, checkOut, nights, guests, rooms = 1, nightly, total, footer }) {
  const { lang, tx, formatPrice } = useLanguage();
  const [showNightly, setShowNightly] = useState(false);
  const dateOpts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

  return (
    <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <SmartImage src={room?.imageUrl || hotel?.imageUrl} alt={hotel?.name} width={720} className="h-40" />
      <div className="space-y-4 p-5">
        <div>
          <Stars value={hotel?.stars} className="h-3 w-3" />
          <p className="mt-1 text-base font-extrabold leading-snug text-slate-900">{hotel?.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Icon name="pin" className="h-3.5 w-3.5" /> {hotel?.address || hotel?.city}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3.5">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Icon name="bed" className="h-4 w-4 text-brand-600" /> {room?.name}
          </p>
          {room?.bedType && <p className="ml-6 text-xs text-slate-500">{room.bedType}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('เช็กอิน', 'Check-in')}</p>
            <p className="mt-0.5 font-semibold text-slate-900">{formatDate(checkIn, lang, dateOpts)}</p>
            <p className="text-xs text-slate-500">{tx('ตั้งแต่ 14:00 น.', 'From 2:00 PM')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('เช็กเอาต์', 'Check-out')}</p>
            <p className="mt-0.5 font-semibold text-slate-900">{formatDate(checkOut, lang, dateOpts)}</p>
            <p className="text-xs text-slate-500">{tx('ก่อน 12:00 น.', 'Until 12:00 PM')}</p>
          </div>
        </div>

        <p className="flex items-center justify-between text-sm text-slate-600">
          <span className="flex items-center gap-2"><Icon name="clock" className="h-4 w-4" />{nights} {tx('คืน', nights === 1 ? 'night' : 'nights')}</span>
          <span className="flex items-center gap-2">
            <Icon name="users" className="h-4 w-4" />{guests} {tx('ผู้เข้าพัก', guests === 1 ? 'guest' : 'guests')}
            {rooms > 1 && <> · {rooms} {tx('ห้อง', 'rooms')}</>}
          </span>
        </p>

        <div className="border-t border-dashed border-slate-200 pt-4">
          {nightly?.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowNightly((v) => !v)}
                className="flex w-full items-center justify-between text-sm text-slate-600 hover:text-slate-900"
              >
                <span>{rooms > 1 ? tx(`ค่าห้อง ${nights} คืน × ${rooms} ห้อง`, `${rooms} rooms × ${nights} nights`) : tx(`ค่าห้อง ${nights} คืน`, `Room × ${nights} nights`)}</span>
                <span className="flex items-center gap-1">
                  {formatPrice(total)}
                  <Icon name={showNightly ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
                </span>
              </button>
              {showNightly && (
                <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {rooms > 1 && <li className="pb-1 text-[11px] font-semibold text-slate-500">{tx('ราคาต่อห้องต่อคืน', 'Price per room per night')}</li>}
                  {nightly.map((night) => (
                    <li key={night.date} className="flex justify-between">
                      <span>{formatDate(night.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span className="font-semibold">{formatPrice(night.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 flex justify-between text-sm text-slate-600">
                <span>{tx('ภาษีและค่าธรรมเนียม', 'Taxes & fees')}</span>
                <span className="font-semibold text-emerald-600">{tx('รวมแล้ว', 'Included')}</span>
              </p>
            </>
          )}
          <div className="mt-3 flex items-end justify-between">
            <span className="text-sm font-bold text-slate-900">{tx('ยอดรวมทั้งหมด', 'Total')}</span>
            <span className="text-2xl font-black tracking-tight text-slate-900">{formatPrice(total)}</span>
          </div>
        </div>
        {footer}
      </div>
    </aside>
  );
}
