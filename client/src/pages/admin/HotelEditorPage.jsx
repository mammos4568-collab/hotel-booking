// หลังบ้าน: เพิ่ม/แก้ข้อมูลโรงแรม + จัดการประเภทห้อง (เพิ่ม/แก้/ลบ) → ปฏิทินราคารายวันของแต่ละห้อง
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { AMENITIES, PROPERTY_TYPES } from '../../lib/format.js';
import {
  Field, Modal, Notice, PageHeader, baht, buttonDanger, buttonPrimary, buttonSecondary, card, inputClass, useAdminData,
} from './adminUi.jsx';
import HotelPhotos, { HotelPhotoDraft, uploadDraftPhotos } from './HotelPhotos.jsx';

const EMPTY_HOTEL = {
  name: '', propertyType: 'Hotel', starRating: '', city: '', address: '', country: 'Thailand',
  latitude: '', longitude: '', imageUrl: '', description: '', amenities: [], ownerId: '',
};
const EMPTY_ROOM = {
  name: '', bedType: '', maxGuests: 2, totalRooms: 1, basePrice: '', sizeSqm: '', breakfastIncluded: false, imageUrl: '', description: '',
};
const STAR_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const asText = (value) => (value === null || value === undefined ? '' : String(value));

function RoomFormModal({ hotelId, room, onClose, onSaved }) {
  const { tx } = useLanguage();
  const [form, setForm] = useState(() => (room ? {
    ...EMPTY_ROOM,
    ...Object.fromEntries(Object.keys(EMPTY_ROOM).map((key) => [key, key === 'breakfastIncluded' ? Boolean(room[key]) : asText(room[key])])),
  } : EMPTY_ROOM));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(room ? `/admin/rooms/${room.id}` : `/admin/hotels/${hotelId}/rooms`, { method: room ? 'PUT' : 'POST', body: form });
      onSaved(room ? tx('บันทึกประเภทห้องแล้ว', 'Room type saved') : tx('เพิ่มประเภทห้องแล้ว', 'Room type added'));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={room ? tx(`แก้ไข ${room.name}`, `Edit ${room.name}`) : tx('เพิ่มประเภทห้อง', 'Add room type')}
      onClose={saving ? () => {} : onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className={buttonSecondary}>{tx('ยกเลิก', 'Cancel')}</button>
          <button type="submit" form="room-form" disabled={saving} className={buttonPrimary}>{saving ? tx('กำลังบันทึก…', 'Saving…') : tx('บันทึก', 'Save')}</button>
        </>
      )}
    >
      <form id="room-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={tx('ชื่อประเภทห้อง', 'Room type name')} required className="sm:col-span-2">
          <input value={form.name} onChange={set('name')} required minLength={2} maxLength={150} placeholder="Deluxe King" className={inputClass} />
        </Field>
        <Field label={tx('ราคาต่อคืน (บาท)', 'Price per night (THB)')} required hint={tx('ราคาปกติ — ตั้งราคาพิเศษรายวันได้ที่ปฏิทินราคา', 'Default price — set daily prices in the calendar')}>
          <input type="number" value={form.basePrice} onChange={set('basePrice')} required min={1} step="0.01" className={inputClass} />
        </Field>
        <Field label={tx('จำนวนห้องจริง', 'Number of rooms')} required hint={tx('ลดต่ำกว่าห้องที่ถูกจองไว้แล้วไม่ได้ · 0 = หยุดขาย', "Can't go below rooms already booked · 0 = stop selling")}>
          <input type="number" value={form.totalRooms} onChange={set('totalRooms')} required min={0} max={500} step={1} className={inputClass} />
        </Field>
        <Field label={tx('ผู้เข้าพักสูงสุดต่อห้อง', 'Max guests per room')} required>
          <input type="number" value={form.maxGuests} onChange={set('maxGuests')} required min={1} max={20} step={1} className={inputClass} />
        </Field>
        <Field label={tx('ประเภทเตียง', 'Bed type')}>
          <input value={form.bedType} onChange={set('bedType')} maxLength={100} placeholder={tx('เตียงคิงไซซ์ 1 เตียง', '1 king bed')} className={inputClass} />
        </Field>
        <Field label={tx('ขนาดห้อง (ตร.ม.)', 'Size (m²)')}>
          <input type="number" value={form.sizeSqm} onChange={set('sizeSqm')} min={1} max={5000} step={1} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.breakfastIncluded} onChange={set('breakfastIncluded')} className="h-4 w-4 rounded accent-brand-600" />
          {tx('รวมอาหารเช้า', 'Breakfast included')}
        </label>
        <Field label={tx('ลิงก์รูปห้อง', 'Room image URL')} hint="https://…" className="sm:col-span-2">
          <input type="url" value={form.imageUrl} onChange={set('imageUrl')} maxLength={1000} className={inputClass} />
        </Field>
        <Field label={tx('คำอธิบายห้อง', 'Description')} className="sm:col-span-2">
          <textarea value={form.description} onChange={set('description')} maxLength={1000} rows={3} className={inputClass} />
        </Field>
        {error && <div className="sm:col-span-2"><Notice>{error}</Notice></div>}
      </form>
    </Modal>
  );
}

