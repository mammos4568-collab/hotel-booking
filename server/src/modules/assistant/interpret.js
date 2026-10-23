// ============================================================
// ผู้ช่วยแนะนำที่พัก — ส่วน "ตีความข้อความ" (กฎ + คำสำคัญ ไม่ใช้ AI ภายนอก ไม่มีค่าใช้จ่าย)
// ============================================================
//
// รับข้อความไทย/อังกฤษ → แยกเป็น "เงื่อนไขค้นหา" (filters) + "เจตนา" (intent)
// เป็นฟังก์ชันล้วน ไม่แตะฐานข้อมูล → ทดสอบได้ตรงๆ ด้วย server/test/assistant.js
//
// หลักการ: อ่านข้อมูลทีละชนิดด้วย regex/คำสำคัญ แล้ว "ลบส่วนที่อ่านแล้วออก" ก่อนอ่านชนิดถัดไป
//   • "เชียงใหม่" อ่านเป็นเมืองแล้ว คำว่า "ใหม่" ข้างในจะไม่ถูกอ่านซ้ำ
//   • "12-14 พ.ย." อ่านเป็นวันที่แล้ว เลข 12, 14 จะไม่ถูกนับเป็นงบประมาณ
// ลำดับ: ชื่อโรงแรม → สถานที่ → วันที่ → จำนวนคืน → จำนวนคน → ดาว → งบ
//        → สิ่งอำนวยความสะดวก → ประเภทที่พัก → การเรียงลำดับ → เจตนา
//
// คุยต่อเนื่องได้: หน้าเว็บส่ง filters ล่าสุดกลับมา (previous) แล้วรวมกับสิ่งที่อ่านได้รอบนี้
//   เช่น "โรงแรมภูเก็ต 2 คน" → ต่อด้วย "มีสระไหม" = ภูเก็ต + 2 คน + สระว่ายน้ำ
// ============================================================
import { MAX_NIGHTS, addDays, isValidDate, nightsBetween } from '../../lib/dates.js';
import { AMENITY_KEYS, PROPERTY_TYPES, SORTS, parseList } from '../../lib/hotelSearch.js';
import { FEATURE_KEYS } from '../../lib/hotelFeatures.js';
import { LANDMARKS, LANDMARK_BY_KEY, LANDMARK_KIND_WORDS } from '../../lib/landmarks.js';
import {
  AMENITY_WORDS, AREAS, CITY_ALIASES, CITY_TH, EN_NUMBER_WORDS, FALSE_CHEAP, FEATURE_WORDS, LUXURY_WORDS, MONTH_WORDS,
  SORT_WORDS, TH_NUMBER_WORDS, TYPE_WORDS, UNKNOWN_ATTRIBUTES, UNSUPPORTED_PLACES, USD_RATE, WEEKDAY_WORDS,
} from './lexicon.js';

export const MAX_MESSAGE_LENGTH = 300;
const MAX_GUESTS = 20;
const MAX_ROOMS = 5; // เท่ากับเพดานของระบบจอง
const MAX_PRICE = 1_000_000;

// ---------------------------------------------------------------------------
// ตัวช่วยทำ regex จากรายการคำ
// ---------------------------------------------------------------------------
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// คำอังกฤษต้องเป็นคำเต็ม (ไม่ใช่ส่วนหนึ่งของคำอื่น) และรับรูปพหูพจน์ -s ได้
// คำไทยเขียนติดกันไม่มีช่องว่าง จึงจับเป็นส่วนหนึ่งของข้อความได้เลย
function wordPattern(word, { plural = true } = {}) {
  const body = escapeRegex(word).replace(/\s+/g, '\\s*');
  return /[a-z]/.test(word) ? `(?<![a-z])${body}${plural ? 's?' : ''}(?![a-z])` : body;
}

// รวมหลายคำเป็น regex เดียว เรียงคำยาวก่อน → ตำแหน่งเดียวกันจะจับคำที่ยาวที่สุดเสมอ
function alternation(words, options) {
  return [...new Set(words)].sort((a, b) => b.length - a.length).map((w) => wordPattern(w, options)).join('|');
}

const compact = (word) => word.replace(/\s+/g, '');

// คำ → ค่า เช่น 'สระว่ายน้ำ' → 'pool' (ค้นได้ทั้งแบบมีเว้นวรรคและรูปพหูพจน์)
function makeLookup(entries) {
  const map = new Map(entries.map(([word, value]) => [compact(word), value]));
  return (match) => {
    const key = compact(match);
    return map.get(key) ?? map.get(key.replace(/s$/, ''));
  };
}

function lexiconMatcher(groups) {
  const entries = Object.entries(groups).flatMap(([value, words]) => words.map((word) => [word, value]));
  return {
    regex: new RegExp(`(${alternation(entries.map(([word]) => word))})`, 'g'),
    lookup: makeLookup(entries),
  };
}

const AMENITY = lexiconMatcher(AMENITY_WORDS);
const TYPE = lexiconMatcher(TYPE_WORDS);
const SORT = lexiconMatcher(SORT_WORDS);
const LUXURY_RE = new RegExp(`(${alternation(LUXURY_WORDS)})`, 'g');
const AREA_BY_KEY = new Map(AREAS.map((area) => [area.key, area]));
const FEATURE = lexiconMatcher(FEATURE_WORDS);
const UNKNOWN = lexiconMatcher(Object.fromEntries(UNKNOWN_ATTRIBUTES.map((item) => [item.key, item.words])));

// คำกว้างๆ อย่าง "สนามบิน", "ถนนคนเดิน" นับเป็นจุดอ้างอิงเฉพาะตอนมีคำบอกความใกล้นำหน้า
// ("ใกล้สนามบิน" ✓ / "รถรับส่งสนามบิน" ✗ อันนั้นคือสิ่งอำนวยความสะดวก) และต้องรู้เมืองถึงจะรู้ว่าที่ไหน
const NEAR_WORDS = '(?:ใกล้ๆ|ใกล้|แถวๆ|แถว|ติด|ห่างจาก|ไกลจาก|เดินไป|(?<![a-z])(?:nearby|near|close to|next to|around|walking distance (?:to|from)|far from|away from)(?![a-z]))';
const KIND_LOOKUP = makeLookup(Object.entries(LANDMARK_KIND_WORDS).flatMap(([kind, words]) => words.map((word) => [word, kind])));
const KIND_RE = new RegExp(`${NEAR_WORDS}\\s*(?:กับ|the\\s+)?(${alternation(Object.values(LANDMARK_KIND_WORDS).flat())})`, 'g');
// "ไกลจากถนนบางลา" = อยากพักให้ห่าง → เรียงจากไกลสุด
const FAR_BEFORE_RE = /(?:ไกลจาก|ไกลๆ|ห่างไกล|(?<![a-z])(?:far from|away from))\s*$/;

