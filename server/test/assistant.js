// ทดสอบผู้ช่วยแนะนำที่พัก
//   ส่วนที่ 1: ตัวตีความข้อความ (interpret.js) — ไม่ต้องเปิด server ใช้ข้อมูลจำลองที่หน้าตาเหมือนฐานข้อมูลจริง
//   ส่วนที่ 2: เรียก API จริง POST /api/assistant/chat — ต้องเปิด server ก่อน (ข้ามถ้าไม่ได้เปิด)
// รัน: node server/test/assistant.js
import { interpret, prepareCatalog, refine, sanitizeFilters } from '../src/modules/assistant/interpret.js';

const TODAY = '2026-10-21'; // วันพุธ — ตายตัว ผลทดสอบเรื่องวันที่จะได้ไม่เปลี่ยนตามวันที่รัน
const API = process.env.API_URL || 'http://localhost:3000/api';

const HOTELS = [
  [1, 'The Grand Sathorn Hotel', 'Bangkok'], [2, 'Chiang Mai Mountain Resort', 'Chiang Mai'],
  [3, 'Phuket Ocean View Villa', 'Phuket'], [4, 'Riverside Heritage Hotel', 'Bangkok'],
  [5, 'Sukhumvit Urban Suites', 'Bangkok'], [6, 'Silom Boutique Stay', 'Bangkok'],
  [7, 'Skyline Tower Bangkok', 'Bangkok'], [8, 'Nimman Garden Boutique', 'Chiang Mai'],
  [9, 'Old City Lanna House', 'Chiang Mai'], [10, 'Patong Bay Beach Resort', 'Phuket'],
  [11, 'Kata Palm Retreat', 'Phuket'], [12, 'Ao Nang Cliffside Resort', 'Krabi'],
  [13, 'Railay Jungle Villas', 'Krabi'], [14, 'Pattaya Seaside Hotel', 'Pattaya'],
  [15, 'Jomtien Family Resort', 'Pattaya'], [16, 'Hua Hin Beachfront Villas', 'Hua Hin'],
  [17, 'Hua Hin Town Hotel', 'Hua Hin'], [18, 'Ayutthaya Riverside Retreat', 'Ayutthaya'],
].map(([id, name, city]) => ({ id, name, city }));
const CITIES = ['Bangkok', 'Phuket', 'Chiang Mai', 'Hua Hin', 'Krabi', 'Pattaya', 'Ayutthaya']
  .map((city) => ({ city, hotels: HOTELS.filter((h) => h.city === city).length, minPrice: 1000 }));
const catalog = prepareCatalog({ hotels: HOTELS, cities: CITIES, maxGuests: 4 });

