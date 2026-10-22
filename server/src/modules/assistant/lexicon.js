// ============================================================
// คลังคำของผู้ช่วยแนะนำที่พัก (ไทย + อังกฤษ)
// อยากให้ผู้ช่วยเข้าใจคำใหม่ → เพิ่มคำที่ไฟล์นี้ไฟล์เดียว ไม่ต้องแก้ตรรกะใน interpret.js
// ============================================================

// อัตราแลกเปลี่ยนที่ใช้แปลงงบเป็นดอลลาร์ → บาท ให้ตรงกับ formatPrice() ฝั่งหน้าเว็บ (LanguageContext.jsx)
export const USD_RATE = 35;

// เมือง: ชื่อในฐานข้อมูล (properties.city) → คำที่ผู้ใช้อาจพิมพ์
// (เมืองที่แอดมินเพิ่มใหม่และไม่อยู่ในรายการนี้ ผู้ช่วยยังเข้าใจชื่อภาษาอังกฤษตามฐานข้อมูลได้)
export const CITY_ALIASES = {
  Bangkok: ['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ', 'กทม.', 'กทม', 'บางกอก', 'bangkok', 'bkk'],
  'Chiang Mai': ['เชียงใหม่', 'chiang mai', 'chiangmai'],
  Phuket: ['ภูเก็ต', 'phuket'],
  Krabi: ['กระบี่', 'krabi'],
  Pattaya: ['พัทยา', 'pattaya'],
  'Hua Hin': ['หัวหิน', 'hua hin', 'huahin'],
  Ayutthaya: ['พระนครศรีอยุธยา', 'อยุธยา', 'ayutthaya', 'ayudhaya', 'ayuthaya'],
};

export const CITY_TH = {
  Bangkok: 'กรุงเทพฯ',
  'Chiang Mai': 'เชียงใหม่',
  Phuket: 'ภูเก็ต',
  Krabi: 'กระบี่',
  Pattaya: 'พัทยา',
  'Hua Hin': 'หัวหิน',
  Ayutthaya: 'อยุธยา',
};

// ย่าน: ค้นจากชื่อ/ที่อยู่ของที่พัก (text) และรู้ว่าอยู่เมืองไหน
export const AREAS = [
  { key: 'sukhumvit', city: 'Bangkok', text: 'สุขุมวิท', th: 'สุขุมวิท', en: 'Sukhumvit', aliases: ['สุขุมวิท', 'sukhumvit'] },
  { key: 'silom', city: 'Bangkok', text: 'สีลม', th: 'สีลม', en: 'Silom', aliases: ['สีลม', 'silom'] },
  { key: 'sathorn', city: 'Bangkok', text: 'สาทร', th: 'สาทร', en: 'Sathorn', aliases: ['สาทร', 'sathorn', 'sathon'] },
  { key: 'bangrak', city: 'Bangkok', text: 'บางรัก', th: 'บางรัก', en: 'Bang Rak', aliases: ['บางรัก', 'bang rak', 'bangrak'] },
  { key: 'ratchada', city: 'Bangkok', text: 'รัชดา', th: 'รัชดา', en: 'Ratchada', aliases: ['รัชดาภิเษก', 'รัชดา', 'ratchadaphisek', 'ratchada'] },
  { key: 'charoenkrung', city: 'Bangkok', text: 'เจริญกรุง', th: 'เจริญกรุง', en: 'Charoen Krung', aliases: ['เจริญกรุง', 'charoen krung'] },
  { key: 'nimman', city: 'Chiang Mai', text: 'นิมมาน', th: 'นิมมาน', en: 'Nimman', aliases: ['นิมมานเหมินท์', 'นิมมาน', 'nimmanhaemin', 'nimman'] },
  { key: 'oldcity', city: 'Chiang Mai', text: 'คูเมือง', th: 'ในคูเมือง', en: 'Old City', aliases: ['ในคูเมือง', 'คูเมือง', 'old city'] },
  { key: 'maerim', city: 'Chiang Mai', text: 'แม่ริม', th: 'แม่ริม', en: 'Mae Rim', aliases: ['แม่ริม', 'mae rim'] },
  { key: 'patong', city: 'Phuket', text: 'ป่าตอง', th: 'ป่าตอง', en: 'Patong', aliases: ['หาดป่าตอง', 'ป่าตอง', 'patong'] },
  { key: 'kata', city: 'Phuket', text: 'กะตะ', th: 'กะตะ', en: 'Kata', aliases: ['หาดกะตะ', 'กะตะ', 'kata'] },
  { key: 'karon', city: 'Phuket', text: 'กะรน', th: 'กะรน', en: 'Karon', aliases: ['หาดกะรน', 'กะรน', 'karon'] },
  { key: 'aonang', city: 'Krabi', text: 'อ่าวนาง', th: 'อ่าวนาง', en: 'Ao Nang', aliases: ['อ่าวนาง', 'ao nang', 'aonang'] },
  { key: 'railay', city: 'Krabi', text: 'ไร่เลย์', th: 'ไร่เลย์', en: 'Railay', aliases: ['หาดไร่เลย์', 'ไร่เลย์', 'ไรเลย์', 'railay', 'railey'] },
  { key: 'jomtien', city: 'Pattaya', text: 'จอมเทียน', th: 'จอมเทียน', en: 'Jomtien', aliases: ['หาดจอมเทียน', 'จอมเทียน', 'jomtien'] },
];

