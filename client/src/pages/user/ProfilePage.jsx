import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { resizeAvatar, resizeErrorText } from '../../lib/imageResize.js';

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
  const { tx } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef(null);
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
    if (connectedProvider) setNotice(tx(`เชื่อมบัญชี ${connectedProvider.label} แล้ว`, `${connectedProvider.label} account connected`));
    // server ยังไม่ได้ตั้งค่าช่องทางนั้น (เด้งกลับมาพร้อม ?link_error=google_not_configured)
    const notConfigured = OAUTH_PROVIDERS.find((p) => searchParams.get('link_error') === `${p.key}_not_configured`);
    if (notConfigured) setError(tx(`ยังไม่เปิดให้เชื่อมบัญชี ${notConfigured.label} ในระบบนี้`, `Connecting a ${notConfigured.label} account isn't available yet`));
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    setSavingProfile(true);
    try {
      // รูปโปรไฟล์ไม่ได้ส่งไปกับฟอร์มนี้แล้ว — อัป/ลบแยกที่ /auth/me/avatar (มีผลทันที)
      await api('/auth/me', { method: 'PUT', body: { name, phone } });
      await refreshUser();
      setNotice(tx('บันทึกโปรไฟล์แล้ว', 'Profile saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // เลือกรูปจากเครื่อง → ครอปเป็นสี่เหลี่ยมจัตุรัส ย่อเป็น 400×400 ในเบราว์เซอร์ (ลบข้อมูลแฝงอย่างพิกัด GPS)
  // แล้วส่งไบต์รูปไปตรงๆ · server ตรวจซ้ำ แล้วให้ลิงก์รูปใหม่ (รหัสสุ่ม) → โหลดข้อมูลผู้ใช้ใหม่ให้รูปเปลี่ยนทุกที่
  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    setNotice('');
    setError('');
    setAvatarBusy(true);
    try {
      const blob = await resizeAvatar(file);
      await api('/auth/me/avatar', { method: 'PUT', body: blob });
      await refreshUser();
      setNotice(tx('เปลี่ยนรูปโปรไฟล์แล้ว', 'Profile photo updated'));
    } catch (err) {
      setError(resizeErrorText(err, tx));
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setNotice('');
    setError('');
    setAvatarBusy(true);
    try {
      await api('/auth/me/avatar', { method: 'DELETE' });
      await refreshUser();
      setNotice(tx('ลบรูปโปรไฟล์แล้ว', 'Profile photo removed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError(tx('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', 'The two new passwords do not match'));
      return;
    }
    setSavingPassword(true);
    try {
      await api('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setNotice(tx('เปลี่ยนรหัสผ่านแล้ว', 'Password changed'));
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
      setNotice(tx(`ยกเลิกการเชื่อมบัญชี ${provider.label} แล้ว`, `${provider.label} account disconnected`));
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
        <h1 className="text-2xl font-black text-slate-900">{tx('โปรไฟล์ของฉัน', 'My profile')}</h1>
        <p className="text-sm text-slate-500 mt-1">{tx('จัดการข้อมูลส่วนตัวและวิธีเข้าสู่ระบบ', 'Manage your personal details and how you sign in')}</p>
      </header>

      {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}
      {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}

      {/* ── Profile form ── */}
      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="font-bold text-slate-900">{tx('ข้อมูลส่วนตัว', 'Personal details')}</h2>
        {/* รูปโปรไฟล์: อัป/ลบมีผลทันที (ไม่ต้องกดบันทึกโปรไฟล์) */}
        <div className="flex items-center gap-4">
          <UserAvatar name={user?.name} src={user?.avatarUrl} className="h-20 w-20 text-2xl" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-slate-700">{tx('รูปโปรไฟล์', 'Profile photo')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {avatarBusy ? tx('กำลังอัปโหลด…', 'Uploading…') : tx('เลือกรูปจากเครื่อง', 'Choose from device')}
              </button>
              {user?.avatarUrl && (
                <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                  {tx('ลบรูป', 'Remove photo')}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {tx('ครอปเป็นสี่เหลี่ยมจัตุรัสและย่อเป็น 400×400 ให้อัตโนมัติ · ข้อมูลแฝงในไฟล์ เช่น พิกัด GPS ถูกลบก่อนอัปโหลด · รูปนี้แสดงคู่กับรีวิวที่คุณเขียน',
                'Cropped to a square and resized to 400×400 automatically · hidden file data such as GPS location is removed before upload · shown next to reviews you write')}
            </p>
          </div>
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar} />
        </div>
        <label className="block text-sm font-semibold text-slate-700">{tx('ชื่อ', 'Name')}
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{tx('อีเมล', 'Email')}
          <input disabled value={user?.email || ''} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{tx('เบอร์โทรศัพท์', 'Phone number')}
          <input maxLength={50} value={phone || ''} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <button disabled={savingProfile} className="rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-60">
          {savingProfile ? tx('กำลังบันทึก…', 'Saving…') : tx('บันทึกโปรไฟล์', 'Save profile')}
        </button>
      </form>

      {/* ── Change password ── */}
      <form onSubmit={changePassword} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">{tx('เปลี่ยนรหัสผ่าน', 'Change password')}</h2>
          {accounts.length > 0 && !accounts.includes('password') && (
            <p className="text-xs text-slate-400 mt-1">{tx('คุณใช้ Social Login อยู่ สามารถตั้งรหัสผ่านเพิ่มได้โดยไม่ต้องกรอกรหัสปัจจุบัน', 'You sign in with a social account — you can add a password without entering a current one')}</p>
          )}
        </div>
        <label className="block text-sm font-semibold text-slate-700">{tx('รหัสผ่านปัจจุบัน', 'Current password')}
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={tx('เว้นว่างได้ถ้าเป็น Social Login', 'Leave blank if you use social sign-in')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{tx('รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)', 'New password (at least 8 characters)')}
          <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{tx('ยืนยันรหัสผ่านใหม่', 'Confirm new password')}
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
            <span className="text-xs text-red-600 mt-1 block">{tx('รหัสผ่านไม่ตรงกัน', "Passwords don't match")}</span>
          )}
        </label>
        <button disabled={savingPassword} className="rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-700 disabled:opacity-60">
          {savingPassword ? tx('กำลังบันทึก…', 'Saving…') : tx('เปลี่ยนรหัสผ่าน', 'Change password')}
        </button>
      </form>


      {/* ── Connected accounts ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="font-bold text-slate-900 mb-4">{tx('บัญชีที่เชื่อมต่อ', 'Connected accounts')}</h2>
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
                      {connected ? tx('เชื่อมต่อแล้ว', 'Connected') : tx('ยังไม่ได้เชื่อมต่อ', 'Not connected')}
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
                    {isDisconnecting ? tx('กำลังยกเลิก…', 'Disconnecting…') : tx('ยกเลิกการเชื่อมต่อ', 'Disconnect')}
                  </button>
                ) : (
                  <a
                    href={provider.connectHref}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    {tx('เชื่อมต่อ', 'Connect')}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button type="button" onClick={signOut} className="rounded-lg border border-red-200 px-4 py-2.5 font-bold text-red-700 hover:bg-red-50">
        {tx('ออกจากระบบ', 'Sign out')}
      </button>
    </div>
  );
}
