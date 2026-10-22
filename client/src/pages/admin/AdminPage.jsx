// [D] หลังบ้าน — เมนูด้านข้าง + หน้าย่อย (nested routes ใต้ /admin/*)
//   owner = เจ้าของโรงแรม: เห็น/แก้เฉพาะโรงแรมตัวเอง · admin = ผู้ดูแลระบบ: ทุกโรงแรม + ผู้ใช้ + บันทึกการทำงาน
// การซ่อนเมนูเป็นแค่ความสะดวก — สิทธิ์จริงตรวจที่ server ทุกคำขอ (ยิง API ตรงๆ ก็ได้ 403)
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import AuditPage from './AuditPage.jsx';
import BookingsPage from './BookingsPage.jsx';
import DashboardPage from './DashboardPage.jsx';
import HotelEditorPage from './HotelEditorPage.jsx';
import HotelsPage from './HotelsPage.jsx';
import ReviewsPage from './ReviewsPage.jsx';
import RoomCalendarPage from './RoomCalendarPage.jsx';
import UsersPage from './UsersPage.jsx';
import { RoleBadge } from './adminUi.jsx';

const NAV = [
  { to: '/admin', end: true, icon: 'chart', th: 'ภาพรวม', en: 'Overview' },
  { to: '/admin/hotels', icon: 'building', th: 'โรงแรมและห้องพัก', en: 'Hotels & rooms' },
  { to: '/admin/bookings', icon: 'receipt', th: 'การจอง', en: 'Bookings' },
  { to: '/admin/reviews', icon: 'star', th: 'รีวิว', en: 'Reviews' },
  { to: '/admin/users', icon: 'users', th: 'ผู้ใช้และสิทธิ์', en: 'Users & roles', adminOnly: true },
  { to: '/admin/audit', icon: 'shield', th: 'บันทึกการทำงาน', en: 'Activity log', adminOnly: true },
];

export default function AdminPage() {
  const { user } = useAuth();
  const { tx } = useLanguage();
  const isAdmin = user.role === 'admin';
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);
  const linkClass = ({ isActive }) =>
    `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <aside className="mb-6 lg:sticky lg:top-24 lg:mb-0 lg:w-60 lg:shrink-0">
        <div className="mb-3 hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{tx('หลังบ้าน', 'Back office')}</p>
          <p className="mt-1 truncate font-bold text-slate-900">{user.name}</p>
          <div className="mt-1.5"><RoleBadge role={user.role} /></div>
        </div>
        {/* มือถือ: เมนูเลื่อนแนวนอน · จอใหญ่: เมนูแนวตั้งด้านซ้าย */}
        <nav aria-label={tx('เมนูหลังบ้าน', 'Back office menu')} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <Icon name={item.icon} className="h-4 w-4" />
              {tx(item.th, item.en)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="hotels" element={<HotelsPage />} />
          <Route path="hotels/new" element={<HotelEditorPage />} />
          <Route path="hotels/:id" element={<HotelEditorPage />} />
          <Route path="rooms/:roomId/calendar" element={<RoomCalendarPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          {isAdmin && <Route path="users" element={<UsersPage />} />}
          {isAdmin && <Route path="audit" element={<AuditPage />} />}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