// ที่ที่ยังไม่มีที่พักบนเว็บ — ตอบให้ชัดว่าไม่มี และแนะนำเมืองใกล้เคียงถ้ามี (near)
export const UNSUPPORTED_PLACES = [
  { th: 'เชียงราย', en: 'Chiang Rai', near: 'Chiang Mai', aliases: ['เชียงราย', 'chiang rai', 'chiangrai'] },
  { th: 'ปาย', en: 'Pai', near: 'Chiang Mai', aliases: ['ปาย', 'pai'] },
  { th: 'เกาะสมุย', en: 'Koh Samui', aliases: ['เกาะสมุย', 'สมุย', 'samui'] },
  { th: 'เกาะพะงัน', en: 'Koh Phangan', aliases: ['เกาะพะงัน', 'พะงัน', 'phangan'] },
  { th: 'เกาะเต่า', en: 'Koh Tao', aliases: ['เกาะเต่า', 'koh tao'] },
  { th: 'เกาะพีพี', en: 'Phi Phi', near: 'Krabi', aliases: ['เกาะพีพี', 'พีพี', 'phi phi'] },
  { th: 'เกาะลันตา', en: 'Koh Lanta', near: 'Krabi', aliases: ['เกาะลันตา', 'ลันตา', 'lanta'] },
  { th: 'เกาะเสม็ด', en: 'Koh Samet', near: 'Pattaya', aliases: ['เกาะเสม็ด', 'เสม็ด', 'samet'] },
  { th: 'ระยอง', en: 'Rayong', near: 'Pattaya', aliases: ['ระยอง', 'rayong'] },
  { th: 'เกาะช้าง', en: 'Koh Chang', aliases: ['เกาะช้าง', 'koh chang'] },
  { th: 'ชะอำ', en: 'Cha-am', near: 'Hua Hin', aliases: ['ชะอำ', 'cha-am', 'cha am'] },
  { th: 'กาญจนบุรี', en: 'Kanchanaburi', aliases: ['กาญจนบุรี', 'kanchanaburi'] },
  { th: 'เขาใหญ่', en: 'Khao Yai', aliases: ['เขาใหญ่', 'khao yai'] },
  { th: 'หาดใหญ่', en: 'Hat Yai', aliases: ['หาดใหญ่', 'hat yai', 'hatyai'] },
  { th: 'ขอนแก่น', en: 'Khon Kaen', aliases: ['ขอนแก่น', 'khon kaen'] },
  { th: 'อุดรธานี', en: 'Udon Thani', aliases: ['อุดรธานี', 'udon thani', 'udon'] },
  { th: 'นครราชสีมา', en: 'Korat', aliases: ['นครราชสีมา', 'โคราช', 'korat'] },
  { th: 'สุโขทัย', en: 'Sukhothai', aliases: ['สุโขทัย', 'sukhothai'] },
  { th: 'น่าน', en: 'Nan', aliases: ['น่าน'] },
  {
    th: 'ต่างประเทศ', en: 'abroad', abroad: true,
    aliases: ['ต่างประเทศ', 'ญี่ปุ่น', 'เกาหลี', 'สิงคโปร์', 'เวียดนาม', 'บาหลี', 'ฮ่องกง', 'ไต้หวัน', 'ยุโรป', 'ลาว', 'กัมพูชา',
      'japan', 'tokyo', 'osaka', 'korea', 'seoul', 'singapore', 'bali', 'vietnam', 'hong kong', 'taiwan', 'europe', 'laos', 'cambodia'],
  },
];

