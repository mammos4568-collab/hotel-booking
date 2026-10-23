// หลังบ้าน: รูปที่เจ้าของอัปโหลด สูงสุด 5 รูป — ใช้ชุดเดียวกันทั้งรูปโรงแรมและรูปประเภทห้อง
//   เลือกรูปจากเครื่อง (หรือลากมาวาง) → เบราว์เซอร์ครอปเป็น 3:2 แล้วย่อเป็น 1200×800 (lib/imageResize.js)
//   รูปแรก = รูปปก (หน้าค้นหา / การ์ดห้อง) · เลื่อนซ้าย/ขวาเพื่อเรียงลำดับ · ลบรูป
//   PhotoManager  ของที่บันทึกแล้ว (หน้าแก้ไขโรงแรม, หน้าต่างแก้ไขห้อง) — อัป/เรียง/ลบที่ server ทันที
//                 HotelPhotos = PhotoManager ของรูปโรงแรม
//   PhotoDraft    ของที่ยังไม่ได้บันทึก (หน้าเพิ่มโรงแรม, หน้าต่างเพิ่มห้อง) — ยังไม่มีรหัสให้ผูกรูป
//                 จึงเก็บรูปที่ย่อแล้วไว้ในเบราว์เซอร์ก่อน แล้วอัปด้วย uploadDraftPhotos() หลังบันทึกเสร็จ
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../components/Icon.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { resizeErrorText, resizeHotelImage } from '../../lib/imageResize.js';
import { Notice, buttonPrimary, card } from './adminUi.jsx';

const MAX_IMAGES = 5; // ตรงกับ MAX_HOTEL_IMAGES / MAX_ROOM_IMAGES ใน server/src/lib/hotelImages.js
const ACCEPT = 'image/jpeg,image/png,image/webp';
const iconButton =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent';
// จำนวนคอลัมน์ตามพื้นที่จริง (ไม่ใช่ความกว้างจอ — หน้าหลังบ้านมีเมนูข้างกินที่) · การ์ดกว้างอย่างน้อย 8.5rem
// พอดีปุ่ม 4 ปุ่มใต้รูป (4 × 1.75rem + ขอบ) → มือถือได้ 2 คอลัมน์ จอกว้างได้ 5 คอลัมน์ครบทุกรูป
const gridClass = 'mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3';