let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `\n        -> ${detail}` : ''}`);
};

// expect: ค่าที่ต้องมี (intent/faq/topic/asked/place.near + ช่องใน filters) · absent: ช่องใน filters ที่ต้องไม่มี
const CASES = [
  ['หาโรงแรมที่ภูเก็ต 2 คน สุดสัปดาห์นี้', {}, { intent: 'search', city: 'Phuket', guests: 2, checkIn: '2026-10-24', checkOut: '2026-10-25', nights: 1 }],
  ['ที่พักติดทะเล งบไม่เกิน 3,000 บาท', {}, { intent: 'search', amenities: ['beach'], maxPrice: 3000 }, ['minPrice', 'sort']],
  ['รีสอร์ทในเชียงใหม่ มีสระว่ายน้ำ', {}, { city: 'Chiang Mai', types: ['Resort'], amenities: ['pool'] }],
  ['12-14 พ.ย. กระบี่ ผู้ใหญ่ 2 เด็ก 1', {}, { city: 'Krabi', checkIn: '2026-11-12', checkOut: '2026-11-14', nights: 2, guests: 3 }, ['maxPrice']],
  ['hotels in bangkok under $100 with a gym', {}, { city: 'Bangkok', maxPrice: 3500, amenities: ['gym'] }],
  ['เชียงใหม่ 3 วัน 2 คืน งบ 2000-4000', {}, { city: 'Chiang Mai', nights: 2, minPrice: 2000, maxPrice: 4000 }],
  ['ไม่เอาสระ', { city: 'Phuket', amenities: ['pool', 'spa'] }, { intent: 'search', city: 'Phuket', amenities: ['spa'] }],
  ['ยกเลิกสระว่ายน้ำ', { city: 'Phuket', amenities: ['pool'] }, { intent: 'search', city: 'Phuket' }, ['amenities']],
  ['แล้วกระบี่ล่ะ', { city: 'Phuket', guests: 2, amenities: ['pool'] }, { intent: 'search', city: 'Krabi', guests: 2, amenities: ['pool'] }],
  ['ถูกกว่านี้', { city: 'Phuket' }, { intent: 'search', city: 'Phuket', sort: 'price_asc' }],
  ['แพงไป', { city: 'Bangkok', maxPrice: 5000 }, { sort: 'price_asc', maxPrice: 5000 }],
  ['skyline tower ราคาเท่าไหร่', {}, { intent: 'hotel', propertyId: 7, city: 'Bangkok' }],
  ['Patong Bay Beach Resort', {}, { intent: 'hotel', propertyId: 10 }, ['amenities', 'types', 'area']],
  ['มีสระไหม', { propertyId: 7, city: 'Bangkok' }, { intent: 'hotel', propertyId: 7, asked: ['pool'] }, ['amenities']],
  ['ราคาเท่าไหร่', { propertyId: 7, city: 'Bangkok' }, { intent: 'hotel', propertyId: 7 }],
  ['2 คน วันศุกร์นี้', { propertyId: 7, city: 'Bangkok' }, { intent: 'hotel', propertyId: 7, guests: 2, checkIn: '2026-10-23' }],
  ['หาที่อื่นในกรุงเทพที่มีอาหารเช้า', { propertyId: 7, city: 'Bangkok' }, { intent: 'search', city: 'Bangkok', amenities: ['breakfast'] }, ['propertyId']],
  ['beach resort in patong', {}, { intent: 'search', area: 'patong', city: 'Phuket', amenities: ['beach'], types: ['Resort'] }, ['propertyId']],
  ['หาที่พักใกล้ grand palace', {}, { intent: 'search' }, ['propertyId']],
  ['ยกเลิกการจองได้ไหม', {}, { intent: 'faq', faq: 'cancel' }],
  ['ที่พักภูเก็ตยกเลิกฟรีไหม', {}, { intent: 'faq', faq: 'cancel', city: 'Phuket' }],
  ['จ่ายเงินยังไง', {}, { intent: 'faq', faq: 'payment' }],
  ['จองยังไง', {}, { intent: 'faq', faq: 'how_to_book' }],
  ['ดูการจองของฉันได้ที่ไหน', {}, { intent: 'faq', faq: 'my_bookings' }],
  ['อยากลบบัญชี', {}, { intent: 'faq', faq: 'privacy' }],
  ['จองแล้วจะได้อีเมลยืนยันไหม', {}, { intent: 'faq', faq: 'confirmation' }],
  ['ราคารวมภาษีหรือยัง', {}, { intent: 'faq', faq: 'price_info' }],
  ['มีเมืองอะไรบ้าง', {}, { intent: 'destinations' }],
  ['where should I go?', {}, { intent: 'destinations' }],
  ['อยากไปเกาะสมุย', {}, { intent: 'unsupported_place' }, ['city']],
  ['ที่พักที่ชะอำ 2 คน', {}, { intent: 'unsupported_place', city: 'Hua Hin', guests: 2 }],
  ['hotels in tokyo', {}, { intent: 'unsupported_place' }, ['city']],
  ['ภูเก็ตหรือเกาะสมุย', {}, { intent: 'search', city: 'Phuket' }],
  ['วันนี้อากาศเป็นยังไง', {}, { intent: 'off_topic', topic: 'weather' }],
  ['อากาศภูเก็ตเป็นยังไง', {}, { intent: 'search', city: 'Phuket' }],
  ['มีเครื่องปรับอากาศไหม', {}, { intent: 'unknown' }],
  ['เขียนโค้ด python ให้หน่อย', {}, { intent: 'unknown' }],
  ['1+1 เท่ากับเท่าไหร่', {}, { intent: 'unknown' }],
  ['สวัสดีครับ', {}, { intent: 'greeting' }],
  ['ทำอะไรได้บ้าง', {}, { intent: 'greeting' }],
  ['ขอบคุณครับ', {}, { intent: 'thanks' }],
  ['555', {}, { intent: 'ack' }, ['maxPrice']],
  ['เริ่มใหม่', { city: 'Phuket', guests: 2 }, { intent: 'reset' }, ['city', 'guests']],
  ['เริ่มใหม่ หาโรงแรมกระบี่', { city: 'Phuket', guests: 2 }, { intent: 'search', city: 'Krabi' }, ['guests']],
  ['มีอีกไหม', { city: 'Phuket' }, { intent: 'search', city: 'Phuket', page: 2 }],
  ['ห้าดาว ที่หัวหิน', {}, { city: 'Hua Hin', stars: 5 }],
  ['4.5 ดาวขึ้นไป', {}, { stars: 4.5 }],
  ['5-star resorts in krabi', {}, { stars: 5, types: ['Resort'], city: 'Krabi' }],
  ['หรูๆ ที่ภูเก็ต', {}, { stars: 4.5, city: 'Phuket' }],
  ['พรุ่งนี้ 1 คืน กรุงเทพ ไม่ต่ำกว่า 2000', {}, { checkIn: '2026-10-22', checkOut: '2026-10-23', city: 'Bangkok', minPrice: 2000 }, ['maxPrice']],
  ['ไม่เกินคืนละ 2500', {}, { maxPrice: 2500 }, ['minPrice']],
  ['ประมาณ 3000', {}, { minPrice: 2400, maxPrice: 3600 }],
  ['ทั้งทริป 10000 3 คืน', {}, { nights: 3, maxPrice: 3333 }],
  ['1,500 บาทขึ้นไป', {}, { minPrice: 1500 }, ['maxPrice']],
  ['ห้องราคาไม่เกิน 2k', {}, { maxPrice: 2000 }],
  ['งบสองพันห้า', {}, { maxPrice: 2500 }],
  ['between 1000 and 2000 baht', {}, { minPrice: 1000, maxPrice: 2000 }],
  ['no more than 4000 baht', {}, { maxPrice: 4000 }, ['minPrice']],
  ['Bangkok tomorrow 2 nights 2 guests budget 3000', {}, { city: 'Bangkok', checkIn: '2026-10-22', nights: 2, guests: 2, maxPrice: 3000 }, ['sort']],
  ['ปีใหม่ที่พัทยา 2 คืน', {}, { city: 'Pattaya', checkIn: '2026-12-31', checkOut: '2027-01-02' }],
  ['เคานต์ดาวน์', {}, { checkIn: '2026-12-31' }],
  ['สงกรานต์ที่เชียงใหม่', {}, { checkIn: '2027-04-13', city: 'Chiang Mai' }],
  ['30 ธ.ค. - 2 ม.ค. ภูเก็ต', {}, { checkIn: '2026-12-30', checkOut: '2027-01-02', nights: 3 }],
  ['12/11 - 14/11 หัวหิน', {}, { checkIn: '2026-11-12', checkOut: '2026-11-14', city: 'Hua Hin' }],
  ['12 พฤศจิกายน 2569 2 คืน', {}, { checkIn: '2026-11-12', checkOut: '2026-11-14' }],
  ['nov 12-14 chiang mai for 2', {}, { checkIn: '2026-11-12', checkOut: '2026-11-14', city: 'Chiang Mai', guests: 2 }],
  ['I need a room for 3 adults and 1 child in Hua Hin on Dec 20', {}, { guests: 4, city: 'Hua Hin', checkIn: '2026-12-20' }],
  ['may 2 people stay in krabi', {}, { guests: 2, city: 'Krabi' }, ['checkIn']],
  ['วันศุกร์นี้ 2 คืน', {}, { checkIn: '2026-10-23', checkOut: '2026-10-25' }],
  ['ศุกร์หน้า', {}, { checkIn: '2026-10-30' }],
  ['วันที่ 25-27', {}, { checkIn: '2026-10-25', checkOut: '2026-10-27' }],
  ['the 15th', {}, { checkIn: '2026-11-15' }],
  ['สามคืน', {}, { nights: 3 }],
  ['two nights in krabi', {}, { nights: 2, city: 'Krabi' }],
  ['แถวสุขุมวิท', {}, { area: 'sukhumvit', city: 'Bangkok' }],
  ['อยุธยา เมืองเก่า', {}, { city: 'Ayutthaya' }, ['area']],
  ['ครอบครัว 4 คน ที่พัทยา', {}, { amenities: ['family'], guests: 4, city: 'Pattaya' }],
  ['ห้องที่มีครัว', {}, { amenities: ['kitchen'] }],
  ['มีที่จอดรถไหม', {}, { amenities: ['parking'] }],
  ['ราคาถูกต้องไหม', {}, { intent: 'search' }, ['sort']],
  ['เมื่อวาน', {}, {}, ['checkIn']],
  ['1 ม.ค. 2569', {}, {}, ['checkIn']],
  // วิว / บรรยากาศ / เรื่องที่ไม่มีข้อมูล
  ['มีโรงแรมที่มีวิวภูเขา มีหมอก บรรยากาศร่มลื่นไหม', {}, { intent: 'search', features: ['mountain_view', 'garden'] }, ['amenities']],
  ['ที่พักวิวทะเล', {}, { features: ['sea_view'] }, ['amenities']],
  ['ที่พักเงียบสงบ ใจกลางเมือง เชียงใหม่', {}, { features: ['quiet', 'central'], city: 'Chiang Mai' }],
  ['ไม่เอาวิวเมือง', { city: 'Bangkok', features: ['city_view', 'quiet'] }, { city: 'Bangkok', features: ['quiet'] }],
  ['รีวิวดีที่สุดในกรุงเทพ', {}, { city: 'Bangkok', sort: 'rating_desc' }, ['features']],
  ['สระส่วนตัว ภูเก็ต', {}, { features: ['private_pool'], city: 'Phuket' }, ['amenities']],
  ['อากาศเย็นๆ ที่เชียงใหม่', {}, { intent: 'search', city: 'Chiang Mai' }],
  ['พาหมาไปได้ไหม', {}, { intent: 'unknown_attribute' }],
  ['มีที่ไหนพาหมาไปได้บ้าง', {}, { intent: 'unknown_attribute' }],
  ['โรงแรมริมแม่น้ำ วิวพระอาทิตย์ตก', {}, { features: ['river_view', 'sunset'] }],
  ['วิวเมืองไหม', { propertyId: 7, city: 'Bangkok' }, { intent: 'hotel', propertyId: 7, askedFeatures: ['city_view'] }, ['features']],
  // ใกล้ / ไกล จุดเที่ยว
  ['ที่พักใกล้ประตูท่าแพ', {}, { intent: 'search', near: 'tha_phae_gate', city: 'Chiang Mai' }],
  ['hotels near the grand palace', {}, { near: 'grand_palace', city: 'Bangkok' }],
  ['โรงแรมใกล้สนามบินภูเก็ต 2 คน', {}, { near: 'hkt_airport', city: 'Phuket', guests: 2 }, ['amenities']],
  ['ใกล้สนามบิน', { city: 'Bangkok' }, { near: 'suvarnabhumi', city: 'Bangkok' }, ['amenities']],
  ['ใกล้สนามบิน', {}, { intent: 'landmark_choice' }, ['near', 'amenities']],
  ['รถรับส่งสนามบิน', {}, { amenities: ['airport_shuttle'] }, ['near']],
  ['ไกลจากถนนบางลา', {}, { near: 'bangla_road', far: true, city: 'Phuket' }],
  ['ใกล้ถนนคนเดิน', { city: 'Pattaya' }, { near: 'pattaya_walking_street', city: 'Pattaya' }],
  ['ใกล้ถนนคนเดิน', { city: 'Krabi' }, { city: 'Krabi', features: ['nightlife'] }, ['near']],
  ['แล้วเชียงใหม่ล่ะ', { city: 'Phuket', near: 'bangla_road' }, { city: 'Chiang Mai' }, ['near']],
  ['Skyline Tower ห่างจากสุวรรณภูมิเท่าไหร่', {}, { intent: 'hotel', propertyId: 7, distanceTo: 'suvarnabhumi' }, ['near']],
  ['ภูเก็ตมีที่เที่ยวอะไรบ้าง', {}, { intent: 'landmarks', city: 'Phuket' }],
  // หลายห้อง
  ['2 ห้อง 4 คน ที่ภูเก็ต', {}, { rooms: 2, guests: 4, city: 'Phuket' }],
  ['two rooms for 5 people in phuket', {}, { rooms: 2, guests: 5, city: 'Phuket' }],
  ['สองห้อง', {}, { rooms: 2 }],
  ['มีห้องน้ำในตัวไหม', {}, {}, ['rooms']],
  ['วิลล่า 2 ห้องนอน', {}, { types: ['Villa'] }, ['rooms']],
  ['6 คน ที่กรุงเทพ', {}, { guests: 6, rooms: 2, city: 'Bangkok' }],
  ['10 คน', {}, { guests: 10, rooms: 3 }],
  ['3 คน', { rooms: 2, guests: 4 }, { guests: 3, rooms: 2 }],
];

console.log('— ตัวตีความข้อความ —');
for (const [message, previous, expect, absent = []] of CASES) {
  const result = interpret(message, { today: TODAY, catalog, previous: sanitizeFilters(previous, catalog) });
  const errors = [];
  for (const [key, value] of Object.entries(expect)) {
    const actual = ['intent', 'faq', 'topic', 'asked', 'askedFeatures', 'distanceTo'].includes(key) ? result[key] : result.filters[key];
    if (JSON.stringify(actual) !== JSON.stringify(value)) errors.push(`${key}=${JSON.stringify(actual)} (ต้องเป็น ${JSON.stringify(value)})`);
  }
  for (const key of absent) if (result.filters[key] !== undefined) errors.push(`${key} ไม่ควรมี แต่ได้ ${JSON.stringify(result.filters[key])}`);
  ok(errors.length === 0, `"${message}"`, `${errors.join(', ')} · filters=${JSON.stringify(result.filters)} intent=${result.intent}`);
}

// ชื่อจุดเที่ยวทุกจุด (ทั้งไทย/อังกฤษ) ต้องพิมพ์แล้วผู้ช่วยรู้จัก — ปุ่ม "ที่พักใกล้…" ที่ผู้ช่วยสร้างเองใช้ชื่อพวกนี้
const unknownLandmarks = catalog.landmarks.filter((landmark) => {
  const th = interpret(`ที่พักใกล้${landmark.th}`, { today: TODAY, catalog });
  const en = interpret(`stays near ${landmark.en}`, { today: TODAY, catalog });
  return th.filters.near !== landmark.key || en.filters.near !== landmark.key;
});
ok(unknownLandmarks.length === 0, `ชื่อจุดเที่ยวทั้ง ${catalog.landmarks.length} จุด จับได้ทั้งไทยและอังกฤษ`, unknownLandmarks.map((l) => l.key).join(', '));

// filters ที่หน้าเว็บส่งกลับมาเป็นข้อมูลจากผู้ใช้ → ต้องกรองค่าแปลกปลอมทิ้ง
const dirty = sanitizeFilters({
  city: "Bangkok'; DROP TABLE users;--", propertyId: 999, guests: 500, maxPrice: -1, amenities: ['pool', 'hack'],
  types: ['Castle'], sort: 'random()', checkIn: '2026-02-30', page: 'x', extra: 'ignored',
}, catalog);
ok(JSON.stringify(dirty) === JSON.stringify({ amenities: ['pool'] }), 'sanitizeFilters ทิ้งค่าที่ไม่รู้จัก/ไม่ถูกต้อง', JSON.stringify(dirty));
const removed = refine({ city: 'Phuket', amenities: ['pool', 'spa'], maxPrice: 3000 }, { remove: 'amenity:pool', today: TODAY });
ok(JSON.stringify(removed.filters) === JSON.stringify({ city: 'Phuket', amenities: ['spa'], maxPrice: 3000 }), 'refine ลบเงื่อนไขทีละข้อ', JSON.stringify(removed.filters));

// ---------------------------------------------------------------------------
console.log('\n— API /api/assistant/chat —');
const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
if (!health) {
  console.log('SKIP  ไม่ได้เปิด server (npm run dev) — ข้ามส่วนทดสอบ API');
} else {
  const chat = async (body) => {
    const res = await fetch(`${API}/assistant/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };

  const greet = await chat({ message: '' });
  ok(greet.status === 200 && greet.data.intent === 'greeting' && greet.data.suggestions.length > 0, 'ข้อความว่าง → คำทักทาย + ปุ่มตัวอย่าง');

  const phuket = await chat({ message: 'ที่พักติดทะเลในภูเก็ต 2 คน' });
  const direct = await fetch(`${API}/hotels?q=Phuket&amenities=beach&guests=2&limit=50`).then((r) => r.json());
  ok(phuket.data.intent === 'search' && phuket.data.total === direct.total && phuket.data.hotels.length === Math.min(3, direct.total),
    'ผลแนะนำตรงกับหน้าค้นหา (ใช้ SQL ชุดเดียวกัน)', `assistant=${phuket.data.total} search=${direct.total}`);
  ok(phuket.data.hotels.every((h) => h.city === 'Phuket' && h.amenities.includes('beach')), 'ทุกที่พักอยู่ภูเก็ตและติดชายหาด');
  ok(/^\/search\?/.test(phuket.data.searchUrl) && phuket.data.chips.length >= 2, 'มีลิงก์ดูทั้งหมด + ป้ายเงื่อนไข');

  const follow = await chat({ message: 'ถูกกว่านี้', context: phuket.data.filters });
  const prices = follow.data.hotels.map((h) => h.nightlyFrom);
  ok(follow.data.filters.sort === 'price_asc' && prices.every((p, i) => i === 0 || prices[i - 1] <= p), 'คุยต่อ "ถูกกว่านี้" → เรียงราคาจากถูกไปแพง', prices.join(','));

  const relaxed = await chat({ message: 'ภูเก็ต งบไม่เกิน 500 บาท' });
  ok(relaxed.data.relaxed === 'budget' && relaxed.data.hotels.length > 0, 'ไม่มีที่ตรงงบ → ผ่อนเงื่อนไขงบแล้วบอกราคาที่ถูกที่สุด', relaxed.data.reply);

  const hotel = await chat({ message: 'Skyline Tower ราคาเท่าไหร่' });
  ok(hotel.data.intent === 'hotel' && hotel.data.hotels[0]?.id === 7 && /\{\{price:\d+\}\}/.test(hotel.data.reply), 'ถามชื่อโรงแรม → ข้อมูล + ราคาห้อง', hotel.data.reply);

  const off = await chat({ message: 'ช่วยทำการบ้านคณิตศาสตร์หน่อย' });
  ok(off.data.intent === 'unknown' && off.data.hotels.length === 0, 'เรื่องนอกเว็บ → ปฏิเสธสุภาพ', off.data.reply);

  const rude = await chat({ message: 'โรงแรมห่วยแตก สัส' });
  ok(rude.status === 200 && rude.data.intent === 'moderation', 'คำหยาบ → ขอให้ใช้คำสุภาพ (ไม่ประมวลผลต่อ)');

  const tooLong = await chat({ message: 'ก'.repeat(301) });
  ok(tooLong.status === 400, 'ข้อความยาวเกิน 300 ตัวอักษร → 400', tooLong.data.message);

  const en = await chat({ message: 'family resort in pattaya', lang: 'en' });
  ok(/[a-z]/i.test(en.data.reply) && !/[ก-๙]/.test(en.data.reply), 'lang=en → ตอบภาษาอังกฤษ', en.data.reply);
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
