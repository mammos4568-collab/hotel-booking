// ============================================================
// ผู้ช่วยแนะนำที่พัก — ส่วน "ตอบกลับ"
// รับผลตีความจาก interpret.js → ค้นฐานข้อมูลจริง → ประกอบข้อความ + การ์ดที่พัก + ปุ่มถามต่อ
//   • ข้อความมี 2 ภาษาตามภาษาที่หน้าเว็บใช้อยู่ (lang)
//   • ราคาเขียนเป็น {{price:1234}} → หน้าเว็บแปลงเป็นบาท/ดอลลาร์ตามที่ผู้ใช้เลือก (formatPrice)
//   • ทุกคำตอบมาจากข้อมูลในระบบ หรือข้อความที่เขียนไว้ล่วงหน้าในไฟล์นี้ → ไม่มีการแต่งข้อมูลขึ้นเอง
// ============================================================
import { pool } from '../../db.js';
import { roomAvailabilitySql } from '../../lib/availability.js';
import { searchHotels, serializeHotel } from '../../lib/hotelSearch.js';
import { FEATURES, featureEvidence } from '../../lib/hotelFeatures.js';
import { LANDMARK_BY_KEY, distanceKm } from '../../lib/landmarks.js';
import { MAX_NIGHTS } from '../../lib/dates.js';
import { AMENITY_LABELS, AREAS, CITY_TH, TYPE_LABELS, UNKNOWN_ATTRIBUTES } from './lexicon.js';

const RESULT_LIMIT = 3;
const AREA_BY_KEY = new Map(AREAS.map((area) => [area.key, area]));
const UNKNOWN_BY_KEY = new Map(UNKNOWN_ATTRIBUTES.map((item) => [item.key, item]));
const price = (amount) => `{{price:${Math.round(amount)}}}`;
const featureLabel = (key, lang) => FEATURES[key]?.[lang] ?? key;
const landmarkName = (key, lang) => LANDMARK_BY_KEY.get(key)?.[lang] ?? key;
// ระยะทางสั้นแสดงเป็นเมตร (ปัดหลักร้อย) ยาวแสดงเป็นกิโลเมตร
const formatDistance = (km, lang) => (km < 1
  ? `${Math.max(100, Math.round(km * 10) * 100)} ${lang === 'en' ? 'm' : 'ม.'}`
  : `${km < 10 ? km.toFixed(1) : Math.round(km)} ${lang === 'en' ? 'km' : 'กม.'}`);

const SORT_LABELS = {
  price_asc: { th: 'ราคาถูกก่อน', en: 'Lowest price first' },
  price_desc: { th: 'ราคาสูงก่อน', en: 'Highest price first' },
  rating_desc: { th: 'รีวิวดีก่อน', en: 'Top reviewed first' },
  stars_desc: { th: 'ดาวสูงก่อน', en: 'Most stars first' },
};

const TOPIC_TEXT = {
  weather: { th: 'ผู้ช่วยนี้ไม่มีข้อมูลสภาพอากาศ', en: "I don't have weather information" },
  attractions: { th: 'ผู้ช่วยนี้ไม่มีข้อมูลสถานที่ท่องเที่ยว', en: "I don't have information about attractions" },
  transport: { th: 'ผู้ช่วยนี้ไม่ได้ช่วยเรื่องเที่ยวบินหรือการเดินทาง', en: "I can't help with flights or getting around" },
  visa: { th: 'ผู้ช่วยนี้ไม่มีข้อมูลเรื่องวีซ่าหรือเอกสารเดินทาง', en: "I don't have visa or travel-document information" },
  food: { th: 'ผู้ช่วยนี้ไม่มีข้อมูลร้านอาหาร', en: "I don't have restaurant recommendations" },
};

// ---------------------------------------------------------------------------
// ตัวช่วยจัดข้อความ
// ---------------------------------------------------------------------------
const makeSay = (lang) => (th, en) => (lang === 'en' ? en : th);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const cityName = (city, lang) => (lang === 'en' ? city : CITY_TH[city] ?? city);
const amenityLabel = (key, lang) => AMENITY_LABELS[key]?.[lang] ?? key;
// ป้ายภาษาอังกฤษ: "a pool" → "Pool"
const chipText = (text) => text.replace(/^an? /, '').replace(/^./, (ch) => ch.toUpperCase());

function joinList(items, lang, word = 'and') {
  if (items.length <= 1) return items.join('');
  return lang === 'en'
    ? `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`
    : `${items.slice(0, -1).join(', ')} และ${items.at(-1)}`;
}

// บางอย่างพูดว่า "มี" ไม่ได้ เช่น "ติดชายหาด" (ไม่ใช่ "มีติดชายหาด")
const AMENITY_STATES = {
  beach: { th: ['ติดชายหาด', 'ไม่ติดชายหาด'], en: ['be beachfront', "It's beachfront", "It isn't beachfront"] },
  family: { th: ['เหมาะกับครอบครัว', 'ไม่ได้ระบุว่าเหมาะกับครอบครัว'], en: ['be family friendly', "It's family friendly", "It isn't listed as family friendly"] },
};

// ต่อท้าย "ไม่จำเป็นต้อง…" / "doesn't have to …"
function amenityNeed(key, lang) {
  const special = AMENITY_STATES[key];
  if (special) return lang === 'en' ? special.en[0] : special.th[0];
  return lang === 'en' ? `have ${amenityLabel(key, 'en')}` : `มี${amenityLabel(key, 'th')}`;
}

// ตอบว่าที่พักนี้มี/ไม่มี
function amenityStatus(key, lang, yes) {
  const special = AMENITY_STATES[key];
  if (special) return lang === 'en' ? special.en[yes ? 1 : 2] : special.th[yes ? 0 : 1];
  const label = amenityLabel(key, lang);
  if (lang === 'en') return `It ${yes ? 'has' : "doesn't have"} ${label}`;
  return `${yes ? 'มี' : 'ไม่มี'}${label}`;
}

function placeName(filters, lang) {
  const area = AREA_BY_KEY.get(filters.area);
  if (area) return lang === 'en' ? `${area.en}, ${area.city}` : `ย่าน${area.th} ${cityName(area.city, lang)}`;
  return filters.city ? cityName(filters.city, lang) : null;
}

function formatDay(iso, lang) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

function formatRange(checkIn, checkOut, lang) {
  return checkIn.slice(0, 7) === checkOut.slice(0, 7)
    ? `${Number(checkIn.slice(8))}–${formatDay(checkOut, lang)}`
    : `${formatDay(checkIn, lang)} – ${formatDay(checkOut, lang)}`;
}

