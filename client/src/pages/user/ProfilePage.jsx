import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const OAUTH_PROVIDERS = [
  {
    key: 'google',
    label: 'Google',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    connectHref: '/api/auth/google/link',
    disconnectEndpoint: '/auth/google',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
    connectHref: '/api/auth/facebook/link',
    disconnectEndpoint: '/auth/facebook',
  },
  {
    key: 'github',
    label: 'GitHub',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    connectHref: '/api/auth/github/link',
    disconnectEndpoint: '/auth/github',
  },
];

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [accounts, setAccounts] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null); // provider key being disconnected

  const loadAccounts = async () => {
    try {
      const result = await api('/auth/accounts');
      setAccounts(result.accounts || []);
    } catch {
      setAccounts([]);
    }
  };

  useEffect(() => {
    loadAccounts();
    // Show success notice if redirected back after connecting a provider
    const connectedProvider = OAUTH_PROVIDERS.find((p) => searchParams.get(p.key) === 'connected');
    if (connectedProvider) setNotice(`เชื่อมบัญชี ${connectedProvider.label} แล้ว`);
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    setSavingProfile(true);
    try {
      await api('/auth/me', { method: 'PUT', body: { name, phone, avatarUrl } });
      await refreshUser();
      setNotice('บันทึกโปรไฟล์แล้ว');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setSavingPassword(true);
    try {
      await api('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setNotice('เปลี่ยนรหัสผ่านแล้ว');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const disconnectProvider = async (provider) => {
    setError('');
    setNotice('');
    setDisconnecting(provider.key);
    try {
      await api(provider.disconnectEndpoint, { method: 'DELETE' });
      await loadAccounts();
      setNotice(`ยกเลิกการเชื่อมบัญชี ${provider.label} แล้ว`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(null);
    }
  };

  const signOut = async () => {
    try {
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-900">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-slate-500 mt-1">จัดการข้อมูลส่วนตัวและวิธีเข้าสู่ระบบ</p>
      </header>

      {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}
      {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}

      {/* ── Profile form ── */}
      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="font-bold text-slate-900">ข้อมูลส่วนตัว</h2>
        <label className="block text-sm font-semibold text-slate-700">ชื่อ
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">อีเมล
          <input disabled value={user?.email || ''} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">เบอร์โทรศัพท์
          <input maxLength={50} value={phone || ''} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Avatar URL
          <input type="text" maxLength={2048} value={avatarUrl || ''} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." pattern="https://.*" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          <span className="text-xs text-slate-400 mt-1 block">ต้องเป็น URL ที่ขึ้นต้นด้วย https://</span>
        </label>
        <button disabled={savingProfile} className="rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-60">
          {savingProfile ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
        </button>
      </form>

      {/* ── Change password ── */}
      <form onSubmit={changePassword} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h2>
          {accounts.length > 0 && !accounts.includes('password') && (
            <p className="text-xs text-slate-400 mt-1">คุณใช้ Social Login อยู่ สามารถตั้งรหัสผ่านเพิ่มได้โดยไม่ต้องกรอกรหัสปัจจุบัน</p>
          )}
        </div>
        <label className="block text-sm font-semibold text-slate-700">รหัสผ่านปัจจุบัน
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="เว้นว่างได้ถ้าเป็น Social Login" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
          <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">ยืนยันรหัสผ่านใหม่
          <input
            required
            minLength={8}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className={`mt-1 w-full rounded-lg border px-3 py-2.5 transition ${
              confirmNewPassword && confirmNewPassword !== newPassword
                ? 'border-red-400 bg-red-50'
                : 'border-slate-300'
            }`}
          />
          {confirmNewPassword && confirmNewPassword !== newPassword && (
            <span className="text-xs text-red-600 mt-1 block">รหัสผ่านไม่ตรงกัน</span>
          )}
        </label>
        <button disabled={savingPassword} className="rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-700 disabled:opacity-60">
          {savingPassword ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
        </button>
      </form>


      {/* ── Connected accounts ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="font-bold text-slate-900 mb-4">บัญชีที่เชื่อมต่อ</h2>
        <div className="divide-y divide-slate-100">
          {OAUTH_PROVIDERS.map((provider) => {
            const connected = accounts.includes(provider.key);
            const isDisconnecting = disconnecting === provider.key;
            return (
              <div key={provider.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5">
                  {provider.icon}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{provider.label}</p>
                    <p className={`text-xs ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
                    </p>
                  </div>
                </div>
                {connected ? (
                  <button
                    type="button"
                    disabled={isDisconnecting}
                    onClick={() => disconnectProvider(provider)}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    {isDisconnecting ? 'กำลังยกเลิก…' : 'ยกเลิกการเชื่อมต่อ'}
                  </button>
                ) : (
                  <a
                    href={provider.connectHref}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    เชื่อมต่อ
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button type="button" onClick={signOut} className="rounded-lg border border-red-200 px-4 py-2.5 font-bold text-red-700 hover:bg-red-50">
        ออกจากระบบ
      </button>
    </div>
  );
}