// เรียงลำดับใหม่ (ใช้ทั้งรูปบน server และรูปที่ยังไม่ได้อัป): สลับกับรูปข้างๆ / ย้ายขึ้นเป็นรูปแรก (= รูปปก)
function swapped(list, index, delta) {
  const next = [...list];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
const toFront = (list, index) => [list[index], ...list.filter((_, i) => i !== index)];

// อ่านไฟล์จากช่องเลือกไฟล์ แล้วล้างค่า → เลือกไฟล์เดิมซ้ำได้
function takeFiles(event) {
  const files = [...event.target.files];
  event.target.value = '';
  return files;
}

// สรุปผลหลังเลือกรูป: ทำสำเร็จกี่รูป · ข้ามกี่รูปเพราะเกิน 5 · รูปไหนใช้ไม่ได้เพราะอะไร
function resultMessage(tx, doneText, skipped, failures) {
  const notes = [
    doneText,
    skipped && tx(`ข้าม ${skipped} รูป เพราะครบ ${MAX_IMAGES} รูปแล้ว`, `${skipped} skipped — the limit is ${MAX_IMAGES}`),
    ...failures,
  ].filter(Boolean);
  if (!notes.length) return null;
  return { tone: failures.length || skipped ? 'error' : 'success', text: notes.join(' · ') };
}

function FileHint() {
  const { tx } = useLanguage();
  return (
    <p className="mt-2 text-xs text-slate-500">
      {tx('รองรับ JPG, PNG, WebP (ไม่เกิน 20 MB ต่อรูป) · ข้อมูลแฝงในไฟล์ เช่น พิกัด GPS ถูกลบก่อนอัปโหลด', 'JPG, PNG or WebP up to 20 MB · hidden file data such as GPS location is removed before upload')}
    </p>
  );
}

// ตารางรูป + ปุ่มเลื่อน/ตั้งเป็นรูปปก/ลบ + ช่องเพิ่มรูป (กดเลือกไฟล์ หรือลากรูปมาวาง) — ใช้ร่วมกันทั้งสองแบบ
function PhotoGrid({ photos, disabled, onPick, onDropFiles, onMove, onMakeCover, onDelete }) {
  const { tx } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const slotsLeft = MAX_IMAGES - photos.length;
  const empty = photos.length === 0;

  // รับไฟล์ที่ลากมาวาง — ต้อง preventDefault เสมอ ไม่งั้นเบราว์เซอร์เปิดรูปแทนหน้าเว็บ (ข้อมูลในฟอร์มหาย)
  const dragOver = (event) => {
    event.preventDefault();
    if (!disabled) setDragging(true);
  };
  const drop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onDropFiles([...event.dataTransfer.files]);
  };

  return (
    <ul className={gridClass}>
      {photos.map((photo, index) => (
        <li key={photo.id} className={`${card} overflow-hidden`}>
          <div className="relative aspect-[3/2] bg-slate-100">
            <img src={photo.url} alt={tx(`รูปที่ ${index + 1}`, `Photo ${index + 1}`)} loading="lazy" className="h-full w-full object-cover" />
            {index === 0 && (
              <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                {tx('รูปปก', 'Cover')}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            <div className="flex">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0 || disabled} className={iconButton} aria-label={tx('เลื่อนไปทางซ้าย', 'Move left')}>
                <Icon name="chevron-left" className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === photos.length - 1 || disabled} className={iconButton} aria-label={tx('เลื่อนไปทางขวา', 'Move right')}>
                <Icon name="chevron-right" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex">
              {index > 0 && (
                <button type="button" onClick={() => onMakeCover(index)} disabled={disabled} className={`${iconButton} text-amber-500`} title={tx('ตั้งเป็นรูปปก', 'Make cover')} aria-label={tx(`ตั้งรูปที่ ${index + 1} เป็นรูปปก`, `Make photo ${index + 1} the cover`)}>
                  <Icon name="star" className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => onDelete(index)} disabled={disabled} className={`${iconButton} text-rose-600 hover:bg-rose-50`} title={tx('ลบรูป', 'Delete photo')} aria-label={tx(`ลบรูปที่ ${index + 1}`, `Delete photo ${index + 1}`)}>
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      ))}
      {slotsLeft > 0 && (
        <li className={empty ? 'col-span-full' : ''} onDragOver={dragOver} onDragLeave={() => setDragging(false)} onDrop={drop}>
          <button
            type="button"
            onClick={onPick}
            disabled={disabled}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed px-3 text-center text-sm font-semibold transition disabled:opacity-60 ${empty ? 'py-10' : 'aspect-[3/2]'} ${dragging ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700'}`}
          >
            <Icon name="image" className="pointer-events-none h-6 w-6" />
            <span className="pointer-events-none">{tx('เลือกรูปจากเครื่อง', 'Choose from device')}</span>
            <span className="pointer-events-none text-xs font-normal">
              {empty
                ? tx(`หรือลากรูปมาวางตรงนี้ · ได้สูงสุด ${MAX_IMAGES} รูป`, `or drop photos here · up to ${MAX_IMAGES}`)
                : tx(`เหลืออีก ${slotsLeft} รูป`, `${slotsLeft} left`)}
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

// ---------- ของที่บันทึกแล้ว: ทำที่ server ทันที ----------
// endpoint = /admin/hotels/:id/images หรือ /admin/rooms/:id/images · compact = หัวข้อเล็ก (ใช้ในหน้าต่างแก้ไขห้อง)
// onChange = เรียกหลังอัป/เรียง/ลบสำเร็จ (หน้าที่เปิดอยู่จะได้โหลดรูปปกใหม่)
export function PhotoManager({ endpoint, title, description, compact = false, onChange }) {
  const { tx } = useLanguage();
  const [images, setImages] = useState(null); // null = กำลังโหลด
  const [busy, setBusy] = useState(''); // ข้อความระหว่างทำงาน เช่น "กำลังอัปโหลด 2/3"
  const [message, setMessage] = useState(null); // { tone, text }
  const [toDelete, setToDelete] = useState(null);
  const [deleteState, setDeleteState] = useState({ loading: false, error: '' });
  const fileInput = useRef(null);

  useEffect(() => {
    api(endpoint)
      .then((data) => setImages(data.images))
      .catch((err) => {
        setImages([]);
        setMessage({ tone: 'error', text: err.message });
      });
  }, [endpoint]);

  // ได้รายการรูปใหม่จาก server หลังแก้สำเร็จ → แสดงผล + บอกหน้าที่เปิดอยู่
  const applyImages = (list) => {
    setImages(list);
    onChange?.(list);
  };

  const slotsLeft = images ? MAX_IMAGES - images.length : 0;
  const pickFiles = () => fileInput.current?.click();

  // อัปทีละรูปตามลำดับที่เลือก — ถ้าเลือกเกินที่ว่าง จะอัปเท่าที่เหลือ แล้วบอกว่าข้ามกี่รูป
  const upload = async (files) => {
    if (!files.length) return;
    setMessage(null);
    const chosen = files.slice(0, slotsLeft);
    const failures = [];
    let uploaded = 0;
    for (let i = 0; i < chosen.length; i += 1) {
      setBusy(tx(`กำลังย่อและอัปโหลดรูป ${i + 1}/${chosen.length}…`, `Resizing and uploading ${i + 1}/${chosen.length}…`));
      try {
        const blob = await resizeHotelImage(chosen[i]);
        const result = await api(endpoint, { method: 'POST', body: blob });
        applyImages(result.images);
        uploaded += 1;
      } catch (err) {
        failures.push(`${chosen[i].name} — ${resizeErrorText(err, tx)}`);
      }
    }
    setBusy('');
    const doneText = uploaded && tx(`อัปโหลดแล้ว ${uploaded} รูป`, `${uploaded} photo(s) uploaded`);
    setMessage(resultMessage(tx, doneText, files.length - chosen.length, failures));
  };

  const saveOrder = async (order) => {
    setBusy(tx('กำลังบันทึกลำดับ…', 'Saving order…'));
    setMessage(null);
    try {
      const result = await api(`${endpoint}/order`, { method: 'PUT', body: { imageIds: order } });
      applyImages(result.images);
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy('');
    }
  };

  const move = (index, delta) => saveOrder(swapped(images, index, delta).map((image) => image.id));
  const makeCover = (index) => saveOrder(toFront(images, index).map((image) => image.id));

  const runDelete = async () => {
    setDeleteState({ loading: true, error: '' });
    try {
      const result = await api(`${endpoint}/${toDelete.id}`, { method: 'DELETE' });
      applyImages(result.images);
      setToDelete(null);
      setDeleteState({ loading: false, error: '' });
      setMessage({ tone: 'success', text: tx('ลบรูปแล้ว', 'Photo deleted') });
    } catch (err) {
      setDeleteState({ loading: false, error: err.message });
    }
  };

  const count = <span className="font-semibold text-slate-400">{images?.length ?? 0}/{MAX_IMAGES}</span>;
  return (
    <section className={compact ? '' : 'mt-8'}>
      {compact ? (
        <>
          <p className="text-xs font-bold text-slate-600">{title} {count}</p>
          {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
        </>
      ) : (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{title} <span className="text-sm">{count}</span></h2>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={pickFiles} disabled={!images || slotsLeft <= 0 || Boolean(busy)} className={buttonPrimary}>
            <Icon name="plus" className="h-4 w-4" />{tx('เพิ่มรูป', 'Add photos')}
          </button>
        </div>
      )}
      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(event) => upload(takeFiles(event))} />

      {(busy || message) && (
        <div className="mt-2 space-y-2">
          {busy && <Notice tone="info">{busy}</Notice>}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      )}

      {images === null ? (
        <div className={gridClass}>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[3/2] animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : (
        <PhotoGrid
          photos={images}
          disabled={Boolean(busy)}
          onPick={pickFiles}
          onDropFiles={upload}
          onMove={move}
          onMakeCover={makeCover}
          onDelete={(index) => setToDelete(images[index])}
        />
      )}
      <FileHint />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={tx('ลบรูปนี้?', 'Delete this photo?')}
        message={tx('รูปจะหายจากหน้าเว็บทันที ถ้าเป็นรูปปก รูปถัดไปจะขึ้นเป็นรูปปกแทน', 'The photo disappears from the site right away. If it is the cover, the next photo becomes the cover.')}
        confirmLabel={tx('ลบรูป', 'Delete photo')}
        loading={deleteState.loading}
        error={deleteState.error}
        onConfirm={runDelete}
        onClose={() => { setToDelete(null); setDeleteState({ loading: false, error: '' }); }}
      />
    </section>
  );
}

// รูปโรงแรม (หน้าแก้ไขโรงแรม)
export default function HotelPhotos({ hotelId }) {
  const { tx } = useLanguage();
  return (
    <PhotoManager
      endpoint={`/admin/hotels/${hotelId}/images`}
      title={tx('รูปโรงแรม', 'Photos')}
      description={tx('รูปแรกคือรูปปกในหน้าค้นหา (กด ★ เพื่อตั้งเป็นรูปปก) · ระบบครอปทุกรูปเป็นสัดส่วน 3:2 และย่อเป็น 1200×800 ให้เท่ากันอัตโนมัติ', 'The first photo is the cover in search results (press ★ to make a photo the cover) · every photo is cropped to 3:2 and resized to 1200×800 automatically')}
    />
  );
}

// ---------- ของที่ยังไม่ได้บันทึก: เก็บไว้ในเบราว์เซอร์ก่อน ----------
// photos = [{ id, url, blob }] (state อยู่ที่หน้าที่ใช้) · blob = รูปที่ย่อแล้ว รออัป · url = ไว้แสดงตัวอย่าง
// onChange รับฟังก์ชันแบบ setState(fn) · onBusyChange แจ้งว่ากำลังย่อรูปอยู่ (หน้าที่ใช้รอให้เสร็จก่อนบันทึก)
let nextDraftId = 1;

// อ่านรูปเป็น data URL ("data:image/jpeg;base64,…") ใส่ <img src> ได้เลย
// ใช้แทน URL.createObjectURL เพราะไม่ต้องคอยสั่งคืนหน่วยความจำเอง — ลบออกจาก state แล้วเบราว์เซอร์เก็บกวาดให้
function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(blob);
  });
}

export function PhotoDraft({ photos, onChange, onBusyChange, disabled, title, hint }) {
  const { tx } = useLanguage();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    onBusyChange?.(Boolean(busy));
  }, [busy]);

  // ย่อทีละรูปแล้วต่อท้ายรายการ (ย่อเสร็จรูปไหนขึ้นตัวอย่างรูปนั้นเลย) — เลือกเกินที่ว่าง จะรับเท่าที่เหลือ
  const addFiles = async (files) => {
    if (!files.length) return;
    setMessage(null);
    const chosen = files.slice(0, MAX_IMAGES - photos.length);
    const failures = [];
    for (let i = 0; i < chosen.length; i += 1) {
      setBusy(tx(`กำลังย่อรูป ${i + 1}/${chosen.length}…`, `Resizing ${i + 1}/${chosen.length}…`));
      try {
        const blob = await resizeHotelImage(chosen[i]);
        const photo = { id: nextDraftId++, url: await readAsDataUrl(blob), blob };
        onChange((current) => [...current, photo]);
      } catch (err) {
        failures.push(`${chosen[i].name} — ${resizeErrorText(err, tx)}`);
      }
    }
    setBusy('');
    setMessage(resultMessage(tx, null, files.length - chosen.length, failures));
  };

  // ยังไม่ได้อัปขึ้น server → ลบได้เลยไม่ต้องถามยืนยัน
  const remove = (index) => onChange((current) => current.filter((_, i) => i !== index));

  return (
    <div>
      <p className="text-xs font-bold text-slate-600">
        {title} <span className="font-semibold text-slate-400">{photos.length}/{MAX_IMAGES}</span>
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      {(busy || message) && (
        <div className="mt-2 space-y-2">
          {busy && <Notice tone="info">{busy}</Notice>}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      )}
      <PhotoGrid
        photos={photos}
        disabled={disabled || Boolean(busy)}
        onPick={() => fileInput.current?.click()}
        onDropFiles={addFiles}
        onMove={(index, delta) => onChange((current) => swapped(current, index, delta))}
        onMakeCover={(index) => onChange((current) => toFront(current, index))}
        onDelete={remove}
      />
      <FileHint />
      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(event) => addFiles(takeFiles(event))} />
    </div>
  );
}

// หลังบันทึกเสร็จ (ได้รหัสโรงแรม/ห้องแล้ว): อัปรูปที่เลือกไว้ "ทีละรูป" ตามลำดับ ไปที่ endpoint ของรูป
//   ไม่ยิงพร้อมกัน: server ต่อรูปใหม่ไว้ท้ายสุดเสมอ (ล็อกแถวแม่แล้วนับ) → ยิงพร้อมกันได้ลำดับตามคำขอที่ถึงก่อน รูปปกอาจสลับ
//   รูปไหนพังก็อัปรูปที่เหลือต่อ แล้วสรุปให้ผู้ใช้ (เพิ่มรูปที่พังใหม่ได้ตอนแก้ไข)
export async function uploadDraftPhotos(endpoint, photos, onProgress) {
  const result = { uploaded: 0, failed: 0, error: '' };
  for (let i = 0; i < photos.length; i += 1) {
    onProgress(i + 1, photos.length);
    try {
      await api(endpoint, { method: 'POST', body: photos[i].blob });
      result.uploaded += 1;
    } catch (err) {
      result.failed += 1;
      result.error ||= err.message;
    }
  }
  return result;
}