// ป้ายเงื่อนไขที่ผู้ช่วยเข้าใจ (หน้าเว็บแสดงเหนือช่องพิมพ์ กด × เพื่อลบทีละข้อได้)
export function buildChips(filters, catalog, lang) {
  const say = makeSay(lang);
  const chips = [];
  const hotel = catalog.hotelsById.get(filters.propertyId);
  if (hotel) chips.push({ key: 'propertyId', label: hotel.name });
  else if (filters.area) chips.push({ key: 'area', label: placeName(filters, lang) });
  else if (filters.city) chips.push({ key: 'city', label: cityName(filters.city, lang) });
  if (filters.near) {
    const name = landmarkName(filters.near, lang);
    chips.push({ key: 'near', label: filters.far ? say(`ห่างจาก${name}`, `Away from ${name}`) : say(`ใกล้${name}`, `Near ${name}`) });
  }
  if (filters.checkIn && filters.checkOut) {
    chips.push({ key: 'dates', label: `${formatRange(filters.checkIn, filters.checkOut, lang)} · ${say(`${filters.nights} คืน`, plural(filters.nights, 'night'))}` });
  } else if (filters.nights) {
    chips.push({ key: 'nights', label: say(`${filters.nights} คืน`, plural(filters.nights, 'night')) });
  }
  if (filters.guests) chips.push({ key: 'guests', label: say(`${filters.guests} ท่าน`, plural(filters.guests, 'guest')) });
  if (filters.rooms > 1) chips.push({ key: 'rooms', label: say(`${filters.rooms} ห้อง`, plural(filters.rooms, 'room')) });
  if (filters.minPrice || filters.maxPrice) {
    const { minPrice: min, maxPrice: max } = filters;
    let label;
    if (min && max) label = `${price(min)}–${price(max)}`;
    else if (max) label = say(`ไม่เกิน ${price(max)}`, `Up to ${price(max)}`);
    else label = say(`${price(min)} ขึ้นไป`, `From ${price(min)}`);
    chips.push({ key: 'budget', label: `${label}${say('/คืน', '/night')}` });
  }
  if (filters.stars) chips.push({ key: 'stars', label: say(`${filters.stars}+ ดาว`, `${filters.stars}+ stars`) });
  for (const type of filters.types ?? []) chips.push({ key: `type:${type}`, label: say(TYPE_LABELS[type].th, chipText(TYPE_LABELS[type].en)) });
  for (const key of filters.amenities ?? []) chips.push({ key: `amenity:${key}`, label: say(amenityLabel(key, 'th'), chipText(amenityLabel(key, 'en'))) });
  for (const key of filters.features ?? []) chips.push({ key: `feature:${key}`, label: featureLabel(key, lang) });
  if (filters.sort) chips.push({ key: 'sort', label: SORT_LABELS[filters.sort][lang] });
  return chips;
}

// วัน/จำนวนคน สำหรับลิงก์ไปหน้าโรงแรม (หน้าโรงแรมจะได้โชว์ราคาและห้องว่างของช่วงเดียวกัน)
function stayQuery(filters) {
  const params = new URLSearchParams();
  if (filters.checkIn && filters.checkOut) {
    params.set('checkIn', filters.checkIn);
    params.set('checkOut', filters.checkOut);
  }
  if (filters.guests) params.set('adults', String(filters.guests));
  if (filters.rooms > 1) params.set('rooms', String(filters.rooms));
  return params.toString();
}

// ลิงก์ "ดูทั้งหมด" ไปหน้าค้นหาด้วยเงื่อนไขเดียวกัน (ชื่อพารามิเตอร์ตรงกับ SearchPage.jsx)
function searchUrl(filters) {
  const params = new URLSearchParams();
  const area = AREA_BY_KEY.get(filters.area);
  if (area) params.set('q', area.text);
  else if (filters.city) params.set('q', filters.city);
  new URLSearchParams(stayQuery(filters)).forEach((value, key) => params.set(key, value));
  if (filters.stars) params.set('stars', String(filters.stars));
  if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
  if (filters.amenities?.length) params.set('amenities', filters.amenities.join(','));
  if (filters.types?.length) params.set('type', filters.types.join(','));
  if (filters.features?.length) params.set('features', filters.features.join(','));
  if (filters.near) params.set('near', filters.near);
  const sort = effectiveSort(filters);
  if (sort !== 'recommended' && !(sort === 'distance' && filters.near)) params.set('sort', sort);
  return `/search?${params}`;
}

// มีจุดอ้างอิงแต่ไม่ได้ขอเรียงแบบอื่น → เรียงตามระยะทาง ("ไกลจาก…" = ไกลสุดก่อน)
function effectiveSort(filters) {
  if (filters.sort) return filters.sort;
  if (filters.near) return filters.far ? 'distance_desc' : 'distance';
  return 'recommended';
}

function searchArgs(filters) {
  const landmark = LANDMARK_BY_KEY.get(filters.near);
  return {
    checkIn: filters.checkIn ?? null,
    checkOut: filters.checkOut ?? null,
    // ทุกห้องต้องมีคนพัก → ถ้าบอกแค่จำนวนห้อง นับคนอย่างน้อยเท่าจำนวนห้อง
    guests: Math.max(filters.guests ?? 1, filters.rooms ?? 1),
    rooms: filters.rooms ?? 1,
    city: filters.city ?? null,
    text: AREA_BY_KEY.get(filters.area)?.text ?? '',
    stars: filters.stars ?? null,
    minPrice: filters.minPrice ?? null,
    maxPrice: filters.maxPrice ?? null,
    amenities: filters.amenities ?? [],
    types: filters.types ?? [],
    near: landmark ? { lat: landmark.lat, lng: landmark.lng } : null,
    features: (filters.features ?? []).map((key) => FEATURES[key].patterns),
    sort: effectiveSort(filters),
    limit: RESULT_LIMIT,
    offset: ((filters.page ?? 1) - 1) * RESULT_LIMIT,
  };
}

// ชื่อ + คำอธิบายของโรงแรมและทุกห้อง → ใช้หาประโยคที่เป็น "หลักฐาน" ว่าตรงวิว/บรรยากาศที่ขอ
async function loadDescriptions(db, hotelIds) {
  if (!hotelIds.length) return {};
  const { rows } = await db.query(
    `SELECT p.property_id, NULL AS room, p.description AS text
       FROM properties p WHERE p.property_id = ANY($1::int[])
     UNION ALL
     SELECT r.property_id, r.room_type_name, r.room_type_name || ' ' || COALESCE(r.description, '')
       FROM rooms r WHERE r.property_id = ANY($1::int[])`,
    [hotelIds],
  );
  const byHotel = {};
  for (const row of rows) {
    if (!row.text) continue;
    (byHotel[row.property_id] ??= []).push({ room: row.room, text: row.text });
  }
  // คำอธิบายของตัวโรงแรมมาก่อนคำอธิบายห้อง (เป็นหลักฐานที่ภาพรวมกว่า)
  for (const texts of Object.values(byHotel)) texts.sort((a, b) => (a.room === null ? 0 : 1) - (b.room === null ? 0 : 1));
  return byHotel;
}