// คำปฏิเสธหน้าเงื่อนไข เช่น "ไม่เอาสระ", "no pool", "ยกเลิกสระว่ายน้ำ"
const NEGATION_RE = /(?:ไม่เอา|ไม่ต้องมี|ไม่ต้องการ|ไม่จำเป็น(?:ต้องมี)?|ไม่ต้อง|ยกเลิก|เอาออก|ตัด|(?<![a-z])(?:without|no need for|don'?t need|do not need|remove|no))\s*$/;
const isNegated = (text, at) => NEGATION_RE.test(text.slice(Math.max(0, at - 18), at));

// ---------------------------------------------------------------------------
// วันที่ (string 'YYYY-MM-DD' ตามข้อตกลงของทีม คำนวณแบบ UTC จะได้ไม่เพี้ยนตามเขตเวลาเครื่อง)
// ---------------------------------------------------------------------------
export { addDays };

const dayOfWeek = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = อาทิตย์

function makeDate(year, monthIndex, day) {
  const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

// ไม่ระบุปี → ปีนี้ ถ้าวันนั้นผ่านไปแล้วถือว่าเป็นปีหน้า
function dateWithoutYear(today, monthIndex, day) {
  const year = Number(today.slice(0, 4));
  const thisYear = makeDate(year, monthIndex, day);
  if (thisYear && thisYear >= today) return thisYear;
  return makeDate(year + 1, monthIndex, day);
}

// ปีที่รับ: ค.ศ. 2020–2039, พ.ศ. 2560–2579 หรือ พ.ศ. 2 หลัก 67–78 (= 2567–2578)
const YEAR_ALT = '20[2-3]\\d|25[6-7]\\d|6[7-9]|7[0-8]';
const YEAR_GUARD = '(?!\\d|\\s*(?:คน|ท่าน|คืน|ห้อง|ดาว|บาท|฿|baht|thb|people|persons?|guests?|nights?|rooms?|stars?))';

function toYear(text) {
  if (!text) return null;
  const year = Number(text);
  if (year >= 2500) return year - 543;
  if (year < 100) return year + 2500 - 543; // พ.ศ. แบบ 2 หลัก
  return year;
}

function resolveDate(today, monthIndex, day, yearText) {
  const year = toYear(yearText);
  return year ? makeDate(year, monthIndex, day) : dateWithoutYear(today, monthIndex, day);
}

const MONTH_LOOKUP = makeLookup(MONTH_WORDS.flatMap((words, index) => words.map((word) => [word, index])));
const M = `(${alternation(MONTH_WORDS.flat(), { plural: false })})`;
const ORD = '(?:st|nd|rd|th)?';
const DAY = `(?<!\\d)(\\d{1,2})${ORD}`;
const SEP = '\\s*(?:-|–|—|ถึง|to|until|till|through|thru)\\s*';
const OF = '\\s*(?:of\\s+)?';
const Y = `(?:\\s*(${YEAR_ALT})${YEAR_GUARD})?`;
const DAY_WORD = '(?:วันที่\\s*)?';

const WEEKDAY_LOOKUP = makeLookup(WEEKDAY_WORDS.flatMap((words, index) => words.map((word) => [word, index])));
const TH_WEEKDAYS = WEEKDAY_WORDS.flat().filter((word) => !/[a-z]/.test(word));
const EN_WEEKDAYS = WEEKDAY_WORDS.flat().filter((word) => /[a-z]/.test(word));

// วันในสัปดาห์ที่จะถึง (นับวันนี้ด้วย) — "หน้า"/"next" = สัปดาห์ถัดไปอีก 7 วัน
function upcomingWeekday(today, weekday, next) {
  const diff = (weekday - dayOfWeek(today) + 7) % 7;
  return addDays(today, diff + (next ? 7 : 0));
}

function extractDates(state, today) {
  const dates = []; // { iso, at } — at = ตำแหน่งในข้อความ ใช้เรียงว่าอันไหนเช็กอิน อันไหนเช็กเอาต์
  const push = (iso, at) => { if (iso) dates.push({ iso, at }); };

  // 1) ช่วงวันในเดือนเดียวกัน: "12-14 พ.ย.", "12 ถึง 14 พฤศจิกายน 2569", "12 to 14 nov"
  take(state, new RegExp(`${DAY_WORD}${DAY}${SEP}${DAY_WORD}${DAY}${OF}${M}${Y}`, 'g'), ([d1, d2, month, year], at) => {
    const monthIndex = MONTH_LOOKUP(month);
    const checkIn = resolveDate(today, monthIndex, Number(d1), year);
    if (!checkIn) return false;
    // "30-2 ธ.ค." → วันที่ 2 ของเดือนถัดไป
    const sameMonth = makeDate(Number(checkIn.slice(0, 4)), monthIndex, Number(d2));
    const checkOut = sameMonth && sameMonth > checkIn
      ? sameMonth
      : makeDate(Number(checkIn.slice(0, 4)) + (monthIndex === 11 ? 1 : 0), (monthIndex + 1) % 12, Number(d2));
    push(checkIn, at);
    push(checkOut, at + 0.5);
  });
  // 2) แบบอังกฤษเดือนขึ้นก่อน: "nov 12-14"
  take(state, new RegExp(`${M}\\s*${DAY}${SEP}${DAY}${Y}`, 'g'), ([month, d1, d2, year], at) => {
    const monthIndex = MONTH_LOOKUP(month);
    const checkIn = resolveDate(today, monthIndex, Number(d1), year);
    const checkOut = checkIn && makeDate(Number(checkIn.slice(0, 4)), monthIndex, Number(d2));
    if (!checkIn || !checkOut) return false;
    push(checkIn, at);
    push(checkOut, at + 0.5);
  });
  // 3) ISO: 2026-11-12
  take(state, /(20\d{2})-(\d{1,2})-(\d{1,2})/g, ([year, month, day], at) => {
    const iso = makeDate(Number(year), Number(month) - 1, Number(day));
    if (!iso) return false;
    push(iso, at);
  });
  // 4) วันเดียว: "12 พ.ย.", "12 พฤศจิกายน 69", "12th of november"
  take(state, new RegExp(`${DAY_WORD}${DAY}${OF}${M}${Y}`, 'g'), ([day, month, year], at) => {
    const iso = resolveDate(today, MONTH_LOOKUP(month), Number(day), year);
    if (!iso) return false;
    push(iso, at);
  });
  // 5) แบบอังกฤษ "nov 12" ("may 2 people" ไม่ใช่วันที่ → may ต้องมี st/nd/rd/th หรือปีตามหลัง)
  take(state, new RegExp(`${M}\\s*(\\d{1,2})(st|nd|rd|th)?(?!\\d)${Y}`, 'g'), ([month, day, ordinal, year], at) => {
    if (compact(month) === 'may' && !ordinal && !year) return false;
    const iso = resolveDate(today, MONTH_LOOKUP(month), Number(day), year);
    if (!iso) return false;
    push(iso, at);
  });
  // 6) ตัวเลข วัน/เดือน[/ปี]: "12/11", "12/11/2569"
  take(state, /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/g, ([day, month, year], at) => {
    let yearNumber = year ? Number(year) : null;
    if (yearNumber !== null && yearNumber < 100) yearNumber += yearNumber >= 60 ? 2500 : 2000;
    const iso = yearNumber
      ? makeDate(yearNumber >= 2500 ? yearNumber - 543 : yearNumber, Number(month) - 1, Number(day))
      : dateWithoutYear(today, Number(month) - 1, Number(day));
    if (!iso) return false;
    push(iso, at);
  });
  // 7) ระบุแค่วันที่: "วันที่ 12" / "วันที่ 12-14" / "the 12th" → เดือนนี้ (ถ้าผ่านไปแล้ว = เดือนหน้า)
  const dayOnly = ([d1, d2], at) => {
    const reference = dates.length ? dates[0].iso : today;
    let year = Number(reference.slice(0, 4));
    let month = Number(reference.slice(5, 7)) - 1;
    if (Number(d1) < Number(reference.slice(8, 10))) {
      month = (month + 1) % 12;
      if (month === 0) year += 1;
    }
    const checkIn = makeDate(year, month, Number(d1));
    if (!checkIn) return false;
    push(checkIn, at);
    if (d2) {
      const checkOut = makeDate(year, month, Number(d2));
      if (checkOut && checkOut > checkIn) push(checkOut, at + 0.5);
    }
  };
  take(state, new RegExp(`วันที่\\s*(\\d{1,2})(?:${SEP}(?:วันที่\\s*)?(\\d{1,2}))?(?!\\s*[/\\d])`, 'g'), dayOnly);
  take(state, new RegExp(`(?<![a-z])the\\s+(\\d{1,2})(?:st|nd|rd|th)(?:${SEP}(?:the\\s+)?(\\d{1,2})${ORD})?`, 'g'), dayOnly);

  // 8) คำบอกวัน
  take(state, /มะรืน(?:นี้)?|(?<![a-z])day after tomorrow(?![a-z])/g, (_, at) => push(addDays(today, 2), at));
  take(state, /วันนี้|คืนนี้|(?<![a-z])(?:today|tonight)(?![a-z])/g, (_, at) => push(today, at));
  take(state, /พรุ่งนี้|(?<![a-z])tomorrow(?![a-z])/g, (_, at) => push(addDays(today, 1), at));
  // สุดสัปดาห์ = เช็กอินวันเสาร์ (ถ้าไม่บอกจำนวนคืน = 1 คืน เสาร์→อาทิตย์)
  take(state, /(?<![a-z])(this|next|coming)\s+weekend(?![a-z])/g, ([which], at) => push(upcomingWeekday(today, 6, which === 'next'), at));
  take(state, /(?:วันหยุดสุดสัปดาห์|สุดสัปดาห์|เสาร์\s*-?\s*อาทิตย์|(?<![a-z])weekend(?![a-z]))\s*(นี้|หน้า)?/g,
    ([which], at) => push(upcomingWeekday(today, 6, which === 'หน้า'), at));
  // "อาทิตย์" แปลว่าสัปดาห์ได้ด้วย ("อาทิตย์หน้า" = สัปดาห์หน้า) → นับเป็นวันอาทิตย์เฉพาะ "วันอาทิตย์"
  take(state, /วันอาทิตย์\s*(นี้|หน้า)?/g, ([which], at) => push(upcomingWeekday(today, 0, which === 'หน้า'), at));
  take(state, new RegExp(`(?:วัน)?(${alternation(TH_WEEKDAYS)})\\s*(นี้|หน้า)?`, 'g'),
    ([word, which], at) => push(upcomingWeekday(today, WEEKDAY_LOOKUP(word), which === 'หน้า'), at));
  take(state, new RegExp(`(?<![a-z])(?:(this|next|coming)\\s+)?(${alternation(EN_WEEKDAYS, { plural: false })})`, 'g'),
    ([which, word], at) => push(upcomingWeekday(today, WEEKDAY_LOOKUP(word), which === 'next'), at));
  // เทศกาล
  take(state, /ปีใหม่|เคานต์ดาวน์|เคาท์ดาวน์|เคาน์ดาวน์|(?<![a-z])(?:new\s*year(?:'s)?(?:\s*eve)?|nye|countdown)(?![a-z])/g,
    (_, at) => push(dateWithoutYear(today, 11, 31), at));
  take(state, /สงกรานต์|(?<![a-z])songkran(?![a-z])/g, (_, at) => push(dateWithoutYear(today, 3, 13), at));

  dates.sort((a, b) => a.at - b.at);
  const [first, second] = dates;
  if (!first) return {};
  if (second && second.iso > first.iso) return { checkIn: first.iso, checkOut: second.iso };
  return { checkIn: first.iso };
}

// ---------------------------------------------------------------------------
// ทำข้อความให้อยู่ในรูปเดียวกันก่อนตีความ
// ---------------------------------------------------------------------------
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const TH_DIGIT_WORDS = 'หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า';
// "สามพัน" → 3000, "พันห้า" → 1500, "สองพันห้าร้อย" → 2500, "หมื่นห้า" → 15000
const THAI_MONEY_RE = new RegExp(`(${TH_DIGIT_WORDS})?(พัน|หมื่น)(?:(${TH_DIGIT_WORDS})(?:ร้อย|พัน)?)?`, 'g');
const TH_COUNT_RE = new RegExp(
  `(${Object.keys(TH_NUMBER_WORDS).join('|')})(?=\\s*(?:คน|ท่าน|คืน|ห้อง|ดาว|วัน|ผู้ใหญ่|เด็ก|สัปดาห์|อาทิตย์))`, 'g',
);
const EN_COUNT_RE = new RegExp(
  `(?<![a-z])(${Object.keys(EN_NUMBER_WORDS).join('|')})(?=[\\s-]*(?:people|persons?|guests?|adults?|kids?|child|children|nights?|rooms?|stars?|weeks?|days?)(?![a-z]))`, 'g',
);

export function normalize(input) {
  // NFKC แปลงตัวอักษรเต็มความกว้าง (２０００ → 2000) แต่จะแยกสระ "ำ" เป็น "ํ"+"า" → ประกอบกลับ
  // (คนพิมพ์ "ํ"+"า" เองก็เจอบ่อย บรรทัดนี้แก้ให้ด้วย)
  let text = String(input ?? '').normalize('NFKC').replace(/ํา/g, 'ำ').toLowerCase();
  text = text.replace(/[​-‍⁠﻿]/g, '');                        // ตัวอักษรล่องหน
  text = text.replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)));   // เลขไทย
  for (const phrase of FALSE_CHEAP) text = text.split(phrase).join(' ');           // "ถูกต้อง" ไม่ใช่ "ราคาถูก"
  text = text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');                              // 2,500 → 2500
  text = text.replace(/(\d+(?:\.\d+)?)\s*(k|พัน|หมื่น)(?![a-z])/g,
    (_, n, unit) => ` ${Math.round(Number(n) * (unit === 'หมื่น' ? 10000 : 1000))} `); // 2k, 3 พัน
  text = text.replace(THAI_MONEY_RE, (_, n1, unit, n2) => {
    const base = unit === 'หมื่น' ? 10000 : 1000;
    return ` ${(n1 ? TH_NUMBER_WORDS[n1] : 1) * base + (n2 ? TH_NUMBER_WORDS[n2] * (base / 10) : 0)} `;
  });
  text = text.replace(TH_COUNT_RE, (word) => ` ${TH_NUMBER_WORDS[word]} `);       // "สองคน" → "2 คน"
  text = text.replace(/(คน|คืน|ห้อง)\s*เดียว/g, ' 1 $1');                          // "คืนเดียว" → "1 คืน"
  text = text.replace(EN_COUNT_RE, (word) => String(EN_NUMBER_WORDS[word]));       // "two nights" → "2 nights"
  text = text.replace(/(?<![a-z])an?\s+(?=(?:night|week|room)(?![a-z]))/g, '1 ');  // "a week" → "1 week"
  return text.replace(/\s+/g, ' ').trim();
}

// อ่านส่วนที่ตรง regex แล้ว "ลบออก" จากข้อความที่ยังไม่ได้ตีความ
// (แทนด้วยช่องว่างยาวเท่าเดิม → ตำแหน่งตัวอักษรไม่เลื่อน ใช้เรียงลำดับวันที่ได้)
// handler คืน false = ไม่ใช้ส่วนนี้ ปล่อยไว้ในข้อความเหมือนเดิม
function take(state, regex, handler) {
  state.text = state.text.replace(regex, (...args) => {
    const match = args[0];
    const at = args[args.length - 2];
    return handler(args.slice(1, -2), at, match) === false ? match : ' '.repeat(match.length);
  });
}

// ---------------------------------------------------------------------------
// จำนวนคืน / คน / ดาว
// ---------------------------------------------------------------------------
function extractNights(state) {
  let nights;
  const set = (n) => { if (nights === undefined && n >= 1) nights = Math.min(n, MAX_NIGHTS + 1); };
  take(state, /(\d{1,2})\s*วัน\s*(\d{1,2})\s*คืน/g, ([, n]) => set(Number(n)));                 // "3 วัน 2 คืน"
  take(state, /(\d{1,2})\s*(?:คืน|(?<![a-z])nights?(?![a-z]))/g, ([n]) => set(Number(n)));
  take(state, /(\d{1,2})\s*(?:สัปดาห์|อาทิตย์|(?<![a-z])weeks?(?![a-z]))/g, ([n]) => set(Number(n) * 7));
  take(state, /(\d{1,2})\s*(?:วัน|(?<![a-z])days?(?![a-z]))/g, ([n]) => set(Math.max(1, Number(n) - 1))); // ไป 3 วัน = 2 คืน
  if (nights === undefined && /ค้างคืน|(?<![a-z])overnight(?![a-z])/.test(state.text)) nights = 1;
  return nights;
}

// "2 ห้อง" / "two rooms" — แต่ "ห้องน้ำ", "2 ห้องนอน" (วิลล่า 2 ห้องนอน) ไม่ใช่จำนวนห้องที่จะจอง
function extractRooms(state) {
  let rooms;
  take(state, /(\d{1,2})\s*(?:ห้อง(?!น้ำ|อาหาร|ครัว|นอน|นั่งเล่น|พัก|ว่าง|สวีท)|(?<![a-z])rooms?(?![a-z]))/g, ([n]) => {
    const value = Number(n);
    if (value < 1) return false;
    rooms = rooms ?? Math.min(value, MAX_ROOMS);
  });
  return rooms;
}

function extractGuests(state) {
  let adults = 0;
  let children = 0;
  let total;
  const KIDS = '(?:เด็ก(?:เล็ก|โต)?|(?<![a-z])(?:kids?|child(?:ren)?)(?![a-z]))';
  const ADULTS = '(?:ผู้ใหญ่|(?<![a-z])adults?(?![a-z]))';
  take(state, new RegExp(`${KIDS}\\s*(\\d{1,2})|(\\d{1,2})\\s*${KIDS}`, 'g'), ([a, b]) => { children += Number(a ?? b); });
  take(state, new RegExp(`${ADULTS}\\s*(\\d{1,2})|(\\d{1,2})\\s*${ADULTS}`, 'g'), ([a, b]) => { adults += Number(a ?? b); });
  take(state, /(\d{1,2})\s*(?:คน|ท่าน|(?<![a-z])(?:people|persons?|guests?|pax|travell?ers?)(?![a-z]))/g, ([n]) => {
    total = (total ?? 0) + Number(n);
  });
  take(state, /(?<![a-z])for\s+(\d{1,2})(?![\d.]|\s*(?:nights?|days?|weeks?|rooms?|stars?|baht|thb|usd|dollars?|บาท))/g, ([n]) => {
    total = total ?? Number(n);
  });
  let guests = total ?? (adults + children || undefined);
  if (guests === undefined && /คู่รัก|แฟน|ฮันนีมูน|(?<![a-z])(?:honeymoon|couple|romantic)(?![a-z])/.test(state.text)) guests = 2;
  if (guests === undefined && /(?<![a-z])(?:solo|alone|by myself|just me)(?![a-z])/.test(state.text)) guests = 1;
  return guests === undefined ? undefined : Math.min(Math.max(guests, 1), MAX_GUESTS);
}

function extractStars(state) {
  let stars;
  take(state, /(\d(?:\.5)?)\s*-?\s*(?:ดาว|★|(?<![a-z])stars?(?![a-z]))\s*(?:ขึ้นไป|\+|(?:or|and)\s+(?:more|above|up|higher))?/g, ([n]) => {
    const value = Number(n);
    if (value < 1 || value > 5) return false;
    stars = stars ?? value;
  });
  return stars;
}

// ---------------------------------------------------------------------------
// งบประมาณ — ดูคำรอบๆ ตัวเลขเพื่อแยกว่าเป็น "ไม่เกิน" / "ตั้งแต่" / "ประมาณ" / "ทั้งทริป"
// ---------------------------------------------------------------------------
const MAX_WORDS = ['ไม่เกินกว่า', 'ไม่เกิน', 'ไม่ถึง', 'ไม่มากกว่า', 'ไม่สูงกว่า', 'ไม่แพงกว่า', 'ต่ำกว่า', 'น้อยกว่า', 'ถูกกว่า',
  'under', 'below', 'less than', 'cheaper than', 'no more than', 'not more than', 'at most', 'up to', 'maximum', 'max', 'within'];
const MIN_WORDS = ['ไม่ต่ำกว่า', 'ไม่น้อยกว่า', 'ไม่ถูกกว่า', 'มากกว่า', 'เกินกว่า', 'เกิน', 'สูงกว่า', 'แพงกว่า', 'ตั้งแต่', 'อย่างน้อย',
  'not less than', 'no less than', 'not lower than', 'not cheaper than',
  'over', 'above', 'more than', 'at least', 'from', 'minimum', 'min'];
const AROUND_WORDS = ['ประมาณ', 'แถวๆ', 'แถว', 'ราวๆ', 'ราว', 'around', 'about', 'approximately', 'roughly'];
const BUDGET_WORDS = ['งบประมาณ', 'งบ', 'ราคา', 'คืนละ', 'ละ', 'my budget is', 'budget is', 'budget of', 'budget',
  'price of', 'price', 'priced at'];
const TOTAL_WORDS = ['รวมทั้งหมด', 'ทั้งทริป', 'ทั้งหมด', 'รวม', 'in total', 'total', 'overall', 'all in', 'for the whole trip'];
const MIN_SUFFIX_WORDS = ['ขึ้นไป', 'or more', 'and up', 'and above', 'or above', 'upwards', 'plus'];
const PER_NIGHT_WORDS = ['ต่อคืน', '/คืน', 'per night', 'a night', '/night', 'nightly'];

const kw = (words) => alternation(words, { plural: false });
const PREFIX_RE = new RegExp(`((?:(?:${kw([...MAX_WORDS, ...MIN_WORDS, ...AROUND_WORDS, ...BUDGET_WORDS, ...TOTAL_WORDS])}|[<>≤≥~])\\s*)+)$`);
const SUFFIX_RE = new RegExp(`^\\s*((?:(?:${kw([...MIN_SUFFIX_WORDS, ...PER_NIGHT_WORDS, ...TOTAL_WORDS])}|\\+)\\s*)+)`);
const has = (text, words) => new RegExp(kw(words)).test(text);
// "ไม่เกิน" มีคำว่า "เกิน" อยู่ข้างใน และ "ไม่ต่ำกว่า" มี "ต่ำกว่า" → ตรวจรูปปฏิเสธก่อน
const NOT_ABOVE_RE = /ไม่(?:เกิน|ถึง|แพง|มาก|สูง)|(?<![a-z])(?:no|not) more than/;
const NOT_BELOW_RE = /ไม่(?:ต่ำ|น้อย|ถูก)กว่า|(?<![a-z])(?:no|not) (?:less|lower|cheaper) than/;

const CURRENCY = '(บาท|฿|thb|baht|usd|us\\$|dollars?|ดอลลาร์|ดอลล่าร์|ดอล)';
const MONEY_RE = new RegExp(`(?<![\\d.])(฿|us\\$|\\$)?\\s*(\\d{2,7}(?:\\.\\d+)?)(?![\\d.])\\s*${CURRENCY}?`, 'g');
const RANGE_RE = new RegExp(
  `(?:(ระหว่าง|between)\\s*)?(?<![\\d.])(฿|\\$)?\\s*(\\d{3,7})\\s*(?:บาท|฿)?\\s*(?:-|–|ถึง|to|and|กับ)\\s*(฿|\\$)?\\s*(\\d{3,7})(?![\\d.])\\s*${CURRENCY}?`, 'g',
);
const isUsd = (prefix, currency) => /\$/.test(prefix ?? '') || /usd|dollar|ดอล|\$/.test(currency ?? '');

function extractBudget(state) {
  const budget = {};
  // ช่วงราคา: "1500-3000", "ระหว่าง 1500 ถึง 3000 บาท"
  take(state, RANGE_RE, ([between, p1, a, p2, b, currency], at, match) => {
    if (!between && /\b(and|กับ)\b|กับ/.test(match) && !/-|–|ถึง|to/.test(match)) return false;
    const rate = isUsd(p1 || p2, currency) ? USD_RATE : 1;
    const low = Number(a) * rate;
    const high = Number(b) * rate;
    budget.minPrice = Math.round(Math.min(low, high));
    budget.maxPrice = Math.round(Math.max(low, high));
  });

  // ตัวเลขเดี่ยว: ดูคำข้างหน้า/ข้างหลังเพื่อตัดสินว่าเป็นงบแบบไหน
  const spans = [];
  let match;
  MONEY_RE.lastIndex = 0;
  while ((match = MONEY_RE.exec(state.text)) !== null) {
    const [whole, prefixCurrency, digits, currency] = match;
    const start = match.index;
    const end = start + whole.length;
    const prefix = state.text.slice(Math.max(0, start - 30), start).match(PREFIX_RE);
    const after = state.text.slice(end, end + 24);
    const suffix = after.match(SUFFIX_RE);
    const amount = Number(digits);
    const words = `${prefix?.[1] ?? ''} ${suffix?.[1] ?? ''}`;
    const explicit = Boolean(prefixCurrency || currency || prefix || suffix);

    // ตัวเลขลอยๆ ที่น้อยเกินจะเป็นราคา หรือ "555" (หัวเราะ) → ไม่ใช่งบ
    if (!explicit && (amount < 300 || /^5{3,}$/.test(digits))) continue;
    const value = Math.round(amount * (isUsd(prefixCurrency, currency) ? USD_RATE : 1));
    if (value < 1 || value > MAX_PRICE) continue;

    const before = prefix?.[1] ?? ''; // คำนำหน้าตัวเลข เช่น 'ไม่เกิน', 'ตั้งแต่'
    const isMin = NOT_BELOW_RE.test(before)
      || (!NOT_ABOVE_RE.test(before) && has(before, MIN_WORDS))
      || (suffix && (has(suffix[1], MIN_SUFFIX_WORDS) || /\+/.test(suffix[1])));
    if (isMin) {
      budget.minPrice = value;
    } else if (has(before, AROUND_WORDS)) {
      budget.minPrice = Math.round(value * 0.8);
      budget.maxPrice = Math.round(value * 1.2);
    } else {
      budget.maxPrice = value;
    }
    if (has(words, TOTAL_WORDS)) budget.totalBudget = value;
    spans.push([start - (prefix?.[0].length ?? 0), end + (suffix?.[0].length ?? 0)]);
  }
  for (const [from, to] of spans) {
    state.text = state.text.slice(0, from) + ' '.repeat(to - from) + state.text.slice(to);
  }
  return budget;
}

// ---------------------------------------------------------------------------
// เจตนาของข้อความ (ตรวจกับข้อความเต็ม)
// ---------------------------------------------------------------------------
const RESET_RE = /เริ่มใหม่|เริ่มต้นใหม่|ค้นหาใหม่|หาใหม่|ล้างทั้งหมด|ล้างตัวกรอง|รีเซ็ต|(?<![a-z])(?:reset|start over|clear all|new search)(?![a-z])/;
const MORE_RE = /ดูเพิ่ม|มีอีกไหม|มีอีกมั้ย|อีกไหม|อื่นๆ|อื่นอีก|แห่งอื่น|ที่อื่น|อันอื่น|เพิ่มเติม|(?<![a-z])(?:show more|more options|see more|any more|others?|next)(?![a-z])/;
const SEARCH_RE = /โรงแรม|ที่พัก|ห้องพัก|ห้องว่าง|ห้อง|พัก|ค้างคืน|นอน|แนะนำ|ช่วยหา|อยากหา|หาให้|จอง|เที่ยว|(?<![a-z])(?:hotels?|stays?|rooms?|accommodations?|lodging|recommend\w*|suggest\w*|find|search|book|looking for|trip|vacation|holiday|where to stay|place to stay)(?![a-z])/;
const DESTINATIONS_RE = /เมือง(?:อะไร|ไหน)|จังหวัด(?:อะไร|ไหน)|มีที่ไหน|ไปไหนดี|ไปที่ไหนดี|เที่ยวไหนดี|เที่ยวที่ไหนดี|ที่ไหนดี|(?<![a-z])(?:which|what) (?:cities|city|destinations?|places)|where (?:can|should) (?:i|we) (?:go|stay|travel)|destinations?(?![a-z])/;
const PRICE_Q_RE = /ราคา|กี่บาท|ค่าห้อง|(?<![a-z])(?:how much|prices?|cost|rates?)(?![a-z])/;
const HOW_MUCH_RE = /เท่าไหร่|เท่าไร/; // "เท่าไหร่" ลอยๆ นับเป็นถามราคาเฉพาะตอนกำลังคุยเรื่องโรงแรมหนึ่งอยู่
// ถามระยะทางของโรงแรมที่คุยอยู่ เช่น "ห่างจากสุวรรณภูมิเท่าไหร่", "ใกล้ BTS ไหม"
const DISTANCE_Q_RE = /ห่าง|ไกลไหม|ไกลมั้ย|ไกลแค่ไหน|ไกลเท่า|กี่กิโล|กี่ ?กม|ระยะทาง|ใกล้.{0,24}(?:ไหม|มั้ย|หรือเปล่า|รึเปล่า|หรือไม่)|(?<![a-z])(?:how far|distance|is it near|is it close)(?![a-z])/;
// เงื่อนไขแนว "เลือกดูหลายที่" (ต่างจากวันที่/จำนวนคนที่ใช้กับโรงแรมเดียวได้)
const BROWSE_KEYS = ['city', 'area', 'minPrice', 'maxPrice', 'stars', 'types', 'sort', 'luxury', 'near'];
const GREETING_RE = /สวัสดี|หวัดดี|ดีจ้า|ฮัลโหล|(?<![a-z])(?:hello|hi|hey|hiya|good (?:morning|afternoon|evening))(?![a-z])/;
const HELP_RE = /ทำอะไรได้|ช่วยอะไรได้|คุณคือใคร|คุณเป็นใคร|เป็นใคร|ใช้ยังไง|ใช้งานยังไง|ถามอะไรได้|(?<![a-z])(?:what can you do|who are you|how does this work|help)(?![a-z])/;
const THANKS_RE = /ขอบคุณ|ขอบใจ|แต๊งกิ้ว|(?<![a-z])(?:thanks?|thank you|thx|ty)(?![a-z])/;
const BYE_RE = /บาย|ลาก่อน|(?<![a-z])(?:bye|goodbye|see you)(?![a-z])/;
const ACK_RE = /^(?:โอเค|ok|okay|ได้|ได้เลย|ครับ|ค่ะ|คับ|จ้า|อืม|เข้าใจแล้ว|got it|cool|nice|great|5{3,}|ฮ่า+|(?:ha)+|lol|อิอิ)$/;

// คำถามทั่วไปเกี่ยวกับเว็บ — เรียงตามลำดับความสำคัญ (ตัวแรกที่ตรงคือคำตอบ)
// strong = ตอบเรื่องนี้แม้ข้อความจะมีเงื่อนไขค้นหาปนมา (เช่น "ที่พักภูเก็ตยกเลิกฟรีไหม")
const FAQ = [
  { key: 'privacy', strong: true, re: /ข้อมูลส่วน(?:ตัว|บุคคล)|ความเป็นส่วนตัว|ลบบัญชี|ลบข้อมูล|เก็บข้อมูล|(?<![a-z])(?:pdpa|privacy|personal data|delete (?:my )?(?:account|data))(?![a-z])/ },
  { key: 'cancel', strong: true, re: /ยกเลิก|คืนเงิน|(?<![a-z])(?:cancel\w*|refund\w*)(?![a-z])/ },
  { key: 'hold', strong: true, re: /15 ?นาที|จองค้าง|ค้างชำระ|หมดเวลา|ถือห้อง|กันห้อง|(?<![a-z])(?:hold|expire\w*|time limit)(?![a-z])/ },
  { key: 'payment', strong: true, re: /วิธี(?:การ)?(?:จ่าย|ชำระ)|จ่าย(?:เงิน)?(?:ยัง|อย่าง|ได้|ผ่าน|ด้วย)|ชำระ|บัตรเครดิต|บัตรเดบิต|เครดิต|พร้อมเพย์|โอนเงิน|ทรูมันนี่?|ทรูมันนี|วอลเล็ท|วอลเลท|(?<![a-z])(?:promptpay|prompt pay|qr|payment|pay|paying|credit card|debit card|truemoney|true money|wallet)(?![a-z])/ },
  { key: 'my_bookings', strong: true, re: /การจองของ(?:ฉัน|ผม|เรา|หนู|ดิฉัน)|ดูการจอง|ประวัติการจอง|เช็[คก](?:การ)?จอง|ตรวจสอบการจอง|เลข(?:ที่)?การจอง|(?<![a-z])(?:my bookings?|booking history|check (?:my )?booking|booking (?:reference|number))(?![a-z])/ },
  { key: 'confirmation', strong: true, re: /อีเมลยืนยัน|ได้อีเมล|ส่งอีเมล|ยืนยันการจอง|(?<![a-z])(?:confirmation (?:e-?mail|mail|number)|confirm(?:ed)? (?:my )?booking|e-?mail confirmation)(?![a-z])/ },
  { key: 'how_to_book', strong: true, re: /จอง(?:ยัง|อย่าง)ไง|จองได้(?:ยัง|อย่าง)ไง|จองอย่างไร|วิธี(?:การ)?จอง|ขั้นตอน(?:การ)?จอง|(?<![a-z])(?:how (?:do i |to |can i |does )?(?:make a )?book\w*|booking process)(?![a-z])/ },
  { key: 'review', strong: true, re: /เขียนรีวิว|รีวิว(?:ยัง|อย่าง)ไง|ให้คะแนน(?:ยัง|อย่าง)ไง|ให้คะแนนที่พัก|(?<![a-z])(?:write a review|leave a review|how (?:do i|to|can i) review)(?![a-z])/ },
  { key: 'account', strong: true, re: /สมัคร|ล็?อ[กค]\s?อิน|เข้าสู่ระบบ|ลืมรหัส|เปลี่ยนรหัส|รหัสผ่าน|(?<![a-z])(?:log ?in|sign ?in|sign ?up|register|forgot (?:my )?password|password|account)(?![a-z])/ },
  { key: 'checkin_time', re: /เช็[คก]\s?(?:อิน|เอา?ท์)กี่โมง|เวลาเช็[คก]|กี่โมง|(?<![a-z])(?:check[- ]?(?:in|out) time|what time)(?![a-z])/ },
  { key: 'price_info', re: /รวมภาษี|ภาษี|ค่าธรรมเนียม|ค่าบริการ|(?<![a-z])(?:vat|tax\w*|fees?|hidden (?:cost|charge)s?|extra charges?)(?![a-z])/ },
  { key: 'currency_language', re: /สกุลเงิน|ดอลลาร์|เปลี่ยนภาษา|ภาษาอังกฤษ|ภาษาไทย|(?<![a-z])(?:currency|usd|dollars?|change (?:the )?language|english|thai language)(?![a-z])/ },
  { key: 'contact', re: /ติดต่อ|เบอร์โทร|โทรหา|แจ้งปัญหา|ร้องเรียน|(?<![a-z])(?:contact|support|call center|customer service|complain\w*)(?![a-z])/ },
];

// เรื่องที่เกี่ยวกับการเดินทางแต่อยู่นอกขอบเขต — ตอบให้ชัดว่าช่วยไม่ได้ (ถ้ามีเมืองด้วยจะแนะนำที่พักในเมืองนั้นต่อ)
const OFF_TOPICS = [
  { key: 'weather', re: /(?<!ปรับ)อากาศ|ฝนตก|พยากรณ์|(?<![a-z])(?:weather|forecast|rain\w*)(?![a-z])/ },
  { key: 'attractions', re: /ที่เที่ยว|สถานที่ท่องเที่ยว|มีอะไรเที่ยว|เที่ยวอะไร|(?<![a-z])(?:attractions?|things to do|sightseeing|what to see)(?![a-z])/ },
  { key: 'transport', re: /เที่ยวบิน|ตั๋วเครื่องบิน|สายการบิน|รถไฟ|รถทัวร์|เช่ารถ|(?<![a-z])(?:flights?|airlines?|train|bus ticket|car rental|rent a car)(?![a-z])/ },
  { key: 'visa', re: /วีซ่า|พาสปอร์ต|หนังสือเดินทาง|(?<![a-z])(?:visa|passport)(?![a-z])/ },
  { key: 'food', re: /ร้านอาหารแนะนำ|ร้านอร่อย|อาหารอร่อย|กินอะไรดี|(?<![a-z])(?:where to eat|good food|food recommendations?)(?![a-z])/ },
];

// ---------------------------------------------------------------------------
// ข้อมูลจากฐานข้อมูล (เมือง/โรงแรม) → ตัวจับคำ — route โหลดแล้วเก็บ cache ไว้
// ---------------------------------------------------------------------------
// คำที่ไม่ช่วยบอกว่าเป็นโรงแรมไหน (ประเภทที่พัก/คำทั่วไป) — ใช้ตอนจับชื่อโรงแรม
const GENERIC_NAME_WORDS = new Set(['the', 'and', 'of', 'hotel', 'hotels', 'resort', 'resorts', 'villa', 'villas', 'house',
  'guesthouse', 'guest', 'stay', 'stays', 'suites', 'suite', 'retreat', 'boutique', 'apartment', 'apartments', 'inn', 'lodge',
  'hostel', 'residence', 'view', 'city', 'town', 'old', 'new', 'sea', 'river']);

export function prepareCatalog({ hotels = [], cities = [], maxGuests = 4 } = {}) {
  const cityNames = cities.map((row) => row.city);
  const cityByLower = new Map(cityNames.map((city) => [city.toLowerCase(), city]));

  // สถานที่ทั้งหมด (เมือง / ย่าน / ที่ที่ยังไม่มีบนเว็บ) รวมเป็น regex เดียว — คำยาวถูกจับก่อน
  const places = [];
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    const kind = cityByLower.has(city.toLowerCase()) ? 'city' : 'unsupported';
    const value = kind === 'city' ? city : { th: CITY_TH[city] ?? city, en: city };
    aliases.forEach((alias) => places.push([alias, { kind, value }]));
  }
  for (const city of cityNames) places.push([city.toLowerCase(), { kind: 'city', value: city }]);
  for (const area of AREAS) {
    if (cityByLower.has(area.city.toLowerCase())) area.aliases.forEach((alias) => places.push([alias, { kind: 'area', value: area }]));
  }
  for (const place of UNSUPPORTED_PLACES) {
    const near = place.near && cityByLower.has(place.near.toLowerCase()) ? place.near : null;
    place.aliases.forEach((alias) => places.push([alias, { kind: 'unsupported', value: { ...place, near } }]));
  }
  // จุดเที่ยว/จุดสำคัญ (เฉพาะเมืองที่มีที่พักในระบบ) — ชื่อยาวกว่าชื่อเมือง เช่น "สนามบินภูเก็ต" จึงถูกจับก่อน "ภูเก็ต"
  const landmarks = LANDMARKS.filter((landmark) => cityByLower.has(landmark.city.toLowerCase()));
  for (const landmark of landmarks) landmark.aliases.forEach((alias) => places.push([alias, { kind: 'landmark', value: landmark }]));
  // เมืองในฐานข้อมูลชนะเสมอ (ใส่ทีหลัง = ทับค่าเดิมใน lookup)
  const placeEntries = [...places.filter(([, p]) => p.kind === 'unsupported'), ...places.filter(([, p]) => p.kind !== 'unsupported')];

  // ชื่อโรงแรม: จับเมื่อพิมพ์ชื่อเต็ม หรือคำติดกัน 2 คำจากชื่อที่มีคำเฉพาะอย่างน้อย 1 คำ
  //   "skyline tower" → Skyline Tower Bangkok  /  "beach resort" ไม่นับ (เป็นคำทั่วไปทั้งคู่)
  const commonWords = new Set([
    ...GENERIC_NAME_WORDS,
    ...placeEntries.flatMap(([alias]) => alias.split(/\s+/)),
    ...Object.values(AMENITY_WORDS).flat().flatMap((w) => w.split(/\s+/)),
    ...Object.values(TYPE_WORDS).flat().flatMap((w) => w.split(/\s+/)),
  ]);
  const hotelMatchers = hotels.map((hotel) => {
    const tokens = hotel.name.toLowerCase().split(/\s+/).filter((t) => t && t !== 'the');
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const pair = [tokens[i], tokens[i + 1]];
      if (pair.some((t) => t.length >= 3 && !commonWords.has(t))) bigrams.push(pair.join(' '));
    }
    return { ...hotel, full: [hotel.name.toLowerCase(), tokens.join(' ')], bigrams };
  });

  return {
    cities,
    hotels,
    maxGuests,
    landmarks,
    cityByLower,
    hotelsById: new Map(hotels.map((hotel) => [hotel.id, hotel])),
    hotelMatchers,
    placeRegex: placeEntries.length ? new RegExp(`(${alternation(placeEntries.map(([alias]) => alias), { plural: false })})`, 'g') : null,
    placeLookup: makeLookup(placeEntries),
  };
}

