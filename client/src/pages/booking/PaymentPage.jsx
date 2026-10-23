import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

// การจ่ายด้วยบัตรเป็นการจำลอง → รับเฉพาะบัตรทดสอบ (ต้องตรงกับ TEST_CARDS ใน server/src/modules/booking/routes.js)
// เลขอื่นถูกปฏิเสธที่หน้าเว็บ "ก่อนส่ง" → ถ้ามีคนเผลอพิมพ์บัตรจริง เลขบัตรจะไม่ออกจากเบราว์เซอร์เลย
const TEST_CARDS = [
  { number: '4242424242424242', success: true },
  { number: '5555555555554444', success: true },
  { number: '4000000000000002', success: false },
];

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

// เบอร์มือถือ 10 หลัก → 081-234-5678 (ใช้กับ TrueMoney Wallet)
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join('-');
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
  const [walletPhone, setWalletPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  // TrueMoney จ่ายผ่าน Opn Payments จริง ('opn') หรือแบบจำลอง ('simulated') — server เป็นคนบอก
  const [payConfig, setPayConfig] = useState({ truemoney: 'simulated', testMode: true });
  const [searchParams, setSearchParams] = useSearchParams();
  const returnedFromGateway = searchParams.get('gateway_return') === '1';
  const [verifying, setVerifying] = useState(returnedFromGateway);
  const viaGateway = method === 'truemoney' && payConfig.truemoney === 'opn';

  useEffect(() => {
    api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch((err) => setLoadError(err.message));
    api('/bookings/payment-config').then(setPayConfig).catch(() => {});
  }, [id]);

  // กลับมาจากหน้ายืนยันของ TrueMoney (Opn พากลับมาพร้อม ?gateway_return=1)
  // → ให้ server ไปถาม Opn ว่าจ่ายสำเร็จไหม (หน้าเว็บไม่ตัดสินเอง) · ยังรอผล = ถามซ้ำทุก 3 วินาที สูงสุด 10 ครั้ง
  useEffect(() => {
    if (!returnedFromGateway) return undefined;
    let stopped = false;
    let timer;
    setVerifying(true);
    const check = async (attempt) => {
      try {
        const result = await api(`/bookings/${id}/pay/verify`, { method: 'POST' });
        if (stopped) return;
        if (result.state === 'paid') {
          navigate(`/booking/success/${id}`, { replace: true });
          return;
        }
        if (attempt < 10) {
          timer = setTimeout(() => check(attempt + 1), 3000);
          return;
        }
        setPayError(tx('ยังไม่ได้รับผลจาก TrueMoney — ถ้ายืนยันในแอปแล้ว รอสักครู่แล้วกดตรวจสอบอีกครั้ง', "No result from TrueMoney yet — if you've approved in the app, wait a moment and check again."));
      } catch (err) {
        if (stopped) return;
        setPayError(err.message);
      }
      setMethod('truemoney');
      setVerifying(false);
      setSearchParams({}, { replace: true });
      api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch(() => {});
    };
    check(1);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [returnedFromGateway, id]);

  const secondsLeft = useCountdown(booking?.holdExpiresAt);
  const digits = card.number.replace(/\s/g, '');

  const isTestCard = TEST_CARDS.some((testCard) => testCard.number === digits);
  // พิมพ์เลขครบ 16 หลักที่ไม่ใช่บัตรทดสอบ (อาจเป็นบัตรจริง) → เตือนทันที ไม่ต้องรอกดจ่าย
  const notTestCard = digits.length >= 16 && passesLuhn(digits) && !isTestCard;

  const cardErrors = {
    number: !passesLuhn(digits)
      ? tx('หมายเลขบัตรไม่ถูกต้อง', 'Invalid card number')
      : !isTestCard ? tx('ใช้ได้เฉพาะบัตรทดสอบด้านล่าง — ห้ามใส่บัตรจริง', 'Test cards only (listed below) — never enter a real card') : '',
    name: !card.name.trim() ? tx('กรอกชื่อบนบัตร', 'Enter the name on card') : '',
    expiry: !/^\d{2}\/\d{2}$/.test(card.expiry) || Number(card.expiry.slice(0, 2)) < 1 || Number(card.expiry.slice(0, 2)) > 12 ? tx('รูปแบบ MM/YY', 'Use MM/YY') : '',
    cvc: !/^\d{3,4}$/.test(card.cvc) ? tx('CVC 3–4 หลัก', '3–4 digits') : '',
  };
  const showCardError = (name) => (touched || (name === 'number' && notTestCard)) && cardErrors[name];
  const walletDigits = walletPhone.replace(/\D/g, '');
  const walletError = /^0[689]\d{8}$/.test(walletDigits) ? '' : tx('เบอร์มือถือ 10 หลัก ขึ้นต้นด้วย 06, 08 หรือ 09', 'A 10-digit mobile number starting with 06, 08 or 09');

  const pay = async (event) => {
    event?.preventDefault();
    setTouched(true);
    setPayError('');
    if (method === 'card' && Object.values(cardErrors).some(Boolean)) return;
    if (method === 'truemoney' && !viaGateway && walletError) return;
    let leaving = false; // กำลังเปลี่ยนไปหน้า TrueMoney → ปุ่มค้างสถานะ "กำลังไป…" ไว้ ไม่ให้กดซ้ำ
    setPaying(true);
    try {
      const bodies = {
        card: { method, cardNumber: digits, cardName: card.name, expiry: card.expiry, cvc: card.cvc },
        truemoney: viaGateway ? { method } : { method, walletPhone: walletDigits },
        promptpay: { method },
      };
      const result = await api(`/bookings/${id}/pay`, { method: 'POST', body: bodies[method] });
      if (result.redirectUrl) {
        // Opn: ไปยืนยันในแอป TrueMoney (เปลี่ยนหน้าทั้งหน้า) — ยังไม่ถือว่าจ่ายจนกว่าจะกลับมาตรวจผล
        leaving = true;
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate(`/booking/success/${id}`, { replace: true });
    } catch (err) {
      setPayError(err.message);
      if (err.status === 409 || err.status === 429) {
        // หมดเวลา / ถูกยกเลิก / จ่ายไปแล้ว / จ่ายผิดครบจำนวนครั้ง → โหลดสถานะล่าสุดมาแสดง
        api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch(() => {});
      }
    } finally {
      if (!leaving) setPaying(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState icon="alert" tone="error" title={loadError} action={<Link to="/my-bookings" className="font-semibold text-brand-600">{tx('ไปที่การจองของฉัน', 'Go to My bookings')}</Link>} />
      </div>
    );
  }
  if (verifying) return <PageLoader label={tx('กำลังตรวจสอบผลการชำระเงินกับ TrueMoney…', 'Checking your TrueMoney payment…')} />;
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
    showCardError(name) ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
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

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: 'card', icon: 'card', label: tx('บัตรเครดิต / เดบิต', 'Credit / debit card') },
              { key: 'promptpay', icon: 'qr', label: 'PromptPay QR' },
              { key: 'truemoney', icon: 'wallet', label: 'TrueMoney Wallet' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => { setMethod(option.key); setPayError(''); setTouched(false); }}
                aria-pressed={method === option.key}
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
              {/* autoComplete="off" ทุกช่อง — ไม่ให้เบราว์เซอร์เสนอเติมบัตรจริงที่ผู้ใช้บันทึกไว้ลงฟอร์มจำลองนี้ */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  {tx('หมายเลขบัตร', 'Card number')}
                  <input inputMode="numeric" autoComplete="off" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} placeholder="4242 4242 4242 4242" className={`${input('number')} font-mono tracking-wider`} />
                  {showCardError('number') && <span className="mt-1 block text-xs text-rose-600">{cardErrors.number}</span>}
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  {tx('ชื่อบนบัตร', 'Name on card')}
                  <input autoComplete="off" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.toUpperCase() })} placeholder="SOMCHAI JAIDEE" className={input('name')} />
                  {touched && cardErrors.name && <span className="mt-1 block text-xs text-rose-600">{cardErrors.name}</span>}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    {tx('วันหมดอายุ', 'Expiry')}
                    <input inputMode="numeric" autoComplete="off" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} placeholder="MM/YY" className={input('expiry')} />
                    {touched && cardErrors.expiry && <span className="mt-1 block text-xs text-rose-600">{cardErrors.expiry}</span>}
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    CVC
                    <input inputMode="numeric" autoComplete="off" type="password" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} placeholder="•••" className={input('cvc')} />
                    {touched && cardErrors.cvc && <span className="mt-1 block text-xs text-rose-600">{cardErrors.cvc}</span>}
                  </label>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <p className="font-semibold">{tx('ระบบชำระเงินจำลอง — ใช้ได้เฉพาะบัตรทดสอบ ห้ามใส่บัตรจริง', 'Simulated payment — test cards only, never enter a real card')}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TEST_CARDS.map((testCard) => (
                      <button
                        key={testCard.number}
                        type="button"
                        onClick={() => setCard({ ...card, number: formatCardNumber(testCard.number) })}
                        className="whitespace-nowrap rounded-lg bg-white px-2 py-1 text-left ring-1 ring-amber-200 transition hover:ring-amber-400"
                      >
                        <span className="font-mono text-slate-800">{formatCardNumber(testCard.number)}</span>{' '}
                        <span className={testCard.success ? 'text-emerald-700' : 'text-rose-600'}>{testCard.success ? tx('ผ่าน', 'success') : tx('ถูกปฏิเสธ', 'declined')}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-amber-800">{tx('กดเลขบัตรเพื่อกรอก · วันหมดอายุอะไรก็ได้ที่ยังไม่หมด · CVC 3 หลักอะไรก็ได้', 'Tap a number to fill it in · any future expiry · any 3-digit CVC')}</p>
                </div>
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
          ) : method === 'truemoney' ? (
            // TrueMoney Wallet (จำลอง): กรอกเบอร์ที่ผูกกับวอลเล็ต → server ตรวจรูปแบบแล้วบันทึกว่าจ่ายแล้ว (ไม่มีการตัดเงินจริง)
            <form onSubmit={pay} noValidate className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white">
                  <Icon name="wallet" className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-bold text-slate-900">TrueMoney Wallet</p>
                  <p className="text-xs text-slate-500">
                    {payConfig.truemoney === 'opn'
                      ? tx('ชำระผ่าน Opn Payments — ยืนยันการจ่ายในแอป TrueMoney', 'Paid via Opn Payments — approve the payment in the TrueMoney app')
                      : tx('กรอกเบอร์มือถือที่ผูกกับวอลเล็ต แล้วยืนยันการชำระในแอป (จำลอง)', 'Enter the mobile number linked to your wallet, then approve in the app (simulated)')}
                  </p>
                </div>
              </div>
              {payConfig.truemoney === 'opn' ? (
                <div className="space-y-2 text-sm">
                  <p className="rounded-xl bg-orange-50 px-3 py-2 text-orange-900">
                    {tx('กดปุ่มด้านล่าง ระบบจะพาไปยืนยันการชำระเงินกับ TrueMoney แล้วพากลับมาที่หน้านี้อัตโนมัติ', "Press the button below — you'll confirm the payment with TrueMoney, then come back here automatically.")}
                  </p>
                  {payConfig.testMode && (
                    <p className="flex items-start gap-1.5 text-xs text-slate-500">
                      <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {tx('โหมดทดสอบ: หน้ายืนยันของ Opn ให้เลือก Successful หรือ Failed ได้ — ไม่มีการตัดเงินจริง', 'Test mode: on the Opn confirmation page choose Successful or Failed — no real money is charged.')}
                    </p>
                  )}
                </div>
              ) : (
              <>
              <label className="block text-sm font-semibold text-slate-700">
                {tx('เบอร์มือถือ', 'Mobile number')}
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={walletPhone}
                  onChange={(e) => setWalletPhone(formatPhone(e.target.value))}
                  placeholder="081-234-5678"
                  className={`mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm tracking-wider outline-none transition focus:ring-4 ${
                    touched && walletError ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                  }`}
                />
                {touched && walletError && <span className="mt-1 block text-xs text-rose-600">{walletError}</span>}
              </label>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {tx('เบอร์ทดสอบ', 'Test numbers')}: <b className="font-mono text-slate-700">081-234-5678</b> {tx('(ผ่าน)', '(success)')} · <b className="font-mono text-slate-700">080-000-0000</b> {tx('(ยอดเงินไม่พอ)', '(insufficient balance)')}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Icon name="shield" className="h-3.5 w-3.5 text-emerald-600" />
                {tx('เราไม่เก็บเบอร์ที่กรอก ใช้ยืนยันการชำระครั้งนี้เท่านั้น', "We don't store this number — it's only used to confirm this payment.")}
              </p>
              </>
              )}
              {payError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{payError}</p>}
              <button type="submit" disabled={paying} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-60">
                <Icon name="wallet" className="h-5 w-5" />
                {payConfig.truemoney === 'opn'
                  ? (paying
                    ? tx('กำลังพาไปหน้า TrueMoney…', 'Taking you to TrueMoney…')
                    : tx(`ไปยืนยันกับ TrueMoney ${formatPrice(booking.totalAmount)}`, `Continue to TrueMoney · ${formatPrice(booking.totalAmount)}`))
                  : (paying
                    ? tx('กำลังรอยืนยันในแอป TrueMoney…', 'Waiting for approval in TrueMoney…')
                    : tx(`ชำระด้วย TrueMoney ${formatPrice(booking.totalAmount)}`, `Pay ${formatPrice(booking.totalAmount)} with TrueMoney`))}
              </button>
              {payConfig.truemoney === 'opn' && payError && (
                // ยืนยันในแอปแล้วแต่ผลยังไม่มา → กดให้ server ถาม Opn อีกครั้ง
                <button type="button" onClick={() => { setPayError(''); setSearchParams({ gateway_return: '1' }, { replace: true }); }} className="w-full rounded-2xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {tx('ตรวจสอบผลการชำระเงินอีกครั้ง', 'Check payment status again')}
                </button>
              )}
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