// [{ label: 'วิวภูเขา', quote: 'ห้อง Superior Mountain View: ห้องพักวิวภูเขา…' }] + รายการที่ไม่ตรง
function featureHighlights(featureKeys, texts, lang) {
  const highlights = [];
  const missing = [];
  for (const key of featureKeys) {
    const evidence = featureEvidence(key, texts ?? []);
    if (!evidence) {
      missing.push(featureLabel(key, lang));
      continue;
    }
    const quote = evidence.room
      ? `${lang === 'en' ? 'Room' : 'ห้อง'} ${evidence.room}: ${evidence.text.slice(evidence.room.length + 1)}`
      : evidence.text;
    highlights.push({ label: featureLabel(key, lang), quote });
  }
  return { highlights, missing };
}

// ไม่มีที่ตรงทุกเงื่อนไข → ลองผ่อนทีละข้อ (ข้อที่สำคัญน้อยก่อน) แล้วบอกผู้ใช้ตรงๆ ว่าผ่อนข้อไหน
//   สิ่งอำนวยความสะดวกลองตัดทีละอย่างก่อน (เช่น ตัดแค่ "ติดชายหาด" แต่ยังมีสระ) แล้วค่อยตัดทั้งหมด
//   args = ค่าที่เปลี่ยนตอนค้น · filters = ค่าที่เปลี่ยนในลิงก์ "ดูทั้งหมด" (ให้ตรงกับผลที่แสดง)
function relaxations(filters) {
  const list = [];
  if (filters.features?.length) list.push({ key: 'features', args: { features: [] }, filters: { features: [] } });
  const amenities = filters.amenities ?? [];
  if (amenities.length > 1) {
    for (const dropped of [...amenities].reverse()) {
      const rest = amenities.filter((a) => a !== dropped);
      list.push({ key: 'amenities', dropped: [dropped], args: { amenities: rest }, filters: { amenities: rest } });
    }
  }
  if (amenities.length) list.push({ key: 'amenities', dropped: amenities, args: { amenities: [] }, filters: { amenities: [] } });
  if (filters.types?.length) list.push({ key: 'types', args: { types: [] }, filters: { types: [] } });
  if (filters.stars) list.push({ key: 'stars', args: { stars: null }, filters: { stars: null } });
  if (filters.minPrice || filters.maxPrice) {
    const sort = filters.maxPrice ? 'price_asc' : 'price_desc';
    list.push({ key: 'budget', args: { minPrice: null, maxPrice: null, sort }, filters: { minPrice: null, maxPrice: null, sort } });
  }
  if (filters.area) list.push({ key: 'area', args: { text: '' }, filters: { area: null } });
  return list;
}

function relaxText(relaxation, filters, hotels, lang) {
  const say = makeSay(lang);
  const needs = (relaxation.dropped ?? []).map((a) => amenityNeed(a, lang));
  const features = (filters.features ?? []).map((key) => featureLabel(key, lang));
  switch (relaxation.key) {
    case 'features': return say(`ไม่เน้น${joinList(features, 'th')}`, `you're flexible on ${joinList(features.map((f) => f.toLowerCase()), 'en')}`);
    case 'amenities': return say(`ไม่จำเป็นต้อง${joinList(needs, 'th')}`, `it doesn't have to ${joinList(needs, 'en', 'or')}`);
    case 'types': return say('ไม่จำกัดประเภทที่พัก', 'any type of property works');
    case 'stars': return say('ลดระดับดาวลงได้', 'a lower star rating is fine');
    case 'budget': return filters.maxPrice
      ? say(`ขยับงบขึ้นได้ (ที่ถูกที่สุดเริ่มต้น ${price(hotels[0].nightlyFrom)}/คืน)`, `you can stretch the budget (the cheapest starts at ${price(hotels[0].nightlyFrom)}/night)`)
      : say('ลดงบขั้นต่ำลงได้', 'a lower price is fine');
    default: return say(`ไปที่อื่นใน${cityName(filters.city, lang)}ได้`, `anywhere in ${filters.city} works`);
  }
}

function notesText(notes, lang) {
  const say = makeSay(lang);
  return notes.map((note) => {
    switch (note.type) {
      case 'past_date': return say('วันที่ที่ระบุผ่านมาแล้ว เลยยังไม่ได้ใส่วันเข้าพักให้ บอกวันใหม่ได้เลย', 'That date has already passed, so I left the dates out — just tell me new ones.');
      case 'too_long': return say(`จองได้ครั้งละไม่เกิน ${MAX_NIGHTS} คืน เลยปรับเป็น ${MAX_NIGHTS} คืน`, `Stays are limited to ${MAX_NIGHTS} nights, so I used ${MAX_NIGHTS}.`);
      case 'total_budget': return say(
        `งบทั้งทริป ${price(note.total)} สำหรับ ${note.nights} คืน เท่ากับประมาณ ${price(note.total / note.nights)}/คืน`,
        `A ${price(note.total)} trip budget over ${plural(note.nights, 'night')} is about ${price(note.total / note.nights)}/night.`,
      );
      case 'off_topic': return say(`${TOPIC_TEXT[note.topic].th} แต่ช่วยหาที่พักให้ได้`, `${TOPIC_TEXT[note.topic].en}, but I can help with places to stay.`);
      case 'unsupported_also': return say(`ยังไม่มีที่พักใน${note.place.th}บนเว็บนี้`, `We don't list stays in ${note.place.en} yet.`);
      case 'auto_rooms': return say(
        `${note.guests} ท่านต้องใช้อย่างน้อย ${note.rooms} ห้อง (ห้องหนึ่งพักได้สูงสุด ${note.maxGuests} ท่าน) เลยค้นหาแบบ ${note.rooms} ห้องให้`,
        `${note.guests} guests need at least ${note.rooms} rooms (max ${note.maxGuests} per room), so I searched for ${note.rooms} rooms.`,
      );
      // เช่น "มีหมอก" — ไม่มีที่พักไหนในระบบระบุไว้ → บอกตรงๆ ว่ายืนยันไม่ได้ แทนที่จะเดาว่ามี
      case 'unknown_attribute': {
        const items = note.keys.map((key) => UNKNOWN_BY_KEY.get(key));
        const seasonal = items.some((item) => item.seasonal);
        return say(
          `ข้อมูลที่พักในระบบไม่ได้ระบุเรื่อง${joinList(items.map((item) => item.th), 'th')} จึงยืนยันให้ไม่ได้${seasonal ? ' (เรื่องนี้ขึ้นกับฤดูกาลและสภาพอากาศด้วย)' : ''}`,
          `Our property data doesn't mention ${joinList(items.map((item) => item.en), 'en')}, so I can't confirm it${seasonal ? ' (it also depends on the season and weather)' : ''}.`,
        );
      }
      default: return '';
    }
  }).filter(Boolean);
}

function starterSuggestions(lang) {
  return lang === 'en'
    ? ['Beachfront stays in Phuket for 2', 'Chiang Mai this weekend under 2000 baht', 'Bangkok hotels with a pool', 'Can I cancel a booking?']
    : ['ที่พักติดทะเลในภูเก็ต 2 คน', 'สุดสัปดาห์นี้ที่เชียงใหม่ งบไม่เกิน 2000', 'โรงแรมกรุงเทพฯ มีสระว่ายน้ำ', 'ยกเลิกการจองได้ไหม'];
}