// สิ่งอำนวยความสะดวก (key ตรงกับ properties.amenities)
// คำยาวถูกจับก่อนคำสั้นเสมอ เช่น "ครอบครัว" (family) จะไม่ถูกอ่านเป็น "ครัว" (kitchen)
export const AMENITY_WORDS = {
  wifi: ['ไวไฟ', 'อินเทอร์เน็ต', 'อินเตอร์เน็ต', 'เน็ต', 'wifi', 'wi-fi', 'wi fi', 'internet'],
  pool: ['สระว่ายน้ำ', 'สระน้ำ', 'สระ', 'ว่ายน้ำ', 'พูล', 'swimming pool', 'pool', 'swimming'],
  breakfast: ['อาหารเช้า', 'ข้าวเช้า', 'มื้อเช้า', 'breakfast'],
  parking: ['ที่จอดรถ', 'จอดรถ', 'parking', 'car park'],
  gym: ['ฟิตเนส', 'ฟิตเนต', 'ยิม', 'ออกกำลังกาย', 'fitness', 'gym', 'workout'],
  spa: ['สปา', 'นวด', 'spa', 'massage'],
  restaurant: ['ห้องอาหาร', 'ร้านอาหาร', 'restaurant', 'dining'],
  bar: ['บาร์', 'ค็อกเทล', 'rooftop bar', 'bar', 'cocktail'],
  beach: ['ติดทะเล', 'ติดหาด', 'ริมทะเล', 'ริมหาด', 'ชายหาด', 'ทะเล', 'หาด',
    'beachfront', 'beaches', 'beach', 'seaside', 'by the sea'],
  airport_shuttle: ['รถรับส่งสนามบิน', 'รับส่งสนามบิน', 'รถรับส่ง', 'สนามบิน',
    'airport shuttle', 'airport transfer', 'airport', 'shuttle'],
  family: ['ครอบครัว', 'เหมาะกับเด็ก', 'สำหรับเด็ก', 'family-friendly', 'family friendly', 'family', 'kids club', 'kid-friendly'],
  kitchen: ['ห้องครัว', 'ครัว', 'ทำอาหาร', 'kitchenette', 'kitchen', 'cook'],
};

export const AMENITY_LABELS = {
  wifi: { th: 'Wi-Fi ฟรี', en: 'free Wi-Fi' },
  pool: { th: 'สระว่ายน้ำ', en: 'a pool' },
  breakfast: { th: 'อาหารเช้า', en: 'breakfast' },
  parking: { th: 'ที่จอดรถ', en: 'parking' },
  gym: { th: 'ฟิตเนส', en: 'a gym' },
  spa: { th: 'สปา', en: 'a spa' },
  restaurant: { th: 'ห้องอาหาร', en: 'a restaurant' },
  bar: { th: 'บาร์', en: 'a bar' },
  beach: { th: 'ติดชายหาด', en: 'beachfront' },
  airport_shuttle: { th: 'รถรับส่งสนามบิน', en: 'an airport shuttle' },
  family: { th: 'เหมาะกับครอบครัว', en: 'family friendly' },
  kitchen: { th: 'ครัวในห้อง', en: 'a kitchen' },
};

