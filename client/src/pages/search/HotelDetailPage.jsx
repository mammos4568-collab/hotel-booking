import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const queryParams = new URLSearchParams(location.search);
  const checkIn = queryParams.get('checkIn') || '';
  const checkOut = queryParams.get('checkOut') || '';
  const guests = queryParams.get('guests') || '2';

  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHotelDetail = async () => {
      try {
        setLoading(true);
        const data = await api(`/hotels/${id}`);
        setHotel(data);
      } catch (err) {
        setError(err.message || 'ไม่สามารถโหลดข้อมูลที่พักได้');
      } finally {
        setLoading(false);
      }
    };

    fetchHotelDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-[#0071c2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !hotel) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <h2 className="text-base font-bold text-slate-800 mb-2">{error}</h2>
        <button onClick={() => navigate('/')} className="text-xs font-bold text-blue-600 hover:underline">
          {t('btn_back_search')}
        </button>
      </div>
    );
  }

  const ratingScore = hotel.stars ? (Number(hotel.stars) * 1.8).toFixed(1) : '8.8';

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-800 font-sans pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition mb-4">
          {t('btn_back_search')}
        </button>

        <div className="bg-white rounded-2xl p-5 sm:p-8 border border-slate-200 shadow-xs mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-400 text-sm">{'★'.repeat(Math.round(Number(hotel.stars) || 0))}</span>
                <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-0.5 rounded-full">
                  {hotel.property_type || t('verified_hotel')}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{hotel.name}</h1>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                <span>📍</span> {hotel.address || hotel.city}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-100 self-start sm:self-auto">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-900">{t('review_excellent')}</div>
                <div className="text-[10px] text-slate-400">{t('reviews_count_prefix')}</div>
              </div>
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#003580] text-white font-black text-sm sm:text-base rounded-xl flex items-center justify-center">
                {ratingScore}
              </div>
            </div>
          </div>

          {/* Gallery */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 sm:gap-3 mt-5 sm:mt-6 rounded-xl overflow-hidden aspect-[16/10] md:aspect-auto md:h-80">
            <div className="md:col-span-2 h-full overflow-hidden">
              <img src="https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1000&auto=format&fit=crop&q=80" alt="Main" className="w-full h-full object-cover hover:scale-102 transition duration-500" />
            </div>
            <div className="hidden md:block h-full overflow-hidden">
              <img src="https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&auto=format&fit=crop&q=80" alt="Room" className="w-full h-full object-cover hover:scale-102 transition duration-500" />
            </div>
            <div className="hidden md:flex flex-col gap-3 h-full">
              <div className="h-1/2 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&auto=format&fit=crop&q=80" alt="Pool" className="w-full h-full object-cover hover:scale-102 transition duration-500" />
              </div>
              <div className="h-1/2 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80" alt="Lobby" className="w-full h-full object-cover hover:scale-102 transition duration-500" />
              </div>
            </div>
          </div>

          {/* Perks Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">📶</span>
              <div>
                <div className="font-bold">{t('feat_wifi')}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{t('feat_wifi_sub')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">🏊</span>
              <div>
                <div className="font-bold">{t('feat_pool')}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{t('feat_pool_sub')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold flex-shrink-0">🍳</span>
              <div>
                <div className="font-bold">{t('feat_breakfast')}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{t('feat_breakfast_sub')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold flex-shrink-0">🚗</span>
              <div>
                <div className="font-bold">{t('feat_parking')}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{t('feat_parking_sub')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Room Selection */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span>🛏️</span> {t('rooms_section_title')}
            </h2>
            {checkIn && (
              <span className="text-[11px] sm:text-xs text-slate-500">
                {t('stay_dates_info')} <b className="text-slate-800">{checkIn}</b> {t('stay_dates_to')} <b className="text-slate-800">{checkOut || '-'}</b> ({guests} {t('stay_guests_suffix')})
              </span>
            )}
          </div>

          {(!hotel.rooms || hotel.rooms.length === 0) ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
              {t('no_rooms_available')}
            </div>
          ) : (
            hotel.rooms.map((room) => (
              <div key={room.id} className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-4 sm:p-6 shadow-xs flex flex-col md:flex-row justify-between gap-5 transition">
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">{room.name || 'Standard Deluxe Room'}</h3>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                      {t('badge_popular_deal')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                    {room.description || t('room_default_desc')}
                  </p>

                  <div className="flex flex-wrap gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-600 font-medium pt-1">
                    <span className="flex items-center gap-1">👥 {t('room_guests_capacity', { count: room.capacity || 2 })}</span>
                    <span className="text-emerald-600 font-semibold">{t('perk_breakfast')}</span>
                    <span className="text-blue-600">✓ {t('perk_free_cancel')}</span>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col justify-between items-center md:items-end border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-6 text-left md:text-right min-w-[190px] gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400">ราคาต่อคืน</span>
                    <div className="text-xl sm:text-2xl font-black text-[#d4111e] tracking-tight">
                      ฿{Number(room.price_per_night || 0).toLocaleString()}
                    </div>
                    <span className="text-[9px] sm:text-[10px] text-slate-500 block">{t('per_room_night')}</span>
                  </div>

                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.append('hotelId', hotel.id);
                      params.append('roomId', room.id);
                      if (checkIn) params.append('checkIn', checkIn);
                      if (checkOut) params.append('checkOut', checkOut);
                      if (guests) params.append('guests', guests);
                      navigate(`/booking?${params.toString()}`);
                    }}
                    className="w-auto md:w-full py-2.5 px-5 md:px-4 bg-[#0071c2] hover:bg-[#005999] active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-xs transition"
                  >
                    {t('btn_book_room')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Policies */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 mt-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span>ℹ️</span> {t('policies_title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <div className="font-bold text-slate-800">{t('policy_checkin_title')}</div>
              <p className="mt-1 text-slate-500">{t('policy_checkin_desc')}</p>
            </div>
            <div>
              <div className="font-bold text-slate-800">{t('policy_pets_title')}</div>
              <p className="mt-1 text-slate-500">{t('policy_pets_desc')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}