function citySuggestions(catalog, lang, count = 4, except = null) {
  return catalog.cities
    .filter((row) => row.city !== except)
    .slice(0, count)
    .map((row) => (lang === 'en' ? `Stays in ${row.city}` : `ที่พักใน${cityName(row.city, 'th')}`));
}

// ---------------------------------------------------------------------------
// ค้นหาที่พัก (พร้อมผ่อนเงื่อนไขเมื่อไม่เจอ)
// ---------------------------------------------------------------------------
async function searchReply(result, { lang, catalog, db, lead = [] }) {
  const say = makeSay(lang);
  const { filters } = result;
  const args = searchArgs(filters);
  let { hotels, total, nights } = await searchHotels(db, args);

  // "ดูเพิ่ม" จนสุดแล้ว → แจ้งว่าครบแล้ว และกลับไปหน้าแรกของผลลัพธ์
  let exhausted = false;
  if (!hotels.length && filters.page > 1) {
    delete filters.page;
    ({ hotels, total, nights } = await searchHotels(db, { ...args, offset: 0 }));
    exhausted = total > 0;
  }

  // วิว/บรรยากาศหลายข้อแล้วไม่มีที่ไหนตรงครบ (เช่น วิวภูเขา + ร่มรื่น) → แสดงที่ที่ตรงบางข้อ เรียงจากตรงมากสุด
  // ดีกว่าตอบว่า "ไม่พบ" เพราะเรื่องบรรยากาศคนส่วนใหญ่ยอมรับที่ใกล้เคียงได้
  let partial = false;
  const features = filters.features ?? [];
  if (!total && features.length > 1) {
    const candidates = await searchHotels(db, { ...args, features: [], offset: 0, limit: 50 });
    const texts = await loadDescriptions(db, candidates.hotels.map((hotel) => hotel.id));
    const scored = candidates.hotels
      .map((hotel, index) => ({ hotel, index, matched: features.filter((key) => featureEvidence(key, texts[hotel.id] ?? [])).length }))
      .filter((item) => item.matched > 0)
      .sort((a, b) => b.matched - a.matched || a.index - b.index);
    if (scored.length) {
      hotels = scored.slice(0, RESULT_LIMIT).map((item) => item.hotel);
      total = scored.length;
      nights = candidates.nights;
      partial = true;
    }
  }

  let relaxed = null;
  if (!total) {
    for (const relaxation of relaxations(filters)) {
      const attempt = await searchHotels(db, { ...args, offset: 0, ...relaxation.args });
      if (attempt.total) {
        ({ hotels, total, nights } = attempt);
        relaxed = relaxation;
        break;
      }
    }
  }

  // ติดหลักฐานให้ทุกการ์ด: ประโยคจากคำอธิบายจริงที่ทำให้นับว่าตรงวิว/บรรยากาศที่ขอ
  if (features.length && hotels.length && relaxed?.key !== 'features') {
    const texts = await loadDescriptions(db, hotels.map((hotel) => hotel.id));
    hotels = hotels.map((hotel) => ({ ...hotel, ...featureHighlights(features, texts[hotel.id], lang) }));
  }

  const where = placeName(filters, lang);
  const nearName = filters.near ? landmarkName(filters.near, lang) : null;
  const lines = [...lead, ...notesText(result.notes, lang)];
  const page = filters.page ?? 1;
  if (partial) {
    const labels = joinList(features.map((key) => featureLabel(key, lang)), lang);
    lines.push(say(
      `ไม่มีที่พัก${where ? `ใน${where}` : ''}ที่ตรงครบทุกข้อ (${labels}) นี่คือที่ที่ตรงบางข้อ เรียงจากตรงมากที่สุด`,
      `No stay${where ? ` in ${where}` : ''} has all of: ${labels} — here are the closest matches.`,
    ));
  } else if (relaxed) {
    lines.push(say(
      `ไม่มีที่พัก${where ? `ใน${where}` : ''}ที่ตรงทุกเงื่อนไข แต่ถ้า${relaxText(relaxed, filters, hotels, lang)} มีตัวเลือกเหล่านี้`,
      `Nothing${where ? ` in ${where}` : ''} matches everything, but if ${relaxText(relaxed, filters, hotels, lang)}, here are some options.`,
    ));
  } else if (!total) {
    lines.push(say(`ไม่พบที่พัก${where ? `ใน${where}` : ''}ที่ตรงกับเงื่อนไข`, `I couldn't find any stays${where ? ` in ${where}` : ''} that match.`));
    if (filters.guests > catalog.maxGuests * (filters.rooms ?? 1)) {
      lines.push(say(`ห้องพักแต่ละห้องรองรับได้สูงสุด ${catalog.maxGuests} ท่าน ลองแยกจองหลายห้อง`, `Each room takes up to ${catalog.maxGuests} guests — try booking more than one room.`));
    } else if (filters.checkIn) {
      lines.push(say('ช่วงวันที่เลือกอาจเต็มแล้ว ลองเปลี่ยนวัน ลดจำนวนผู้เข้าพัก หรือกด × ที่เงื่อนไขด้านล่างเพื่อลบออก', 'Those dates may be fully booked — try other dates, fewer guests, or tap × on a filter below to remove it.'));
    } else {
      lines.push(say('ลองเปลี่ยนเมือง หรือกด × ที่เงื่อนไขด้านล่างเพื่อลบออก', 'Try another city, or tap × on a filter below to remove it.'));
    }
  } else if (exhausted) {
    lines.push(say(`แสดงครบทั้ง ${total} ที่พักแล้ว นี่คือที่แนะนำอันดับแรกอีกครั้ง`, `That's every match (${total} in total) — here are the top picks again.`));
  } else if (page > 1) {
    const from = (page - 1) * RESULT_LIMIT + 1;
    lines.push(say(`ตัวเลือกเพิ่มเติม (${from}–${from + hotels.length - 1} จาก ${total} ที่พัก)`, `More options (${from}–${from + hotels.length - 1} of ${total})`));
  } else {
    let order = filters.sort ? ` (${SORT_LABELS[filters.sort][lang].toLowerCase()})` : '';
    if (!filters.sort && nearName) {
      order = filters.far
        ? say(` เรียงจากไกล${nearName}ที่สุด`, ` — farthest from ${nearName} first`)
        : say(` เรียงจากใกล้${nearName}ที่สุด`, ` — closest to ${nearName} first`);
    }
    lines.push(say(
      `พบ ${total} ที่พัก${where ? `ใน${where}` : ''}ที่ตรงกับความต้องการ${order}${total > hotels.length ? ` นี่คือ ${hotels.length} แห่งแรก` : ''}`,
      `I found ${plural(total, 'stay')}${where ? ` in ${where}` : ''} that match${total === 1 ? 'es' : ''}${order}${total > hotels.length ? ` (top ${hotels.length} below)` : ''}.`,
    ));
  }
  if (total && features.length && relaxed?.key !== 'features') {
    lines.push(say('ดูจากคำอธิบายของที่พักและห้องพักจริง (ข้อความใต้ชื่อแต่ละที่)', "Matched against each property's own description (quoted under its name)."));
  }
  if (total && nearName) {
    lines.push(say('ระยะทางเป็นระยะเส้นตรงโดยประมาณ ไม่ใช่ระยะเดินทางจริง', 'Distances are approximate straight-line distances, not travel routes.'));
  }
  if (total && !filters.checkIn) {
    lines.push(say('บอกวันเข้าพักเพิ่มได้ เช่น "พรุ่งนี้ 2 คืน" จะได้เห็นห้องว่างและราคารวมจริง', 'Add your dates (e.g. "tomorrow, 2 nights") to see real availability and total prices.'));
  }

  const suggestions = [];
  if (total > page * RESULT_LIMIT && !relaxed && !partial) suggestions.push(say('ดูเพิ่มอีก', 'Show more'));
  if (total && filters.sort !== 'price_asc') suggestions.push(say('ถูกกว่านี้', 'Cheaper options'));
  if (!filters.checkIn) suggestions.push(say('สุดสัปดาห์นี้', 'This weekend'));
  if (!filters.guests) suggestions.push(say('2 คน', '2 guests'));
  if (!filters.amenities?.includes('pool')) suggestions.push(say('มีสระว่ายน้ำ', 'With a pool'));
  if (filters.sort !== 'rating_desc') suggestions.push(say('รีวิวดีที่สุด', 'Top rated'));
  if (!filters.city) suggestions.push(...citySuggestions(catalog, lang, 2));

  return {
    reply: lines.join('\n'),
    hotels,
    total,
    nights,
    relaxed: relaxed?.key ?? (partial ? 'partial' : null),
    nearLabel: nearName,
    suggestions: suggestions.slice(0, 4),
    // ผลแบบ "ตรงบางข้อ" ไม่มีหน้าค้นหาที่กรองแบบเดียวกัน → ไม่ทำลิงก์ "ดูทั้งหมด" (กันโชว์ผลที่ไม่ตรงกับที่บอก)
    searchUrl: total && !partial ? searchUrl(relaxed ? { ...filters, ...relaxed.filters } : filters) : null,
  };
}

