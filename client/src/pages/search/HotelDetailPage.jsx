import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import Stars from '../../components/Stars.jsx';
import RatingBadge from '../../components/RatingBadge.jsx';
import FavoriteButton from '../../components/FavoriteButton.jsx';
import PhotoLightbox from '../../components/PhotoLightbox.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import GuestPicker from '../../components/GuestPicker.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { AMENITIES, cityLabel, formatDate, formatShortRange, isISODate, nightsBetween, shortName } from '../../lib/format.js';

// ช่องในตาราง 4×2 ของแกลเลอรี (มือถือแสดงแค่รูปแรก)
function galleryTile(index, count) {
  if (index === 0) return count === 1 ? 'col-span-4 row-span-2' : 'col-span-4 row-span-2 md:col-span-2';
  const wide = (count === 2) || (count === 3) || (count === 4 && index === 3);
  const tall = count === 2;
  return `hidden md:block ${wide ? 'md:col-span-2' : ''} ${tall ? 'md:row-span-2' : ''}`;
}

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handler = (event) => ref.current && !ref.current.contains(event.target) && onClose();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// ---------------------------------------------------------------------------
// กล่องเลือกวัน/จำนวนคน (sticky ด้านขวา) — เปลี่ยนค่าแล้วอัปเดต URL → โหลดห้องว่างใหม่
// ---------------------------------------------------------------------------
function StayPicker({ checkIn, checkOut, adults, children, rooms, onApply, cheapest, nights, openSignal }) {
  const { lang, tx, formatPrice } = useLanguage();
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({ checkIn, checkOut, adults, children, rooms });
  const ref = useRef(null);
  const close = useCallback(() => setOpen(null), []);
  useOutsideClose(ref, close);

  useEffect(() => { setDraft({ checkIn, checkOut, adults, children, rooms }); }, [checkIn, checkOut, adults, children, rooms]);
  useEffect(() => { if (openSignal) setOpen('dates'); }, [openSignal]);

  const dirty = draft.checkIn !== checkIn || draft.checkOut !== checkOut || draft.adults !== adults
    || draft.children !== children || draft.rooms !== rooms;
  const canApply = (draft.checkIn && draft.checkOut) || (!draft.checkIn && !draft.checkOut);

  return (
    <div ref={ref} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      {cheapest !== null && (
        <p className="text-sm text-slate-500">
          {tx('เริ่มต้น', 'From')} <span className="text-2xl font-black text-slate-900">{formatPrice(cheapest)}</span> / {tx('คืน', 'night')}
        </p>
      )}
      <div className="relative mt-4 grid grid-cols-2 overflow-visible rounded-2xl border border-slate-300">
        <button type="button" onClick={() => setOpen(open === 'dates' ? null : 'dates')} className="rounded-tl-2xl border-r border-slate-300 p-3 text-left hover:bg-slate-50">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('เช็กอิน', 'Check-in')}</span>
          <span className={`block text-sm font-semibold ${draft.checkIn ? 'text-slate-900' : 'text-slate-400'}`}>
            {draft.checkIn ? formatDate(draft.checkIn, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : tx('เพิ่มวันที่', 'Add date')}
          </span>
        </button>
        <button type="button" onClick={() => setOpen(open === 'dates' ? null : 'dates')} className="rounded-tr-2xl p-3 text-left hover:bg-slate-50">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('เช็กเอาต์', 'Check-out')}</span>
          <span className={`block text-sm font-semibold ${draft.checkOut ? 'text-slate-900' : 'text-slate-400'}`}>
            {draft.checkOut ? formatDate(draft.checkOut, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : tx('เพิ่มวันที่', 'Add date')}
          </span>
        </button>
        <button type="button" onClick={() => setOpen(open === 'guests' ? null : 'guests')} className="col-span-2 rounded-b-2xl border-t border-slate-300 p-3 text-left hover:bg-slate-50">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{tx('ผู้เข้าพัก', 'Guests')}</span>
          <span className="block text-sm font-semibold text-slate-900">
            {draft.adults} {tx('ผู้ใหญ่', 'adults')}{draft.children > 0 && `, ${draft.children} ${tx('เด็ก', 'children')}`}
            {draft.rooms > 1 && ` · ${draft.rooms} ${tx('ห้อง', 'rooms')}`}
          </span>
        </button>

        {open === 'dates' && (
          <div className="absolute right-0 top-full z-40 mt-2 animate-pop-in rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <DatePicker
              checkIn={draft.checkIn}
              checkOut={draft.checkOut}
              onChange={(nextIn, nextOut) => setDraft((d) => ({ ...d, checkIn: nextIn, checkOut: nextOut }))}
              onDone={() => setOpen(null)}
            />
          </div>
        )}
        {open === 'guests' && (
          <div className="absolute right-0 top-full z-40 mt-2 animate-pop-in rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <GuestPicker
              adults={draft.adults}
              children={draft.children}
              rooms={draft.rooms}
              onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
              onDone={() => setOpen(null)}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!dirty || !canApply}
        onClick={() => { setOpen(null); onApply(draft); }}
        className="mt-4 w-full rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
      >
        {dirty ? tx('ตรวจสอบห้องว่าง', 'Check availability') : nights > 0 ? tx(`แสดงราคาสำหรับ ${nights} คืนแล้ว`, `Showing prices for ${nights} nights`) : tx('เลือกวันเพื่อดูห้องว่าง', 'Pick dates to see availability')}
      </button>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-emerald-600" />{tx('ยกเลิกฟรีก่อนวันเช็กอิน', 'Free cancellation before check-in')}</li>
        <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-emerald-600" />{tx('ราคารวมภาษีและค่าธรรมเนียมแล้ว', 'Taxes and fees included')}</li>
        <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-emerald-600" />{tx('ยืนยันการจองทันที', 'Instant confirmation')}</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// การ์ดประเภทห้อง
// ---------------------------------------------------------------------------
// onViewPhotos(index) = เปิดดูรูปห้องเต็มจอ — ตัวดูรูปอยู่ระดับหน้า (ไม่อยู่ในการ์ดที่เป็น @container
// เพราะ container query ทำให้ position: fixed อิงกรอบการ์ดแทนทั้งจอได้)
function RoomCard({ room, nights, guests, rooms, onBook, onPickDates, onViewPhotos }) {
  const { tx, formatPrice } = useLanguage();
  const photos = room.images ?? [];
  const hasDates = nights > 0;
  const soldOut = hasDates && room.available === 0;
  const notEnough = hasDates && !soldOut && !room.enoughRooms; // ว่างอยู่ แต่น้อยกว่าจำนวนห้องที่ต้องการ
  const tooSmall = !room.fitsGuests;

  let badge = null;
  if (hasDates && room.available > 0 && room.available <= 3) {
    badge = <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-deal-600"><Icon name="flame" className="h-3.5 w-3.5" />{tx(`เหลือ ${room.available} ห้องสุดท้าย`, `Only ${room.available} left`)}</span>;
  } else if (hasDates && room.available > 3) {
    badge = <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" />{tx(`ว่าง ${room.available} ห้อง`, `${room.available} rooms available`)}</span>;
  }

  // ใช้ container query (@container / @lg: / @2xl:) จัด layout ตามความกว้างของคอลัมน์จริง
  // ไม่ใช่ความกว้างจอ — คอลัมน์ซ้ายของหน้านี้แคบกว่าจอมาก การ์ดจะได้ไม่เบียดจนราคาโดนตัด
  return (
    <div className="@container">
    <article className={`flex flex-col overflow-hidden rounded-3xl border bg-white transition @2xl:flex-row ${soldOut ? 'border-slate-200 opacity-75' : 'border-slate-200 hover:border-brand-200 hover:shadow-lg hover:shadow-slate-900/5'}`}>
      {/* รูปห้อง: กดดูเต็มจอได้ทุกรูป (รูปที่เจ้าของอัปโหลด สูงสุด 5 รูป) · มีหลายรูปขึ้นป้ายจำนวนรูป */}
      {photos.length ? (
        <button
          type="button"
          onClick={() => onViewPhotos(0)}
          aria-label={tx(`ดูรูป ${room.name} (${photos.length} รูป)`, `View ${room.name} photos (${photos.length})`)}
          className="relative h-48 overflow-hidden @2xl:h-auto @2xl:w-60 @2xl:shrink-0"
        >
          <SmartImage src={room.imageUrl} alt={room.name} width={560} className="h-full w-full" imgClassName="transition duration-700 hover:scale-105" />
          {photos.length > 1 && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs font-bold text-white">
              <Icon name="image" className="h-3.5 w-3.5" />{photos.length}
            </span>
          )}
        </button>
      ) : (
        <SmartImage src={room.imageUrl} alt={room.name} width={560} className="h-48 @2xl:h-auto @2xl:w-60 @2xl:shrink-0" />
      )}
      <div className="flex flex-1 flex-col gap-4 p-5 @lg:flex-row">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{room.name}</h3>
            {room.description && <p className="mt-1 text-sm text-slate-500">{room.description}</p>}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-600">
            {room.bedType && <li className="flex items-center gap-2"><Icon name="bed" className="h-4 w-4 text-slate-400" />{room.bedType}</li>}
            {room.sizeSqm && <li className="flex items-center gap-2"><Icon name="size" className="h-4 w-4 text-slate-400" />{room.sizeSqm} {tx('ตร.ม.', 'm²')}</li>}
            <li className="flex items-center gap-2"><Icon name="users" className="h-4 w-4 text-slate-400" />{tx(`พักได้ ${room.maxGuests} คน`, `Sleeps ${room.maxGuests}`)}</li>
            <li className="flex items-center gap-2"><Icon name="coffee" className="h-4 w-4 text-slate-400" />{room.breakfastIncluded ? tx('รวมอาหารเช้า', 'Breakfast included') : tx('ไม่รวมอาหารเช้า', 'Room only')}</li>
          </ul>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Icon name="shield" className="h-4 w-4" />{tx('ยกเลิกฟรีก่อนวันเช็กอิน', 'Free cancellation before check-in')}</p>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 @lg:w-48 @lg:shrink-0 @lg:border-l @lg:border-t-0 @lg:pl-5 @lg:pt-0 @lg:text-right">
          <div className="space-y-1">
            {badge}
            <p className="text-xs text-slate-500">{hasDates ? tx('เฉลี่ยต่อคืน', 'Avg. per night') : tx('ราคาต่อคืนเริ่มต้น', 'Per night from')}</p>
            <p className="text-2xl font-black tracking-tight text-slate-900">{formatPrice(room.nightlyPrice)}</p>
            {hasDates && room.stayPrice && (
              <p className="text-sm text-slate-600">
                {tx(`รวม ${nights} คืน`, `${nights} nights`)}{rooms > 1 && tx(` · ${rooms} ห้อง`, ` · ${rooms} rooms`)}{' '}
                <b className="text-slate-900">{formatPrice(room.stayPrice * rooms)}</b>
              </p>
            )}
          </div>
          {tooSmall ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {rooms > 1
                ? tx(`${rooms} ห้องพักได้ไม่เกิน ${room.maxGuests * rooms} คน (คุณเลือก ${guests} คน)`, `${rooms} rooms sleep up to ${room.maxGuests * rooms} (you selected ${guests})`)
                : tx(`ห้องนี้พักได้ไม่เกิน ${room.maxGuests} คน (คุณเลือก ${guests} คน) — เพิ่มจำนวนห้องได้`, `Max ${room.maxGuests} guests (you selected ${guests}) — try more rooms`)}
            </p>
          ) : notEnough ? (
            <button type="button" disabled className="w-full rounded-xl bg-slate-200 py-2.5 text-sm font-bold text-slate-500">{tx(`ว่างไม่พอ (เหลือ ${room.available} ห้อง)`, `Only ${room.available} left`)}</button>
          ) : soldOut ? (
            <button type="button" disabled className="w-full rounded-xl bg-slate-200 py-2.5 text-sm font-bold text-slate-500">{tx('เต็มในวันที่เลือก', 'Sold out for your dates')}</button>
          ) : hasDates ? (
            <button type="button" onClick={() => onBook(room)} className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 active:scale-[0.98]">
              {rooms > 1 ? tx(`จอง ${rooms} ห้อง`, `Reserve ${rooms} rooms`) : tx('จองห้องนี้', 'Reserve')}
            </button>
          ) : (
            <button type="button" onClick={onPickDates} className="w-full rounded-xl border-2 border-brand-600 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-50">
              {tx('เลือกวันเพื่อจอง', 'Pick dates to book')}
            </button>
          )}
        </div>
      </div>
    </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// รีวิว (อ่าน + เขียนรีวิวสำหรับการจองที่เข้าพักเสร็จแล้ว)
// ---------------------------------------------------------------------------
function ReviewsSection({ hotelId }) {
  const { lang, tx } = useLanguage();
  const { user, openAuthModal } = useAuth();
  const [data, setData] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [form, setForm] = useState({ bookingId: '', rating: 5, comment: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/reviews?hotelId=${hotelId}`).then(setData).catch(() => setData({ reviews: [], reviewCount: 0, averageRating: null, ratingBreakdown: {} }));
  }, [hotelId]);

  useEffect(() => {
    if (!user) { setEligible([]); return; }
    api('/bookings/me')
      .then((res) => setEligible((res.bookings || []).filter((b) => b.hotelId === Number(hotelId) && b.canReview)))
      .catch(() => setEligible([]));
  }, [user, hotelId]);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const result = await api('/reviews', { method: 'POST', body: { bookingId: Number(form.bookingId), rating: form.rating, comment: form.comment } });
      setData((current) => ({ ...current, reviews: [result.review, ...(current?.reviews || [])], reviewCount: (current?.reviewCount || 0) + 1 }));
      setEligible((list) => list.filter((b) => String(b.id) !== String(form.bookingId)));
      setForm({ bookingId: '', rating: 5, comment: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!data) return null;
  const breakdown = data.ratingBreakdown || {};

  return (
    <section id="reviews" className="scroll-mt-24">
      <h2 className="text-xl font-black text-slate-900">{tx('รีวิวจากผู้เข้าพัก', 'Guest reviews')}</h2>
      <div className="mt-4 grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 md:grid-cols-[14rem_1fr]">
        <div className="space-y-4">
          <RatingBadge rating={data.averageRating} count={data.reviewCount} size="lg" />
          {data.reviewCount > 0 && (
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = breakdown[star] || 0;
                const pct = Math.round((count / data.reviewCount) * 100);
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-3">{star}</span>
                    <Icon name="star" filled className="h-3 w-3 text-amber-400" strokeWidth={1.5} />
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-5 text-right text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {data.reviews.length === 0 ? (
            <p className="text-sm text-slate-500">{tx('ยังไม่มีรีวิว เป็นคนแรกที่รีวิวหลังเข้าพัก!', 'No reviews yet — be the first after your stay!')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.reviews.slice(0, 6).map((review) => (
                <li key={review.id} className="py-4 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {review.user?.avatarUrl ? (
                        <img src={review.user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                          {(review.user?.name || 'G').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900">{shortName(review.user?.name) || tx('ผู้เข้าพัก', 'Guest')}</p>
                        <p className="text-xs text-slate-400">{formatDate(String(review.createdAt).slice(0, 10), lang)}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">
                      <Icon name="star" filled className="h-3 w-3 text-amber-400" strokeWidth={1.5} />{Number(review.rating).toFixed(1)}
                    </span>
                  </div>
                  {review.comment && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{review.comment}</p>}
                </li>
              ))}
            </ul>
          )}

          {user && eligible.length > 0 && (
            <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">{tx('รีวิวการเข้าพักของคุณ', 'Review your stay')}</p>
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              <select required value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">{tx('เลือกการจองที่จะรีวิว', 'Choose a stay')}</option>
                {eligible.map((b) => (
                  <option key={b.id} value={b.id}>{b.reference} · {b.room.name} · {formatShortRange(b.checkIn, b.checkOut, lang)}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} aria-label={`${n}`}>
                    <Icon name="star" filled={n <= form.rating} strokeWidth={1.5} className={`h-7 w-7 ${n <= form.rating ? 'text-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
              <textarea rows={3} maxLength={2000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder={tx('เล่าประสบการณ์การเข้าพัก…', 'Tell others about your stay…')} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              <button disabled={sending || !form.bookingId} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                {sending ? tx('กำลังส่ง…', 'Sending…') : tx('ส่งรีวิว', 'Submit review')}
              </button>
            </form>
          )}
          {!user && (
            <p className="mt-4 text-sm text-slate-500">
              <button type="button" onClick={() => openAuthModal('login')} className="font-semibold text-brand-600 hover:underline">{tx('เข้าสู่ระบบ', 'Sign in')}</button>
              {' '}{tx('เพื่อรีวิวที่พักที่คุณเคยเข้าพัก', 'to review a place you stayed at')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// หน้าโรงแรม
// ---------------------------------------------------------------------------
export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { lang, tx } = useLanguage();
  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pickSignal, setPickSignal] = useState(0);
  // ดูรูปเต็มจอ (รูปโรงแรม หรือรูปของห้องที่กด): null = ปิด · { photos, index, alt }
  const [viewer, setViewer] = useState(null);
  const openViewer = (photos, index, alt) => setViewer({ photos, index, alt });

  // รองรับทั้ง checkIn/checkOut และ checkin/checkout (ลิงก์เก่า) + guests แบบรวม
  const checkIn = [params.get('checkIn'), params.get('checkin')].find(isISODate) || '';
  const checkOut = [params.get('checkOut'), params.get('checkout')].find(isISODate) || '';
  const adults = Number(params.get('adults')) || Number(params.get('guests')) || 2;
  const children = Number(params.get('children')) || 0;
  const guests = adults + children;
  // จำนวนห้อง 1–5 และไม่เกินจำนวนคน (ตรงกับ GuestPicker / server)
  const rooms = Math.min(Math.max(Number(params.get('rooms')) || 1, 1), 5, guests);
  const validStay = checkIn && checkOut && nightsBetween(checkIn, checkOut) > 0;

  useEffect(() => {
    const query = new URLSearchParams({ guests: String(guests), rooms: String(rooms) });
    if (validStay) {
      query.set('checkIn', checkIn);
      query.set('checkOut', checkOut);
    }
    let ignore = false;
    setRefreshing(true);
    setError('');
    api(`/hotels/${id}?${query}`)
      .then((data) => { if (!ignore) setHotel(data); })
      .catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) { setLoading(false); setRefreshing(false); } });
    return () => { ignore = true; };
  }, [id, checkIn, checkOut, guests, rooms, validStay]);

  const applyStay = (draft) => {
    const next = new URLSearchParams();
    if (draft.checkIn && draft.checkOut) {
      next.set('checkIn', draft.checkIn);
      next.set('checkOut', draft.checkOut);
    }
    next.set('adults', String(draft.adults));
    if (draft.children) next.set('children', String(draft.children));
    if (draft.rooms > 1) next.set('rooms', String(draft.rooms));
    setParams(next, { replace: true });
  };

  const book = (room) => {
    const query = new URLSearchParams({ roomId: String(room.id), checkIn, checkOut, guests: String(guests), rooms: String(rooms) });
    navigate(`/checkout?${query}`);
  };

  const pickDates = () => {
    document.getElementById('stay-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPickSignal((n) => n + 1);
  };

  if (loading) return <PageLoader label={tx('กำลังโหลดข้อมูลที่พัก…', 'Loading property…')} />;
  if (error && !hotel) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon="alert" tone="error" title={error} action={<Link to="/search" className="font-semibold text-brand-600">{tx('กลับไปค้นหา', 'Back to search')}</Link>} />
      </div>
    );
  }

  const nights = hotel.nights || 0;
  const bookable = hotel.rooms.filter((room) => room.fitsGuests && room.enoughRooms !== false);
  const cheapest = bookable.length ? Math.min(...bookable.map((room) => room.nightlyPrice)) : null;
  // รูปที่เจ้าของอัปโหลด (สูงสุด 5 รูป ขนาด 1200×800 เท่ากันทุกรูป) · ยังไม่มี → ใช้รูปเดิม + รูปประเภทห้อง
  const uploadedPhotos = (hotel.images ?? []).filter((src) => src.startsWith('/api/hotels/images/'));
  const gallery = uploadedPhotos.length
    ? uploadedPhotos
    : [hotel.imageUrl, ...new Set(hotel.rooms.map((room) => room.imageUrl))].filter(Boolean).slice(0, 5);
  const hasMap = hotel.latitude !== null && hotel.longitude !== null;
  const bbox = hasMap ? [hotel.longitude - 0.01, hotel.latitude - 0.006, hotel.longitude + 0.01, hotel.latitude + 0.006].join(',') : '';

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      {/* breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="hover:text-brand-600">{tx('หน้าแรก', 'Home')}</Link>
        <Icon name="chevron-right" className="h-3.5 w-3.5" />
        <Link to={`/search?q=${encodeURIComponent(hotel.city)}`} className="hover:text-brand-600">{cityLabel(hotel.city, lang)}</Link>
        <Icon name="chevron-right" className="h-3.5 w-3.5" />
        <span className="truncate text-slate-700">{hotel.name}</span>
      </nav>

      {/* หัวข้อ */}
      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">{hotel.type}</span>
            <Stars value={hotel.stars} />
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{hotel.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
            <Icon name="pin" className="h-4 w-4 text-brand-600" /> {hotel.address}, {cityLabel(hotel.city, lang)}
            {hasMap && <a href="#location" className="ml-1 font-semibold text-brand-600 hover:underline">{tx('ดูแผนที่', 'Show map')}</a>}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <FavoriteButton hotelId={hotel.id} variant="pill" />
          <a href="#reviews" className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-brand-300">
            <RatingBadge rating={hotel.rating} count={hotel.reviewCount} />
          </a>
        </div>
      </header>

      {/* แกลเลอรี: รูปแรกใหญ่ 2×2 รูปที่เหลือเติมช่องด้านขวาให้เต็มพอดีตามจำนวนรูปที่มี · กดรูปเพื่อดูเต็มจอ */}
      <div className="relative mt-6">
        {/* มือถือ: กรอบสัดส่วน 3:2 เท่ารูปที่อัปโหลด → เห็นรูปเต็มไม่ถูกตัด · จอใหญ่: สูงคงที่ให้ตาราง 4×2 */}
        <div className="grid aspect-[3/2] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:aspect-auto sm:h-[26rem]">
          {gallery.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => openViewer(gallery, index, hotel.name)}
              aria-label={tx(`ดูรูปที่ ${index + 1} เต็มจอ`, `View photo ${index + 1}`)}
              className={`${galleryTile(index, gallery.length)} overflow-hidden`}
            >
              <SmartImage
                src={src}
                alt={hotel.name}
                width={index === 0 ? 1400 : 600}
                className="h-full w-full"
                imgClassName="transition duration-700 hover:scale-105"
              />
            </button>
          ))}
        </div>
        {/* มือถือเห็นแค่รูปแรก → ปุ่มนี้คือทางดูรูปที่เหลือ */}
        {gallery.length > 1 && (
          <button
            type="button"
            onClick={() => openViewer(gallery, 0, hotel.name)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-sm font-bold text-slate-800 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <Icon name="grid" className="h-4 w-4" />{tx(`ดูรูปทั้งหมด ${gallery.length} รูป`, `Show all ${gallery.length} photos`)}
          </button>
        )}
      </div>
      {viewer && (
        <PhotoLightbox
          photos={viewer.photos}
          index={viewer.index}
          onIndex={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
          alt={viewer.alt}
        />
      )}

      {/* มือถือ: กล่องเลือกวันขึ้นก่อนเนื้อหา · จอใหญ่: อยู่คอลัมน์ขวาแบบ sticky */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="order-2 min-w-0 space-y-10 lg:order-1">
          {/* รายละเอียด + สิ่งอำนวยความสะดวก */}
          <section>
            <h2 className="text-xl font-black text-slate-900">{tx('เกี่ยวกับที่พักนี้', 'About this property')}</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{hotel.description}</p>
            {hotel.amenities.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {hotel.amenities.map((key) => AMENITIES[key] && (
                  <div key={key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon name={AMENITIES[key].icon} className="h-5 w-5" />
                    </span>
                    {AMENITIES[key][lang === 'en' ? 'en' : 'th']}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ห้องพัก */}
          <section id="rooms" className="scroll-mt-24">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-xl font-black text-slate-900">{tx('เลือกห้องพัก', 'Choose your room')}</h2>
              <p className="text-sm text-slate-500">
                {validStay
                  ? <>{formatShortRange(checkIn, checkOut, lang)} · {nights} {tx('คืน', 'nights')} · {guests} {tx('ผู้เข้าพัก', 'guests')}{rooms > 1 && <> · {rooms} {tx('ห้อง', 'rooms')}</>}</>
                  : tx('เลือกวันเข้าพักเพื่อดูห้องว่างและราคารวม', 'Add dates to see availability and total price')}
              </p>
            </div>
            <div className={`mt-4 space-y-4 transition ${refreshing ? 'pointer-events-none opacity-60' : ''}`}>
              {hotel.rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  nights={nights}
                  guests={guests}
                  rooms={rooms}
                  onBook={book}
                  onPickDates={pickDates}
                  onViewPhotos={(index) => openViewer(room.images, index, room.name)}
                />
              ))}
            </div>
          </section>

          <ReviewsSection hotelId={hotel.id} />

          {/* นโยบาย */}
          <section>
            <h2 className="text-xl font-black text-slate-900">{tx('นโยบายที่พัก', 'House rules')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { icon: 'login', title: tx('เช็กอิน', 'Check-in'), text: tx('ตั้งแต่ 14:00 น. (แสดงบัตรประชาชน/พาสปอร์ต)', 'From 2:00 PM (ID or passport required)') },
                { icon: 'logout', title: tx('เช็กเอาต์', 'Check-out'), text: tx('ก่อน 12:00 น.', 'Until 12:00 PM') },
                { icon: 'shield', title: tx('การยกเลิก', 'Cancellation'), text: tx('ยกเลิกฟรีก่อนวันเช็กอิน คืนเงินเต็มจำนวน', 'Free before check-in with a full refund') },
                { icon: 'clock', title: tx('การชำระเงิน', 'Payment'), text: tx('ระบบถือห้องไว้ให้ 15 นาทีระหว่างชำระเงิน', 'Your room is held for 15 minutes while you pay') },
              ].map((rule) => (
                <div key={rule.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <Icon name={rule.icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{rule.title}</p>
                    <p className="text-sm text-slate-600">{rule.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {hasMap && (
            <section id="location" className="scroll-mt-24">
              <h2 className="text-xl font-black text-slate-900">{tx('ทำเลที่ตั้ง', 'Location')}</h2>
              <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
                <iframe
                  title="map"
                  className="h-72 w-full"
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${hotel.latitude},${hotel.longitude}`}
                />
              </div>
            </section>
          )}
        </div>

        <div id="stay-picker" className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <StayPicker
            checkIn={validStay ? checkIn : ''}
            checkOut={validStay ? checkOut : ''}
            adults={adults}
            children={children}
            rooms={rooms}
            onApply={applyStay}
            cheapest={cheapest}
            nights={nights}
            openSignal={pickSignal}
          />
        </div>
      </div>
    </div>
  );
}
