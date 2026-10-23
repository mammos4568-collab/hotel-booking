// หลังบ้าน (admin เท่านั้น): บันทึกการทำงาน — ใครแก้อะไรเมื่อไร (ตรวจย้อนหลังได้)
// บันทึกเก็บแค่รหัสอ้างอิง/ชื่อฟิลด์/เหตุผล ไม่เก็บข้อมูลส่วนตัวของลูกค้า (PDPA)
import { useState } from 'react';
import EmptyState from '../../components/EmptyState.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { Notice, PageHeader, Pagination, ROLE_META, RoleBadge, baht, card, useAdminData } from './adminUi.jsx';

const FIELD_LABELS = {
  name: ['ชื่อ', 'name'], propertyType: ['ประเภท', 'type'], description: ['คำอธิบาย', 'description'], country: ['ประเทศ', 'country'],
  city: ['เมือง', 'city'], address: ['ที่อยู่', 'address'], latitude: ['ละติจูด', 'latitude'], longitude: ['ลองจิจูด', 'longitude'],
  starRating: ['ดาว', 'stars'], imageUrl: ['รูป', 'image'], amenities: ['สิ่งอำนวยความสะดวก', 'amenities'], owner: ['เจ้าของ', 'owner'],
  maxGuests: ['จำนวนคน', 'max guests'], basePrice: ['ราคา', 'price'], totalRooms: ['จำนวนห้อง', 'room count'], bedType: ['เตียง', 'bed'],
  sizeSqm: ['ขนาด', 'size'], breakfastIncluded: ['อาหารเช้า', 'breakfast'],
};