// ---------------------------------------------------------------------------
// ข้อมูลโรงแรมที่ระบุชื่อ: สิ่งอำนวยความสะดวก + ประเภทห้อง + ราคา/ห้องว่าง (ถ้าบอกวัน)
// ---------------------------------------------------------------------------
async function hotelReply(result, { lang, catalog, db }) {
  const say = makeSay(lang);
  const { filters, asked, askedFeatures } = result;
  const hasDates = Boolean(filters.checkIn && filters.checkOut);
  const roomCount = filters.rooms ?? 1;
  const guests = Math.max(filters.guests ?? 1, roomCount);
  const landmark = LANDMARK_BY_KEY.get(result.distanceTo ?? filters.near);

  const [{ rows: [row] }, { rows: rooms }, available, texts] = await Promise.all([
    db.query(
      `SELECT p.*, rv.avg_rating, rv.review_count
         FROM properties p
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS review_count
             FROM reviews WHERE property_id = p.property_id
         ) rv ON TRUE
        WHERE p.property_id = $1`,
      [filters.propertyId],
    ),
    db.query(
      `WITH ra AS (${roomAvailabilitySql(2, 3)})
       SELECT r.room_type_name AS name, r.max_guests, r.base_price_per_night::float AS base_price,
              ra.available, ra.stay_price, ra.nights
         FROM rooms r
         JOIN ra ON ra.room_id = r.room_id
        WHERE r.property_id = $1
        ORDER BY r.base_price_per_night, r.room_id`,
      [filters.propertyId, hasDates ? filters.checkIn : null, hasDates ? filters.checkOut : null],
    ),
    searchHotels(db, { checkIn: filters.checkIn, checkOut: filters.checkOut, guests, rooms: roomCount, propertyId: filters.propertyId, limit: 1 }),
    askedFeatures?.length ? loadDescriptions(db, [filters.propertyId]) : {},
  ]);
  if (!row) return searchReply({ ...result, filters: { ...filters, propertyId: undefined } }, { lang, catalog, db });

  const hotel = serializeHotel(row);
  // ระยะทางเส้นตรงจากโรงแรมถึงจุดที่ถาม (พิกัดโรงแรมอยู่ในตาราง properties)
  const distance = landmark && row.latitude !== null
    ? distanceKm(Number(row.latitude), Number(row.longitude), landmark.lat, landmark.lng)
    : null;
  const card = {
    ...(available.hotels[0] ?? {
      ...hotel,
      nightlyFrom: rooms.length ? Math.min(...rooms.map((room) => room.base_price)) : null,
      stayFrom: null,
      roomsLeft: hasDates ? 0 : null,
    }),
    distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
  };
  const typeLabel = lang === 'en' ? hotel.type : TYPE_LABELS[hotel.type]?.th ?? hotel.type;
  const lines = [...notesText(result.notes, lang)];
  lines.push(`${hotel.name} · ${typeLabel} ${hotel.stars ?? '-'}${say(' ดาว', '★')} · ${cityName(hotel.city, lang)}`);
  lines.push(hotel.rating !== null
    ? say(`คะแนนรีวิว ${hotel.rating}/5 จาก ${hotel.reviewCount} รีวิว`, `Rated ${hotel.rating}/5 from ${plural(hotel.reviewCount, 'review')}`)
    : say('ยังไม่มีรีวิว', 'No reviews yet'));
  if (distance !== null) {
    lines.push(say(
      `ห่างจาก${landmark.th}ประมาณ ${formatDistance(distance, 'th')} (ระยะเส้นตรง ไม่ใช่ระยะเดินทางจริง)`,
      `About ${formatDistance(distance, 'en')} from ${landmark.en} (straight-line distance, not a travel route)`,
    ));
  }

  // ตอบทีละข้อที่ถาม: สิ่งอำนวยความสะดวกดูจากรายการของโรงแรม · วิว/บรรยากาศดูจากคำอธิบาย (ยกประโยคมาให้เห็น)
  for (const key of asked ?? []) {
    const yes = hotel.amenities.includes(key);
    lines.push(`${yes ? '✓' : '✗'} ${amenityStatus(key, lang, yes)}`);
  }
  if (askedFeatures?.length) {
    const { highlights, missing } = featureHighlights(askedFeatures, texts[hotel.id], lang);
    for (const item of highlights) lines.push(`✓ ${item.label} — “${item.quote}”`);
    for (const label of missing) lines.push(say(`✗ คำอธิบายของที่พักนี้ไม่ได้พูดถึง${label}`, `✗ ${label} isn't mentioned in this property's description`));
  }
  if (!asked?.length && !askedFeatures?.length && hotel.amenities.length) {
    lines.push(say(
      `สิ่งอำนวยความสะดวก: ${hotel.amenities.map((key) => amenityLabel(key, 'th')).join(', ')}`,
      `Amenities: ${hotel.amenities.map((key) => chipText(amenityLabel(key, 'en'))).join(', ')}`,
    ));
  }

  lines.push(hasDates
    ? say(`ห้องพัก ${formatRange(filters.checkIn, filters.checkOut, lang)} (${filters.nights} คืน):`, `Rooms for ${formatRange(filters.checkIn, filters.checkOut, lang)} (${plural(filters.nights, 'night')}):`)
    : say('ห้องพัก (ราคาเริ่มต้นต่อคืน):', 'Rooms (from, per night):'));
  for (const room of rooms.slice(0, 4)) {
    const capacity = say(`${room.max_guests} ท่าน`, plural(room.max_guests, 'guest'));
    let status;
    if (!hasDates) status = `${price(room.base_price)}${say('/คืน', '/night')}`;
    else if (room.available < 1) status = say('เต็ม', 'sold out');
    else if (room.available < roomCount) status = say(`ว่างไม่พอ (เหลือ ${room.available} ห้อง)`, `only ${room.available} left`);
    else if (roomCount > 1) status = say(`${roomCount} ห้อง รวม ${price(room.stay_price * roomCount)}`, `${roomCount} rooms ${price(room.stay_price * roomCount)} total`);
    else status = say(`รวม ${price(room.stay_price)} · ว่าง ${room.available} ห้อง`, `${price(room.stay_price)} total · ${room.available} left`);
    const tooSmall = guests > room.max_guests * roomCount;
    lines.push(`• ${room.name} — ${capacity} · ${status}${tooSmall ? say(' (พักได้ไม่ถึงจำนวนที่ต้องการ)', ' (too small for your group)') : ''}`);
  }

  // วัน/จำนวนคนที่ต้องการไม่ว่าง → แนะนำที่อื่นในเมืองเดียวกันที่ยังว่าง
  let alternatives = [];
  if (!available.hotels.length && (hasDates || guests > 1)) {
    lines.push(hasDates
      ? say(`ช่วงวันที่เลือกไม่มีห้องว่างสำหรับ ${guests} ท่าน`, `No room is available for ${plural(guests, 'guest')} on those dates.`)
      : say(`ไม่มีห้องที่พักได้ ${guests} ท่านในห้องเดียว`, `No single room here fits ${plural(guests, 'guest')}.`));
    const others = await searchHotels(db, { ...searchArgs({ ...filters, area: undefined }), city: hotel.city, limit: RESULT_LIMIT + 1, offset: 0 });
    alternatives = others.hotels.filter((other) => other.id !== hotel.id).slice(0, 2);
    if (alternatives.length) lines.push(say(`ที่พักอื่นใน${cityName(hotel.city, lang)}ที่ยังว่าง:`, `Other stays in ${hotel.city} with space:`));
  } else if (!hasDates) {
    lines.push(say('บอกวันเข้าพักได้ เช่น "พรุ่งนี้ 2 คืน" จะเช็กห้องว่างและราคารวมให้', 'Tell me your dates (e.g. "tomorrow, 2 nights") and I\'ll check availability.'));
  }

  const suggestions = [];
  if (!hasDates) suggestions.push(say('พรุ่งนี้ 1 คืน', 'Tomorrow, 1 night'), say('สุดสัปดาห์นี้', 'This weekend'));
  if (!asked?.includes('breakfast')) suggestions.push(say('มีอาหารเช้าไหม', 'Is breakfast included?'));
  suggestions.push(say(`ที่พักอื่นใน${cityName(hotel.city, 'th')}`, `Other stays in ${hotel.city}`));
  const query = stayQuery(filters);
  const hotelUrl = `/hotels/${hotel.id}${query ? `?${query}` : ''}`;

  return {
    reply: lines.join('\n'),
    hotels: [card, ...alternatives],
    total: 1,
    nights: hasDates ? filters.nights : 0,
    nearLabel: landmark ? landmark[lang] : null,
    suggestions: suggestions.slice(0, 4),
    links: [{ label: say('ดูรายละเอียดและจอง', 'View & book'), to: hotelUrl }],
    searchUrl: hotelUrl,
  };
}

