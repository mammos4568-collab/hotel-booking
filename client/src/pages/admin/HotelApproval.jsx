// หลังบ้าน: แถบสถานะการอนุมัติ (บนสุดของหน้าแก้ไขโรงแรม)
//   เจ้าของ: รู้ว่ารออนุมัติ / ถูกระงับเพราะอะไร (แก้แล้วบันทึก = ส่งตรวจใหม่)
//   admin:   อนุมัติ · ไม่อนุมัติ/ระงับ (ต้องใส่เหตุผล) · เห็นคำก้ำกึ่งที่ตัวกรองเจอ
import { useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDateTime } from '../../lib/format.js';
import { ApprovalBadge, Field, Modal, Notice, SuspiciousWords, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from './adminUi.jsx';

const TONE = {
  pending: 'border-amber-200 bg-amber-50',
  approved: 'border-emerald-200 bg-emerald-50/60',
  rejected: 'border-rose-200 bg-rose-50',
};

export default function HotelApproval({ hotel, isAdmin, onChanged }) {
  const { lang, tx } = useLanguage();
  const { status, note, submittedAt } = hotel.approval;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState('');
  const upcoming = hotel.rooms.reduce((sum, room) => sum + room.upcomingBookings, 0);

  const decide = async (action, body) => {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/hotels/${hotel.id}/${action}`, { method: 'POST', body });
      setRejecting(false);
      setReason('');
      setDone(action === 'approve'
        ? tx('อนุมัติแล้ว — ลูกค้าเห็นและจองโรงแรมนี้ได้ทันที', 'Approved — guests can now find and book this hotel')
        : tx('บันทึกแล้ว — ลูกค้าจะไม่เห็นโรงแรมนี้จนกว่าจะอนุมัติ', 'Saved — guests will not see this hotel until it is approved'));
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // เจ้าของโรงแรมที่เผยแพร่แล้ว ไม่ต้องมีแถบนี้ (แสดงแค่ป้ายสถานะในหัวข้อพอ)
  if (!isAdmin && status === 'approved') return null;

  const message = {
    pending: isAdmin
      ? tx('รอการอนุมัติ — ตรวจชื่อ คำอธิบาย รูป และห้องพักด้านล่าง แล้วตัดสินใจ', 'Waiting for review — check the name, description, photos and rooms below')
      : tx('รอผู้ดูแลระบบอนุมัติ — ลูกค้ายังไม่เห็นและยังจองโรงแรมนี้ไม่ได้ ระหว่างรอ เพิ่มรูปและประเภทห้องให้ครบได้เลย', 'Waiting for admin approval — guests cannot see or book this hotel yet. Meanwhile, add photos and room types.'),
    approved: tx('เผยแพร่แล้ว — ลูกค้าเห็นและจองได้', 'Published — guests can find and book it'),
    rejected: isAdmin
      ? tx('ไม่อนุมัติ/ระงับอยู่ — ลูกค้าไม่เห็นโรงแรมนี้ (การจองเดิมยังอยู่)', 'Not approved / suspended — hidden from guests (existing bookings stay)')
      : tx('ผู้ดูแลระบบไม่อนุมัติ/ระงับโรงแรมนี้ — แก้ตามเหตุผลด้านล่าง แล้วกด "บันทึกการแก้ไข" เพื่อส่งตรวจอีกครั้ง', 'An admin did not approve / suspended this hotel — fix it, then press "Save changes" to resubmit'),
  }[status];

  return (
    <section className={`mb-4 rounded-3xl border p-4 ${TONE[status]}`} aria-label={tx('สถานะการอนุมัติ', 'Approval status')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalBadge status={status} />
            {submittedAt && status === 'pending' && (
              <span className="text-xs text-slate-500">{tx('ส่งเมื่อ', 'Submitted')} {formatDateTime(submittedAt, lang)}</span>
            )}
          </div>
          <p className="text-sm text-slate-700">{message}</p>
          {note && status !== 'approved' && (
            <p className="text-sm font-semibold text-rose-700">
              {status === 'pending' ? tx('เหตุผลที่ไม่อนุมัติครั้งก่อน', 'Previous reason') : tx('เหตุผล', 'Reason')}: {note}
            </p>
          )}
          {isAdmin && <SuspiciousWords words={hotel.suspiciousWords} />}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {status !== 'approved' && (
              <button type="button" onClick={() => decide('approve')} disabled={busy} className={buttonPrimary}>
                <Icon name="check" className="h-4 w-4" />{tx('อนุมัติ', 'Approve')}
              </button>
            )}
            {status !== 'rejected' && (
              <button type="button" onClick={() => setRejecting(true)} disabled={busy} className={`${buttonDanger} border border-rose-200 bg-white`}>
                <Icon name="x" className="h-4 w-4" />{status === 'approved' ? tx('ระงับโรงแรม', 'Suspend') : tx('ไม่อนุมัติ', 'Reject')}
              </button>
            )}
          </div>
        )}
      </div>
      {error && !rejecting && <div className="mt-3"><Notice>{error}</Notice></div>}
      {done && <div className="mt-3"><Notice tone="success">{done}</Notice></div>}

      <Modal
        open={rejecting}
        title={status === 'approved' ? tx(`ระงับ ${hotel.name}?`, `Suspend ${hotel.name}?`) : tx(`ไม่อนุมัติ ${hotel.name}?`, `Reject ${hotel.name}?`)}
        onClose={busy ? () => {} : () => { setRejecting(false); setError(''); }}
        footer={(
          <>
            <button type="button" onClick={() => setRejecting(false)} disabled={busy} className={buttonSecondary}>{tx('ยกเลิก', 'Cancel')}</button>
            <button type="submit" form="reject-form" disabled={busy} className={`${buttonPrimary} bg-rose-600 shadow-rose-600/25 hover:bg-rose-700`}>
              {busy ? tx('กำลังบันทึก…', 'Saving…') : status === 'approved' ? tx('ระงับ', 'Suspend') : tx('ไม่อนุมัติ', 'Reject')}
            </button>
          </>
        )}
      >
        <form id="reject-form" onSubmit={(event) => { event.preventDefault(); decide('reject', { reason }); }} className="space-y-3">
          {status === 'approved' && upcoming > 0 && (
            <Notice tone="info">{tx(`มีการจองที่ยังไม่เข้าพัก ${upcoming} รายการ — การจองเดิมยังอยู่ครบ แต่ลูกค้าจะค้นหาและจองใหม่ไม่ได้`, `${upcoming} upcoming bookings stay as they are, but guests can no longer find or book this hotel`)}</Notice>
          )}
          <Field label={tx('เหตุผล (เจ้าของโรงแรมจะเห็น)', 'Reason (shown to the owner)')} required hint={tx('บอกสิ่งที่ต้องแก้ให้ชัด · ห้ามใส่ข้อมูลส่วนตัวของลูกค้า', 'Say clearly what to fix · no guest personal data')}>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={300} rows={3} className={inputClass} placeholder={tx('เช่น ชื่อโรงแรมมีคำไม่เหมาะสม กรุณาเปลี่ยนชื่อ', 'e.g. The hotel name is inappropriate, please change it')} />
          </Field>
          {error && <Notice>{error}</Notice>}
        </form>
      </Modal>
    </section>
  );
}
