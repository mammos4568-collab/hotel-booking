import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const OAUTH_PROVIDERS = [
  {
    key: 'google',
    label: 'Google',
    href: '/api/auth/google',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
  },
  {
    key: 'facebook',
    label: 'Facebook',
    href: '/api/auth/facebook',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
  },
  {
    key: 'github',
    label: 'GitHub',
    href: '/api/auth/github',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
];

// รหัสข้อผิดพลาดที่ server ส่งกลับมาใน URL (?auth_error=google_login_failed) → ข้อความ 2 ภาษา
//   <ช่องทาง>_link_required   อีเมลนี้มีบัญชีอยู่แล้ว ต้องล็อกอินแล้วไปเชื่อมที่หน้าโปรไฟล์
//   <ช่องทาง>_login_failed    ผู้ให้บริการปฏิเสธ / ยืนยันตัวตนไม่ผ่าน
//   <ช่องทาง>_not_configured  server ยังไม่ได้ใส่ Client ID / Secret (ดู README หัวข้อเข้าสู่ระบบด้วย Google / GitHub / Facebook)
function oauthErrorMessage(code, tx) {
  const provider = OAUTH_PROVIDERS.find((p) => code.startsWith(`${p.key}_`));
  const reason = provider ? code.slice(provider.key.length + 1) : '';
  const label = provider?.label;
  if (reason === 'link_required') {
    return tx(`บัญชีนี้มีอยู่แล้ว กรุณาเข้าสู่ระบบแล้วเชื่อม ${label} จากหน้าโปรไฟล์`, `An account with this email already exists. Sign in, then connect ${label} from your profile.`);
  }
  if (reason === 'login_failed') {
    return tx(`เข้าสู่ระบบด้วย ${label} ไม่สำเร็จ กรุณาลองอีกครั้ง`, `Signing in with ${label} failed. Please try again.`);
  }
  if (reason === 'not_configured') {
    return tx(`ยังไม่เปิดให้เข้าสู่ระบบด้วย ${label} — เข้าสู่ระบบด้วยอีเมลและรหัสผ่านแทนได้`, `Signing in with ${label} isn't available yet — please use your email and password.`);
  }
  return tx('เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง', 'Sign-in failed. Please try again.');
}

export default function AuthModal() {
  const { authModal, openAuthModal, closeAuthModal, login, register } = useAuth();
  const { tx } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-open login modal if there's an auth_error in URL
  useEffect(() => {
    const errCode = searchParams.get('auth_error');
    if (errCode && !authModal) {
      openAuthModal('login');
      setError(oauthErrorMessage(errCode, tx));
      // Clean up URL
      setSearchParams(params => { params.delete('auth_error'); return params; }, { replace: true });
    }
  }, [searchParams, authModal, openAuthModal, setSearchParams]);

  if (!authModal) return null;

  const isLogin = authModal === 'login';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    
    if (!isLogin && password !== confirmPassword) {
      setError(tx('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'The two passwords do not match'));
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      closeAuthModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode) => {
    setError('');
    setEmail('');
    setPassword('');
    setName('');
    setConfirmPassword('');
    openAuthModal(mode);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="absolute inset-0" 
        onClick={closeAuthModal} 
      />
      <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              {isLogin ? tx('เข้าสู่ระบบ', 'Sign in') : tx('สมัครสมาชิก', 'Create an account')}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isLogin
                ? tx('เข้าสู่ระบบบัญชี HotelBooking ของคุณ', 'Sign in to your HotelBooking account')
                : tx('สร้างบัญชี HotelBooking เพื่อจองและจัดการการเข้าพัก', 'Create your HotelBooking account to book and manage stays')}
            </p>
          </div>
          <button 
            onClick={closeAuthModal} 
            aria-label={tx('ปิด', 'Close')}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition self-start"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {error && (
            <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <label className="block text-sm font-semibold text-slate-700">{tx('ชื่อและนามสกุล', 'Full name')}
                <input required autoComplete="name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 transition" />
              </label>
            )}
            
            <label className="block text-sm font-semibold text-slate-700">{tx('อีเมล', 'Email')}
              <input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 transition" />
            </label>
            
            <label className="block text-sm font-semibold text-slate-700">
              {isLogin ? tx('รหัสผ่าน', 'Password') : tx('รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)', 'Password (at least 8 characters)')}
              <input required autoComplete={isLogin ? 'current-password' : 'new-password'} type="password" minLength={isLogin ? undefined : 8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 transition" />
            </label>
            
            {!isLogin && (
              <label className="block text-sm font-semibold text-slate-700">{tx('ยืนยันรหัสผ่าน', 'Confirm password')}
                <input required autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 transition" />
              </label>
            )}

            <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition mt-2 shadow-xs">
              {loading ? tx('กำลังประมวลผล…', 'Please wait…') : (isLogin ? tx('เข้าสู่ระบบ', 'Sign in') : tx('สมัครสมาชิก', 'Create account'))}
            </button>
            {/* PDPA: แจ้งว่าจะใช้ข้อมูลอย่างไรก่อนสร้างบัญชี */}
            {!isLogin && (
              <p className="text-xs leading-relaxed text-slate-500">
                {tx('การสมัครสมาชิกถือว่าคุณรับทราบ', 'By creating an account you acknowledge our')}{' '}
                <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-blue-600 underline underline-offset-2">{tx('นโยบายความเป็นส่วนตัว', 'Privacy Policy')}</a>
                {tx(' เราใช้ชื่อและอีเมลเพื่อจัดการบัญชีและการจองของคุณเท่านั้น', '. We use your name and email only to manage your account and bookings.')}
              </p>
            )}
          </form>

          {/* Social Login */}
          <div className="mt-6">
            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-slate-200" />
              <span className="text-xs text-slate-400 font-medium">{tx('หรือดำเนินการด้วย', 'or continue with')}</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {OAUTH_PROVIDERS.map((provider) => (
                <a
                  key={provider.key}
                  href={provider.href}
                  aria-label={tx(`ดำเนินการต่อด้วย ${provider.label}`, `Continue with ${provider.label}`)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  {provider.icon}
                  <span className="hidden sm:inline">{provider.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Toggle */}
        <div className="bg-slate-50 p-4 text-center text-sm text-slate-600 border-t border-slate-100">
          {isLogin ? (
            <>{tx('ยังไม่มีบัญชี?', "Don't have an account?")} <button onClick={() => switchMode('register')} className="font-bold text-blue-600 hover:underline">{tx('สมัครสมาชิก', 'Sign up')}</button></>
          ) : (
            <>{tx('มีบัญชีแล้ว?', 'Already have an account?')} <button onClick={() => switchMode('login')} className="font-bold text-blue-600 hover:underline">{tx('เข้าสู่ระบบ', 'Sign in')}</button></>
          )}
        </div>
      </div>
    </div>
  );
}
