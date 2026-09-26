import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  const { lang, switchLanguage, currency, switchCurrency, t } = useLanguage();
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const languages = [
    { code: 'th', name: 'ภาษาไทย', flag: 'https://flagcdn.com/w40/th.png' },
    { code: 'en', name: 'English', flag: 'https://flagcdn.com/w40/us.png' },
  ];

  const currencies = [
    { code: 'THB', symbol: '฿', name: 'บาทไทย (Thai Baht)' },
    { code: 'USD', symbol: '$', name: 'ดอลลาร์สหรัฐ (US Dollar)' },
  ];

  const selectedLanguage = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Desktop Nav */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-blue-500/25 group-hover:bg-blue-700 transition">
                H
              </span>
              <span className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Hotel<span className="text-blue-600">Booking</span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              <NavLink to="/" end className={({ isActive }) => `px-3.5 py-2 rounded-xl text-sm font-semibold transition ${isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>
                {t('nav_hotels')}
              </NavLink>
              <NavLink to="/my-bookings" className={({ isActive }) => `px-3.5 py-2 rounded-xl text-sm font-semibold transition ${isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>
                {t('nav_my_bookings')}
              </NavLink>
            </nav>
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            <Link to="/admin" className="text-xs font-semibold text-slate-700 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition">
              {t('nav_list_property')}
            </Link>

            {/* ปุ่มคลิกเปลี่ยนสกุลเงิน */}
            <button
              type="button"
              onClick={() => setIsCurrencyModalOpen(true)}
              className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
            >
              {currency === 'USD' ? '$ USD' : '฿ THB'}
            </button>

            {/* ปุ่มเปลี่ยนภาษา */}
            <button
              type="button"
              onClick={() => setIsLangModalOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
            >
              <img src={selectedLanguage.flag} alt="" className="w-5 h-3.5 object-cover rounded-xs shadow-xs" />
              <span className="text-xs text-slate-400">▾</span>
            </button>

            <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-blue-600 px-3 py-2 transition">
              {t('nav_signin')}
            </Link>
            <Link to="/login" className="text-sm font-semibold text-blue-600 hover:text-white border border-blue-600 hover:bg-blue-600 px-4 py-1.5 rounded-xl shadow-xs transition">
              {t('nav_register')}
            </Link>
          </div>

          {/* Mobile Right Actions */}
          <div className="flex lg:hidden items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCurrencyModalOpen(true)}
              className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md"
            >
              {currency === 'USD' ? '$' : '฿'}
            </button>

            <button type="button" onClick={() => setIsLangModalOpen(true)} className="p-2 rounded-xl hover:bg-slate-100">
              <img src={selectedLanguage.flag} alt="" className="w-5 h-3.5 object-cover rounded-xs" />
            </button>

            <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-700 hover:bg-slate-100 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="w-72 bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <span className="font-extrabold text-slate-900">{t('nav_mobile_menu')}</span>
                <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 p-1">✕</button>
              </div>

              <div className="py-4 space-y-2">
                <NavLink to="/" end onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <span>🏨</span> {t('nav_hotels')}
                </NavLink>
                <NavLink to="/my-bookings" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <span>📋</span> {t('nav_my_bookings')}
                </NavLink>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); setIsCurrencyModalOpen(true); }}
                  className="w-full flex justify-between px-3 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-700"
                >
                  <span>{t('currency_label')}</span>
                  <span className="text-blue-600">{currency}</span>
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-2">
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="w-full py-2 bg-blue-600 text-white text-center text-xs font-bold rounded-xl block">
                {t('nav_signin')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Outlet */}
      <main className={`flex-1 ${isHome ? '' : 'max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6'}`}>
        <Outlet />
      </main>

      {/* Modal สลับสกุลเงิน */}
      {isCurrencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{t('currency_modal_title')}</h3>
              <button type="button" onClick={() => setIsCurrencyModalOpen(false)} className="text-slate-400">✕</button>
            </div>
            <div className="py-4 space-y-2">
              {currencies.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { switchCurrency(c.code); setIsCurrencyModalOpen(false); }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition ${
                    currency === c.code ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-sm font-black">{c.symbol}</span>
                    <span>{c.name}</span>
                  </span>
                  {currency === c.code && <span className="text-blue-600">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal สลับภาษา */}
      {isLangModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{t('lang_modal_title')}</h3>
              <button type="button" onClick={() => setIsLangModalOpen(false)} className="text-slate-400">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 py-4">
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => { switchLanguage(l.code); setIsLangModalOpen(false); }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition ${
                    lang === l.code ? 'border-slate-800 bg-white ring-1 ring-slate-800' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <img src={l.flag} alt="" className="w-5 h-3.5 object-cover rounded-xs" />
                  <span>{l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}