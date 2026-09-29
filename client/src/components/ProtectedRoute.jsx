import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading, openAuthModal } = useAuth();
  const location = useLocation();

  // เมื่อโหลดเสร็จแล้วและไม่มี user → เปิด Modal แล้ว redirect ไป home
  useEffect(() => {
    if (!loading && !user) {
      openAuthModal('login');
    }
  }, [loading, user, openAuthModal]);

  if (loading) return <div className="p-10 text-center text-sm text-slate-500">Loading...</div>;

  // ยังไม่ login → redirect กลับ home (AuthModal จะเปิดอัตโนมัติผ่าน useEffect)
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;

  // login แล้วแต่ role ไม่ตรง → redirect home
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
