// ผู้ช่วยแนะนำที่พัก (แชท) — ปุ่มลอยมุมขวาล่างทุกหน้า
// server ตีความข้อความด้วยกฎ + คำสำคัญ (ไม่ใช้ AI ภายนอก) แล้วตอบจากฐานข้อมูลจริง: POST /api/assistant/chat
// ประวัติแชทอยู่ใน state ของหน้าเว็บเท่านั้น (ไม่บันทึกที่ server · รีเฟรชหน้าแล้วเริ่มใหม่)
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import SmartImage from './SmartImage.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { AMENITIES, cityLabel, formatDistance } from '../lib/format.js';

const MAX_LENGTH = 300; // ตรงกับ MAX_MESSAGE_LENGTH ฝั่ง server
const CHIP_ICONS = {
  city: 'pin', area: 'pin', propertyId: 'building', dates: 'calendar', nights: 'calendar', near: 'map',
  guests: 'users', budget: 'receipt', stars: 'star', type: 'building', sort: 'sliders', feature: 'sparkles',
};

function chipIcon(key) {
  const [kind, value] = key.split(':');
  return kind === 'amenity' ? AMENITIES[value]?.icon ?? 'check' : CHIP_ICONS[kind] ?? 'info';
}

// id ของข้อความ (ใช้เป็น key) — สุ่มแทนตัวนับ จะได้ไม่ซ้ำแม้โค้ดถูกโหลดใหม่ระหว่างพัฒนา
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// การ์ดที่พักแบบย่อในแชท — กดแล้วไปหน้าที่พักพร้อมวัน/จำนวนคนที่คุยไว้
// ถ้าถามเรื่องวิว/บรรยากาศ จะมีประโยคจากคำอธิบายจริงของที่พักเป็นหลักฐาน (highlights) ว่าทำไมถึงแนะนำ
function HotelMini({ hotel, nights, query, nearLabel, onNavigate }) {
  const { lang, tx, formatPrice } = useLanguage();
  const soldOut = hotel.roomsLeft === 0;
  const evidence = hotel.highlights?.length > 0 || hotel.missing?.length > 0;

  return (
    <Link
      to={`/hotels/${hotel.id}${query ? `?${query}` : ''}`}
      onClick={onNavigate}
      className="group block rounded-2xl border border-slate-200 bg-white p-2 transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex gap-3">
        <SmartImage src={hotel.imageUrl} alt={hotel.name} width={200} className="h-[4.5rem] w-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">{hotel.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
            <Icon name="pin" className="h-3 w-3" />
            {cityLabel(hotel.city, lang)}
            {hotel.stars ? (
              <span className="inline-flex items-center gap-0.5">· {hotel.stars}<Icon name="star" filled strokeWidth={1.5} className="h-3 w-3 text-amber-400" /></span>
            ) : null}
            {hotel.rating ? <span>· <b className="font-semibold text-slate-700">{hotel.rating}</b>/5</span> : null}
          </p>
          <p className="mt-1 text-sm font-extrabold text-brand-700">
            {soldOut && tx('เต็มช่วงวันที่เลือก', 'Sold out for these dates')}
            {!soldOut && hotel.stayFrom && (
              <>{formatPrice(hotel.stayFrom)} <span className="text-xs font-medium text-slate-500">· {tx(`รวม ${nights} คืน`, `${nights} night${nights === 1 ? '' : 's'} total`)}</span></>
            )}
            {!soldOut && !hotel.stayFrom && hotel.nightlyFrom && (
              <><span className="text-xs font-medium text-slate-500">{tx('เริ่มต้น', 'From')} </span>{formatPrice(hotel.nightlyFrom)}<span className="text-xs font-medium text-slate-500">/{tx('คืน', 'night')}</span></>
            )}
          </p>
          {hotel.distanceKm !== null && hotel.distanceKm !== undefined && nearLabel && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <Icon name="map" className="h-3 w-3 shrink-0" />
              <span className="truncate">{tx(`ห่าง${nearLabel} ~${formatDistance(hotel.distanceKm, 'th')}`, `~${formatDistance(hotel.distanceKm, 'en')} from ${nearLabel}`)}</span>
            </p>
          )}
        </div>
      </div>
      {evidence && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs leading-snug">
          {hotel.highlights?.map((item) => (
            <li key={item.label} className="flex gap-1.5 text-slate-600">
              <Icon name="check" className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />
              <span className="line-clamp-2"><b className="font-semibold text-slate-800">{item.label}</b> — “{item.quote}”</span>
            </li>
          ))}
          {hotel.missing?.map((label) => (
            <li key={label} className="flex gap-1.5 text-slate-400">
              <Icon name="x" className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={3} />
              <span>{tx(`ไม่ได้ระบุเรื่อง${label}`, `${label} not mentioned`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

function BotMessage({ message, isLast, loading, onSuggest, onNavigate, renderText }) {
  const { tx } = useLanguage();
  const showAll = message.searchUrl && message.intent !== 'hotel' && message.total > message.hotels.length;

  return (
    <div className="flex items-start gap-2 animate-fade-in">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Icon name="sparkles" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className={`whitespace-pre-line break-words rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed ${
          message.error ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/70'
        }`}
        >
          {renderText(message.text)}
        </p>

        {message.hotels?.length > 0 && (
          <div className="space-y-2">
            {message.hotels.map((hotel) => (
              <HotelMini key={hotel.id} hotel={hotel} nights={message.nights} query={message.hotelQuery} nearLabel={message.nearLabel} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {(showAll || message.links?.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {showAll && (
              <Link to={message.searchUrl} onClick={onNavigate} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                {tx(`ดูทั้งหมด ${message.total} ที่พัก`, `See all ${message.total} stays`)} <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Link>
            )}
            {message.links?.map((link) => (
              <Link key={link.to} to={link.to} onClick={onNavigate} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100">
                {link.label} <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        )}

        {isLast && !loading && message.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {message.suggestions.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onSuggest(text)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantWidget() {
  const { lang, tx, formatPrice } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [context, setContext] = useState({}); // เงื่อนไขที่ผู้ช่วยเข้าใจล่าสุด — ส่งกลับไปทุกครั้งเพื่อคุยต่อเนื่อง
  const [chips, setChips] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const launcherRef = useRef(null);
  const wasOpen = useRef(false);

  // ราคาในข้อความมาเป็น {{price:1234}} → แสดงตามสกุลเงินที่ผู้ใช้เลือก
  const renderText = (text) => String(text ?? '').replace(/\{\{price:(\d+)\}\}/g, (_, amount) => formatPrice(Number(amount)));

  const send = async ({ text = '', action, remove, echo } = {}) => {
    if (loading) return;
    const message = text.trim().slice(0, MAX_LENGTH);
    const shown = echo ?? message;
    if (shown) setMessages((prev) => [...prev, { id: newId(), role: 'user', text: shown }]);
    setInput('');
    setLoading(true);
    try {
      const data = await api('/assistant/chat', { method: 'POST', body: { message, context, lang, action, remove } });
      setContext(data.filters ?? {});
      setChips(data.chips ?? []);
      setMessages((prev) => [...prev, {
        id: newId(),
        role: 'bot',
        text: data.reply,
        intent: data.intent,
        hotels: data.hotels ?? [],
        total: data.total ?? 0,
        nights: data.nights ?? 0,
        nearLabel: data.nearLabel,
        hotelQuery: data.hotelQuery ?? '',
        searchUrl: data.searchUrl,
        links: data.links ?? [],
        suggestions: data.suggestions ?? [],
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: newId(), role: 'bot', text: err.message, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  // เปิดครั้งแรก → ขอคำทักทาย (ข้อความว่าง) จาก server
  useEffect(() => {
    if (open && messages.length === 0 && !loading) send();
    if (open) inputRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ปิดแชท → ล้างเคอร์เซอร์ข้อความที่เบราว์เซอร์ย้ายมาค้างไว้ (ปุ่มเปิดแชทถูกสร้างใหม่ตรงตำแหน่งเดิม)
  // แล้วคืนโฟกัสให้ปุ่มเปิดแชท — คนที่ใช้คีย์บอร์ดจะกด Enter เปิดใหม่ได้ทันที ไม่หลงตำแหน่ง
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    const selection = window.getSelection();
    if (selection?.isCollapsed) selection.removeAllRanges(); // แค่เคอร์เซอร์ ไม่ใช่ข้อความที่ผู้ใช้ลากเลือกไว้
    launcherRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const restart = () => {
    setMessages([]);
    setContext({});
    setChips([]);
    // context ใน closure ของ send ยังเป็นค่าเดิม → เริ่มใหม่ด้วยการส่งคำว่า "เริ่มใหม่" ให้ server ล้างเงื่อนไขเอง
    send({ text: 'เริ่มใหม่', echo: '' });
  };

  // บนมือถือหน้าต่างแชทบังทั้งจอ → กดลิงก์แล้วปิดแชทให้เห็นหน้าที่เปิด
  const onNavigate = () => {
    if (window.matchMedia('(max-width: 639px)').matches) setOpen(false);
  };

  const lastBotIndex = messages.map((m) => m.role).lastIndexOf('bot');

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tx('เปิดผู้ช่วยหาที่พัก', 'Open stay assistant')}
          aria-expanded={open}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 py-3 pl-3.5 pr-4 text-sm font-bold text-white shadow-xl shadow-brand-700/30 transition hover:-translate-y-0.5 hover:shadow-2xl animate-pop-in"
        >
          <Icon name="sparkles" className="h-5 w-5" />
          <span className="hidden sm:inline">{tx('ผู้ช่วยหาที่พัก', 'Stay assistant')}</span>
        </button>
      )}

      {open && (
        <>
          {/* มือถือ: พื้นหลังมืด แตะเพื่อปิด */}
          <div className="fixed inset-0 z-50 bg-slate-900/40 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <section
            role="dialog"
            aria-label={tx('ผู้ช่วยหาที่พัก', 'Stay assistant')}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-slate-50 shadow-2xl animate-slide-up sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(40rem,calc(100dvh-6.5rem))] sm:w-[25rem] sm:rounded-3xl"
          >
            <header className="flex items-center gap-3 bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-3.5 text-white">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <Icon name="sparkles" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-tight">{tx('ผู้ช่วยหาที่พัก', 'Stay assistant')}</p>
                <p className="truncate text-xs text-white/75">{tx('ตอบเฉพาะเรื่องที่พักและการจองบนเว็บนี้', 'Stays and bookings on this site only')}</p>
              </div>
              <button type="button" onClick={restart} disabled={loading} className="rounded-full p-2 text-white/85 hover:bg-white/15 hover:text-white disabled:opacity-50" title={tx('เริ่มใหม่', 'Start over')} aria-label={tx('เริ่มใหม่', 'Start over')}>
                <Icon name="refresh" className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-white/85 hover:bg-white/15 hover:text-white" aria-label={tx('ปิด', 'Close')}>
                <Icon name="x" className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 py-4" aria-live="polite">
              {messages.map((message, index) => (message.role === 'user' ? (
                <div key={message.id} className="flex justify-end animate-fade-in">
                  <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">
                    {renderText(message.text)}
                  </p>
                </div>
              ) : (
                <BotMessage
                  key={message.id}
                  message={message}
                  isLast={index === lastBotIndex}
                  loading={loading}
                  onSuggest={(text) => send({ text })}
                  onNavigate={onNavigate}
                  renderText={renderText}
                />
              )))}
              {loading && (
                <div className="flex items-center gap-2" aria-label={tx('กำลังพิมพ์', 'Typing')}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Icon name="sparkles" className="h-4 w-4" /></span>
                  <span className="flex gap-1 rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-200/70">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* เงื่อนไขที่ผู้ช่วยเข้าใจ — กด × เพื่อลบทีละข้อ */}
            {chips.length > 0 && (
              <div className="border-t border-slate-200 bg-white px-3 pt-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tx('เงื่อนไขตอนนี้', 'Current filters')}</p>
                <div className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-y-auto pb-2.5">
                  {chips.map((chip) => (
                    <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-brand-800">
                      <Icon name={chipIcon(chip.key)} className="h-3.5 w-3.5" />
                      {renderText(chip.label)}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => send({ action: 'refine', remove: chip.key, echo: tx(`ลบเงื่อนไข: ${renderText(chip.label)}`, `Remove: ${renderText(chip.label)}`) })}
                        className="rounded-full p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800 disabled:opacity-40"
                        aria-label={tx(`ลบเงื่อนไข ${renderText(chip.label)}`, `Remove ${renderText(chip.label)}`)}
                      >
                        <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={(event) => { event.preventDefault(); if (input.trim()) send({ text: input }); }}
              className="border-t border-slate-200 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={MAX_LENGTH}
                  placeholder={tx('เช่น ภูเก็ต 2 คน สุดสัปดาห์นี้ งบ 3000', 'e.g. Phuket for 2 this weekend under 3000')}
                  className="min-w-0 flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  aria-label={tx('พิมพ์ข้อความถึงผู้ช่วย', 'Message the assistant')}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-40"
                  aria-label={tx('ส่ง', 'Send')}
                >
                  <Icon name="arrow-right" className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                {tx('ผู้ช่วยอัตโนมัติ ตอบจากข้อมูลบนเว็บนี้ · ไม่บันทึกข้อความ', 'Automated assistant using this site’s data · messages aren’t stored')}
                {' · '}
                <Link to="/privacy" onClick={onNavigate} className="underline hover:text-brand-600">{tx('ความเป็นส่วนตัว', 'Privacy')}</Link>
              </p>
            </form>
          </section>
        </>
      )}
    </>
  );
}