export default function HotelEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { lang, tx } = useLanguage();
  const isAdmin = user.role === 'admin';
  const { data, error: loadError, reload } = useAdminData(id ? `/admin/hotels/${id}` : null);
  const { data: ownerData } = useAdminData(isAdmin ? '/admin/users/owners' : null);
  const [form, setForm] = useState(EMPTY_HOTEL);
  const [draftPhotos, setDraftPhotos] = useState([]); // หน้าเพิ่มโรงแรม: รูปที่เลือกไว้ รออัปหลังสร้างโรงแรม
  const [photoBusy, setPhotoBusy] = useState(false); // กำลังย่อรูปที่เพิ่งเลือก → ยังไม่ให้กดบันทึก
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(''); // ข้อความบนปุ่มตอนอัปรูป เช่น "กำลังอัปรูป 2/5…"
  const [message, setMessage] = useState(null); // { tone, text }
  const [roomDialog, setRoomDialog] = useState(null); // null | { room } (room = null คือเพิ่มใหม่)
  const [confirm, setConfirm] = useState(null); // { kind: 'hotel' } | { kind: 'room', room }
  const [confirmState, setConfirmState] = useState({ loading: false, error: '' });
  const hotel = data?.hotel;

  // โหลดข้อมูลโรงแรมเสร็จ → เติมลงฟอร์ม (ค่า null แปลงเป็น '' ให้ช่องกรอกใช้ได้)
  useEffect(() => {
    if (!hotel) return;
    setForm({
      ...Object.fromEntries(Object.keys(EMPTY_HOTEL).map((key) => [key, asText(hotel[key])])),
      amenities: hotel.amenities ?? [],
      ownerId: asText(hotel.owner?.id),
    });
  }, [hotel]);

  // เพิ่งสร้างโรงแรมเสร็จ (เด้งมาจากหน้าเพิ่มพร้อม state.created = ผลการอัปรูป) → บอกผล + ขั้นต่อไป
  useEffect(() => {
    const created = location.state?.created;
    if (!created) return;
    if (created.failed) {
      setMessage({
        tone: 'error',
        text: tx(
          `เพิ่มโรงแรมแล้ว แต่อัปรูปไม่สำเร็จ ${created.failed} รูป (${created.error}) — เพิ่มรูปอีกครั้งได้ในส่วน "รูปโรงแรม" ด้านล่าง`,
          `Hotel created, but ${created.failed} photo(s) failed to upload (${created.error}) — add them again in the Photos section below`,
        ),
      });
      return;
    }
    setMessage({
      tone: 'success',
      text: created.uploaded
        ? tx(`เพิ่มโรงแรมพร้อมรูป ${created.uploaded} รูปแล้ว — ขั้นต่อไปเพิ่มประเภทห้องด้านล่าง`, `Hotel created with ${created.uploaded} photo(s) — next, add room types below`)
        : tx('เพิ่มโรงแรมแล้ว — ขั้นต่อไปเพิ่มประเภทห้องด้านล่าง', 'Hotel created — next, add room types below'),
    });
  }, [location.state]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const toggleAmenity = (key) => setForm({
    ...form,
    amenities: form.amenities.includes(key) ? form.amenities.filter((item) => item !== key) : [...form.amenities, key],
  });

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const { ownerId, ...fields } = form;
    // owner ส่ง ownerId มาก็ไม่มีผล (server บังคับเป็นตัวเอง) — ส่งเฉพาะตอนเป็น admin
    const body = isAdmin ? { ...fields, ownerId } : fields;
    try {
      const result = await api(id ? `/admin/hotels/${id}` : '/admin/hotels', { method: id ? 'PUT' : 'POST', body });
      if (id) {
        setMessage({ tone: 'success', text: tx('บันทึกข้อมูลโรงแรมแล้ว', 'Hotel saved') });
        reload();
      } else {
        // ได้รหัสโรงแรมแล้ว → อัปรูปที่เลือกไว้ตามลำดับ (รูปแรก = รูปปก) แล้วไปหน้าแก้ไขพร้อมผลการอัป
        const photos = await uploadDraftPhotos(result.hotel.id, draftPhotos, (done, total) => (
          setProgress(tx(`กำลังอัปรูป ${done}/${total}…`, `Uploading photo ${done}/${total}…`))
        ));
        setDraftPhotos([]);
        navigate(`/admin/hotels/${result.hotel.id}`, { replace: true, state: { created: photos } });
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const runConfirm = async () => {
    setConfirmState({ loading: true, error: '' });
    try {
      if (confirm.kind === 'hotel') {
        await api(`/admin/hotels/${id}`, { method: 'DELETE' });
        navigate('/admin/hotels', { replace: true });
        return;
      }
      await api(`/admin/rooms/${confirm.room.id}`, { method: 'DELETE' });
      setConfirm(null);
      setConfirmState({ loading: false, error: '' });
      setMessage({ tone: 'success', text: tx(`ลบ ${confirm.room.name} แล้ว`, `${confirm.room.name} deleted`) });
      reload();
    } catch (err) {
      setConfirmState({ loading: false, error: err.message });
    }
  };

  if (id && !hotel) return loadError ? <Notice>{loadError}</Notice> : <PageLoader />;

  return (
    <div>
      <PageHeader
        back={(
          <Link to="/admin/hotels" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <Icon name="arrow-left" className="h-4 w-4" />{tx('โรงแรมทั้งหมด', 'All hotels')}
          </Link>
        )}
        title={hotel ? hotel.name : tx('เพิ่มโรงแรม', 'Add hotel')}
        description={hotel ? tx('แก้ข้อมูลที่ลูกค้าเห็น และจัดการประเภทห้อง', 'Edit what guests see and manage room types') : tx('กรอกข้อมูลโรงแรม แล้วเพิ่มประเภทห้องในขั้นถัดไป', 'Fill in the property, then add room types')}
        actions={hotel && (
          <Link to={`/hotels/${hotel.id}`} target="_blank" rel="noreferrer" className={buttonSecondary}>
            <Icon name="external" className="h-4 w-4" />{tx('ดูหน้าเว็บ', 'View on site')}
          </Link>
        )}
      />

      <form onSubmit={submit} className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
        <Field label={tx('ชื่อที่พัก', 'Property name')} required className="sm:col-span-2">
          <input value={form.name} onChange={set('name')} required minLength={2} maxLength={255} className={inputClass} />
        </Field>
        <Field label={tx('ประเภทที่พัก', 'Property type')} required>
          <select value={form.propertyType} onChange={set('propertyType')} className={inputClass}>
            {Object.entries(PROPERTY_TYPES).map(([key, label]) => <option key={key} value={key}>{label[lang]}</option>)}
          </select>
        </Field>
        <Field label={tx('ระดับดาว', 'Star rating')}>
          <select value={form.starRating} onChange={set('starRating')} className={inputClass}>
            <option value="">{tx('ไม่ระบุ', 'Not rated')}</option>
            {STAR_OPTIONS.map((star) => <option key={star} value={star}>{star} ★</option>)}
          </select>
        </Field>
        <Field label={tx('เมือง', 'City')} required hint={tx('สะกดแบบเดียวกับที่ลูกค้าค้นหา เช่น Chiang Mai', 'Spell it the way guests search, e.g. Chiang Mai')}>
          <input value={form.city} onChange={set('city')} required minLength={2} maxLength={100} className={inputClass} />
        </Field>
        <Field label={tx('ประเทศ', 'Country')}>
          <input value={form.country} onChange={set('country')} maxLength={100} className={inputClass} />
        </Field>
        <Field label={tx('ที่อยู่', 'Address')} required className="sm:col-span-2">
          <input value={form.address} onChange={set('address')} required minLength={5} maxLength={500} className={inputClass} />
        </Field>
        <Field label={tx('ละติจูด', 'Latitude')} hint={tx('ใส่คู่กับลองจิจูด — ใช้คำนวณระยะทางไปสถานที่เที่ยว', 'Pair with longitude — used for distances to landmarks')}>
          <input type="number" value={form.latitude} onChange={set('latitude')} min={-90} max={90} step="any" placeholder="18.7883" className={inputClass} />
        </Field>
        <Field label={tx('ลองจิจูด', 'Longitude')}>
          <input type="number" value={form.longitude} onChange={set('longitude')} min={-180} max={180} step="any" placeholder="98.9853" className={inputClass} />
        </Field>
        {/* หน้าเพิ่มโรงแรม: เลือกรูปจากเครื่องได้เลย (อัปหลังกดเพิ่มโรงแรม) · หน้าแก้ไขมีส่วน "รูปโรงแรม" แยกด้านล่างฟอร์ม */}
        {!hotel && (
          <div className="sm:col-span-2">
            <HotelPhotoDraft photos={draftPhotos} onChange={setDraftPhotos} onBusyChange={setPhotoBusy} disabled={saving} />
          </div>
        )}
        {/* ลิงก์รูปจากเว็บอื่น = ทางเลือกสำรอง (ข้อมูลตัวอย่างใช้แบบนี้) — พับไว้ ไม่ให้สับสนกับการอัปรูป */}
        <details className="sm:col-span-2">
          <summary className="cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900">
            {tx('ใช้ลิงก์รูปจากเว็บแทน (ไม่บังคับ)', 'Use an image link instead (optional)')}
            {form.imageUrl && <span className="font-semibold text-emerald-700"> · {tx('ใส่ลิงก์ไว้แล้ว', 'link set')}</span>}
          </summary>
          <div className="mt-2 space-y-2">
            <input type="url" value={form.imageUrl} onChange={set('imageUrl')} maxLength={1000} placeholder="https://…" aria-label={tx('ลิงก์รูป', 'Image link')} className={inputClass} />
            <p className="text-xs text-slate-400">
              {tx('ลูกค้าเห็นรูปจากลิงก์นี้เฉพาะตอนที่ยังไม่มีรูปอัปโหลด — มีรูปอัปโหลดแล้วจะใช้รูปที่อัปแทน', 'Guests only see this image while no photos are uploaded — uploaded photos take its place')}
            </p>
            {form.imageUrl && <SmartImage src={form.imageUrl} alt="" width={640} className="h-40 rounded-2xl" />}
          </div>
        </details>
        <Field label={tx('คำอธิบาย', 'Description')} hint={tx('เขียนวิว บรรยากาศ จุดเด่น — ผู้ช่วยแนะนำที่พักค้นจากข้อความนี้', 'Describe views, atmosphere and highlights — the assistant searches this text')} className="sm:col-span-2">
          <textarea value={form.description} onChange={set('description')} maxLength={2000} rows={4} className={inputClass} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-bold text-slate-600">{tx('สิ่งอำนวยความสะดวก', 'Amenities')}</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(AMENITIES).map(([key, amenity]) => {
              const on = form.amenities.includes(key);
              return (
                <button key={key} type="button" onClick={() => toggleAmenity(key)} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <Icon name={on ? 'check' : amenity.icon} className="h-4 w-4" />{amenity[lang]}
                </button>
              );
            })}
          </div>
        </fieldset>
        {isAdmin && (
          <Field label={tx('เจ้าของโรงแรม', 'Owner')} hint={tx('รายชื่อมาจากผู้ใช้ที่มีบทบาท "เจ้าของโรงแรม" (ตั้งได้ที่เมนูผู้ใช้และสิทธิ์)', 'Users with the hotel-owner role (set under Users & roles)')} className="sm:col-span-2">
            <select value={form.ownerId} onChange={set('ownerId')} className={inputClass}>
              <option value="">{tx('ยังไม่มีเจ้าของ (ผู้ดูแลระบบดูแล)', 'No owner (managed by admins)')}</option>
              {(ownerData?.owners ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>)}
            </select>
          </Field>
        )}

        {message && <div className="sm:col-span-2"><Notice tone={message.tone}>{message.text}</Notice></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
          {hotel ? (
            <button type="button" onClick={() => setConfirm({ kind: 'hotel' })} className={buttonDanger}>
              <Icon name="trash" className="h-4 w-4" />{tx('ลบโรงแรม', 'Delete hotel')}
            </button>
          ) : <span />}
          <button type="submit" disabled={saving || photoBusy} className={buttonPrimary}>
            {saving ? progress || tx('กำลังบันทึก…', 'Saving…') : hotel ? tx('บันทึกการแก้ไข', 'Save changes') : tx('เพิ่มโรงแรม', 'Create hotel')}
          </button>
        </div>
      </form>

      {hotel && <HotelPhotos hotelId={hotel.id} />}

      {hotel && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{tx('ประเภทห้อง', 'Room types')}</h2>
              <p className="text-sm text-slate-500">{tx('ราคาปกติและจำนวนห้อง — ปรับราคา/ปิดขายรายวันได้ที่ปฏิทินราคา', 'Default price and room count — adjust daily prices in the calendar')}</p>
            </div>
            <button type="button" onClick={() => setRoomDialog({ room: null })} className={buttonPrimary}>
              <Icon name="plus" className="h-4 w-4" />{tx('เพิ่มประเภทห้อง', 'Add room type')}
            </button>
          </div>
          {hotel.rooms.length === 0 ? (
            <p className={`${card} px-5 py-8 text-center text-sm text-slate-500`}>{tx('ยังไม่มีประเภทห้อง — ลูกค้าจะยังจองโรงแรมนี้ไม่ได้', 'No room types yet — guests cannot book this hotel')}</p>
          ) : (
            <ul className="grid gap-3">
              {hotel.rooms.map((room) => (
                <li key={room.id} className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{room.name}</p>
                    <p className="text-sm text-slate-500">
                      {[room.bedType, tx(`สูงสุด ${room.maxGuests} คน`, `Up to ${room.maxGuests} guests`), room.sizeSqm && `${room.sizeSqm} ${tx('ตร.ม.', 'm²')}`, room.breakfastIncluded && tx('รวมอาหารเช้า', 'Breakfast')].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-extrabold text-slate-900">{baht(room.basePrice)}</span>
                      <span className="text-slate-500"> / {tx('คืน', 'night')} · {room.totalRooms === 0 ? <span className="font-semibold text-rose-600">{tx('หยุดขาย', 'Not on sale')}</span> : tx(`${room.totalRooms} ห้อง`, `${room.totalRooms} rooms`)} · {tx(`การจองที่ยังไม่เข้าพัก ${room.upcomingBookings}`, `${room.upcomingBookings} upcoming bookings`)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/admin/rooms/${room.id}/calendar`} className={buttonSecondary}>
                      <Icon name="calendar" className="h-4 w-4" />{tx('ปฏิทินราคา', 'Price calendar')}
                    </Link>
                    <button type="button" onClick={() => setRoomDialog({ room })} className={buttonSecondary}>
                      <Icon name="pencil" className="h-4 w-4" />{tx('แก้ไข', 'Edit')}
                    </button>
                    <button type="button" onClick={() => setConfirm({ kind: 'room', room })} className={buttonDanger} aria-label={tx(`ลบ ${room.name}`, `Delete ${room.name}`)}>
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {roomDialog && (
        <RoomFormModal
          hotelId={hotel.id}
          room={roomDialog.room}
          onClose={() => setRoomDialog(null)}
          onSaved={(text) => {
            setRoomDialog(null);
            setMessage({ tone: 'success', text });
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'hotel' ? tx(`ลบ ${hotel?.name}?`, `Delete ${hotel?.name}?`) : tx(`ลบ ${confirm?.room?.name}?`, `Delete ${confirm?.room?.name}?`)}
        message={tx(
          'ลบได้เฉพาะที่ไม่เคยมีการจอง (ประวัติการจองต้องเก็บไว้เป็นหลักฐาน) — ถ้าจะหยุดขาย ให้ตั้งจำนวนห้องเป็น 0 แทน',
          'Only items that were never booked can be deleted (booking history must be kept). To stop selling, set the room count to 0.',
        )}
        confirmLabel={tx('ลบ', 'Delete')}
        loading={confirmState.loading}
        error={confirmState.error}
        onConfirm={runConfirm}
        onClose={() => { setConfirm(null); setConfirmState({ loading: false, error: '' }); }}
      />
    </div>
  );
}