function matchHotel(state, catalog) {
  let best = null;
  let tie = false;
  for (const hotel of catalog.hotelMatchers) {
    const fullHit = hotel.full.find((name) => state.text.includes(name));
    const hits = fullHit ? [fullHit] : hotel.bigrams.filter((pair) => state.text.includes(pair));
    const score = fullHit ? 100 : hits.length;
    if (!score) continue;
    if (!best || score > best.score) { best = { hotel, score, hits }; tie = false; } else if (score === best.score) tie = true;
  }
  if (!best || tie) return null;
  for (const hit of best.hits) state.text = state.text.split(hit).join(' '.repeat(hit.length));
  return catalog.hotelsById.get(best.hotel.id);
}

// ---------------------------------------------------------------------------
// filters ที่หน้าเว็บส่งกลับมา = ข้อมูลจากผู้ใช้ → ตรวจทุกช่องก่อนใช้ (รับเฉพาะค่าที่รู้จัก)
// ---------------------------------------------------------------------------
function intIn(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : undefined;
}

function numberIn(value, min, max) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

export function sanitizeFilters(raw, catalog) {
  const filters = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return filters;
  const city = catalog.cityByLower.get(String(raw.city ?? '').toLowerCase());
  if (city) filters.city = city;
  const area = AREA_BY_KEY.get(raw.area);
  if (area && catalog.cityByLower.has(area.city.toLowerCase())) Object.assign(filters, { area: area.key, city: area.city });
  const hotel = catalog.hotelsById.get(Number(raw.propertyId));
  if (hotel) Object.assign(filters, { propertyId: hotel.id, city: hotel.city });
  // จุดอ้างอิงต้องอยู่เมืองเดียวกับที่ค้นหา
  const landmark = LANDMARK_BY_KEY.get(raw.near);
  if (landmark && catalog.cityByLower.has(landmark.city.toLowerCase()) && (!filters.city || filters.city === landmark.city)) {
    Object.assign(filters, { near: landmark.key, city: landmark.city });
    if (raw.far === true) filters.far = true;
  }
  if (isValidDate(raw.checkIn)) filters.checkIn = raw.checkIn;
  if (filters.checkIn && isValidDate(raw.checkOut)) filters.checkOut = raw.checkOut;
  const values = {
    nights: intIn(raw.nights, 1, MAX_NIGHTS),
    guests: intIn(raw.guests, 1, MAX_GUESTS),
    rooms: intIn(raw.rooms, 2, MAX_ROOMS),
    minPrice: numberIn(raw.minPrice, 0, MAX_PRICE),
    maxPrice: numberIn(raw.maxPrice, 0, MAX_PRICE),
    stars: numberIn(raw.stars, 1, 5),
    page: intIn(raw.page, 2, 50),
  };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) filters[key] = value;
  const amenities = parseList(raw.amenities ?? [], AMENITY_KEYS);
  if (amenities.length) filters.amenities = amenities;
  const types = parseList(raw.types ?? [], PROPERTY_TYPES);
  if (types.length) filters.types = types;
  const features = parseList(raw.features ?? [], FEATURE_KEYS);
  if (features.length) filters.features = features;
  if (SORTS[raw.sort] && raw.sort !== 'recommended' && !raw.sort.startsWith('distance')) filters.sort = raw.sort;
  return filters;
}

