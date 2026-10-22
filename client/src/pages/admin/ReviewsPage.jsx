// หลังบ้าน: รีวิว — owner ดูรีวิวโรงแรมตัวเองได้ (ลบไม่ได้ เพื่อความเป็นธรรมกับลูกค้า)
// admin ลบรีวิวที่ผิดกฎได้ (ต้องใส่เหตุผล → เก็บในบันทึกการทำงาน โดยไม่เก็บข้อความรีวิว)
import { useState } from 'react';
import { api } from '../../api.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import Stars from '../../components/Stars.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';
import { Field, HotelFilter, Notice, PageHeader, Pagination, buttonDanger, card, inputClass, useAdminData } from './adminUi.jsx';

export default function ReviewsPage() {
  const { lang, tx } = useLanguage();
  const [filters, setFilters] = useState({ hotelId: '', maxRating: '', page: 1 });
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const { data, error, loading, reload } = useAdminData(`/admin/reviews?${query}`);
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ loading: false, error: '' });
  const [notice, setNotice] = useState('');

  const close = () => {
    setTarget(null);
    setReason('');
    setState({ loading: false, error: '' });
  };
  const remove = async () => {
    setState({ loading: true, error: '' });
    try {
      await api(`/admin/reviews/${target.id}`, { method: 'DELETE', body: { reason } });
      close();
      setNotice(tx('ลบรีวิวแล้ว — คะแนนเฉลี่ยของโรงแรมคำนวณใหม่ทันที', 'Review deleted — the hotel’s average updates immediately'));
      reload();
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  };

  return (
    <div>
      <PageHeader
        title={tx('รีวิว', 'Reviews')}
        description={data && !data.canDelete
          ? tx('เจ้าของโรงแรมลบรีวิวไม่ได้ เพื่อความเป็นธรรมกับลูกค้า — ถ้ารีวิวผิดกฎ (คำหยาบ สแปม) แจ้งผู้ดูแลระบบ', 'Owners can’t delete reviews, to keep them fair — report rule-breaking reviews to an admin')
          : tx('ลบได้เฉพาะรีวิวที่ผิดกฎ เช่น ข้อความไม่เหมาะสม สแปม หรือข้อมูลส่วนตัวของผู้อื่น', 'Delete only reviews that break the rules — abuse, spam or someone else’s personal data')}
      />

      <div className={`${card} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <Field label={tx('โรงแรม', 'Hotel')} className="w-full sm:w-auto">
          <HotelFilter value={filters.hotelId} onChange={(hotelId) => setFilters({ ...filters, hotelId, page: 1 })} />
        </Field>
        <Field label={tx('คะแนน', 'Rating')} className="w-full sm:w-44">
          <select value={filters.maxRating} onChange={(event) => setFilters({ ...filters, maxRating: event.target.value, page: 1 })} className={inputClass}>
            <option value="">{tx('ทุกคะแนน', 'Any rating')}</option>
            <option value="2">{tx('2 ดาวลงมา', '2 stars or less')}</option>
            <option value="3">{tx('3 ดาวลงมา', '3 stars or less')}</option>
          </select>
        </Field>
      </div>

      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}
      {error && <Notice>{error}</Notice>}
      {!data ? (
        !error && <PageLoader />
      ) : data.reviews.length === 0 ? (
        <EmptyState icon="star" title={tx('ยังไม่มีรีวิว', 'No reviews')} />
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ul className="grid gap-3">
            {data.reviews.map((review) => (
              <li key={review.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Stars value={review.rating} className="h-4 w-4" />
                      <span className="text-sm font-bold text-slate-900">{review.rating.toFixed(1)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {review.reviewer ?? tx('ผู้เข้าพัก (ลบบัญชีแล้ว)', 'Guest (account deleted)')} · {review.hotel.name} · {formatDate(review.createdAt, lang)}
                      {review.bookingReference && <span className="font-mono"> · {review.bookingReference}</span>}
                    </p>
                  </div>
                  {data.canDelete && (
                    <button type="button" onClick={() => { setNotice(''); setTarget(review); }} className={buttonDanger}>
                      <Icon name="trash" className="h-4 w-4" />{tx('ลบ', 'Delete')}
                    </button>
                  )}
                </div>
                {review.comment
                  ? <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{review.comment}</p>
                  : <p className="mt-2 text-sm italic text-slate-400">{tx('ให้คะแนนอย่างเดียว ไม่มีความคิดเห็น', 'Rating only, no comment')}</p>}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        title={tx('ลบรีวิวนี้?', 'Delete this review?')}
        message={(
          <div className="space-y-3">
            <p>{tx('ลบแล้วกู้คืนไม่ได้ และคะแนนเฉลี่ยของโรงแรมจะเปลี่ยน', 'This can’t be undone and the hotel’s average score will change.')}</p>
            <Field label={tx('เหตุผล (เก็บในบันทึกการทำงาน)', 'Reason (kept in the activity log)')} required>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} minLength={5} maxLength={300} placeholder={tx('เช่น มีคำหยาบ / สแปมโฆษณา', 'e.g. abusive language / spam')} className={inputClass} />
            </Field>
          </div>
        )}
        confirmLabel={tx('ลบรีวิว', 'Delete review')}
        loading={state.loading}
        error={state.error}
        onConfirm={remove}
        onClose={close}
      />
    </div>
  );
}
