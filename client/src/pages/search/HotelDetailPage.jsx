import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user, openAuthModal } = useAuth();

  const queryParams = new URLSearchParams(location.search);
  const checkIn = queryParams.get('checkIn') || '';
  const checkOut = queryParams.get('checkOut') || '';
  const guests = queryParams.get('guests') || '2';

  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({ averageRating: null, reviewCount: 0, ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [bookingId, setBookingId] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

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

  useEffect(() => {
    api(`/reviews?hotelId=${encodeURIComponent(id)}`)
      .then((data) => {
        setReviews(data.reviews || []);
        setReviewStats({
          averageRating: data.averageRating ?? null,
          reviewCount: data.reviewCount ?? 0,
          ratingBreakdown: data.ratingBreakdown ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        });
      })
      .catch(() => setReviews([]));
  }, [id]);

  useEffect(() => {
    if (!user) {
      setEligibleBookings([]);
      return;
    }
    api('/bookings/me')
      .then((data) => {
        const bookings = Array.isArray(data) ? data : data.bookings || [];
        const today = new Date().toISOString().slice(0, 10);
        // อ่าน reviews ล่าสุดผ่าน functional updater เพื่อหลีกเลี่ยง stale closure
        setReviews((currentReviews) => {
          const alreadyReviewed = new Set(currentReviews.map((r) => String(r.bookingId)));
          setEligibleBookings(bookings.filter((booking) => {
            const paymentStatus = booking.paymentStatus || booking.payment_status;
            const checkout = booking.checkOut || booking.check_out_date;
            const propertyId = booking.hotelId || booking.propertyId || booking.property_id;
            return Number(propertyId) === Number(id)
              && String(paymentStatus).toLowerCase() === 'paid'
              && checkout < today
              && !alreadyReviewed.has(String(booking.id || booking.bookingId || booking.booking_id));
          }));
          return currentReviews; // ไม่เปลี่ยน reviews state
        });
      })
      .catch(() => setEligibleBookings([]));
  }, [id, user]);

  const submitReview = async (event) => {
    event.preventDefault();
    setReviewError('');
    setReviewLoading(true);
    try {
      const result = await api('/reviews', {
        method: 'POST',
        body: { bookingId: Number(bookingId), rating: Number(reviewRating), comment: reviewComment },
      });
      setReviews((current) => [result.review, ...current]);
      setEligibleBookings((current) => current.filter((booking) => String(booking.id || booking.bookingId || booking.booking_id) !== String(bookingId)));
      setBookingId('');
      setReviewComment('');
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setReviewLoading(false);
    }
  };

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

  // ใช้คะแนนเฉลี่ยจากรีวิวจริง ถ้ายังไม่มีรีวิวให้แสดงเป็น hotel.stars (fallback)
  const ratingScore = reviewStats.averageRating !== null
    ? reviewStats.averageRating.toFixed(1)
    : (hotel.stars ? Number(hotel.stars).toFixed(1) : null);


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

        <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 mt-6 shadow-xs">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-black text-slate-900">รีวิวจากผู้เข้าพัก</h2>
            {reviewStats.reviewCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-lg">{'★'.repeat(Math.round(reviewStats.averageRating || 0))}</span>
                <span className="text-base font-black text-slate-900">{reviewStats.averageRating?.toFixed(1)}</span>
                <span className="text-xs text-slate-400">/ 5 · {reviewStats.reviewCount} รีวิว</span>
              </div>
            )}
          </div>

          {/* Rating Breakdown */}
          {reviewStats.reviewCount > 0 && (
            <div className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviewStats.ratingBreakdown[star] ?? 0;
                const pct = reviewStats.reviewCount > 0 ? Math.round((count / reviewStats.reviewCount) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-3 text-right">{star}</span>
                    <span className="text-amber-400 text-[10px]">★</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {reviews.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">ยังไม่มีรีวิวสำหรับที่พักนี้</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {reviews.map((review) => (
                <article key={review.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {review.user?.avatarUrl ? (
                        <img src={review.user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {(review.user?.name || 'ผ').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-bold text-sm text-slate-800">{review.user?.name || 'ผู้เข้าพัก'}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-amber-500 text-sm leading-none">{'★'.repeat(Math.round(review.rating))}{'☆'.repeat(5 - Math.round(review.rating))}</span>
                      {review.createdAt && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(review.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {review.comment && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{review.comment}</p>}
                </article>
              ))}
            </div>
          )}


          {user && eligibleBookings.length > 0 && (
            <form onSubmit={submitReview} className="mt-5 pt-5 border-t border-slate-100 space-y-3">
              <h3 className="font-bold text-sm text-slate-800">เขียนรีวิวการเข้าพัก</h3>
              {reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}
              <label className="block text-sm text-slate-700">รายการจอง
                <select required value={bookingId} onChange={(event) => setBookingId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">เลือกการจอง</option>
                  {eligibleBookings.map((booking) => {
                    const idValue = booking.id || booking.bookingId || booking.booking_id;
                    return <option key={idValue} value={idValue}>#{idValue} · {booking.checkIn || booking.check_in_date} – {booking.checkOut || booking.check_out_date}</option>;
                  })}
                </select>
              </label>
              <label className="block text-sm text-slate-700">คะแนน
                <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} ดาว</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-700">ความคิดเห็น
                <textarea maxLength={2000} rows={3} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <button disabled={reviewLoading || !bookingId} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{reviewLoading ? 'กำลังส่ง…' : 'ส่งรีวิว'}</button>
            </form>
          )}
          {user && eligibleBookings.length === 0 && reviews.some((r) => r.user?.id === user?.id)
            ? <p className="mt-4 text-sm text-slate-500">คุณได้รีวิวโรงแรมนี้แล้ว</p>
            : user && eligibleBookings.length === 0
              ? null /* ไม่แสดงข้อความถ้าไม่เคยจองโรงแรมนี้ */
              : null
          }
          {!user && (
            <p className="mt-4 text-sm text-slate-500">
              <button type="button" onClick={() => openAuthModal('login')} className="font-semibold text-blue-600 hover:underline">
                เข้าสู่ระบบ
              </button>{' '}
              เพื่อเขียนรีวิว
            </p>
          )}
        </section>

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