// แปลงบันทึก 1 แถว → ข้อความที่คนอ่านเข้าใจ
function describe(log, tx, lang) {
  const d = log.detail ?? {};
  const fields = (d.fields ?? []).map((key) => (FIELD_LABELS[key] ? tx(...FIELD_LABELS[key]) : key)).join(', ');
  const role = (key) => (ROLE_META[key] ? tx(ROLE_META[key].th, ROLE_META[key].en) : key);
  switch (log.action) {
    case 'hotel.create': return {
      title: tx(`เพิ่มโรงแรม #${log.entityId}`, `Created hotel #${log.entityId}`),
      detail: d.approval === 'pending' && tx('รออนุมัติ', 'Pending approval'),
    };
    case 'hotel.update': return {
      title: tx(`แก้ข้อมูลโรงแรม #${log.entityId}`, `Edited hotel #${log.entityId}`),
      detail: [fields && tx(`ฟิลด์: ${fields}`, `Fields: ${fields}`), d.resubmitted && tx('ส่งตรวจใหม่', 'Resubmitted for review')].filter(Boolean).join(' · '),
    };
    case 'hotel.approve': return { title: tx(`อนุมัติโรงแรม #${log.entityId}`, `Approved hotel #${log.entityId}`) };
    case 'hotel.reject': return {
      title: d.from === 'approved' ? tx(`ระงับโรงแรม #${log.entityId}`, `Suspended hotel #${log.entityId}`) : tx(`ไม่อนุมัติโรงแรม #${log.entityId}`, `Rejected hotel #${log.entityId}`),
      detail: d.reason && tx(`เหตุผล: ${d.reason}`, `Reason: ${d.reason}`),
    };
    case 'hotel.delete': return { title: tx(`ลบโรงแรม #${log.entityId}`, `Deleted hotel #${log.entityId}`), detail: d.name };
    case 'hotel.image_add': return { title: tx(`เพิ่มรูปโรงแรม #${log.entityId}`, `Added a photo to hotel #${log.entityId}`), detail: d.position && tx(`ลำดับที่ ${d.position} · ${Math.round(d.bytes / 1024)} KB`, `Position ${d.position} · ${Math.round(d.bytes / 1024)} KB`) };
    case 'hotel.image_reorder': return { title: tx(`เรียงรูปโรงแรม #${log.entityId} ใหม่`, `Reordered photos of hotel #${log.entityId}`) };
    case 'hotel.image_delete': return { title: tx(`ลบรูปโรงแรม #${log.entityId}`, `Deleted a photo of hotel #${log.entityId}`) };
    case 'room.create': return { title: tx(`เพิ่มประเภทห้อง #${log.entityId}`, `Created room type #${log.entityId}`), detail: tx(`โรงแรม #${d.hotelId}`, `Hotel #${d.hotelId}`) };
    case 'room.update': return { title: tx(`แก้ประเภทห้อง #${log.entityId}`, `Edited room type #${log.entityId}`), detail: fields && tx(`ฟิลด์: ${fields}`, `Fields: ${fields}`) };
    case 'room.delete': return { title: tx(`ลบประเภทห้อง #${log.entityId}`, `Deleted room type #${log.entityId}`), detail: d.name };
    case 'room.calendar': {
      const parts = [
        `${formatDate(d.from, lang, { day: 'numeric', month: 'short' })} – ${formatDate(d.to, lang, { day: 'numeric', month: 'short', year: 'numeric' })} (${tx(`${d.nights} คืน`, `${d.nights} nights`)})`,
        d.reset && tx('คืนค่าปกติ', 'reset to defaults'),
        d.price !== undefined && tx(`ราคา ${baht(d.price)}`, `price ${baht(d.price)}`),
        d.availableRooms !== undefined && (d.availableRooms === 0 ? tx('ปิดขาย', 'closed') : tx(`เปิดขาย ${d.availableRooms} ห้อง`, `${d.availableRooms} rooms on sale`)),
      ];
      return { title: tx(`ปฏิทินห้อง #${log.entityId}`, `Calendar of room type #${log.entityId}`), detail: parts.filter(Boolean).join(' · ') };
    }
    case 'booking.cancel': return {
      title: tx(`ยกเลิกการจอง #${log.entityId}`, `Cancelled booking #${log.entityId}`),
      detail: [d.refunded && tx('คืนเงินแล้ว', 'refunded'), d.reason && `“${d.reason}”`].filter(Boolean).join(' · '),
    };
    case 'review.delete': return {
      title: tx(`ลบรีวิว #${log.entityId}`, `Deleted review #${log.entityId}`),
      detail: [tx(`โรงแรม #${d.hotelId}`, `hotel #${d.hotelId}`), tx(`${d.rating} ดาว`, `${d.rating} stars`), d.reason && `“${d.reason}”`].filter(Boolean).join(' · '),
    };
    case 'user.role': return {
      title: tx(`เปลี่ยนบทบาทผู้ใช้ #${log.entityId}`, `Changed role of user #${log.entityId}`),
      detail: [`${role(d.from)} → ${role(d.to)}`, d.unassignedHotels > 0 && tx(`ถอดจากโรงแรม ${d.unassignedHotels} แห่ง`, `removed from ${d.unassignedHotels} hotels`)].filter(Boolean).join(' · '),
    };
    default: return { title: log.action };
  }
}

export default function AuditPage() {
  const { lang, tx } = useLanguage();
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAdminData(`/admin/audit?page=${page}`);

  return (
    <div>
      <PageHeader title={tx('บันทึกการทำงาน', 'Activity log')} description={tx('ทุกการแก้ไขในหลังบ้าน ล่าสุดก่อน — แก้หรือลบบันทึกไม่ได้', 'Every back-office change, newest first — entries can’t be edited')} />
      {error && <Notice>{error}</Notice>}
      {!data ? (
        !error && <PageLoader />
      ) : data.logs.length === 0 ? (
        <EmptyState icon="shield" title={tx('ยังไม่มีบันทึก', 'Nothing logged yet')} />
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ol className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {data.logs.map((log) => {
              const text = describe(log, tx, lang);
              return (
                <li key={log.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-4">
                  <span className="text-xs tabular-nums text-slate-500">{formatDateTime(log.createdAt, lang)}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{text.title}</span>
                    {text.detail && <span className="block truncate text-sm text-slate-500" title={text.detail}>{text.detail}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-slate-600 sm:justify-end">
                    {log.actor ? (
                      <>{log.actor.name}<RoleBadge role={log.actor.role} /></>
                    ) : (
                      <span className="italic text-slate-400">{log.detail?.via === 'script' ? tx('สคริปต์ระบบ', 'System script') : tx('บัญชีที่ลบแล้ว', 'Deleted account')}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