// ลบเงื่อนไขทีละข้อ (ผู้ใช้กด × ที่ป้ายเงื่อนไขบนหน้าแชท)
export function removeFilter(filters, key) {
  const next = { ...filters };
  const [kind, value] = String(key).split(':');
  if (kind === 'city') ['city', 'area', 'propertyId', 'near', 'far'].forEach((k) => delete next[k]);
  if (kind === 'area' || kind === 'propertyId') delete next[kind];
  if (kind === 'near') ['near', 'far'].forEach((k) => delete next[k]);
  if (kind === 'dates') ['checkIn', 'checkOut', 'nights'].forEach((k) => delete next[k]);
  if (['nights', 'guests', 'rooms', 'stars', 'sort'].includes(kind)) delete next[kind];
  if (kind === 'budget') ['minPrice', 'maxPrice'].forEach((k) => delete next[k]);
  if (kind === 'amenity') next.amenities = (next.amenities ?? []).filter((a) => a !== value);
  if (kind === 'type') next.types = (next.types ?? []).filter((t) => t !== value);
  if (kind === 'feature') next.features = (next.features ?? []).filter((f) => f !== value);
  if (!next.amenities?.length) delete next.amenities;
  if (!next.types?.length) delete next.types;
  if (!next.features?.length) delete next.features;
  delete next.page;
  return next;
}

