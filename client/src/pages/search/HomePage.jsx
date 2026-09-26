import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const HOTEL_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&auto=format&fit=crop&q=80'
];

const POPULAR_DESTINATIONS = ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Hua Hin'];

function formatLocalizedAddress(address = '', city = '', lang = 'th') {
  if (lang === 'th') {
    return address || city;
  }

  const dict = [
    // ชื่อเมือง/จังหวัด
    { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
    { th: 'กรุงเทพฯ', en: 'Bangkok' },
    { th: 'เชียงใหม่', en: 'Chiang Mai' },
    { th: 'ภูเก็ต', en: 'Phuket' },
    { th: 'พัทยา', en: 'Pattaya' },
    { th: 'หัวหิน', en: 'Hua Hin' },
    { th: 'ชลบุรี', en: 'Chonburi' },

    // อำเภอ / ตำบล / สถานที่
    { th: 'แม่ริม', en: 'Mae Rim' },
    { th: 'กะทู้', en: 'Kathu' },
    { th: 'ป่าตอง', en: 'Patong' },
    { th: 'หาด', en: 'Beach ' },
    { th: 'หมู่', en: 'Moo' },

    // ถนน / ซอย / เขต
    { th: 'ถนนสาทรเหนือ', en: 'North Sathorn Rd.' },
    { th: 'ถนนสาทร', en: 'Sathorn Rd.' },
    { th: 'ถนน', en: 'Rd.' },
    { th: 'ซอย', en: 'Soi' },
    { th: 'สีลม', en: 'Silom' },
    { th: 'บางรัก', en: 'Bang Rak' },
    { th: 'สุขุมวิท', en: 'Sukhumvit' },
    { th: 'นิมมานเหมินท์', en: 'Nimman' },
  ];

  let result = address || city || '';
  dict.forEach(({ th, en }) => {
    result = result.replaceAll(th, en);
  });

  return result;
}

// ฟังก์ชันแปลงรูปแบบวันที่ตามภาษาที่เลือก
function formatDateDisplay(dateStr, lang, placeholder) {
  if (!dateStr) return placeholder;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return placeholder;

  return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// คอมโพเนนต์ปฏิทินแบบกำหนดภาษาได้เอง (TH / EN)
function CustomDatePickerModal({ lang, checkIn, checkOut, onSelectDate, onClose }) {
  const [viewDate, setViewDate] = useState(() => {
    return checkIn ? new Date(checkIn) : new Date();
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNamesTh = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const monthNamesEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const daysTh = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const daysEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const monthLabel = lang === 'th' ? `${monthNamesTh[month]} ${year}` : `${monthNamesEn[month]} ${year}`;
  const dayLabels = lang === 'th' ? daysTh : daysEn;

  // วันแรกของเดือน และจำนวนวันในเดือน
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (dayNum) => {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    onSelectDate(formattedDate);
  };

  return (
    <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-72 sm:w-80 select-none animate-in fade-in zoom-in-95 duration-150">
      {/* Header เดือน และปุ่มเลื่อนเดือน */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
        >
          ‹
        </button>
        <span className="font-bold text-sm text-slate-800">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
        >
          ›
        </button>
      </div>

      {/* วันในสัปดาห์ */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 py-2">
        {dayLabels.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {/* วันที่ 1 - 31 */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium">
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const isCheckIn = checkIn === dateStr;
          const isCheckOut = checkOut === dateStr;
          const isInRange = checkIn && checkOut && dateStr > checkIn && dateStr < checkOut;

          return (
            <button
              key={dayNum}
              type="button"
              onClick={() => handleDateClick(dayNum)}
              className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center transition ${
                isCheckIn || isCheckOut
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : isInRange
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Footer ปุ่มปิด / ล้างค่า */}
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 text-xs">
        <button
          type="button"
          onClick={() => {
            onSelectDate('clear');
          }}
          className="text-slate-400 hover:text-slate-600 font-medium"
        >
          {lang === 'th' ? 'ล้าง' : 'Clear'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="font-bold text-blue-600 hover:underline"
        >
          {lang === 'th' ? 'เสร็จสิ้น' : 'Done'}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t, lang, formatPrice } = useLanguage();
  

  // Search & Filter State
  const [city, setCity] = useState('');
  const [stars, setStars] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('');
  
  // Date & Guests State
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('2');
  const [activePicker, setActivePicker] = useState(null); // 'checkIn' | 'checkOut' | null

  // Select
  const handleSelectDateFromPicker = (selectedDate) => {
    if (selectedDate === 'clear') {
      setCheckIn('');
      setCheckOut('');
      return;
    }
    if (activePicker === 'checkIn') {
      setCheckIn(selectedDate);
      if (checkOut && selectedDate >= checkOut) {
        setCheckOut('');
      }
      setActivePicker('checkOut'); // เลือก Check-in เสร็จ เลื่อนไปถาม Check-out อัตโนมัติ
    } else {
      if (checkIn && selectedDate <= checkIn) {
        setCheckIn(selectedDate);
        setCheckOut('');
      } else {
        setCheckOut(selectedDate);
        setActivePicker(null); // เลือกครบทั้งคู่แล้วปิด Popup
      }
    }
  };

  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHotels = async (targetCity = city) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (targetCity) params.append('city', targetCity);
      if (stars) params.append('stars', stars);
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      if (sort) params.append('sort', sort);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await api(`/hotels${queryString}`);
      setHotels(data || []);
    } catch (err) {
      setError(err.message || 'ระบบไม่สามารถดึงข้อมูลได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHotels();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchHotels();
  };

  const handleQuickDestination = (destName) => {
    setCity(destName);
    fetchHotels(destName);
  };

  const handleResetFilters = () => {
    setCity('');
    setStars('');
    setMinPrice('');
    setMaxPrice('');
    setSort('');
    api('/hotels').then((data) => setHotels(data || []));
  };

  const goToDetail = (hotelId) => {
    const params = new URLSearchParams();
    if (checkIn) params.append('checkIn', checkIn);
    if (checkOut) params.append('checkOut', checkOut);
    if (guests) params.append('guests', guests);
    navigate(`/hotels/${hotelId}${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-800 font-sans pb-20">
      
      {/* Header Banner */}
      <section 
        className="relative bg-cover bg-center bg-no-repeat text-white pt-8 pb-20 md:pt-12 md:pb-24 px-4 sm:px-6"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1600&auto=format&fit=crop&q=80')`
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a2f64]/85 via-[#0d3b7d]/80 to-[#124b99]/90" />

        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="mb-5 sm:mb-6">
            <span className="inline-flex items-center gap-1.5 bg-[#febb02] text-slate-950 text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded shadow-xs tracking-wide uppercase">
              {t('badge_best_price')}
            </span>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight mt-2.5 leading-tight drop-shadow-md">
              {t('hero_title')}
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm md:text-base mt-2 font-normal drop-shadow-sm">
              {t('hero_subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap overflow-x-auto pb-1">
            <span className="text-blue-200 font-medium whitespace-nowrap">{t('popular_destinations')}</span>
            {POPULAR_DESTINATIONS.map((dest) => (
              <button
                key={dest}
                type="button"
                onClick={() => handleQuickDestination(dest)}
                className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap backdrop-blur-md transition ${
                  city.toLowerCase() === dest.toLowerCase()
                    ? 'bg-white text-blue-900 border-white font-bold shadow-sm'
                    : 'border-white/30 text-white hover:bg-white/20 hover:border-white'
                }`}
              >
                {dest}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Floating Search Bar */}
      <div className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12">
        <form onSubmit={handleSearchSubmit} className="bg-white p-3 sm:p-4 rounded-2xl shadow-xl border border-slate-200/80 grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-center">
          <div className="md:col-span-4 bg-slate-50 hover:bg-slate-100/80 focus-within:bg-white focus-within:border-blue-600 rounded-xl border border-slate-200 p-2.5 transition">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('search_dest_label')}
            </label>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-slate-400 text-sm">📍</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('search_dest_placeholder')}
                className="w-full bg-transparent text-slate-900 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-slate-400"
              />
              {city && <button type="button" onClick={() => setCity('')} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>}
            </div>
          </div>

          {/* วันเช็คอิน - เช็คเอาท์ (คลิกได้ทั่วทั้งช่อง + สลับภาษา TH/EN สมบูรณ์) */}
          {/* วันเช็คอิน - เช็คเอาท์ (Custom Popover รองรับภาษา TH และ EN 100%) */}
          <div className="relative md:col-span-4 lg:col-span-3 bg-slate-50 hover:bg-slate-100/80 focus-within:bg-white focus-within:border-blue-600 rounded-xl border border-slate-200 p-2.5 transition">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('search_dates_label')}
            </label>
            <div className="flex items-center gap-1 mt-0.5">
              
              {/* ปุ่ม Check-in */}
              <button
                type="button"
                onClick={() => setActivePicker(activePicker === 'checkIn' ? null : 'checkIn')}
                className={`w-1/2 text-left text-xs font-semibold truncate ${
                  checkIn ? 'text-slate-800' : 'text-slate-400 font-normal'
                }`}
              >
                {formatDateDisplay(checkIn, lang, lang === 'th' ? 'วันเช็คอิน' : 'Check-in')}
              </button>

              <span className="text-slate-300">|</span>

              {/* ปุ่ม Check-out */}
              <button
                type="button"
                onClick={() => setActivePicker(activePicker === 'checkOut' ? null : 'checkOut')}
                className={`w-1/2 text-left text-xs font-semibold truncate ${
                  checkOut ? 'text-slate-800' : 'text-slate-400 font-normal'
                }`}
              >
                {formatDateDisplay(checkOut, lang, lang === 'th' ? 'วันเช็คเอาท์' : 'Check-out')}
              </button>

              <span 
                onClick={() => setActivePicker(activePicker ? null : 'checkIn')} 
                className="text-slate-400 text-xs cursor-pointer hover:text-slate-600"
              >
                📅
              </span>
            </div>

            {/* Popup ปฏิทินแสดงผลตามภาษาที่เลือก */}
            {activePicker && (
              <CustomDatePickerModal
                lang={lang}
                checkIn={checkIn}
                checkOut={checkOut}
                onSelectDate={handleSelectDateFromPicker}
                onClose={() => setActivePicker(null)}
              />
            )}
          </div>
        </form>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs sticky top-20 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-extrabold text-slate-800 text-sm tracking-wide flex items-center gap-1.5">
                  <span>🎯</span> {t('filter_title')}
                </span>
                <button type="button" onClick={handleResetFilters} className="text-xs text-blue-600 hover:underline font-semibold">
                  {t('filter_reset')}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  {t('filter_sort_label')}
                </label>
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-blue-500">
                  <option value="">{t('sort_recommended')}</option>
                  <option value="price_asc">{t('sort_price_asc')}</option>
                  <option value="price_desc">{t('sort_price_desc')}</option>
                  <option value="stars_desc">{t('sort_stars_desc')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  {t('filter_stars_label')}
                </label>
                <div className="space-y-1 sm:space-y-1.5">
                  {[
                    { label: t('star_opt_5'), val: '5' },
                    { label: t('star_opt_4'), val: '4' },
                    { label: t('star_opt_3'), val: '3' },
                    { label: t('star_opt_all'), val: '' },
                  ].map((item) => (
                    <label key={item.val} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs text-slate-700 select-none">
                      <input type="radio" name="stars" checked={stars === item.val} onChange={() => setStars(item.val)} className="text-blue-600 accent-blue-600" />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  {t('filter_budget_label')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={t('filter_min')} className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 w-full" />
                  <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={t('filter_max')} className="p-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 w-full" />
                </div>
              </div>

              <button type="button" onClick={() => fetchHotels()} className="w-full py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-xs">
                {t('btn_apply_filter')}
              </button>
            </div>
          </aside>

          {/* List */}
          <main className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-sm font-bold text-slate-700">
                {t('results_found_prefix')} {city && <span className="text-blue-600 font-extrabold">"{city}"</span>}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {t('results_count_prefix')} {hotels.length} {t('results_count_suffix')}
              </span>
            </div>

            {loading && <div className="p-8 text-center text-xs text-slate-400">{t('loading_hotels')}</div>}
            
            {!loading && !error && hotels.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center text-slate-500">
                <span className="text-4xl block mb-2">🏖️</span>
                <p className="font-bold text-base text-slate-700">{t('no_hotels_found')}</p>
                <p className="text-xs mt-1">{t('no_hotels_sub')}</p>
              </div>
            )}

            {!loading && hotels.map((hotel, index) => {
              const rating = hotel.stars ? (Number(hotel.stars) * 1.8).toFixed(1) : '8.6';
              const imgUrl = HOTEL_IMAGES[index % HOTEL_IMAGES.length];

              return (
                <div key={hotel.id} className="group bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 flex flex-col sm:flex-row overflow-hidden">
                  <div className="relative w-full sm:w-56 md:w-64 h-48 sm:h-auto overflow-hidden bg-slate-100 flex-shrink-0">
                    <img src={imgUrl} alt={hotel.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                    <div className="absolute top-3 left-3 bg-rose-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded shadow-xs uppercase tracking-wide">
                      {t('badge_special_deal')}
                    </div>
                  </div>

                  <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-500 text-xs">
                        {'★'.repeat(Math.round(Number(hotel.stars) || 0))}
                        <span className="text-[11px] font-semibold text-slate-400 ml-1">
                          • {hotel.property_type || t('verified_hotel')}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-blue-700 transition mt-1 leading-snug">
                        {hotel.name}
                      </h2>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <span>📍</span> {formatLocalizedAddress(hotel.address, hotel.city, lang)}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <span className="text-[10px] sm:text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          {t('perk_breakfast')}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200/60">
                          {t('perk_free_cancel')}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          {t('perk_wifi')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                      <div className="bg-[#003580] text-white font-black text-xs px-2.5 py-1 rounded-md">
                        {rating}
                      </div>
                      <div className="text-[11px]">
                        <span className="font-bold text-slate-800">{t('review_excellent')}</span>
                        <span className="text-slate-400 ml-1">{t('review_sub')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full sm:w-48 md:w-56 p-4 sm:p-5 bg-slate-50/70 border-t sm:border-t-0 sm:border-l border-slate-100 flex flex-row sm:flex-col justify-between items-center sm:items-end text-left sm:text-right flex-shrink-0 gap-3">
                    <div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400 line-through">
                        {formatPrice(Number(hotel.min_price || 2000) * 1.3)}
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-[#d4111e] leading-none mt-0.5">
                        {formatPrice(hotel.min_price || 0)}
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-slate-500 block mt-0.5">
                        {t('per_room_night')}
                      </span>
                    </div>

                    <button type="button" onClick={() => goToDetail(hotel.id)} className="w-auto sm:w-full py-2.5 px-5 sm:px-4 bg-[#0071c2] hover:bg-[#005999] active:scale-[0.98] text-white text-xs font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1 shadow-xs flex-shrink-0">
                      {t('btn_select_room')}
                    </button>
                  </div>
                </div>
              );
            })}
          </main>
        </div>
      </div>
    </div>
  );
}