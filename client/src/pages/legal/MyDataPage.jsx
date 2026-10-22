// สิทธิของเจ้าของข้อมูล (PDPA): ดาวน์โหลดสำเนาข้อมูล และลบบัญชีด้วยตัวเอง
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { todayISO } from '../../lib/format.js';

const CONFIRM_TEXT = 'ลบบัญชี';

export default function MyDataPage() {
  const { user, refreshUser } = useAuth();
  const { tx } = useLanguage();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleted, setDeleted] = useState(false);

  // ขอข้อมูลจาก server แล้วสร้างไฟล์ .json ให้ดาวน์โหลดในเบราว์เซอร์
  const downloadData = async () => {
    setExporting(true);
    setExportError('');
    try {
      const data = await api('/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-hotelbooking-data-${todayISO()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setDeleteError('');
    try {
      await api('/privacy/account', { method: 'DELETE', body: { password, confirm } });
      // ยังไม่ refreshUser ตรงนี้ — ไม่งั้น ProtectedRoute จะเปลี่ยนเป็นหน้า "กรุณาเข้าสู่ระบบ" ทับข้อความสำเร็จ
      setDeleted(true);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (deleted) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Icon name="check" className="h-7 w-7" strokeWidth={3} />
        </span>
        <h1 className="mt-4 text-2xl font-black text-slate-900">{tx('ลบบัญชีเรียบร้อยแล้ว', 'Your account has been deleted')}</h1>
        <p className="mt-2 text-sm text-slate-500">{tx('ข้อมูลที่ระบุตัวตนของคุณถูกลบออกจากระบบแล้ว ขอบคุณที่ใช้บริการ', 'Your personal data has been removed. Thank you for travelling with us.')}</p>
        <button
          type="button"
          // cookie ถูกลบแล้ว → refreshUser ทำให้หน้าเว็บกลับเป็นสถานะยังไม่ล็อกอิน แล้วค่อยกลับหน้าแรก
          onClick={() => refreshUser().finally(() => navigate('/'))}
          className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          {tx('กลับหน้าแรก', 'Back to home')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link to="/privacy" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600">
          <Icon name="arrow-left" className="h-4 w-4" /> {tx('นโยบายความเป็นส่วนตัว', 'Privacy policy')}
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{tx('ข้อมูลส่วนบุคคลของฉัน', 'My personal data')}</h1>
        <p className="mt-1 text-sm text-slate-500">{tx(`บัญชี ${user?.email} · ใช้สิทธิตาม PDPA ได้ด้วยตัวเองที่หน้านี้`, `Account ${user?.email} · exercise your PDPA rights here`)}</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="receipt" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-slate-900">{tx('ดาวน์โหลดสำเนาข้อมูล', 'Download a copy of your data')}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {tx('ไฟล์ JSON ที่มีข้อมูลบัญชี การจอง การชำระเงิน (เฉพาะ 4 หลักท้ายของบัตร) และรีวิวทั้งหมดของคุณ', 'A JSON file with your profile, bookings, payments (last 4 card digits only) and reviews.')}
            </p>
            {exportError && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{exportError}</p>}
            <button type="button" onClick={downloadData} disabled={exporting} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-black disabled:opacity-60">
              <Icon name="arrow-right" className="h-4 w-4 rotate-90" />
              {exporting ? tx('กำลังเตรียมไฟล์…', 'Preparing…') : tx('ดาวน์โหลดข้อมูลของฉัน', 'Download my data')}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-rose-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Icon name="alert" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-slate-900">{tx('ลบบัญชี', 'Delete account')}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>{tx('ลบบัญชีและการเชื่อมต่อ Google/Facebook/GitHub ทั้งหมด — ย้อนกลับไม่ได้', 'Deletes your account and linked sign-ins — this cannot be undone')}</li>
              <li>{tx('ประวัติการจองเก็บไว้เป็นหลักฐานทางบัญชี แต่ลบชื่อ อีเมล เบอร์โทร และคำขอพิเศษออกจนระบุตัวตนไม่ได้', 'Past bookings stay as accounting records, with your name, email, phone and requests removed')}</li>
              <li>{tx('รีวิวที่เคยเขียนยังแสดงอยู่ แต่ไม่แสดงชื่อคุณ', 'Your reviews stay visible without your name')}</li>
              <li>{tx('ต้องยกเลิกการจองที่ยังไม่เข้าพักก่อน', 'Cancel any upcoming bookings first')}</li>
            </ul>
            <form onSubmit={deleteAccount} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                {tx('รหัสผ่าน', 'Password')} <span className="font-normal text-slate-400">({tx('ถ้าบัญชีของคุณตั้งรหัสผ่านไว้', 'if your account has one')})</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                {tx(`พิมพ์ "${CONFIRM_TEXT}" เพื่อยืนยัน`, `Type "${CONFIRM_TEXT}" to confirm`)}
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={CONFIRM_TEXT} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100" />
              </label>
              {deleteError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteError}</p>}
              <button type="submit" disabled={deleting || confirm.trim() !== CONFIRM_TEXT} className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-40">
                {deleting ? tx('กำลังลบบัญชี…', 'Deleting…') : tx('ลบบัญชีของฉันถาวร', 'Permanently delete my account')}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