// ---------------------------------------------------------------------------
// คำถามทั่วไปเกี่ยวกับเว็บ — คำตอบเขียนให้ตรงกับระบบจริง (กติกาการจอง/ยกเลิก/ชำระเงินใน modules/booking)
// ---------------------------------------------------------------------------
function faqReply(key, lang) {
  const say = makeSay(lang);
  const myBookings = { label: say('การจองของฉัน', 'My bookings'), to: '/my-bookings' };
  const answers = {
    how_to_book: [say(
      'จองได้ใน 4 ขั้นตอน:\n1) ค้นหาเมืองและเลือกวันเข้าพัก\n2) เปิดหน้าที่พักแล้วเลือกประเภทห้อง\n3) กรอกข้อมูลผู้เข้าพัก (ต้องเข้าสู่ระบบ)\n4) ชำระเงินภายใน 15 นาทีเพื่อยืนยันการจอง',
      'Booking takes 4 steps:\n1) Search a city and pick your dates\n2) Open a property and choose a room type\n3) Enter guest details (sign-in required)\n4) Pay within 15 minutes to confirm',
    ), [{ label: say('ค้นหาที่พัก', 'Search stays'), to: '/search' }]],
    payment: [say(
      'ชำระได้ด้วยบัตรเครดิต/เดบิต, QR พร้อมเพย์ หรือ TrueMoney Wallet (เป็นการชำระเงินจำลองของโปรเจกต์) ราคาคิดเป็นเงินบาท ระบบเก็บเฉพาะเลข 4 หลักท้ายของบัตร ไม่เก็บเลขบัตรเต็ม CVC หรือเบอร์วอลเล็ต',
      'You can pay by credit/debit card, PromptPay QR or TrueMoney Wallet (payments are simulated in this project). Prices are charged in Thai baht; only the last 4 card digits are stored — never the full number, CVC or wallet phone number.',
    ), [myBookings]],
    hold: [say(
      'หลังกดจอง ระบบกันห้องไว้ให้ 15 นาที ถ้าไม่ชำระภายในเวลานี้การจองจะหมดอายุและห้องจะกลับไปให้คนอื่นจองได้ (มีการจองที่รอชำระพร้อมกันได้ไม่เกิน 3 รายการ)',
      'After you book, the room is held for 15 minutes. If you don\'t pay in time the booking expires and the room is released (you can have up to 3 unpaid bookings at once).',
    ), [myBookings]],
    cancel: [say(
      'ยกเลิกได้ฟรีจนถึงวันก่อนวันเช็กอิน ที่หน้า "การจองของฉัน" ถ้าชำระเงินแล้วระบบจะคืนเงินให้อัตโนมัติ',
      'You can cancel for free up to the day before check-in from "My bookings". If you have already paid, you are refunded automatically.',
    ), [myBookings]],
    my_bookings: [say(
      'ดูการจองทั้งหมดได้ที่หน้า "การจองของฉัน" (ต้องเข้าสู่ระบบ) มีทั้งรายการที่รอชำระ ยืนยันแล้ว และเข้าพักเสร็จแล้ว พร้อมเลขที่การจอง',
      'All your bookings — awaiting payment, confirmed and completed, with booking references — are on "My bookings" (sign-in required).',
    ), [myBookings]],
    confirmation: [say(
      'เมื่อชำระเงินสำเร็จ การจองจะได้รับการยืนยันทันที และดูรายละเอียดกับเลขที่การจองได้ที่หน้า "การจองของฉัน" (ตอนนี้ระบบยังไม่ส่งอีเมลยืนยัน)',
      'Your booking is confirmed as soon as payment succeeds; details and the booking reference are on "My bookings" (the site does not send confirmation emails yet).',
    ), [myBookings]],
    review: [say(
      'เขียนรีวิวได้หลังเข้าพักเสร็จ (ถึงวันเช็กเอาต์แล้ว) ที่หน้า "การจองของฉัน" → เลือกการจองนั้น ชื่อผู้รีวิวจะแสดงแบบย่อ เช่น "Ploy S."',
      'Once your stay is complete (check-out date reached), open the booking in "My bookings" to write a review. Reviewer names are shortened, e.g. "Ploy S.".',
    ), [myBookings]],
    account: [say(
      'สมัครสมาชิกหรือเข้าสู่ระบบได้จากปุ่มมุมขวาบนของหน้าเว็บ ค้นหาและดูราคาได้โดยไม่ต้องล็อกอิน แต่ต้องล็อกอินตอนกดจอง',
      'Sign up or sign in from the top-right of any page. You can search and see prices without an account; you only need to sign in to book.',
    ), []],
    privacy: [say(
      'เว็บนี้เก็บข้อมูลส่วนบุคคลเท่าที่จำเป็นต่อการจองตาม PDPA ดาวน์โหลดสำเนาข้อมูลหรือลบบัญชีได้เองที่หน้า "ข้อมูลส่วนบุคคลของฉัน" — ข้อความที่คุยกับผู้ช่วยนี้ไม่ถูกบันทึก',
      'We only keep the personal data needed for bookings, under Thailand\'s PDPA. You can download your data or delete your account yourself on "My personal data". Messages to this assistant are not stored.',
    ), [{ label: say('นโยบายความเป็นส่วนตัว', 'Privacy policy'), to: '/privacy' }, { label: say('ข้อมูลส่วนบุคคลของฉัน', 'My personal data'), to: '/privacy/my-data' }]],
    price_info: [say(
      'ราคาที่แสดงเป็นราคาต่อห้องต่อคืน รวมภาษีแล้ว ไม่มีค่าธรรมเนียมเพิ่มตอนชำระเงิน ราคาอาจต่างกันตามวัน เช่น คืนวันศุกร์–เสาร์ และช่วงปีใหม่',
      'Prices are per room per night and include taxes, with no extra fees at checkout. They can vary by date — e.g. Friday/Saturday nights and New Year.',
    ), []],
    checkin_time: [say(
      'เวลาเช็กอิน–เช็กเอาต์ขึ้นอยู่กับที่พักแต่ละแห่ง (ส่วนใหญ่เช็กอินหลัง 14:00 และเช็กเอาต์ก่อน 12:00) ระบบนับการเข้าพักเป็นคืน วันเช็กเอาต์ไม่นับเป็นคืนที่พัก',
      'Check-in and check-out times depend on the property (usually check-in after 2 pm and check-out by noon). Stays are counted in nights — the check-out day is not a night.',
    ), []],
    currency_language: [say(
      'เปลี่ยนภาษา (ไทย/อังกฤษ) และสกุลเงิน (บาท/ดอลลาร์) ได้ที่ปุ่มมุมขวาบนของหน้าเว็บ ราคาดอลลาร์เป็นค่าประมาณ (1 USD ≈ 35 บาท) การชำระเงินคิดเป็นเงินบาท',
      'Switch language (Thai/English) and currency (THB/USD) from the top-right of the page. USD prices are estimates (1 USD ≈ 35 THB); payments are in baht.',
    ), []],
    contact: [say(
      'การจองจัดการเองได้ที่หน้า "การจองของฉัน" ส่วนเรื่องข้อมูลส่วนบุคคลติดต่อ privacy@hotelbooking.example',
      'You can manage bookings yourself on "My bookings". For personal-data requests, email privacy@hotelbooking.example.',
    ), [myBookings]],
  };
  const [reply, links] = answers[key];
  return { reply, links };
}