// ประเภทที่พัก (ตรงกับ properties.property_type) — "โรงแรม" ไม่อยู่ในนี้เพราะคนใช้เรียกที่พักทุกแบบ
export const TYPE_WORDS = {
  Resort: ['รีสอร์ท', 'รีสอร์ต', 'รีสอร์ด', 'resort'],
  Villa: ['วิลล่า', 'วิลลา', 'villa'],
  'Boutique Hotel': ['บูทีคโฮเทล', 'บูติคโฮเทล', 'บูทีค', 'บูติค', 'boutique'],
  Apartment: ['เซอร์วิสอพาร์ตเมนต์', 'อพาร์ตเมนต์', 'อพาร์ทเมนท์', 'อพาร์ทเม้นท์', 'อพาร์ตเม้นต์', 'คอนโด',
    'serviced apartment', 'apartment', 'condo'],
  Guesthouse: ['เกสต์เฮาส์', 'เกสท์เฮาส์', 'เกสต์เฮ้าส์', 'เกสเฮาส์', 'โฮสเทล', 'guest house', 'guesthouse', 'hostel'],
};

export const TYPE_LABELS = {
  Hotel: { th: 'โรงแรม', en: 'hotels' },
  Resort: { th: 'รีสอร์ท', en: 'resorts' },
  Villa: { th: 'วิลล่า', en: 'villas' },
  'Boutique Hotel': { th: 'บูทีคโฮเทล', en: 'boutique hotels' },
  Apartment: { th: 'อพาร์ตเมนต์', en: 'apartments' },
  Guesthouse: { th: 'เกสต์เฮาส์', en: 'guesthouses' },
};

// วิว / บรรยากาศ → key ของ FEATURES ใน lib/hotelFeatures.js (ดูจากคำอธิบายโรงแรม/ห้องจริง)
// อ่านก่อนสิ่งอำนวยความสะดวก: "วิวทะเล" = วิว (ไม่ใช่ "ติดชายหาด"), "สระส่วนตัว" ≠ "สระ" เฉยๆ
export const FEATURE_WORDS = {
  view: ['วิวสวยๆ', 'วิวสวย', 'วิวดี', 'วิวหลักล้าน', 'วิวปัง', 'วิว', 'nice view', 'great view', 'beautiful view', 'good view', 'with a view', 'views', 'view'],
  sea_view: ['วิวทะเล', 'เห็นทะเล', 'มองเห็นทะเล', 'sea view', 'ocean view'],
  mountain_view: ['วิวภูเขา', 'วิวเขา', 'วิวดอย', 'ภูเขา', 'ขุนเขา', 'บนดอย', 'บนเขา', 'mountain view', 'mountain'],
  city_view: ['วิวเมือง', 'วิวตึกสูง', 'วิวตึก', 'ตึกสูง', 'วิวกลางคืน', 'city view', 'city lights', 'skyline view'],
  river_view: ['วิวแม่น้ำ', 'ริมแม่น้ำ', 'ติดแม่น้ำ', 'ริมน้ำ', 'แม่น้ำ', 'เจ้าพระยา', 'river view', 'riverside', 'riverfront', 'river'],
  sunset: ['วิวพระอาทิตย์ตก', 'พระอาทิตย์ตก', 'ชมพระอาทิตย์', 'ดูพระอาทิตย์', 'sunset'],
  garden: ['ร่มรื่น', 'ร่มลื่น', 'สวนสวย', 'มีสวน', 'วิวสวน', 'ต้นไม้', 'สีเขียว', 'เขียวๆ', 'garden', 'greenery', 'leafy', 'shady'],
  quiet: ['เงียบสงบ', 'เงียบๆ', 'ไม่วุ่นวาย', 'ไม่พลุกพล่าน', 'ความเป็นส่วนตัว', 'เป็นส่วนตัว', 'สงบ', 'เงียบ', 'พักผ่อน', 'ชิลๆ', 'ชิล',
    'quiet', 'peaceful', 'private', 'secluded', 'relaxing', 'tranquil', 'chill'],
  nature: ['ธรรมชาติ', 'ป่าเขา', 'กลางป่า', 'ในป่า', 'ป่าไม้', 'nature', 'jungle', 'forest'],
  central: ['ใจกลางเมือง', 'กลางเมือง', 'ตัวเมือง', 'เดินทางสะดวก', 'เดินทางง่าย', 'ใกล้รถไฟฟ้า', 'ติดรถไฟฟ้า', 'รถไฟฟ้า',
    'bts', 'mrt', 'downtown', 'city center', 'city centre', 'central', 'convenient'],
  nightlife: ['ถนนคนเดิน', 'ตลาดกลางคืน', 'แหล่งกินเที่ยว', 'กินเที่ยว', 'ชีวิตกลางคืน', 'เที่ยวกลางคืน', 'ปาร์ตี้', 'สถานบันเทิง', 'ผับ',
    'nightlife', 'night life', 'night market', 'party', 'pubs', 'bars'],
  heritage: ['ย้อนยุค', 'คลาสสิก', 'ประวัติศาสตร์', 'วัฒนธรรม', 'โบราณ', 'ล้านนา', 'เรือนไทย', 'โคโลเนียล', 'ไม้สัก',
    'heritage', 'historic', 'traditional', 'colonial', 'cultural', 'culture'],
  work: ['ทำงาน', 'เวิร์กเคชั่น', 'พักยาว', 'อยู่ยาว', 'อยู่นาน', 'ทริปธุรกิจ', 'workation', 'long stay', 'long-term',
    'remote work', 'digital nomad', 'business trip', 'work'],
  cafe: ['คาเฟ่', 'ร้านกาแฟ', 'cafe', 'café', 'coffee shop'],
  private_pool: ['สระว่ายน้ำส่วนตัว', 'สระส่วนตัว', 'พูลวิลล่า', 'private pool', 'pool villa'],
  romantic: ['โรแมนติก', 'ฮันนีมูน', 'honeymoon', 'romantic'],
};

