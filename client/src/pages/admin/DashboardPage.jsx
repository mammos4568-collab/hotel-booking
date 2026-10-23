// หลังบ้าน: ภาพรวม — ตัวเลขสำคัญ + กราฟรายได้รายวัน + อัตราเข้าพักล่วงหน้า + เช็กอินที่ใกล้ถึง
// owner เห็นเฉพาะโรงแรมตัวเอง · admin เห็นทั้งระบบ (server กรองให้ — หน้าเว็บไม่ต้องกรองเอง)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';
import { STATUS_META } from '../booking/bookingStatus.js';
import BarChart, { ChartCard } from './BarChart.jsx';
import { PageHeader, baht, card, compactNumber, useAdminData } from './adminUi.jsx';

const RANGES = [7, 30, 90];
const STATUS_ORDER = ['confirmed', 'awaiting_payment', 'completed', 'cancelled', 'expired'];
const percent = (ratio) => `${Math.round(ratio * 100)}%`;

// เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน: ขึ้น = เขียว ลง = แดง (มีลูกศร + เครื่องหมาย ไม่ใช้สีอย่างเดียว)
function Delta({ current, previous, days }) {
  const { tx } = useLanguage();
  const against = tx(`เทียบ ${days} วันก่อนหน้า`, `vs previous ${days} days`);
  if (!previous) {
    return <p className="mt-1 text-xs text-slate-500">{current ? tx('ช่วงก่อนหน้ายังไม่มีข้อมูล', 'No data in the previous period') : against}</p>;
  }
  const change = (current - previous) / previous;
  const up = change >= 0;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
      <span className={`inline-flex items-center gap-0.5 font-bold ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
        <Icon name={up ? 'trending-up' : 'trending-down'} className="h-3.5 w-3.5" />
        {up ? '+' : '−'}{Math.abs(Math.round(change * 100))}%
      </span>
      {against}
    </p>
  );
}

function StatTile({ label, value, children }) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {children}
    </div>
  );
}

// แถบสัดส่วน: ส่วนที่เต็มกับราง ใช้สีโทนเดียวกัน (เข้ม/อ่อน)
function Meter({ ratio, label }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

function StatusBreakdown({ counts, days }) {
  const { tx } = useLanguage();
  const total = STATUS_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  return (
    <section className={`${card} p-5`}>
      <h2 className="text-base font-extrabold text-slate-900">{tx('การจองใหม่แยกตามสถานะ', 'New bookings by status')}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{tx(`จองใน ${days} วันล่าสุด · ${total} รายการ`, `Made in the last ${days} days · ${total} total`)}</p>
      <ul className="mt-4 space-y-3">
        {STATUS_ORDER.map((key) => {
          const count = counts[key] ?? 0;
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-700">{STATUS_META[key].label(tx)}</span>
                <span className="font-bold tabular-nums text-slate-900">
                  {count} <span className="text-xs font-normal text-slate-400">({total ? percent(count / total) : '0%'})</span>
                </span>
              </div>
              <Meter ratio={total ? count / total : 0} label={STATUS_META[key].label(tx)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TopHotels({ hotels, days }) {
  const { tx } = useLanguage();
  const best = Math.max(0, ...hotels.map((hotel) => hotel.revenue));
  return (
    <section className={`${card} p-5`}>
      <h2 className="text-base font-extrabold text-slate-900">{tx('โรงแรมที่ทำรายได้สูงสุด', 'Top hotels by revenue')}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{tx(`${days} วันล่าสุด`, `Last ${days} days`)}</p>
      {hotels.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">{tx('ยังไม่มีรายได้ในช่วงนี้', 'No revenue in this period')}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {hotels.map((hotel, index) => (
            <li key={hotel.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link to={`/admin/hotels/${hotel.id}`} className="min-w-0 truncate text-slate-700 hover:text-brand-700">
                  <span className="mr-1.5 text-xs font-bold text-slate-400">{index + 1}</span>{hotel.name}
                </Link>
                <span className="shrink-0 font-bold tabular-nums text-slate-900">{baht(hotel.revenue)}</span>
              </div>
              <Meter ratio={best ? hotel.revenue / best : 0} label={hotel.name} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function UpcomingCheckIns({ upcoming }) {
  const { lang, tx } = useLanguage();
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">{tx('เช็กอินภายใน 7 วัน', 'Check-ins in the next 7 days')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{tx('การจองที่ยืนยันแล้วหรือรอชำระเงิน', 'Confirmed or awaiting payment')}</p>
        </div>
        <Link to="/admin/bookings" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
          {tx(`ดูการจองทั้งหมด`, 'All bookings')}
        </Link>
      </div>
      {upcoming.bookings.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">{tx('ไม่มีผู้เข้าพักใน 7 วันนี้', 'No arrivals in the next 7 days')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs font-bold text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-3">{tx('เช็กอิน', 'Check-in')}</th>
                <th className="py-2 pr-3">{tx('ผู้เข้าพัก', 'Guest')}</th>
                <th className="py-2 pr-3">{tx('โรงแรม / ห้อง', 'Hotel / room')}</th>
                <th className="py-2 pr-3">{tx('คืน · ห้อง', 'Nights · rooms')}</th>
                <th className="py-2">{tx('สถานะ', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcoming.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="py-2.5 pr-3 font-semibold text-slate-900">{formatDate(booking.checkIn, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="py-2.5 pr-3">
                    <Link to={`/admin/bookings?q=${encodeURIComponent(booking.reference)}`} className="font-semibold text-slate-800 hover:text-brand-700">{booking.guestName || '—'}</Link>
                    <p className="font-mono text-xs text-slate-400">{booking.reference}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{booking.hotel}<p className="text-xs text-slate-400">{booking.room}</p></td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">{booking.nights} · {booking.rooms}</td>
                  <td className="py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_META[booking.status].className}`}>{STATUS_META[booking.status].label(tx)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {upcoming.total > upcoming.bookings.length && (
            <p className="mt-3 text-xs text-slate-500">{tx(`และอีก ${upcoming.total - upcoming.bookings.length} รายการ`, `and ${upcoming.total - upcoming.bookings.length} more`)}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { lang, tx } = useLanguage();
  const [days, setDays] = useState(30);
  const { data, error, loading } = useAdminData(`/admin/stats?days=${days}`);

  if (!data) return error ? <p className="text-rose-600">{error}</p> : <PageLoader />;

  const short = { day: 'numeric', month: 'short' };
  const full = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const revenueData = data.revenueByDay.map((day) => ({
    key: day.date,
    label: formatDate(day.date, lang, short),
    title: formatDate(day.date, lang, full),
    value: day.revenue,
    detail: tx(`ชำระเงิน ${day.payments} รายการ`, `${day.payments} payments`),
  }));
  const occupancyData = data.occupancy.byDay.map((day) => ({
    key: day.date,
    label: formatDate(day.date, lang, short),
    title: formatDate(day.date, lang, full),
    value: day.capacity ? day.booked / day.capacity : 0,
    detail: tx(`จองแล้ว ${day.booked} จาก ${day.capacity} ห้อง`, `${day.booked} of ${day.capacity} rooms booked`),
  }));
  const { occupancy, totals } = data;

  return (
    <div>
      <PageHeader
        title={tx('ภาพรวม', 'Overview')}
        description={user.role === 'admin'
          ? tx(`ทั้งระบบ · ${totals.hotels} โรงแรม · ${totals.rooms} ห้อง`, `All properties · ${totals.hotels} hotels · ${totals.rooms} rooms`)
          : tx(`โรงแรมของคุณ ${totals.hotels} แห่ง · ${totals.rooms} ห้อง`, `Your ${totals.hotels} hotels · ${totals.rooms} rooms`)}
        actions={(
          // ตัวกรองช่วงเวลา (แถวเดียวด้านบน) — มีผลกับตัวเลขและกราฟทุกตัวในหน้านี้
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label={tx('ช่วงเวลา', 'Date range')}>
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                aria-pressed={days === range}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${days === range ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tx(`${range} วัน`, `${range} days`)}
              </button>
            ))}
          </div>
        )}
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {/* โรงแรมรออนุมัติ: admin = คิวงานที่ต้องตรวจ · owner = โรงแรมของตัวเองที่ลูกค้ายังไม่เห็น */}
      {totals.pendingHotels > 0 && (
        <Link
          to="/admin/hotels?status=pending"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          <span className="flex items-center gap-2">
            <Icon name="clock" className="h-5 w-5 shrink-0" />
            {user.role === 'admin'
              ? tx(`มีโรงแรมรออนุมัติ ${totals.pendingHotels} แห่ง — ลูกค้ายังไม่เห็นจนกว่าคุณจะอนุมัติ`, `${totals.pendingHotels} hotel(s) waiting for your approval — hidden from guests until approved`)
              : tx(`โรงแรมของคุณรอผู้ดูแลระบบอนุมัติ ${totals.pendingHotels} แห่ง`, `${totals.pendingHotels} of your hotels are waiting for admin approval`)}
          </span>
          <Icon name="chevron-right" className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* ระหว่างโหลดช่วงใหม่ คงหน้าเดิมไว้แบบจางลง (ไม่กระพริบ ไม่กระโดด) */}
      <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={tx(`รายได้ ${days} วันล่าสุด`, `Revenue, last ${days} days`)} value={baht(data.current.revenue)}>
            <Delta current={data.current.revenue} previous={data.previous.revenue} days={days} />
          </StatTile>
          <StatTile label={tx(`การจองใหม่ ${days} วันล่าสุด`, `New bookings, last ${days} days`)} value={data.current.bookings.toLocaleString()}>
            <Delta current={data.current.bookings} previous={data.previous.bookings} days={days} />
          </StatTile>
          <StatTile label={tx('อัตราเข้าพัก 30 คืนข้างหน้า', 'Occupancy, next 30 nights')} value={occupancy.rate === null ? '—' : percent(occupancy.rate)}>
            <Meter ratio={occupancy.rate ?? 0} label={tx('อัตราเข้าพัก', 'Occupancy')} />
            <p className="mt-1.5 text-xs text-slate-500">{tx(`จองแล้ว ${occupancy.booked.toLocaleString()} จาก ${occupancy.capacity.toLocaleString()} ห้อง-คืน`, `${occupancy.booked.toLocaleString()} of ${occupancy.capacity.toLocaleString()} room-nights`)}</p>
          </StatTile>
          <StatTile label={tx('คะแนนรีวิวเฉลี่ย', 'Average review score')} value={totals.avgRating === null ? '—' : `${totals.avgRating.toFixed(2)} / 5`}>
            <p className="mt-1 text-xs text-slate-500">{tx(`จาก ${totals.reviews.toLocaleString()} รีวิว`, `From ${totals.reviews.toLocaleString()} reviews`)}</p>
          </StatTile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title={tx('รายได้รายวัน', 'Daily revenue')}
            subtitle={tx('เงินที่ชำระสำเร็จ ไม่รวมรายการที่คืนเงินแล้ว (บาท)', 'Successful payments, refunds excluded (THB)')}
            rows={revenueData.map((row) => ({ key: row.key, title: row.title, value: baht(row.value) }))}
            valueLabel={tx('รายได้', 'Revenue')}
          >
            <BarChart
              data={revenueData}
              formatValue={baht}
              formatTick={compactNumber}
              ariaLabel={tx('กราฟรายได้รายวัน', 'Daily revenue chart')}
              emptyText={tx('ยังไม่มีรายได้ในช่วงนี้', 'No revenue in this period')}
            />
          </ChartCard>
          <StatusBreakdown counts={data.statusCounts} days={days} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title={tx('อัตราเข้าพักรายคืน 30 คืนข้างหน้า', 'Occupancy by night, next 30 nights')}
            subtitle={tx('ห้องที่ถูกจอง ÷ ห้องที่เปิดขายในคืนนั้น (รวมการจองที่รอชำระเงิน)', 'Rooms booked ÷ rooms on sale that night (includes unpaid holds)')}
            rows={occupancyData.map((row) => ({ key: row.key, title: row.title, value: `${percent(row.value)} · ${row.detail}` }))}
            valueLabel={tx('อัตราเข้าพัก', 'Occupancy')}
          >
            <BarChart
              data={occupancyData}
              formatValue={percent}
              formatTick={percent}
              maxValue={1}
              ariaLabel={tx('กราฟอัตราเข้าพักรายคืน', 'Nightly occupancy chart')}
              emptyText={tx('ยังไม่มีการจองใน 30 คืนข้างหน้า', 'No bookings in the next 30 nights')}
            />
          </ChartCard>
          <TopHotels hotels={data.topHotels} days={days} />
        </div>

        <UpcomingCheckIns upcoming={data.upcoming} />
      </div>
    </div>
  );
}
