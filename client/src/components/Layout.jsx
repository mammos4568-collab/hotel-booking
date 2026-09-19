// [A] Layout กลาง — navbar ใช้ร่วมกันทุกหน้า
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

export default function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <>
      <header className="navbar">
        <div className="nav-left">
          <Link to="/" className="logo">
            <span className="logo-mark">H</span>
            <span>Hotel<b>Booking</b></span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/" end>โรงแรม</NavLink>
            <NavLink to="/my-bookings">การจองของฉัน</NavLink>
          </nav>
        </div>
        <div className="nav-right">
          <Link to="/admin" className="btn-outline">ลงประกาศที่พัก</Link>
          <span className="currency">฿ THB</span>
          <Link to="/login" className="nav-signin">เข้าสู่ระบบ</Link>
          <Link to="/login" className="btn-outline">สมัครสมาชิก</Link>
        </div>
      </header>
      <main className={isHome ? '' : 'container'}>
        <Outlet />
      </main>
    </>
  );
}
