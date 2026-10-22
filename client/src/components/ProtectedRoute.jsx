import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import Icon from './Icon.jsx';
import { PageLoader } from './Loading.jsx';

// หน้าที่ต้องล็อกอิน: ถ้ายังไม่ล็อกอินจะ "อยู่หน้าเดิม" แล้วเปิดหน้าต่างเข้าสู่ระบบให้
// ล็อกอินเสร็จเนื้อหาของหน้านั้นจะแสดงต่อทันที ไม่ต้องย้อนกลับมาเอง (เดิมเด้งไปหน้าแรก)
export default function ProtectedRoute({ children, roles }) {
  const { user, loading, openAuthModal } = useAuth();
  const { tx } = useLanguage();
  const asked = useRef(false);

  // เปิดหน้าต่างเข้าสู่ระบบอัตโนมัติครั้งเดียว — ถ้าผู้ใช้ปิดไปจะไม่เด้งซ้ำ (ยังกดปุ่มด้านล่างได้)
  useEffect(() => {
    if (!loading && !user && !asked.current) {
      asked.current = true;
      openAuthModal('login');
    }
  }, [loading, user, openAuthModal]);

  if (loading) return <PageLoader />;

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon name="lock" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">{tx('กรุณาเข้าสู่ระบบ', 'Please sign in')}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {tx('หน้านี้ดูได้เฉพาะสมาชิก เข้าสู่ระบบแล้วจะกลับมาที่หน้านี้ทันที', "This page is for members. Sign in and you'll land right back here.")}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" onClick={() => openAuthModal('login')} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              {tx('เข้าสู่ระบบ', 'Sign in')}
            </button>
            <button type="button" onClick={() => openAuthModal('register')} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
              {tx('สมัครสมาชิก', 'Register')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ล็อกอินแล้วแต่ role ไม่ตรง (เช่น หน้าแอดมิน) → กลับหน้าแรก
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