// ---------------------------------------------------------------------------
// ประกอบคำตอบตามเจตนา
// ---------------------------------------------------------------------------
export async function respond(result, { lang = 'th', catalog, db = pool }) {
  const say = makeSay(lang);
  const ctx = { lang, catalog, db };
  const where = placeName(result.filters, lang);
  let body = {};

  switch (result.intent) {
    case 'search':
      body = await searchReply(result, ctx);
      break;
    case 'hotel':
      body = await hotelReply(result, ctx);
      break;
    case 'faq': {
      body = faqReply(result.faq, lang);
      // ถามเรื่องทั่วไปพร้อมเอ่ยถึงเมือง → มีปุ่มพาไปดูที่พักในเมืองนั้นต่อ
      body.suggestions = where
        ? [say(`ดูที่พักใน${where}`, `Show stays in ${where}`)]
        : [say('แนะนำที่พักหน่อย', 'Recommend a stay'), ...(result.faq === 'how_to_book' ? [] : [say('จองยังไง', 'How do I book?')])];
      break;
    }
    case 'destinations': {
      const lines = catalog.cities.map((row) => say(
        `• ${cityName(row.city, 'th')} — ${row.hotels} แห่ง เริ่มต้น ${price(row.minPrice)}/คืน`,
        `• ${row.city} — ${plural(row.hotels, 'property', 'properties')} from ${price(row.minPrice)}/night`,
      ));
      body = {
        reply: `${say(`ตอนนี้มีที่พักใน ${catalog.cities.length} เมือง:`, `We have stays in ${catalog.cities.length} cities:`)}\n${lines.join('\n')}`,
        suggestions: citySuggestions(catalog, lang),
      };
      break;
    }
    case 'unsupported_place': {
      const { place } = result;
      if (place.near) {
        body = await searchReply(result, {
          ...ctx,
          lead: [say(`ยังไม่มีที่พักใน${place.th}บนเว็บนี้ ที่ใกล้ที่สุดคือ${cityName(place.near, 'th')}`, `We don't list stays in ${place.en} yet — the closest is ${place.near}.`)],
        });
      } else {
        const cities = catalog.cities.map((row) => cityName(row.city, lang)).join(', ');
        body = {
          reply: place.abroad
            ? say(`ตอนนี้เว็บนี้มีเฉพาะที่พักในประเทศไทย: ${cities}`, `We only list stays in Thailand for now: ${cities}.`)
            : say(`ยังไม่มีที่พักใน${place.th}บนเว็บนี้ ตอนนี้มีที่พักใน ${cities}`, `We don't list stays in ${place.en} yet. We have stays in ${cities}.`),
          suggestions: citySuggestions(catalog, lang),
        };
      }
      break;
    }
    // "ภูเก็ตมีที่เที่ยวอะไรบ้าง" → รายชื่อจุดที่รู้จัก (ใช้หาที่พักใกล้ๆ) — ไม่แต่งรายละเอียดของสถานที่เอง
    case 'landmarks': {
      const places = catalog.landmarks.filter((landmark) => landmark.city === result.city);
      body = places.length
        ? {
          reply: say(
            `จุดยอดนิยมใน${cityName(result.city, 'th')}ที่ผู้ช่วยรู้จัก ใช้หาที่พักใกล้ๆ ได้ (ผู้ช่วยไม่มีรายละเอียดของแต่ละสถานที่):\n${places.map((p) => `• ${p.th}`).join('\n')}`,
            `Popular spots I know in ${result.city} — I can find stays near them (I don't have details about the places themselves):\n${places.map((p) => `• ${p.en}`).join('\n')}`,
          ),
          suggestions: places.slice(0, 4).map((p) => say(`ที่พักใกล้${p.th}`, `Stays near ${p.en}`)),
        }
        : {
          reply: say('ผู้ช่วยรู้จักจุดยอดนิยมในทุกเมืองที่มีที่พักบนเว็บ เลือกเมืองได้เลย', 'I know popular spots in every city we list — pick a city.'),
          suggestions: catalog.cities.slice(0, 4).map((row) => say(`ที่เที่ยวใน${cityName(row.city, 'th')}`, `Things to see in ${row.city}`)),
        };
      break;
    }
    // "ใกล้สนามบิน" แต่ไม่รู้เมือง → ให้เลือก
    case 'landmark_choice':
      body = {
        reply: say('หมายถึงที่ไหน เลือกได้เลย', 'Which one do you mean?'),
        suggestions: result.candidates.slice(0, 4).map((p) => say(`ที่พักใกล้${p.th}`, `Stays near ${p.en}`)),
      };
      break;
    case 'unknown_attribute':
      body = {
        reply: [
          ...notesText(result.notes, lang),
          say('ลองถามเรื่องที่มีในข้อมูลได้ เช่น วิวภูเขา ริมแม่น้ำ เงียบสงบ หรือใกล้จุดที่อยากไป', 'You can ask about things our data covers — e.g. mountain views, riverside, quiet, or near a place you want to visit.'),
        ].join('\n'),
        suggestions: lang === 'en'
          ? ['Quiet stays with a mountain view', 'Riverside hotels in Bangkok', 'Stays near Tha Phae Gate']
          : ['ที่พักเงียบสงบ วิวภูเขา', 'โรงแรมริมแม่น้ำ กรุงเทพฯ', 'ที่พักใกล้ประตูท่าแพ'],
      };
      break;
    case 'greeting':
      body = {
        reply: result.help
          ? say(
            'ผู้ช่วยนี้ตอบได้เฉพาะเรื่องที่พักและการจองบนเว็บนี้:\n• แนะนำที่พักตามเมือง วันที่ จำนวนคน งบ และสิ่งอำนวยความสะดวก\n• ดูข้อมูล ราคา และห้องว่างของที่พักที่ระบุชื่อ\n• ตอบคำถามเรื่องการจอง การชำระเงิน การยกเลิก และข้อมูลส่วนบุคคล',
            'I can only help with stays and bookings on this site:\n• Recommend stays by city, dates, guests, budget and amenities\n• Show details, prices and availability for a named property\n• Answer questions about booking, payment, cancellation and privacy',
          )
          : say(
            'สวัสดี ผู้ช่วยหาที่พักพร้อมแนะนำที่พักบนเว็บนี้\nบอกได้เลยว่าอยากไปที่ไหน กี่คน วันไหน งบเท่าไร หรืออยากได้อะไรเป็นพิเศษ เช่น สระว่ายน้ำ ติดทะเล อาหารเช้า',
            "Hi! I can help you find a place to stay on this site.\nTell me where you're going, how many guests, your dates and budget, or must-haves like a pool, beachfront or breakfast.",
          ),
        suggestions: starterSuggestions(lang),
      };
      break;
    case 'reset':
      body = { reply: say('เริ่มค้นหาใหม่แล้ว อยากไปที่ไหนดี', 'Starting over — where would you like to go?'), suggestions: citySuggestions(catalog, lang) };
      break;
    case 'thanks':
      body = { reply: say('ยินดีให้บริการ ถ้าอยากให้ช่วยหาที่พักเพิ่ม พิมพ์บอกได้ตลอด', "You're welcome! Ask me anytime if you'd like more ideas.") };
      break;
    case 'bye':
      body = { reply: say('ขอให้เดินทางอย่างมีความสุข แล้วพบกันใหม่', 'Have a great trip — see you next time!') };
      break;
    case 'ack':
      body = { reply: say('ถ้าอยากเปลี่ยนเมือง เพิ่มวันที่ หรือกำหนดงบ บอกได้เลย', 'Let me know if you\'d like to change the city, add dates or set a budget.') };
      break;
    case 'moderation':
      body = { reply: say('ขอความกรุณาใช้ถ้อยคำสุภาพ ผู้ช่วยยินดีช่วยหาที่พักให้', "Please keep it polite — I'm happy to help you find a place to stay.") };
      break;
    case 'off_topic':
      body = {
        reply: say(
          `${TOPIC_TEXT[result.topic].th} ผู้ช่วยนี้ช่วยได้เฉพาะเรื่องที่พักและการจองบนเว็บนี้ ลองถามแบบนี้ได้:`,
          `${TOPIC_TEXT[result.topic].en} — I can only help with stays and bookings on this site. Try asking:`,
        ),
        suggestions: starterSuggestions(lang),
      };
      break;
    default:
      body = {
        reply: say(
          'ขออภัย ผู้ช่วยนี้ตอบได้เฉพาะเรื่องการค้นหาและจองที่พักบนเว็บไซต์นี้ ลองถามแบบนี้ได้:',
          'Sorry, I can only help with finding and booking stays on this website. Try asking:',
        ),
        suggestions: starterSuggestions(lang),
      };
  }

  const filters = result.filters ?? {};
  return {
    intent: result.intent,
    reply: body.reply,
    hotels: body.hotels ?? [],
    total: body.total ?? 0,
    nights: body.nights ?? 0,
    relaxed: body.relaxed ?? null,
    nearLabel: body.nearLabel ?? null,
    filters,
    chips: buildChips(filters, catalog, lang),
    suggestions: body.suggestions ?? [],
    links: body.links ?? [],
    searchUrl: body.searchUrl ?? null,
    hotelQuery: stayQuery(filters),
  };
}
