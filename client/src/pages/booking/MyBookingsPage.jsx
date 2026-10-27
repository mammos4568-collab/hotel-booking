// [B] การจองของฉัน — แท็บ กำลังจะถึง / ผ่านไปแล้ว / ยกเลิก + ปุ่มชำระเงิน/ยกเลิก/รีวิว
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { cityLabel, formatDate } from '../../lib/format.js';
import { STATUS_META, cancelDeadlineNote, cancelNote } from './bookingStatus.js';

const TABS = [
  { key: 'upcoming', statuses: ['awaiting_payment', 'confirmed'] },
  { key: 'past', statuses: ['completed'] },
  { key: 'cancelled', statuses: ['cancelled', 'expired'] },
];

function BookingCard({ booking, onCancel }) {
  const { lang, tx, formatPrice } = useLanguage();
  const meta = STATUS_META[booking.status];
  const dateOpts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const deadline = cancelDeadlineNote(booking, tx, lang);

  return (
    <article className="flex animate-slide-up flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition hover:shadow-lg hover:shadow-slate-900/5 sm:flex-row">
      <Link to={`/bookings/${booking.id}`} className="sm:w-56 sm:shrink-0">
        <SmartImage src={booking.hotel.imageUrl} alt={booking.hotel.name} width={480} className="h-44 sm:h-full" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{booking.reference}</p>
            <Link to={`/bookings/${booking.id}`} className="mt-0.5 block text-lg font-extrabold leading-snug text-slate-900 hover:text-brand-700">{booking.hotel.name}</Link>
            <p className="text-sm text-slate-500">{booking.room.name} · {cityLabel(booking.hotel.city, lang)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}>{meta.label(tx)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('เช็กอิน', 'Check-in')}</p>
            <p className="font-semibold text-slate-900">{formatDate(booking.checkIn, lang, dateOpts)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('เช็กเอาต์', 'Check-out')}</p>
            <p className="font-semibold text-slate-900">{formatDate(booking.checkOut, lang, dateOpts)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('ผู้เข้าพัก', 'Guests')}</p>
            <p className="font-semibold text-slate-900">
              {booking.guests} · {booking.nights} {tx('คืน', 'nights')}
              {booking.rooms > 1 && <> · {booking.rooms} {tx('ห้อง', 'rooms')}</>}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tx('ยอดรวม', 'Total')}</p>
            <p className="font-black text-slate-900">{formatPrice(booking.totalAmount)}</p>
          </div>
        </div>

        {!booking.canCancel && deadline && (
          // จ่ายแล้วแต่ถึงวันเช็กอินแล้ว — บอกให้ชัดว่าใบนี้ยกเลิกเองไม่ได้เพราะอะไร และต้องทำยังไง (ไม่ใช่ซ่อนปุ่มเฉยๆ)
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{deadline}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {booking.canPay && (
            <Link to={`/checkout/pay/${booking.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-brand-600/25 hover:bg-brand-700">
              <Icon name="card" className="h-4 w-4" />{tx('ชำระเงิน', 'Pay now')}
            </Link>
          )}
          {booking.canReview && (
            <Link to={`/hotels/${booking.hotel.id}#reviews`} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300">
              <Icon name="star" className="h-4 w-4" />{tx('เขียนรีวิว', 'Write a review')}
            </Link>
          )}
          <Link to={`/bookings/${booking.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {tx('ดูรายละเอียด', 'View details')}
          </Link>
          {['cancelled', 'expired', 'completed'].includes(booking.status) && (
            <Link to={`/hotels/${booking.hotel.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="arrow-right" className="h-4 w-4" />{tx('จองอีกครั้ง', 'Book again')}
            </Link>
          )}
          {booking.canCancel && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {/* จ่ายแล้ว → บอกวันสุดท้ายที่ยกเลิกได้ · ยังไม่จ่ายไม่มีกำหนด (deadline = null) */}
              {deadline && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <Icon name="shield" className="h-3.5 w-3.5" />{deadline}
                </span>
              )}
              <button type="button" onClick={() => onCancel(booking)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                <Icon name="x" className="h-4 w-4" />{tx('ยกเลิกการจอง', 'Cancel booking')}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MyBookingsPage() {
  const { tx, formatPrice } = useLanguage();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('upcoming');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    api('/bookings/me').then((data) => setBookings(data.bookings || [])).catch((err) => setError(err.message));
  }, []);

  const confirmCancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      const { booking } = await api(`/bookings/${cancelTarget.id}/cancel`, { method: 'POST' });
      setBookings((list) => list.map((b) => (b.id === booking.id ? booking : b)));
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) return <div className="mx-auto max-w-xl py-10"><EmptyState icon="alert" tone="error" title={tx('โหลดการจองไม่สำเร็จ', 'Could not load bookings')} description={error} /></div>;
  if (!bookings) return <PageLoader />;

  const counts = Object.fromEntries(TABS.map((t) => [t.key, bookings.filter((b) => t.statuses.includes(b.status)).length]));
  const current = TABS.find((t) => t.key === tab);
  // กำลังจะถึง: เรียงจากวันเข้าพักที่ใกล้ที่สุดก่อน · แท็บอื่น: ล่าสุดก่อน
  const list = bookings
    .filter((b) => current.statuses.includes(b.status))
    .sort((a, b) => (tab === 'upcoming' ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn)));
  const labels = {
    upcoming: tx('กำลังจะถึง', 'Upcoming'),
    past: tx('ผ่านไปแล้ว', 'Past stays'),
    cancelled: tx('ยกเลิก', 'Cancelled'),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">{tx('การจองของฉัน', 'My bookings')}</h1>
        <p className="text-sm text-slate-500">{tx('จัดการทริปทั้งหมดของคุณได้ที่นี่', 'Manage all your trips in one place')}</p>
      </header>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-200/70 p-1 no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {labels[t.key]}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-300/80 text-slate-700'}`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {list.length === 0 ? (
          <EmptyState
            icon={tab === 'upcoming' ? 'calendar' : tab === 'past' ? 'map' : 'ticket'}
            title={tab === 'upcoming' ? tx('ยังไม่มีทริปที่กำลังจะถึง', 'No upcoming trips') : tab === 'past' ? tx('ยังไม่มีประวัติการเข้าพัก', 'No past stays yet') : tx('ไม่มีการจองที่ถูกยกเลิก', 'No cancelled bookings')}
            description={tab === 'upcoming' ? tx('ค้นหาที่พักถูกใจแล้วเริ่มวางแผนทริปถัดไปของคุณ', 'Find a place you love and start planning your next trip.') : undefined}
            action={tab === 'upcoming' && <Link to="/search" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">{tx('ค้นหาที่พัก', 'Search stays')}</Link>}
          />
        ) : (
          list.map((booking) => <BookingCard key={booking.id} booking={booking} onCancel={setCancelTarget} />)
        )}
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={tx('ยกเลิกการจองนี้?', 'Cancel this booking?')}
        message={cancelTarget && (
          <>
            <p><b>{cancelTarget.hotel.name}</b> · {cancelTarget.reference}</p>
            <p className="mt-1">{cancelNote(cancelTarget, tx, formatPrice)}</p>
          </>
        )}
        confirmLabel={tx('ยืนยันการยกเลิก', 'Yes, cancel')}
        loading={cancelling}
        error={cancelError}
        onConfirm={confirmCancel}
        onClose={() => { setCancelTarget(null); setCancelError(''); }}
      />
    </div>
  );
}