// ---------------------------------------------------------------------------
// รวมเงื่อนไขเดิม + เงื่อนไขใหม่ แล้วตรวจวันที่
// ---------------------------------------------------------------------------
function mergeFilters(previous, found, { reset, more }) {
  const next = reset ? {} : { ...previous };
  delete next.page;

  // สถานที่: พูดถึงที่ใหม่ = เลิกเจาะจงโรงแรม/ย่านเดิม
  if (found.propertyId) {
    // ระบุชื่อโรงแรม = เริ่มโฟกัสใหม่ เก็บไว้แค่วัน/จำนวนคน (ตัวกรองแนวเลือกดูของเดิมไม่เกี่ยวแล้ว)
    for (const key of Object.keys(next)) if (!['checkIn', 'checkOut', 'nights', 'guests'].includes(key)) delete next[key];
    Object.assign(next, { propertyId: found.propertyId, city: found.city });
  } else if (found.area) {
    Object.assign(next, { area: found.area, city: found.city });
    delete next.propertyId;
  } else if (found.city) {
    next.city = found.city;
    delete next.area;
    delete next.propertyId;
  }
  // เปลี่ยนเงื่อนไขแนวเลือกดู (งบ/ดาว/สิ่งอำนวยความสะดวก/วิว/ประเภท/การเรียง) = ต้องการดูหลายที่ → เลิกเจาะจงโรงแรม
  const browsing = [...BROWSE_KEYS, 'amenities', 'removeAmenities', 'features', 'removeFeatures'].some((k) => found[k] !== undefined);
  if (browsing && !found.propertyId) delete next.propertyId;

  // จุดอ้างอิง ("ใกล้ประตูท่าแพ") — เปลี่ยนไปเมืองอื่นแล้ว จุดเดิมใช้ไม่ได้
  if (found.near) {
    next.near = found.near;
    if (found.far) next.far = true; else delete next.far;
  }
  if (next.near && LANDMARK_BY_KEY.get(next.near)?.city !== next.city) {
    delete next.near;
    delete next.far;
  }
  if (found.features?.length || found.removeFeatures?.length) {
    const set = new Set([...(next.features ?? []), ...(found.features ?? [])]);
    (found.removeFeatures ?? []).forEach((f) => set.delete(f));
    next.features = [...set];
    if (!next.features.length) delete next.features;
  }

  if (found.checkIn) {
    next.checkIn = found.checkIn;
    if (found.checkOut) next.checkOut = found.checkOut; else delete next.checkOut;
  }
  if (found.nights) {
    next.nights = found.nights;
    if (!found.checkOut) delete next.checkOut;
  }
  if (found.guests) next.guests = found.guests;
  if (found.rooms) next.rooms = found.rooms;
  if (next.rooms === 1) delete next.rooms;
  if (found.stars) next.stars = found.stars;
  else if (found.luxury) next.stars = Math.max(next.stars ?? 0, found.luxury === 'more' && (next.stars ?? 0) >= 4.5 ? 5 : 4.5);
  if (found.minPrice !== undefined || found.maxPrice !== undefined) {
    delete next.minPrice;
    delete next.maxPrice;
    if (found.minPrice !== undefined) next.minPrice = found.minPrice;
    if (found.maxPrice !== undefined) next.maxPrice = found.maxPrice;
  }
  if (found.amenities?.length || found.removeAmenities?.length) {
    const set = new Set([...(next.amenities ?? []), ...(found.amenities ?? [])]);
    (found.removeAmenities ?? []).forEach((a) => set.delete(a));
    next.amenities = [...set];
    if (!next.amenities.length) delete next.amenities;
  }
  if (found.types?.length) next.types = found.types;
  if (found.sort) next.sort = found.sort === 'recommended' ? undefined : found.sort;
  if (!next.sort) delete next.sort;
  if (more) next.page = (previous.page ?? 1) + 1;
  return next;
}

