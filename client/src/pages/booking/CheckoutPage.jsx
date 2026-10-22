import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import BookingSteps from '../../components/BookingSteps.jsx';
import BookingSummary from '../../components/BookingSummary.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// หน้า checkout: /checkout?roomId=&checkIn=&checkOut=&guests=&rooms=
// ราคาที่แสดงมาจาก server (/bookings/quote) และตอนกดจอง server จะคำนวณใหม่อีกรอบเสมอ
export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const { tx, formatPrice } = useLanguage();

  const roomId = params.get('roomId') || params.get('roomTypeId');
  const checkIn = params.get('checkIn') || params.get('checkin');
  const checkOut = params.get('checkOut') || params.get('checkout');
  const guests = Number(params.get('guests')) || 1;
  const rooms = Number(params.get('rooms')) || 1;

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ guestName: '', guestEmail: '', guestPhone: '', specialRequests: '' });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!roomId || !checkIn || !checkOut) {
      setError(tx('ข้อมูลการจองไม่ครบ กรุณาเลือกห้องจากหน้าที่พักอีกครั้ง', 'Missing booking details — please choose a room again.'));
      return;
    }
    const query = new URLSearchParams({ roomId, checkIn, checkOut, guests: String(guests), rooms: String(rooms) });
    api(`/bookings/quote?${query}`).then(setQuote).catch((err) => setError(err.message));
  }, [roomId, checkIn, checkOut, guests, rooms]);

  // เติมชื่อ/อีเมลจากบัญชีที่ล็อกอินให้อัตโนมัติ
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        guestName: f.guestName || user.name || '',
        guestEmail: f.guestEmail || user.email || '',
        guestPhone: f.guestPhone || user.phone || '',
      }));
    }
  }, [user]);

  const errors = {
    guestName: !form.guestName.trim() ? tx('กรุณากรอกชื่อ-นามสกุล', 'Please enter your full name') : '',
    guestEmail: !EMAIL_PATTERN.test(form.guestEmail.trim()) ? tx('อีเมลไม่ถูกต้อง', 'Enter a valid email') : '',
    guestPhone: form.guestPhone && !/^[+\d][\d\s-]{6,19}$/.test(form.guestPhone.trim()) ? tx('เบอร์โทรไม่ถูกต้อง', 'Enter a valid phone number') : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    if (!user) { openAuthModal('login'); return; }
    if (hasErrors) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { booking } = await api('/bookings', {
        method: 'POST',
        body: { roomId: Number(roomId), checkIn, checkOut, guests, rooms, ...form },
      });
      navigate(`/checkout/pay/${booking.id}`, { replace: true });
    } catch (err) {
      setSubmitError(err.status === 401 ? tx('กรุณาเข้าสู่ระบบอีกครั้ง', 'Please sign in again') : err.message);
      if (err.status === 401) openAuthModal('login');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState icon="alert" tone="error" title={tx('ไม่สามารถดำเนินการจองได้', 'Unable to continue')} description={error}
          action={<Link to="/search" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">{tx('กลับไปค้นหาที่พัก', 'Back to search')}</Link>} />
      </div>
    );
  }
  if (!quote || authLoading) return <PageLoader label={tx('กำลังตรวจสอบห้องว่างและราคา…', 'Checking availability and price…')} />;

  // ห้องเต็ม / ว่างไม่พอจำนวนห้อง / จำนวนคนเกินที่ห้องรับได้ → จองไม่ได้ (server ตรวจซ้ำอีกรอบตอนกดจอง)
  const unavailable = quote.available < 1 || !quote.enoughRooms || !quote.fitsGuests;
  const roomsLink = `/hotels/${quote.hotel.id}?checkIn=${checkIn}&checkOut=${checkOut}&adults=${guests}${rooms > 1 ? `&rooms=${rooms}` : ''}`;
  const field = (name) => `mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:ring-4 ${
    touched && errors[name] ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
  }`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to={roomsLink} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600">
          <Icon name="arrow-left" className="h-4 w-4" /> {tx('กลับไปเลือกห้อง', 'Back to rooms')}
        </Link>
        <BookingSteps current={0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <form onSubmit={submit} className="space-y-6" noValidate>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{tx('กรอกข้อมูลผู้เข้าพัก', 'Who is checking in?')}</h1>
            <p className="mt-1 text-sm text-slate-500">{tx('ที่พักจะใช้ข้อมูลนี้ติดต่อคุณเกี่ยวกับการเข้าพัก', 'The property will use these details to contact you about your stay')}</p>
          </div>

          {unavailable && (
            <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <Icon name="alert" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">
                  {!quote.fitsGuests
                    ? quote.capacityError
                    : quote.available < 1
                      ? tx('ห้องนี้เต็มแล้วในวันที่เลือก', 'This room just sold out for your dates')
                      : tx(`ห้องนี้ว่างไม่พอ (เหลือ ${quote.available} ห้อง แต่ต้องการ ${rooms} ห้อง)`, `Not enough rooms left (${quote.available} left, you need ${rooms})`)}
                </p>
                <Link to={roomsLink} className="font-semibold underline">{tx('เลือกห้องอื่น', 'Choose another room')}</Link>
              </div>
            </div>
          )}

          {!user && (
            <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-brand-900">
                <Icon name="user" className="h-5 w-5" />
                {tx('เข้าสู่ระบบเพื่อจอง และดูการจองย้อนหลังได้ทุกเมื่อ', 'Sign in to book and manage your trips anytime')}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => openAuthModal('login')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">{tx('เข้าสู่ระบบ', 'Sign in')}</button>
                <button type="button" onClick={() => openAuthModal('register')} className="rounded-xl border border-brand-300 bg-white px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50">{tx('สมัครสมาชิก', 'Register')}</button>
              </div>
            </div>
          )}

          <fieldset disabled={!user || unavailable} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 disabled:opacity-60 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                {tx('ชื่อ-นามสกุล (ตามบัตรประชาชน/พาสปอร์ต)', 'Full name (as on ID/passport)')} <span className="text-rose-500">*</span>
                <input value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} autoComplete="name" maxLength={200} className={field('guestName')} />
                {touched && errors.guestName && <span className="mt-1 block text-xs text-rose-600">{errors.guestName}</span>}
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                {tx('อีเมล', 'Email')} <span className="text-rose-500">*</span>
                <input type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} autoComplete="email" className={field('guestEmail')} />
                {touched && errors.guestEmail && <span className="mt-1 block text-xs text-rose-600">{errors.guestEmail}</span>}
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                {tx('เบอร์โทรศัพท์', 'Phone number')} <span className="font-normal text-slate-400">({tx('ไม่บังคับ', 'optional')})</span>
                <input type="tel" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} autoComplete="tel" placeholder="08x-xxx-xxxx" className={field('guestPhone')} />
                {touched && errors.guestPhone && <span className="mt-1 block text-xs text-rose-600">{errors.guestPhone}</span>}
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              {tx('คำขอพิเศษ', 'Special requests')} <span className="font-normal text-slate-400">({tx('ไม่บังคับ', 'optional')})</span>
              <textarea rows={3} maxLength={500} value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} placeholder={tx('เช่น ขอห้องชั้นสูง, เช็กอินดึก', 'e.g. high floor, late check-in')} className={field('specialRequests')} />
              <span className="mt-1 block text-xs font-normal text-slate-400">{tx('ที่พักจะพยายามจัดให้ตามคำขอ แต่ไม่สามารถรับประกันได้', 'Requests are subject to availability')}</span>
            </label>
          </fieldset>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="shield" className="h-5 w-5 text-emerald-600" />{tx('นโยบายการยกเลิก', 'Cancellation policy')}</p>
            <p className="mt-1.5 text-sm text-slate-600">
              {tx('ยกเลิกฟรีและได้รับเงินคืนเต็มจำนวน หากยกเลิกก่อนวันเช็กอิน', 'Free cancellation with a full refund if you cancel before check-in day.')}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Icon name="clock" className="h-4 w-4 text-amber-500" />
              {tx(`หลังกดดำเนินการต่อ ระบบจะถือห้องไว้ให้ ${quote.holdMinutes} นาทีเพื่อชำระเงิน`, `We'll hold the room for ${quote.holdMinutes} minutes while you pay`)}
            </p>
          </div>

          {/* PDPA: แจ้งว่าจะใช้ข้อมูลทำอะไร ก่อนกดส่งข้อมูล (มาตรา 23) */}
          <p className="flex items-start gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span>
              {tx(
                'ข้อมูลผู้เข้าพักจะใช้เพื่อทำการจองและการเข้าพักครั้งนี้เท่านั้น ไม่ใช้เพื่อการตลาด และไม่เปิดเผยให้บุคคลอื่นนอกจากที่พักที่คุณจอง อ่านรายละเอียดได้ที่',
                'Your details are used only for this booking and stay — never for marketing, and shared only with the property you booked. See our',
              )}{' '}
              <Link to="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand-700 underline underline-offset-2">
                {tx('นโยบายความเป็นส่วนตัว', 'privacy policy')}
              </Link>
            </span>
          </p>

          {submitError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{submitError}</p>}

          <button
            type="submit"
            disabled={submitting || unavailable}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? tx('กำลังจองห้อง…', 'Reserving your room…') : user ? <>{tx('ดำเนินการต่อเพื่อชำระเงิน', 'Continue to payment')} · {formatPrice(quote.totalPrice)} <Icon name="arrow-right" className="h-5 w-5" /></> : tx('เข้าสู่ระบบเพื่อจอง', 'Sign in to book')}
          </button>
        </form>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <BookingSummary
            hotel={quote.hotel}
            room={quote.room}
            checkIn={quote.checkIn}
            checkOut={quote.checkOut}
            nights={quote.nights}
            guests={quote.guests}
            rooms={quote.rooms}
            nightly={quote.nightly}
            total={quote.totalPrice}
            footer={!unavailable && quote.available <= 3 && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-deal-600">
                <Icon name="flame" className="h-4 w-4" />{tx(`เหลือเพียง ${quote.available} ห้องในราคานี้`, `Only ${quote.available} left at this price`)}
              </p>
            )}
          />
        </div>
      </div>
    </div>
  );
}
