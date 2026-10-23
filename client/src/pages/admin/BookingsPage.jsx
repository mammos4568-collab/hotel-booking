// หลังบ้าน: การจอง — กรองตามสถานะ/โรงแรม/วันเช็กอิน ค้นด้วยเลขที่การจองหรือชื่อ/อีเมลผู้เข้าพัก
// เปิดดูรายละเอียด + ประวัติการชำระเงิน · ยกเลิกให้ลูกค้าได้ (ต้องใส่เหตุผล · จ่ายแล้วคืนเงินเต็มจำนวน)
// ตัวกรองเก็บไว้ใน URL (?status=…&q=…) → กดย้อนกลับ/แชร์ลิงก์แล้วได้หน้าเดิม
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { STATUS_META, paymentLabel, paymentMethodLabel } from '../booking/bookingStatus.js';
import {
  Field, HotelFilter, Modal, Notice, PageHeader, Pagination, baht, buttonDanger, buttonSecondary, card, inputClass, useAdminData,
} from './adminUi.jsx';

const STATUSES = ['awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired'];
const FILTER_KEYS = ['status', 'hotelId', 'q', 'from', 'to', 'page'];

function StatusBadge({ status }) {
  const { tx } = useLanguage();
  const meta = STATUS_META[status];
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.className}`}>{meta.label(tx)}</span>;
}

function BookingDetail({ bookingId, onClose, onChanged }) {
  const { lang, tx } = useLanguage();
  const { data, error, reload } = useAdminData(`/admin/bookings/${bookingId}`);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ loading: false, error: '', done: '' });
  const booking = data?.booking;

  const cancel = async () => {
    setState({ loading: true, error: '', done: '' });
    try {
      const result = await api(`/admin/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason } });
      setState({ loading: false, error: '', done: result.refunded ? tx('ยกเลิกแล้ว และคืนเงินเต็มจำนวน', 'Cancelled and fully refunded') : tx('ยกเลิกแล้ว', 'Cancelled') });
      setCancelling(false);
      reload();
      onChanged();
    } catch (err) {
      setState({ loading: false, error: err.message, done: '' });
    }
  };

  const row = (label, value) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );

  return (
    <Modal open wide title={booking ? booking.reference : tx('รายละเอียดการจอง', 'Booking details')} onClose={state.loading ? () => {} : onClose}>
      {!booking ? (
        error ? <Notice>{error}</Notice> : <PageLoader />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={booking.status} />
            <span className="text-xs text-slate-500">{tx('จองเมื่อ', 'Booked')} {formatDateTime(booking.createdAt, lang)}</span>
          </div>
          {state.done && <Notice tone="success">{state.done}</Notice>}

          <div className="grid gap-5 sm:grid-cols-2">
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{tx('การเข้าพัก', 'Stay')}</h3>
              <dl className="divide-y divide-slate-100">
                {row(tx('โรงแรม', 'Hotel'), booking.hotel.name)}
                {row(tx('ห้อง', 'Room'), booking.room.name)}
                {row(tx('เช็กอิน', 'Check-in'), formatDate(booking.checkIn, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}
                {row(tx('เช็กเอาต์', 'Check-out'), formatDate(booking.checkOut, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}
                {row(tx('คืน · ห้อง · ผู้เข้าพัก', 'Nights · rooms · guests'), `${booking.nights} · ${booking.rooms} · ${booking.guests}`)}
                {row(tx('ยอดรวม', 'Total'), baht(booking.totalAmount))}
              </dl>
            </section>
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{tx('ผู้เข้าพัก', 'Guest')}</h3>
              <dl className="divide-y divide-slate-100">
                {row(tx('ชื่อ', 'Name'), booking.guest.name || '—')}
                {row(tx('อีเมล', 'Email'), booking.guest.email ? <a href={`mailto:${booking.guest.email}`} className="text-brand-700 hover:underline">{booking.guest.email}</a> : '—')}
                {row(tx('โทร', 'Phone'), booking.guest.phone ? <a href={`tel:${booking.guest.phone}`} className="text-brand-700 hover:underline">{booking.guest.phone}</a> : '—')}
              </dl>
              {booking.specialRequests && (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="block text-xs font-bold text-slate-500">{tx('คำขอพิเศษ', 'Special requests')}</span>{booking.specialRequests}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">{tx('ใช้ข้อมูลติดต่อเพื่อการเข้าพักครั้งนี้เท่านั้น (PDPA)', 'Use contact details for this stay only (PDPA)')}</p>
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{tx('การชำระเงิน', 'Payments')}</h3>
            {booking.payments.length === 0 ? (
              <p className="text-sm text-slate-500">{tx('ยังไม่มีการชำระเงิน', 'No payments yet')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {booking.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {paymentMethodLabel(payment.method, payment.cardLast4, tx)}
                      <span className="ml-2 text-xs text-slate-400">{formatDateTime(payment.paidAt, lang)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-slate-900">{baht(payment.amount)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{paymentLabel(payment.status === 'Success' ? 'paid' : payment.status, tx)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {['awaiting_payment', 'confirmed'].includes(booking.status) && (
            <section className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
              {!cancelling ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">{tx('ยกเลิกแทนลูกค้า เช่น ที่พักปิดปรับปรุง หรือลูกค้าแจ้งทางโทรศัพท์', 'Cancel on the guest’s behalf, e.g. the property is closed')}</p>
                  <button type="button" onClick={() => setCancelling(true)} className={buttonDanger}>
                    <Icon name="x" className="h-4 w-4" />{tx('ยกเลิกการจองนี้', 'Cancel this booking')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label={tx('เหตุผลการยกเลิก', 'Reason')} required hint={tx('บันทึกไว้ในบันทึกการทำงาน — ไม่ต้องใส่ข้อมูลส่วนตัวของลูกค้า', 'Kept in the activity log — do not include personal data')}>
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} minLength={5} maxLength={300} className={inputClass} />
                  </Field>
                  <Notice tone="info">
                    {booking.paymentStatus === 'Paid'
                      ? tx(`ลูกค้าชำระแล้ว — ระบบจะคืนเงิน ${baht(booking.totalAmount)} เต็มจำนวน`, `Paid — ${baht(booking.totalAmount)} will be refunded in full`)
                      : tx('ยังไม่ได้ชำระเงิน — ห้องจะกลับมาว่างทันที', 'Not paid yet — the room is released immediately')}
                  </Notice>
                  {state.error && <Notice>{state.error}</Notice>}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setCancelling(false)} disabled={state.loading} className={buttonSecondary}>{tx('ไม่ยกเลิก', 'Keep booking')}</button>
                    <button type="button" onClick={cancel} disabled={state.loading || reason.trim().length < 5} className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                      {state.loading ? tx('กำลังยกเลิก…', 'Cancelling…') : tx('ยืนยันยกเลิก', 'Confirm cancellation')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function BookingsPage() {
  const { lang, tx } = useLanguage();
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const [search, setSearch] = useState(filters.q);
  const [openId, setOpenId] = useState(null);

  // แก้ตัวกรอง → เขียนลง URL (เปลี่ยนตัวกรองอื่นเมื่อไร กลับไปหน้า 1)
  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...patch }).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  // พิมพ์ค้นหาแล้วรอ 350ms ค่อยเขียนลง URL (ไม่ยิง API ทุกตัวอักษร) — ทำงานเฉพาะตอนข้อความค้นหาเปลี่ยน
  useEffect(() => {
    const timer = setTimeout(() => search.trim() !== filters.q && update({ q: search.trim() }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const { data, error, loading, reload } = useAdminData(`/admin/bookings${query ? `?${query}` : ''}`);
  const hasFilters = FILTER_KEYS.some((key) => key !== 'page' && filters[key]);

  return (
    <div>
      <PageHeader title={tx('การจอง', 'Bookings')} description={tx('เรียงตามวันเช็กอินล่าสุดก่อน', 'Latest check-in first')} />

      <div className={`${card} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <Field label={tx('ค้นหา', 'Search')} className="w-full sm:w-64">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx('เลขที่การจอง ชื่อ หรืออีเมล', 'Reference, name or email')} className={inputClass} />
        </Field>
        <Field label={tx('สถานะ', 'Status')} className="w-full sm:w-44">
          <select value={filters.status} onChange={(event) => update({ status: event.target.value })} className={inputClass}>
            <option value="">{tx('ทุกสถานะ', 'All statuses')}</option>
            {STATUSES.map((status) => <option key={status} value={status}>{STATUS_META[status].label(tx)}</option>)}
          </select>
        </Field>
        <Field label={tx('โรงแรม', 'Hotel')} className="w-full sm:w-auto">
          <HotelFilter value={filters.hotelId} onChange={(hotelId) => update({ hotelId })} />
        </Field>
        <Field label={tx('เช็กอินตั้งแต่', 'Check-in from')} className="w-[calc(50%-6px)] sm:w-40">
          <input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} className={inputClass} />
        </Field>
        <Field label={tx('ถึง', 'to')} className="w-[calc(50%-6px)] sm:w-40">
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} className={inputClass} />
        </Field>
        {hasFilters && (
          <button type="button" onClick={() => { setSearch(''); setParams({}, { replace: true }); }} className="pb-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
            {tx('ล้างตัวกรอง', 'Clear filters')}
          </button>
        )}
      </div>

      {error && <Notice>{error}</Notice>}
      {!data ? (
        !error && <PageLoader />
      ) : data.bookings.length === 0 ? (
        <EmptyState icon="receipt" title={tx('ไม่พบการจอง', 'No bookings found')} description={hasFilters ? tx('ลองเปลี่ยนตัวกรอง', 'Try different filters') : ''} />
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {data.bookings.map((booking) => (
              <li key={booking.id}>
                <button type="button" onClick={() => setOpenId(booking.id)} className="grid w-full gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[1.2fr_1.4fr_1fr_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-slate-900">{booking.guest.name || tx('(ลบบัญชีแล้ว)', '(account deleted)')}</span>
                    <span className="block font-mono text-xs text-slate-400">{booking.reference}</span>
                  </span>
                  <span className="min-w-0 text-sm text-slate-600">
                    <span className="block truncate">{booking.hotel.name}</span>
                    <span className="block truncate text-xs text-slate-400">{booking.room.name} · {tx(`${booking.rooms} ห้อง ${booking.guests} คน`, `${booking.rooms} rooms, ${booking.guests} guests`)}</span>
                  </span>
                  <span className="text-sm text-slate-700">
                    {formatDate(booking.checkIn, lang, { day: 'numeric', month: 'short' })} – {formatDate(booking.checkOut, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
                    <span className="block text-xs text-slate-400">{tx(`${booking.nights} คืน`, `${booking.nights} nights`)} · {baht(booking.totalAmount)}</span>
                  </span>
                  <span className="flex items-center gap-2 sm:justify-end">
                    <StatusBadge status={booking.status} />
                    <Icon name="chevron-right" className="hidden h-4 w-4 text-slate-400 sm:block" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={(page) => update({ ...filters, page: String(page) })} />
        </div>
      )}

      {openId && <BookingDetail bookingId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}