// เติม/ตรวจวันที่: มีวันเช็กอินแต่ไม่มีวันเช็กเอาต์ → บวกจำนวนคืน (ไม่บอก = 1 คืน)
function finalizeStay(filters, today, notes) {
  if (filters.nights > MAX_NIGHTS) {
    notes.push({ type: 'too_long' });
    filters.nights = MAX_NIGHTS;
  }
  if (!filters.checkIn) {
    delete filters.checkOut;
    return filters;
  }
  if (!filters.checkOut) filters.checkOut = addDays(filters.checkIn, filters.nights ?? 1);
  let nights = nightsBetween(filters.checkIn, filters.checkOut);
  if (filters.checkIn < today) {
    notes.push({ type: 'past_date' });
    delete filters.checkIn;
    delete filters.checkOut;
    return filters;
  }
  if (nights > MAX_NIGHTS) {
    notes.push({ type: 'too_long' });
    nights = MAX_NIGHTS;
    filters.checkOut = addDays(filters.checkIn, nights);
  }
  filters.nights = nights;
  return filters;
}

// มากันหลายคนเกินกว่าห้องเดียวจะรับได้ → ใช้หลายห้อง (ปัดขึ้น) แล้วบอกผู้ใช้ว่าคิดให้แล้ว
//   เช่น 6 คน ห้องใหญ่สุดในระบบพักได้ 4 คน → อย่างน้อย 2 ห้อง
function fitRooms(filters, catalog, notes, roomsGiven) {
  const guests = filters.guests ?? 1;
  const rooms = filters.rooms ?? 1;
  if (roomsGiven || guests <= catalog.maxGuests * rooms) return filters;
  const needed = Math.ceil(guests / catalog.maxGuests);
  if (needed > MAX_ROOMS) return filters;
  filters.rooms = needed;
  notes.push({ type: 'auto_rooms', guests, rooms: needed, maxGuests: catalog.maxGuests });
  return filters;
}

