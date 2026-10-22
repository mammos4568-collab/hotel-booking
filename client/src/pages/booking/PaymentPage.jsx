import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import BookingSteps from '../../components/BookingSteps.jsx';
import BookingSummary from '../../components/BookingSummary.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

// ---------- ตรวจบัตรฝั่งหน้าเว็บ (server ตรวจซ้ำอีกรอบเสมอ) ----------
function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

function cardBrand(digits) {
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^35/.test(digits)) return 'JCB';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return '';
}

function formatCardNumber(value) {
  return value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

// นับถอยหลังเวลาถือห้อง (มาจาก holdExpiresAt ที่ server คำนวณ)
function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
}

// QR จำลอง: ลายจุดคงที่จากเลขที่การจอง (ไม่ใช่ QR จริง — การชำระเงินทั้งหมดเป็นการจำลอง)
function MockQr({ seed }) {
  const cells = useMemo(() => {
    let state = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return Array.from({ length: 21 * 21 }, () => {
      state = (state * 1103515245 + 12345) >>> 0;
      return (state >>> 16) % 2 === 0;
    });
  }, [seed]);
  const finder = (x, y) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#0f172a" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f172a" />
    </g>
  );
  const inFinder = (cx, cy) => (cx < 8 && cy < 8) || (cx > 12 && cy < 8) || (cx < 8 && cy > 12);
  return (
    <svg viewBox="-1 -1 23 23" className="h-48 w-48" shapeRendering="crispEdges" aria-label="QR">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {cells.map((on, i) => {
        const cx = i % 21;
        const cy = Math.floor(i / 21);
        return on && !inFinder(cx, cy) ? <rect key={i} x={cx} y={cy} width="1" height="1" fill="#0f172a" /> : null;
      })}
      {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    </svg>
  );
}

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tx, formatPrice } = useLanguage();
  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [method, setMethod] = useState('card');
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [touched, setTouched] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch((err) => setLoadError(err.message));
  }, [id]);

  const secondsLeft = useCountdown(booking?.holdExpiresAt);
  const digits = card.number.replace(/\s/g, '');

  const cardErrors = {
    number: !passesLuhn(digits) ? tx('หมายเลขบัตรไม่ถูกต้อง', 'Invalid card number') : '',
    name: !card.name.trim() ? tx('กรอกชื่อบนบัตร', 'Enter the name on card') : '',
    expiry: !/^\d{2}\/\d{2}$/.test(card.expiry) || Number(card.expiry.slice(0, 2)) < 1 || Number(card.expiry.slice(0, 2)) > 12 ? tx('รูปแบบ MM/YY', 'Use MM/YY') : '',
    cvc: !/^\d{3,4}$/.test(card.cvc) ? tx('CVC 3–4 หลัก', '3–4 digits') : '',
  };

  const pay = async (event) => {
    event?.preventDefault();
    setTouched(true);
    setPayError('');
    if (method === 'card' && Object.values(cardErrors).some(Boolean)) return;
    setPaying(true);
    try {
      const body = method === 'card'
        ? { method, cardNumber: digits, cardName: card.name, expiry: card.expiry, cvc: card.cvc }
        : { method };
      await api(`/bookings/${id}/pay`, { method: 'POST', body });
      navigate(`/booking/success/${id}`, { replace: true });
    } catch (err) {
      setPayError(err.message);
      if (err.status === 409 || err.status === 429) {
        // หมดเวลา / ถูกยกเลิก / จ่ายไปแล้ว / จ่ายผิดครบจำนวนครั้ง → โหลดสถานะล่าสุดมาแสดง
        api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch(() => {});
      }
    } finally {
      setPaying(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState icon="alert" tone="error" title={loadError} action={<Link to="/my-bookings" className="font-semibold text-brand-600">{tx('ไปที่การจองของฉัน', 'Go to My bookings')}</Link>} />
      </div>
    );
  }
  if (!booking) return <PageLoader />;
  if (booking.status === 'confirmed' || booking.status === 'completed') return <Navigate to={`/booking/success/${id}`} replace />;

  const expired = booking.status === 'expired' || secondsLeft === 0;
  const cancelled = booking.status === 'cancelled';
  const rebookLink = `/hotels/${booking.hotel.id}?checkIn=${booking.checkIn}&checkOut=${booking.checkOut}&adults=${booking.guests}${booking.rooms > 1 ? `&rooms=${booking.rooms}` : ''}`;

  if (expired || cancelled) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState
          icon={cancelled ? 'alert' : 'clock'}
          tone="error"
          title={cancelled ? tx('การจองนี้ถูกยกเลิกแล้ว', 'This booking was cancelled') : tx('หมดเวลาชำระเงิน', 'Payment time expired')}
          description={payError || tx('ห้องที่ถือไว้ถูกปล่อยให้ผู้อื่นจองแล้ว กรุณาทำการจองใหม่ (ราคาอาจเปลี่ยนแปลง)', 'The held room has been released. Please book again — prices may have changed.')}
          action={<Link to={rebookLink} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">{tx('จองใหม่อีกครั้ง', 'Book again')}</Link>}
        />
      </div>
    );
  }

  const minutes = String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, '0');
  const seconds = String((secondsLeft ?? 0) % 60).padStart(2, '0');
  const urgent = secondsLeft !== null && secondsLeft < 120;
  const input = (name) => `mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:ring-4 ${
    touched && cardErrors[name] ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
  }`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">{tx('เลขที่การจอง', 'Booking ref.')} <b className="font-mono text-slate-900">{booking.reference}</b></p>
        <BookingSteps current={1} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${urgent ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>
            <Icon name="clock" className="h-5 w-5 shrink-0" />
            <p className="flex-1">{tx('เราถือห้องนี้ไว้ให้คุณ กรุณาชำระเงินภายใน', "We're holding this room for you. Complete payment within")}</p>
            <span className="rounded-lg bg-white/70 px-2.5 py-1 font-mono text-lg font-black tabular-nums">{minutes}:{seconds}</span>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{tx('ชำระเงิน', 'Payment')}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Icon name="lock" className="h-4 w-4" />{tx('ระบบชำระเงินจำลองสำหรับโปรเจกต์ — ไม่มีการตัดเงินจริง', 'Simulated payment for this project — no real charge')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'card', icon: 'card', label: tx('บัตรเครดิต / เดบิต', 'Credit / debit card') },
              { key: 'promptpay', icon: 'qr', label: 'PromptPay QR' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => { setMethod(option.key); setPayError(''); }}
                className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left text-sm font-bold transition ${
                  method === option.key ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon name={option.icon} className="h-6 w-6" />
                {option.label}
              </button>
            ))}
          </div>

          {method === 'card' ? (
            <form onSubmit={pay} noValidate className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 md:grid-cols-[1fr_16rem]">
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  {tx('หมายเลขบัตร', 'Card number')}
                  <input inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} placeholder="4242 4242 4242 4242" className={`${input('number')} font-mono tracking-wider`} />
                  {touched && cardErrors.number && <span className="mt-1 block text-xs text-rose-600">{cardErrors.number}</span>}
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  {tx('ชื่อบนบัตร', 'Name on card')}
                  <input autoComplete="cc-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.toUpperCase() })} placeholder="SOMCHAI JAIDEE" className={input('name')} />
                  {touched && cardErrors.name && <span className="mt-1 block text-xs text-rose-600">{cardErrors.name}</span>}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    {tx('วันหมดอายุ', 'Expiry')}
                    <input inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} placeholder="MM/YY" className={input('expiry')} />
                    {touched && cardErrors.expiry && <span className="mt-1 block text-xs text-rose-600">{cardErrors.expiry}</span>}
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    CVC
                    <input inputMode="numeric" autoComplete="cc-csc" type="password" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} placeholder="•••" className={input('cvc')} />
                    {touched && cardErrors.cvc && <span className="mt-1 block text-xs text-rose-600">{cardErrors.cvc}</span>}
                  </label>
                </div>
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {tx('บัตรทดสอบ', 'Test cards')}: <b className="font-mono text-slate-700">4242 4242 4242 4242</b> {tx('(ผ่าน)', '(success)')} · <b className="font-mono text-slate-700">4000 0000 0000 0002</b> {tx('(ถูกปฏิเสธ)', '(declined)')}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon name="shield" className="h-3.5 w-3.5 text-emerald-600" />
                  {tx('เราเก็บเฉพาะเลข 4 หลักท้ายของบัตร ไม่เก็บเลขบัตรเต็ม วันหมดอายุ หรือ CVC', 'We keep only the last 4 digits — never the full card number, expiry or CVC.')}
                </p>
              </div>

              {/* ตัวอย่างบัตร */}
              <div className="hidden md:block">
                <div className="relative aspect-[1.586] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-brand-900 to-brand-600 p-4 text-white shadow-xl">
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
                  <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-white/5" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="h-6 w-8 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" />
                      <span className="text-sm font-black italic">{cardBrand(digits)}</span>
                    </div>
                    <p className="font-mono text-[15px] tracking-[0.15em]">{card.number || '•••• •••• •••• ••••'}</p>
                    <div className="flex items-end justify-between text-[10px] uppercase">
                      <span className="max-w-[9rem] truncate">{card.name || tx('ชื่อบนบัตร', 'CARDHOLDER')}</span>
                      <span className="font-mono">{card.expiry || 'MM/YY'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {payError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 md:col-span-2">{payError}</p>}
              <button type="submit" disabled={paying} className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-60 md:col-span-2">
                <Icon name="lock" className="h-5 w-5" />
                {paying ? tx('กำลังชำระเงิน…', 'Processing…') : tx(`ชำระเงิน ${formatPrice(booking.totalAmount)}`, `Pay ${formatPrice(booking.totalAmount)}`)}
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 text-center">
              <span className="rounded-lg bg-brand-900 px-3 py-1 text-xs font-black tracking-widest text-white">PromptPay</span>
              <div className="rounded-2xl border border-slate-200 p-3"><MockQr seed={booking.reference} /></div>
              <div>
                <p className="text-sm text-slate-500">{tx('ยอดที่ต้องชำระ', 'Amount due')}</p>
                <p className="text-3xl font-black text-slate-900">{formatPrice(booking.totalAmount)}</p>
                <p className="mt-1 text-xs text-slate-400">{tx('QR ตัวอย่าง (จำลอง) — กดปุ่มด้านล่างเพื่อยืนยันการชำระเงิน', 'Sample QR (simulated) — press the button below to confirm payment')}</p>
              </div>
              {payError && <p className="w-full rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{payError}</p>}
              <button type="button" onClick={pay} disabled={paying} className="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700 disabled:opacity-60">
                {paying ? tx('กำลังตรวจสอบการชำระเงิน…', 'Verifying payment…') : tx('ฉันชำระเงินเรียบร้อยแล้ว', "I've completed the payment")}
              </button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <BookingSummary
            hotel={booking.hotel}
            room={booking.room}
            checkIn={booking.checkIn}
            checkOut={booking.checkOut}
            nights={booking.nights}
            guests={booking.guests}
            rooms={booking.rooms}
            total={booking.totalAmount}
            footer={(
              <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-bold text-slate-800">{tx('ผู้เข้าพัก', 'Guest')}</p>
                <p>{booking.guest.name} · {booking.guest.email}</p>
                {booking.specialRequests && <p className="mt-1 italic">“{booking.specialRequests}”</p>}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
