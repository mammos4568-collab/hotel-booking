import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import Stars from '../../components/Stars.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import FavoriteButton from '../../components/FavoriteButton.jsx';
import SearchBar, { buildSearchParams, loadDestinations } from '../../components/SearchBar.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { HERO_IMAGE, addDays, cityImage, cityLabel, ratingLabel, sizedImage, todayISO } from '../../lib/format.js';

// วันศุกร์ที่จะถึง (ถ้าวันนี้ศุกร์/เสาร์ ใช้สัปดาห์นี้) → ทางลัด "สุดสัปดาห์นี้"
function upcomingWeekend() {
  const today = todayISO();
  const day = new Date().getDay(); // 0 = อาทิตย์
  const toFriday = day === 6 ? -1 : (5 - day + 7) % 7;
  const friday = addDays(today, toFriday);
  return { checkIn: friday < today ? today : friday, checkOut: addDays(friday, 2) };
}

function FeaturedHotel({ hotel }) {
  const { lang, tx, formatPrice } = useLanguage();
  return (
    <Link
      to={`/hotels/${hotel.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10"
    >
      <div className="relative">
        <SmartImage src={hotel.imageUrl} alt={hotel.name} width={640} className="aspect-[4/3]" imgClassName="transition duration-700 group-hover:scale-105" />
        <FavoriteButton hotelId={hotel.id} className="absolute left-3 top-3" />
        {hotel.rating !== null && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-sm">
            <Icon name="star" filled className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.5} />
            {hotel.rating.toFixed(1)}
            <span className="font-medium text-slate-500">· {ratingLabel(hotel.rating, lang)}</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <Stars value={hotel.stars} className="h-3 w-3" />
        <p className="mt-1.5 line-clamp-1 text-base font-extrabold text-slate-900 group-hover:text-brand-700">{hotel.name}</p>
        <p className="mt-0.5 text-sm text-slate-500">{cityLabel(hotel.city, lang)} · {hotel.type}</p>
        <p className="mt-auto pt-4 text-sm text-slate-500">
          {tx('เริ่มต้น', 'From')} <span className="text-lg font-black text-slate-900">{formatPrice(hotel.nightlyFrom)}</span> / {tx('คืน', 'night')}
        </p>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { lang, tx, formatPrice } = useLanguage();
  const [destinations, setDestinations] = useState([]);
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    loadDestinations().then(setDestinations);
    api('/hotels?sort=rating_desc&limit=8')
      .then((data) => setFeatured(data.hotels || []))
      .catch(() => setFeatured([]));
  }, []);

  const weekend = upcomingWeekend();
  const weekendLink = `/search?${buildSearchParams({ ...weekend, adults: 2 })}`;

  return (
    <div className="pb-8">
      {/* ===== Hero ===== */}
      {/* z-10: isolate ทำให้ hero เป็นชั้นของตัวเอง ต้องยกทั้งก้อนขึ้น
          ไม่งั้น dropdown/ปฏิทินของกล่องค้นหาจะถูกการ์ดเมืองด้านล่างทับ */}
      <section className="relative isolate z-10">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img src={sizedImage(HERO_IMAGE, 1920)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950/70 via-brand-900/50 to-slate-50" />
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:pb-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            <Icon name="zap" className="h-3.5 w-3.5 text-amber-300" />
            {tx('ยืนยันการจองทันที · ยกเลิกฟรีก่อนวันเข้าพัก', 'Instant confirmation · Free cancellation before check-in')}
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.1] tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
            {tx('เที่ยวไทยครั้งต่อไป', 'Your next Thai getaway')}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-white to-sky-200 bg-clip-text text-transparent">
              {tx('เริ่มที่ที่พักดีๆ', 'starts with the right stay')}
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            {tx('ค้นหาโรงแรม รีสอร์ท และวิลล่าทั่วไทย เทียบราคารายคืนตามวันที่คุณเลือก แล้วจองได้ในไม่กี่ขั้นตอน', 'Search hotels, resorts and villas across Thailand, compare nightly prices for your dates, and book in a few steps.')}
          </p>

          <div className="mt-8">
            <SearchBar variant="hero" />
          </div>

          {/* ทางลัด — ใช้ชิปพื้นขาว อ่านออกทั้งบนรูปมืดและส่วนที่ไล่สีเป็นพื้นหลังสว่าง */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Link to={weekendLink} className="rounded-full bg-white/90 px-3.5 py-1.5 font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white">
              🌴 {tx('สุดสัปดาห์นี้', 'This weekend')}
            </Link>
            {['Phuket', 'Chiang Mai', 'Krabi'].map((city) => (
              <Link key={city} to={`/search?q=${encodeURIComponent(city)}&adults=2`} className="rounded-full bg-white/90 px-3.5 py-1.5 font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white">
                {cityLabel(city, lang)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== จุดหมายยอดนิยม ===== */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{tx('จุดหมายยอดนิยม', 'Trending destinations')}</h2>
            <p className="mt-1 text-sm text-slate-500">{tx('เมืองที่นักเดินทางค้นหามากที่สุด', 'Where travellers are heading')}</p>
          </div>
          <Link to="/search" className="hidden items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-700 sm:inline-flex">
            {tx('ดูที่พักทั้งหมด', 'View all stays')} <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {destinations.slice(0, 5).map((d, index) => (
            <Link
              key={d.city}
              to={`/search?q=${encodeURIComponent(d.city)}&adults=2`}
              className={`group relative isolate overflow-hidden rounded-3xl ${index === 0 ? 'col-span-2 row-span-2 min-h-72 md:min-h-96' : 'min-h-40 md:min-h-44'}`}
            >
              <SmartImage src={cityImage(d.city)} alt={d.city} width={index === 0 ? 1000 : 500} className="absolute inset-0 -z-10" imgClassName="transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
              <div className="flex h-full flex-col justify-end p-4 sm:p-5">
                <p className={`font-black text-white ${index === 0 ? 'text-3xl' : 'text-lg'}`}>{cityLabel(d.city, lang)}</p>
                <p className="text-xs font-medium text-white/80 sm:text-sm">
                  {d.hotels} {tx('ที่พัก', 'stays')} · {tx('เริ่ม', 'from')} {formatPrice(d.minPrice)}
                </p>
              </div>
            </Link>
          ))}
          {destinations.length === 0 && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`animate-pulse rounded-3xl bg-slate-200 ${i === 0 ? 'col-span-2 row-span-2 min-h-72 md:min-h-96' : 'min-h-40'}`} />
          ))}
        </div>
      </section>

      {/* ===== ที่พักคะแนนรีวิวสูง ===== */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{tx('ที่พักคะแนนรีวิวสูงสุด', 'Top-rated stays')}</h2>
            <p className="mt-1 text-sm text-slate-500">{tx('คัดจากรีวิวจริงของผู้เข้าพัก', 'Picked from real guest reviews')}</p>
          </div>
          <Link to="/search?sort=rating_desc" className="hidden items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-700 sm:inline-flex">
            {tx('ดูเพิ่มเติม', 'See more')} <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((hotel) => <FeaturedHotel key={hotel.id} hotel={hotel} />)}
          {featured.length === 0 && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      </section>

      {/* ===== ทำไมต้องจองกับเรา ===== */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-4 rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white shadow-xl shadow-brand-900/20 sm:p-10 md:grid-cols-3">
          {[
            { icon: 'zap', title: tx('ยืนยันทันที', 'Instant confirmation'), text: tx('ระบบตรวจห้องว่างแบบเรียลไทม์ จองแล้วได้ห้องแน่นอน ไม่มีจองซ้อน', 'Real-time availability — once you book, the room is yours. No double bookings.') },
            { icon: 'receipt', title: tx('ราคาโปร่งใส', 'Transparent pricing'), text: tx('เห็นราคารายคืนตามวันที่เข้าพักจริง รวมภาษีแล้ว ไม่มีค่าใช้จ่ายแอบแฝง', 'See the real nightly price for your dates with taxes included.') },
            { icon: 'shield', title: tx('ยกเลิกได้ยืดหยุ่น', 'Flexible cancellation'), text: tx('ยกเลิกฟรีก่อนวันเช็กอิน และขอคืนเงินอัตโนมัติ', 'Cancel for free before check-in with an automatic refund.') },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                <Icon name={item.icon} className="h-6 w-6" />
              </span>
              <p className="mt-4 text-lg font-bold">{item.title}</p>
              <p className="mt-1 text-sm text-white/80">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
