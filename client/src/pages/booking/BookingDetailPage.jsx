import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import BookingSteps from '../../components/BookingSteps.jsx';
import BookingSummary from '../../components/BookingSummary.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { STATUS_META, paymentLabel, paymentMethodLabel } from './bookingStatus.js';

// ใช้ 2 แบบ: /booking/success/:id (หลังจ่ายเงินเสร็จ) และ /bookings/:id (ดูรายละเอียดจากหน้าการจองของฉัน)
export default function BookingDetailPage({ justBooked = false }) {
  const { id } = useParams();
  const { lang, tx, formatPrice } = useLanguage();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    api(`/bookings/${id}`).then((data) => setBooking(data.booking)).catch((err) => setError(err.message));
  }, [id]);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(booking.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      const data = await api(`/bookings/${id}/cancel`, { method: 'POST' });
      setBooking(data.booking);
      setConfirmCancel(false);
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState icon="alert" tone="error" title={error} action={<Link to="/my-bookings" className="font-semibold text-brand-600">{tx('ไปที่การจองของฉัน', 'Go to My bookings')}</Link>} />
      </div>
    );
  }
  if (!booking) return <PageLoader />;

  const meta = STATUS_META[booking.status];
  const success = justBooked && booking.status === 'confirmed';

  return (
    <div className="mx-auto max-w-6xl">
      {justBooked && (
        <div className="mb-6 flex justify-end">
          <BookingSteps current={success ? 3 : 2} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          {success ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-900/15 sm:p-8">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
              <span className="relative flex h-14 w-14 animate-pop-in items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-lg">
                <Icon name="check" className="h-8 w-8" strokeWidth={3} />
              </span>
              <h1 className="relative mt-5 text-2xl font-black sm:text-3xl">{tx('จองสำเร็จแล้ว! 🎉', "You're all set! 🎉")}</h1>
              <p className="relative mt-1 text-white/90">
                {tx('ห้องพักของคุณได้รับการยืนยันแล้ว แสดงเลขที่การจองด้านล่างตอนเช็กอินได้เลย', 'Your room is confirmed. Show the booking reference below when you check in.')}
              </p>
            </div>
          ) : (
            <div>
              <Link to="/my-bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600">
                <Icon name="arrow-left" className="h-4 w-4" /> {tx('การจองของฉัน', 'My bookings')}
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{tx('รายละเอียดการจอง', 'Booking details')}</h1>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}>{meta.label(tx)}</span>
              </div>
            </div>
          )}

          {/* เลขที่การจอง */}
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{tx('เลขที่การจอง', 'Booking reference')}</p>
              <p className="mt-1 font-mono text-2xl font-black tracking-wider text-slate-900">{booking.reference}</p>
              <p className="mt-1 text-xs text-slate-500">{tx('จองเมื่อ', 'Booked on')} {formatDateTime(booking.createdAt, lang)}</p>
            </div>
            <button type="button" onClick={copyReference} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
              {copied ? tx('คัดลอกแล้ว', 'Copied') : tx('คัดลอก', 'Copy')}
            </button>
          </div>

          {/* ข้อมูลผู้เข้าพัก + การชำระเงิน */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="user" className="h-4 w-4 text-brand-600" />{tx('ผู้เข้าพัก', 'Guest')}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('ชื่อ', 'Name')}</dt><dd className="text-right font-semibold text-slate-900">{booking.guest.name}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('อีเมล', 'Email')}</dt><dd className="truncate text-right font-semibold text-slate-900">{booking.guest.email}</dd></div>
                {booking.guest.phone && <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('โทร', 'Phone')}</dt><dd className="text-right font-semibold text-slate-900">{booking.guest.phone}</dd></div>}
                {booking.specialRequests && <div className="rounded-xl bg-slate-50 p-2.5 text-xs italic text-slate-600">“{booking.specialRequests}”</div>}
              </dl>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="receipt" className="h-4 w-4 text-brand-600" />{tx('การชำระเงิน', 'Payment')}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('ยอดรวม', 'Total')}</dt><dd className="font-black text-slate-900">{formatPrice(booking.totalAmount)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('สถานะ', 'Status')}</dt><dd className="font-semibold text-slate-900">{paymentLabel(booking.paymentStatus, tx)}</dd></div>
                {booking.payment && (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">{tx('วิธีชำระ', 'Method')}</dt>
                      <dd className="font-semibold text-slate-900">{paymentMethodLabel(booking.payment.method, booking.payment.cardLast4, tx, booking.payment.viaGateway)}</dd>
                    </div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">{tx('ชำระเมื่อ', 'Paid at')}</dt><dd className="font-semibold text-slate-900">{formatDateTime(booking.payment.paidAt, lang)}</dd></div>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* สิ่งที่ต้องรู้ก่อนเดินทาง */}
          {['confirmed', 'awaiting_payment'].includes(booking.status) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <p className="text-sm font-bold text-slate-900">{tx('ก่อนเดินทาง', 'Before you go')}</p>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                <li className="flex gap-2.5"><Icon name="login" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{tx(`เช็กอินได้ตั้งแต่ 14:00 น. วันที่ ${formatDate(booking.checkIn, lang)}`, `Check in from 2:00 PM on ${formatDate(booking.checkIn, lang)}`)}</li>
                <li className="flex gap-2.5"><Icon name="ticket" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{tx('แสดงเลขที่การจองและบัตรประชาชน/พาสปอร์ตที่เคาน์เตอร์', 'Show your booking reference and ID/passport at the front desk')}</li>
                <li className="flex gap-2.5"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{tx('ยกเลิกฟรีได้จนถึงวันก่อนเช็กอิน', 'Free cancellation until the day before check-in')}</li>
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {booking.canPay && (
              <Link to={`/checkout/pay/${booking.id}`} className="flex-1 rounded-2xl bg-brand-600 py-3 text-center text-sm font-bold text-white shadow-md shadow-brand-600/25 hover:bg-brand-700">
                {tx('ชำระเงินต่อ', 'Continue to payment')}
              </Link>
            )}
            <Link to="/my-bookings" className="flex-1 rounded-2xl bg-slate-900 py-3 text-center text-sm font-bold text-white hover:bg-black">
              {tx('ดูการจองทั้งหมดของฉัน', 'View all my bookings')}
            </Link>
            <Link to={`/hotels/${booking.hotel.id}`} className="flex-1 rounded-2xl border border-slate-300 bg-white py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
              {tx('ดูหน้าที่พัก', 'View property')}
            </Link>
          </div>
          {booking.canCancel && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm font-semibold text-rose-600 hover:underline">
              {tx('ยกเลิกการจองนี้', 'Cancel this booking')}
            </button>
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
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={tx('ยกเลิกการจองนี้?', 'Cancel this booking?')}
        message={booking.paymentStatus !== 'Paid'
          ? tx('ห้องที่ถือไว้จะถูกปล่อยให้ผู้อื่นจอง', 'The held room will be released.')
          : booking.payment?.method === 'promptpay_live'
            // PromptPay เงินจริงโอนเข้าบัญชีตรง ไม่ผ่าน gateway → ระบบสั่งคืนเงินเองไม่ได้
            ? tx(`การจองนี้จ่ายด้วย PromptPay เงินจริง — ระบบโอนคืนอัตโนมัติไม่ได้ ต้องโอนคืน ${formatPrice(booking.totalAmount)} เอง และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `This booking was paid with real PromptPay — it can't be refunded automatically; transfer ${formatPrice(booking.totalAmount)} back yourself. The room will be released.`)
            : booking.payment?.manualRefund
              // PromptPay ผ่าน Opn: Opn คืนเงิน PromptPay ไม่ได้ → ผู้ดูแลระบบต้องโอนคืนเอง
              ? tx(`การจองนี้จ่ายด้วย PromptPay ผ่าน Opn ซึ่งคืนเงินอัตโนมัติไม่ได้ — ผู้ดูแลระบบจะโอนคืน ${formatPrice(booking.totalAmount)} ให้ภายหลัง และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `This booking was paid with PromptPay via Opn, which can't be refunded automatically — an admin will transfer ${formatPrice(booking.totalAmount)} back to you later. The room will be released.`)
              : tx(`ระบบจะคืนเงิน ${formatPrice(booking.totalAmount)} ไปยังช่องทางที่ชำระ และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `We'll refund ${formatPrice(booking.totalAmount)} to your original payment method and release the room.`)}
        confirmLabel={tx('ยืนยันการยกเลิก', 'Yes, cancel booking')}
        loading={cancelling}
        error={cancelError}
        onConfirm={cancel}
        onClose={() => { setConfirmCancel(false); setCancelError(''); }}
      />
    </div>
  );
}