// เรื่องที่ไม่มีในข้อมูลที่พักเลย → บอกตรงๆ ว่ายืนยันไม่ได้ (ไม่เดาว่ามี)
export const UNKNOWN_ATTRIBUTES = [
  { key: 'mist', th: 'หมอก', en: 'mist', seasonal: true, words: ['ทะเลหมอก', 'หมอก', 'mist', 'misty', 'fog', 'foggy'] },
  { key: 'cool', th: 'อากาศเย็น', en: 'cool weather', seasonal: true, words: ['อากาศเย็น', 'อากาศหนาว', 'เย็นสบาย', 'หนาวๆ', 'cool weather', 'cold weather'] },
  { key: 'stars', th: 'การดูดาว', en: 'stargazing', seasonal: true, words: ['ดูดาว', 'stargazing'] },
  { key: 'pets', th: 'การพาสัตว์เลี้ยง', en: 'pets', words: ['สัตว์เลี้ยง', 'พาหมา', 'พาแมว', 'น้องหมา', 'น้องแมว', 'pet-friendly', 'pet friendly', 'pets', 'pet', 'dogs', 'dog', 'cats', 'cat'] },
  { key: 'ev', th: 'ที่ชาร์จรถไฟฟ้า', en: 'EV charging', words: ['ที่ชาร์จรถไฟฟ้า', 'ชาร์จรถ', 'ev charger', 'ev charging'] },
  { key: 'smoking', th: 'การสูบบุหรี่', en: 'smoking', words: ['สูบบุหรี่', 'smoking'] },
  { key: 'wheelchair', th: 'การรองรับรถเข็น', en: 'wheelchair access', words: ['รถเข็น', 'ผู้พิการ', 'wheelchair', 'accessible'] },
];