// ผู้ใช้กด × ที่ป้ายเงื่อนไข หรือกดปุ่ม "ดูเพิ่ม" → ค้นใหม่ด้วยเงื่อนไขเดิม (ไม่ต้องตีความข้อความ)
export function refine(previous, { remove, more = false, today }) {
  const notes = [];
  const next = remove ? removeFilter(previous, remove) : { ...previous };
  if (more) next.page = (previous.page ?? 1) + 1;
  const filters = finalizeStay(next, today, notes);
  return { intent: filters.propertyId ? 'hotel' : 'search', filters, found: {}, notes };
}

// ---------------------------------------------------------------------------
// ตีความข้อความ 1 ข้อความ
//   message   ข้อความที่ผู้ใช้พิมพ์
//   previous  filters ล่าสุด (ผ่าน sanitizeFilters แล้ว)
//   today     วันนี้ตามเวลาไทย 'YYYY-MM-DD'
// คืนค่า { intent, filters, found, notes, faq?, topic?, place? }
// ---------------------------------------------------------------------------
export function interpret(message, { today, catalog, previous = {} }) {
  const original = normalize(message);
  const state = { text: original };
  const found = {};
  const notes = [];

  // 1) ชื่อโรงแรม
  const hotel = matchHotel(state, catalog);
  if (hotel) Object.assign(found, { propertyId: hotel.id, city: hotel.city });

  // 2) สถานที่ (ตัวแรกที่เจอ): เมือง / ย่าน / จุดเที่ยว / ที่ที่ยังไม่มีบนเว็บ
  let unsupported;
  if (catalog.placeRegex) {
    take(state, catalog.placeRegex, ([word], at) => {
      const place = catalog.placeLookup(word);
      if (!place) return false;
      if (place.kind === 'city' && !found.city) found.city = place.value;
      // ย่าน/จุดเที่ยวต้องอยู่ในเมืองเดียวกับที่พูดถึง (ถ้าพูดถึงเมืองมาก่อน)
      const sameCity = !found.city || found.city === place.value.city;
      if (place.kind === 'area' && !found.area && !found.propertyId && sameCity) {
        Object.assign(found, { area: place.value.key, city: place.value.city });
      }
      if (place.kind === 'landmark' && !found.near && sameCity) {
        if (!found.city) found.cityFromLandmark = true;
        Object.assign(found, { near: place.value.key, city: place.value.city });
        if (FAR_BEFORE_RE.test(original.slice(Math.max(0, at - 14), at))) found.far = true;
      }
      if (place.kind === 'unsupported') unsupported = unsupported ?? place.value;
    });
  }

  // 2.1) "ใกล้สนามบิน" / "ใกล้ถนนคนเดิน" → ดูเมืองที่คุยอยู่ว่าหมายถึงที่ไหน ถ้าไม่รู้เมืองและมีหลายที่ → ถามกลับ
  let ambiguousKind;
  take(state, KIND_RE, ([word], at, match) => {
    if (found.near) return false;
    const kind = KIND_LOOKUP(word);
    const city = found.city ?? (RESET_RE.test(original) ? undefined : previous.city);
    const candidates = catalog.landmarks.filter((landmark) => landmark.kind?.startsWith(kind));
    // เมืองที่มีสนามบิน 2 แห่ง (กรุงเทพฯ) เลือกสนามบินหลัก kind 'airport' ก่อน 'airport_secondary'
    const inCity = candidates.filter((landmark) => landmark.city === city).sort((a, b) => a.kind.length - b.kind.length);
    const landmark = city ? inCity[0] : (candidates.length === 1 ? candidates[0] : null);
    if (!landmark) {
      if (city) return false; // เมืองนี้ไม่มีจุดแบบนี้ในรายการ → ปล่อยให้อ่านเป็นอย่างอื่น (เช่น สิ่งอำนวยความสะดวก)
      ambiguousKind = { kind, candidates };
      return true;
    }
    if (!found.city) found.cityFromLandmark = true;
    Object.assign(found, { near: landmark.key, city: landmark.city });
    if (/ไกล|far|away/.test(match)) found.far = true;
    return true;
  });

  // 3–7) วันที่ จำนวนคืน จำนวนคน ดาว งบประมาณ
  Object.assign(found, extractDates(state, today));
  const nights = extractNights(state);
  if (nights) found.nights = nights;
  const rooms = extractRooms(state);
  if (rooms) found.rooms = rooms;
  const guests = extractGuests(state);
  if (guests) found.guests = guests;
  const stars = extractStars(state);
  if (stars) found.stars = stars;
  const budget = extractBudget(state);
  Object.assign(found, budget);

  // 8) เรื่องที่ข้อมูลที่พักไม่มีเลย (หมอก สัตว์เลี้ยง ฯลฯ) → จดไว้บอกผู้ใช้ตรงๆ ว่ายืนยันไม่ได้
  const unknown = new Set();
  take(state, UNKNOWN.regex, ([word]) => {
    const key = UNKNOWN.lookup(word);
    if (!key) return false;
    unknown.add(key);
  });
  if (unknown.size) notes.push({ type: 'unknown_attribute', keys: [...unknown] });

  // 9) วิว / บรรยากาศ — อ่านก่อนสิ่งอำนวยความสะดวก ("วิวทะเล" ≠ "ติดทะเล", "สระส่วนตัว" ≠ "สระ")
  const features = new Set();
  const removeFeatures = new Set();
  take(state, FEATURE.regex, ([word], at) => {
    const key = FEATURE.lookup(word);
    // "รีวิว" (review) มีคำว่า "วิว" อยู่ข้างใน → ไม่ใช่ถามเรื่องวิว
    if (!key || (word.startsWith('วิว') && original.slice(Math.max(0, at - 2), at) === 'รี')) return false;
    (isNegated(original, at) ? removeFeatures : features).add(key);
  });
  // "วิว" ลอยๆ ตามด้วยวิวที่เจาะจง (เช่น "วิว…แม่น้ำ") → ใช้แค่วิวที่เจาะจง
  if (features.has('view') && [...features].some((key) => key.endsWith('_view') || key === 'sunset' || key === 'garden')) features.delete('view');
  if (features.size) found.features = [...features];
  if (removeFeatures.size) found.removeFeatures = [...removeFeatures];

  // 10) สิ่งอำนวยความสะดวก ("ไม่เอาสระ" = เอาออก)
  const amenities = new Set();
  const removeAmenities = new Set();
  take(state, AMENITY.regex, ([word], at) => {
    const key = AMENITY.lookup(word);
    if (!key) return false;
    (isNegated(original, at) ? removeAmenities : amenities).add(key);
  });
  if (amenities.size) found.amenities = [...amenities];
  if (removeAmenities.size) found.removeAmenities = [...removeAmenities];

  // 11) ประเภทที่พัก
  const types = new Set();
  take(state, TYPE.regex, ([word]) => { const type = TYPE.lookup(word); if (type) types.add(type); else return false; });
  if (types.size) found.types = [...types];

  // 12) การเรียงลำดับ / ความหรู
  take(state, SORT.regex, ([word]) => { found.sort = found.sort ?? SORT.lookup(word); });
  take(state, LUXURY_RE, ([word]) => { found.luxury = /กว่านี้|fancier/.test(word) ? 'more' : true; });

  // งบ "ทั้งทริป" → หารจำนวนคืนเป็นงบต่อคืน
  if (found.totalBudget) {
    const tripNights = found.nights
      ?? (found.checkIn && found.checkOut ? nightsBetween(found.checkIn, found.checkOut) : null)
      ?? previous.nights ?? 1;
    found.maxPrice = Math.floor(found.totalBudget / tripNights);
    if (found.minPrice === found.totalBudget) delete found.minPrice;
    notes.push({ type: 'total_budget', total: found.totalBudget, nights: tripNights });
    delete found.totalBudget;
  }

  // 13) เจตนา
  const reset = RESET_RE.test(original);
  const more = MORE_RE.test(original) && Object.keys(previous).length > 0;
  const focusedHotel = found.propertyId ?? (reset ? undefined : previous.propertyId);

  // "ห่างจากสุวรรณภูมิเท่าไหร่" ตอนกำลังคุยเรื่องโรงแรมหนึ่ง = ถามระยะทางของโรงแรมนี้ ไม่ใช่ค้นหาที่พักใกล้สนามบิน
  let distanceTo;
  if (focusedHotel && found.near && DISTANCE_Q_RE.test(original)) {
    distanceTo = found.near;
    delete found.near;
    delete found.far;
    if (found.cityFromLandmark && !found.propertyId) delete found.city;
  }
  delete found.cityFromLandmark;

  // กำลังคุยเรื่องโรงแรมหนึ่งอยู่ แล้วถาม "มีสระไหม" / "วิวภูเขาไหม" = ถามว่าโรงแรมนี้มีไหม ไม่ใช่เพิ่มตัวกรอง
  const priceQuestion = Boolean(focusedHotel) && (PRICE_Q_RE.test(original) || HOW_MUCH_RE.test(original));
  let asked;
  let askedFeatures;
  const browseKeys = found.propertyId ? BROWSE_KEYS.filter((key) => key !== 'city') : BROWSE_KEYS;
  if (focusedHotel && (found.amenities || found.features) && !browseKeys.some((key) => found[key] !== undefined)) {
    asked = found.amenities;
    askedFeatures = found.features;
    ['amenities', 'removeAmenities', 'features', 'removeFeatures'].forEach((key) => delete found[key]);
  }
  const hasFilters = Object.keys(found).length > 0;
  const filters = fitRooms(
    finalizeStay(mergeFilters(previous, found, { reset, more: more && !hasFilters }), today, notes),
    catalog, notes, Boolean(found.rooms),
  );
  const faq = FAQ.find((item) => item.re.test(original));
  // ตรวจหัวข้อนอกขอบเขตกับข้อความที่เหลือ (เช่น "อากาศเย็น" ถูกอ่านเป็นเรื่องที่ไม่มีข้อมูลไปแล้ว ไม่นับเป็นถามพยากรณ์อากาศซ้ำ)
  const topic = OFF_TOPICS.find((item) => item.re.test(state.text))?.key;
  const result = (intent, extra = {}) => ({ intent, filters, found, notes, ...extra });

  if (!original) return result('greeting');
  if (reset && !hasFilters) return result('reset', { filters: {} });
  // "ยกเลิกสระว่ายน้ำ" = เอาเงื่อนไขออก ไม่ใช่ถามเรื่องยกเลิกการจอง
  if (faq && (faq.strong || !hasFilters) && !(faq.key === 'cancel' && found.removeAmenities)) {
    return result('faq', { faq: faq.key });
  }
  if (unsupported && !found.city && !found.propertyId) {
    if (unsupported.near) {
      filters.city = unsupported.near;
      delete filters.area;
      delete filters.propertyId;
    }
    return result('unsupported_place', { place: unsupported });
  }
  if (unsupported) notes.push({ type: 'unsupported_also', place: unsupported });
  // "ใกล้สนามบิน" แต่ไม่รู้ว่าเมืองไหน → ถามกลับพร้อมปุ่มให้เลือก
  if (ambiguousKind && !found.near && !found.city) return result('landmark_choice', { candidates: ambiguousKind.candidates });
  // "มีที่ไหนพาหมาไปได้บ้าง" = ถามเรื่องที่ไม่มีข้อมูล (ไม่ใช่ถามรายชื่อเมือง)
  if (unknown.size && !hasFilters && !focusedHotel) return result('unknown_attribute', { filters: previous });
  if (DESTINATIONS_RE.test(original) && !found.city && !found.propertyId) return result('destinations');
  // "ภูเก็ตมีที่เที่ยวอะไรบ้าง" → บอกรายชื่อจุดที่รู้จักไว้ให้กดหาที่พักใกล้ๆ (ไม่มีรายละเอียดสถานที่)
  if (topic === 'attractions' && !found.near && !found.propertyId) return result('landmarks', { city: filters.city ?? null });
  // "วันนี้อากาศเป็นไง" มีคำบอกวันแต่ไม่ได้ถามเรื่องที่พัก → ตอบว่านอกขอบเขต (ไม่ใช่โชว์ที่พักคืนนี้)
  if (topic && !found.city && !found.propertyId && !SEARCH_RE.test(original)) return result('off_topic', { topic, filters: previous });
  if (topic) notes.push({ type: 'off_topic', topic });
  // ถามถึงโรงแรมที่กำลังคุยอยู่: ระบุชื่อ / ถามราคา / ถามว่ามีสระไหม / ถามระยะทาง / เปลี่ยนวัน-จำนวนคน
  if (filters.propertyId && (found.propertyId || asked || askedFeatures || priceQuestion || distanceTo || (hasFilters && !more))) {
    return result('hotel', { asked, askedFeatures, distanceTo });
  }
  if (hasFilters || more || SEARCH_RE.test(original) || PRICE_Q_RE.test(original)) {
    // ขอดูที่พักแบบทั่วไป (ไม่ได้เอ่ยชื่อโรงแรม) → เลิกเจาะจงโรงแรมที่คุยค้างไว้
    if (!found.propertyId && filters.propertyId) {
      delete filters.propertyId;
      delete filters.page;
    }
    return result('search');
  }
  // ถามแต่เรื่องที่ไม่มีข้อมูล เช่น "มีหมอกไหม" → ตอบตรงๆ ว่ายืนยันไม่ได้
  if (unknown.size) return result('unknown_attribute', { filters: previous });
  if (topic) return result('off_topic', { topic });
  if (HELP_RE.test(original) || GREETING_RE.test(original)) return result('greeting', { help: HELP_RE.test(original) });
  if (THANKS_RE.test(original)) return result('thanks');
  if (BYE_RE.test(original)) return result('bye');
  if (ACK_RE.test(original)) return result('ack');
  return result('unknown');
}
