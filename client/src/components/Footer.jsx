import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function Footer() {
  const { tx } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-xl font-black text-white">H</span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Hotel<span className="text-brand-600">Booking</span></span>
          </Link>
          <p className="mt-3 max-w-sm text-sm text-slate-500">
            {tx(
              'ค้นหาและจองที่พักทั่วไทยในไม่กี่คลิก ราคาโปร่งใส ยืนยันการจองทันที',
              'Find and book stays across Thailand in a few clicks — transparent prices, instant confirmation.'
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><Icon name="shield" className="h-4 w-4 text-emerald-600" />{tx('ชำระเงินปลอดภัย', 'Secure payment')}</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="zap" className="h-4 w-4 text-amber-500" />{tx('ยืนยันทันที', 'Instant confirmation')}</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-brand-600" />{tx('ยกเลิกฟรีก่อนวันเข้าพัก', 'Free cancellation')}</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{tx('สำรวจ', 'Explore')}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/search" className="hover:text-brand-600">{tx('ค้นหาที่พัก', 'Search stays')}</Link></li>
            <li><Link to="/search?q=Bangkok" className="hover:text-brand-600">{tx('โรงแรมในกรุงเทพฯ', 'Hotels in Bangkok')}</Link></li>
            <li><Link to="/search?q=Phuket" className="hover:text-brand-600">{tx('โรงแรมในภูเก็ต', 'Hotels in Phuket')}</Link></li>
            <li><Link to="/search?q=Chiang%20Mai" className="hover:text-brand-600">{tx('โรงแรมในเชียงใหม่', 'Hotels in Chiang Mai')}</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{tx('บัญชีของฉัน', 'My account')}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/my-bookings" className="hover:text-brand-600">{tx('การจองของฉัน', 'My bookings')}</Link></li>
            <li><Link to="/favorites" className="hover:text-brand-600">{tx('รายการโปรด', 'Favourites')}</Link></li>
            <li><Link to="/profile" className="hover:text-brand-600">{tx('โปรไฟล์', 'Profile')}</Link></li>
            <li><Link to="/privacy/my-data" className="hover:text-brand-600">{tx('ข้อมูลส่วนบุคคลของฉัน', 'My personal data')}</Link></li>
            <li><Link to="/privacy" className="hover:text-brand-600">{tx('นโยบายความเป็นส่วนตัว', 'Privacy policy')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">
        © {year} HotelBooking · {tx('โปรเจกต์รายวิชา — ข้อมูลและการชำระเงินเป็นการจำลอง', 'Course project — data and payments are simulated')}
      </div>
    </footer>
  );
}