// คำบอกความต้องการเรื่องราคา/คุณภาพ → วิธีเรียงผลลัพธ์ (key ตรงกับ SORTS ใน lib/hotelSearch.js)
export const SORT_WORDS = {
  price_asc: ['best price', 'best deal', 'best value', 'ถูกที่สุด', 'ถูกสุด', 'ถูกกว่านี้', 'ถูกลง', 'ราคาถูก', 'ถูกๆ', 'ราคาประหยัด', 'ประหยัด', 'ไม่แพง', 'แพงเกินไป', 'แพงไป', 'ถูก',
    'cheapest', 'cheaper', 'cheap', 'budget', 'affordable', 'inexpensive', 'low cost', 'lowest price',
    'too expensive', 'too pricey'],
  price_desc: ['แพงที่สุด', 'แพงสุด', 'most expensive'],
  rating_desc: ['รีวิวดีที่สุด', 'คะแนนรีวิวสูง', 'รีวิวดี', 'คะแนนดี', 'คะแนนสูง', 'ดีที่สุด', 'ดีกว่านี้', 'ยอดนิยม', 'คนชอบ',
    'top rated', 'top-rated', 'best rated', 'highly rated', 'best reviewed', 'good reviews', 'great reviews',
    'most popular', 'popular', 'better', 'best'],
};

// หรู = ดาวตั้งแต่ 4.5 ขึ้นไป
export const LUXURY_WORDS = ['หรูกว่านี้', 'หรูหรา', 'หรูๆ', 'หรู', 'luxurious', 'luxury', 'premium', 'high-end', 'high end', 'upscale', 'fancy', 'fancier'];

// วลีที่มีคำว่า "ถูก" แต่ไม่ได้แปลว่าราคาถูก — ตัดทิ้งก่อนตีความ
export const FALSE_CHEAP = ['ถูกต้อง', 'ถูกใจ', 'ถูกจอง', 'ถูกยกเลิก', 'ถูกหัก', 'ถูกเรียก'];

// เดือน (index 0 = มกราคม)
export const MONTH_WORDS = [
  ['มกราคม', 'มกรา', 'ม.ค.', 'มค', 'january', 'jan'],
  ['กุมภาพันธ์', 'กุมภา', 'ก.พ.', 'กพ', 'february', 'feb'],
  ['มีนาคม', 'มีนา', 'มี.ค.', 'มีค', 'march', 'mar'],
  ['เมษายน', 'เมษา', 'เม.ย.', 'เมย', 'april', 'apr'],
  ['พฤษภาคม', 'พฤษภา', 'พ.ค.', 'พค', 'may'],
  ['มิถุนายน', 'มิถุนา', 'มิ.ย.', 'มิย', 'june', 'jun'],
  ['กรกฎาคม', 'กรกฎา', 'ก.ค.', 'กค', 'july', 'jul'],
  ['สิงหาคม', 'สิงหา', 'ส.ค.', 'สค', 'august', 'aug'],
  ['กันยายน', 'กันยา', 'ก.ย.', 'กย', 'september', 'sept', 'sep'],
  ['ตุลาคม', 'ตุลา', 'ต.ค.', 'ตค', 'october', 'oct'],
  ['พฤศจิกายน', 'พฤศจิกา', 'พ.ย.', 'พย', 'november', 'nov'],
  ['ธันวาคม', 'ธันวา', 'ธ.ค.', 'ธค', 'december', 'dec'],
];

// วันในสัปดาห์ (index = getUTCDay(): 0 = อาทิตย์)
// "อาทิตย์" แปลว่า "สัปดาห์" ได้ด้วย จึงนับเป็นวันอาทิตย์เฉพาะตอนมีคำว่า "วัน" นำหน้า (ดู interpret.js)
export const WEEKDAY_WORDS = [
  ['sunday'],
  ['จันทร์', 'monday'],
  ['อังคาร', 'tuesday'],
  ['พุธ', 'wednesday'],
  ['พฤหัสบดี', 'พฤหัส', 'thursday'],
  ['ศุกร์', 'friday'],
  ['เสาร์', 'saturday'],
];

export const TH_NUMBER_WORDS = { หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10 };
export const EN_NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
