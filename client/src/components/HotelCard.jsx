import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import Stars from './Stars.jsx';
import RatingBadge from './RatingBadge.jsx';
import SmartImage from './SmartImage.jsx';
import FavoriteButton from './FavoriteButton.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { AMENITIES, cityLabel, formatDistance } from '../lib/format.js';

// การ์ดโรงแรมในหน้าผลค้นหา — กดได้ทั้งใบ พาไปหน้าโรงแรมพร้อมวัน/จำนวนคนที่ค้นหาไว้
// layout ปรับตามความกว้างของคอลัมน์ผลลัพธ์ (container query) ไม่ใช่ความกว้างจอ:
//   แคบ → รูปบน เนื้อหาล่าง · กลาง → รูปซ้าย · กว้าง → รูป | รายละเอียด | ราคา
export default function HotelCard({ hotel, nights = 0, rooms = 1, linkQuery = '', nearLabel = '' }) {
  const { lang, tx, formatPrice } = useLanguage();
  const href = `/hotels/${hotel.id}${linkQuery ? `?${linkQuery}` : ''}`;
  const fewLeft = hotel.roomsLeft !== null && hotel.roomsLeft !== undefined && hotel.roomsLeft <= 3;

  return (
    <div className="@container animate-slide-up">
      <Link
        to={href}
        className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-xl hover:shadow-slate-900/8 @xl:flex-row"
      >
        <div className="relative @xl:w-60 @xl:shrink-0 @3xl:w-72">
          <SmartImage
            src={hotel.imageUrl}
            alt={hotel.name}
            width={640}
            className="h-52 @xl:h-full"
            imgClassName="transition duration-700 group-hover:scale-105"
          />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur">
            {hotel.type}
          </span>
          <FavoriteButton hotelId={hotel.id} className="absolute right-3 top-3" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col @3xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-5">
            <div className="min-w-0">
              <Stars value={hotel.stars} />
              <h3 className="mt-1.5 text-lg font-extrabold leading-snug text-slate-900 transition group-hover:text-brand-700">
                {hotel.name}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <Icon name="pin" className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  <b className="font-semibold text-slate-700">{cityLabel(hotel.city, lang)}</b> · {hotel.address}
                </span>
              </p>
              {/* ค้นหาแบบ "ใกล้ …" → บอกระยะทางเส้นตรงจากจุดนั้น */}
              {nearLabel && hotel.distanceKm !== null && hotel.distanceKm !== undefined && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <Icon name="map" className="h-3.5 w-3.5" />
                  {tx(`ห่าง${nearLabel} ~${formatDistance(hotel.distanceKm, 'th')}`, `~${formatDistance(hotel.distanceKm, 'en')} from ${nearLabel}`)}
                </p>
              )}
              {hotel.amenities?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hotel.amenities.slice(0, 4).map((key) => AMENITIES[key] && (
                    <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      <Icon name={AMENITIES[key].icon} className="h-3.5 w-3.5" />
                      {AMENITIES[key][lang === 'en' ? 'en' : 'th']}
                    </span>
                  ))}
                  {hotel.amenities.length > 4 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">+{hotel.amenities.length - 4}</span>
                  )}
                </div>
              )}
            </div>
            <RatingBadge rating={hotel.rating} count={hotel.reviewCount} />
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-slate-100 bg-slate-50/60 p-5 @3xl:w-56 @3xl:shrink-0 @3xl:flex-col @3xl:border-l @3xl:border-t-0 @3xl:text-right">
            <div className="space-y-1.5">
              {fewLeft && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-deal-600">
                  <Icon name="flame" className="h-3.5 w-3.5" />
                  {tx(`เหลือ ${hotel.roomsLeft} ห้องสุดท้าย`, `Only ${hotel.roomsLeft} left`)}
                </span>
              )}
              <p className="text-xs text-slate-500">{tx('ราคาเริ่มต้น / ห้อง / คืน', 'From / room / night')}</p>
              <p className="text-2xl font-black tracking-tight text-slate-900">{formatPrice(hotel.nightlyFrom)}</p>
              {nights > 0 && hotel.stayFrom && (
                <p className="text-xs text-slate-500">
                  {tx(`รวม ${nights} คืน`, `${nights} nights`)}{rooms > 1 && tx(` · ${rooms} ห้อง`, ` · ${rooms} rooms`)} <b className="font-semibold text-slate-700">{formatPrice(hotel.stayFrom)}</b>
                </p>
              )}
              <p className="text-[11px] text-emerald-600">{tx('รวมภาษีและค่าธรรมเนียมแล้ว', 'Taxes & fees included')}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition group-hover:bg-brand-700">
              {tx('ดูห้องพัก', 'See rooms')}
              <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
