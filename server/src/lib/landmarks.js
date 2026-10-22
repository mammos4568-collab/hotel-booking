// ============================================================
// จุดท่องเที่ยว/จุดสำคัญยอดนิยม + พิกัด — ใช้หา "ที่พักใกล้ ..." และบอกระยะทาง
// ใช้ร่วมกันระหว่างหน้าค้นหา (?near=key) และผู้ช่วยแนะนำที่พัก
//
// พิกัดเป็นค่าโดยประมาณ และระยะทางที่คำนวณเป็น "ระยะเส้นตรง" (ไม่ใช่ระยะขับรถ)
// → หน้าเว็บต้องบอกผู้ใช้ว่าประมาณเสมอ
// kind: ใช้จับคำกว้างๆ ตามเมือง เช่น "ใกล้สนามบิน" + ภูเก็ต → สนามบินภูเก็ต
// ============================================================

export const LANDMARKS = [
  // กรุงเทพฯ
  { key: 'grand_palace', city: 'Bangkok', th: 'พระบรมมหาราชวัง', en: 'Grand Palace', lat: 13.7500, lng: 100.4913, aliases: ['พระบรมมหาราชวัง', 'วังหลวง', 'วัดพระแก้ว', 'grand palace', 'wat phra kaew', 'emerald buddha'] },
  { key: 'wat_pho', city: 'Bangkok', th: 'วัดโพธิ์', en: 'Wat Pho', lat: 13.7465, lng: 100.4927, aliases: ['วัดโพธิ์', 'วัดพระเชตุพน', 'wat pho', 'reclining buddha'] },
  { key: 'wat_arun', city: 'Bangkok', th: 'วัดอรุณ', en: 'Wat Arun', lat: 13.7437, lng: 100.4889, aliases: ['วัดอรุณ', 'วัดแจ้ง', 'wat arun', 'temple of dawn'] },
  { key: 'khao_san', city: 'Bangkok', th: 'ถนนข้าวสาร', en: 'Khao San Road', lat: 13.7590, lng: 100.4970, aliases: ['ถนนข้าวสาร', 'ข้าวสาร', 'khao san', 'khaosan'] },
  { key: 'yaowarat', city: 'Bangkok', th: 'เยาวราช', en: 'Chinatown (Yaowarat)', lat: 13.7406, lng: 100.5097, aliases: ['เยาวราช', 'ไชน่าทาวน์', 'chinatown', 'yaowarat'] },
  { key: 'siam', city: 'Bangkok', th: 'สยาม', en: 'Siam', lat: 13.7462, lng: 100.5347, aliases: ['สยามพารากอน', 'สยามสแควร์', 'สยาม', 'siam paragon', 'siam square', 'siam'] },
  { key: 'mbk', city: 'Bangkok', th: 'เอ็มบีเค', en: 'MBK Center', lat: 13.7445, lng: 100.5298, aliases: ['มาบุญครอง', 'เอ็มบีเค', 'mbk'] },
  { key: 'central_world', city: 'Bangkok', th: 'เซ็นทรัลเวิลด์', en: 'CentralWorld', lat: 13.7466, lng: 100.5393, aliases: ['เซ็นทรัลเวิลด์', 'เซ็นทรัลเวิร์ล', 'centralworld', 'central world'] },
  { key: 'pratunam', city: 'Bangkok', th: 'ประตูน้ำ', en: 'Pratunam', lat: 13.7508, lng: 100.5404, aliases: ['ประตูน้ำ', 'แพลทินัม', 'pratunam', 'platinum mall'] },
  { key: 'victory_monument', city: 'Bangkok', th: 'อนุสาวรีย์ชัยฯ', en: 'Victory Monument', lat: 13.7649, lng: 100.5383, aliases: ['อนุสาวรีย์ชัยสมรภูมิ', 'อนุสาวรีย์ชัย', 'victory monument'] },
  { key: 'chatuchak', city: 'Bangkok', th: 'ตลาดนัดจตุจักร', en: 'Chatuchak Market', lat: 13.7999, lng: 100.5502, aliases: ['ตลาดนัดจตุจักร', 'จตุจักร', 'เจเจ', 'chatuchak', 'jatujak'] },
  { key: 'lumphini', city: 'Bangkok', th: 'สวนลุมพินี', en: 'Lumphini Park', lat: 13.7307, lng: 100.5418, aliases: ['สวนลุมพินี', 'สวนลุม', 'lumphini', 'lumpini'] },
  { key: 'terminal21_asok', city: 'Bangkok', th: 'เทอร์มินอล 21 อโศก', en: 'Terminal 21 Asok', lat: 13.7377, lng: 100.5603, aliases: ['เทอร์มินอล 21 อโศก', 'เทอร์มินอล21', 'อโศก', 'terminal 21 asok', 'terminal 21', 'asok', 'asoke'] },
  { key: 'iconsiam', city: 'Bangkok', th: 'ไอคอนสยาม', en: 'ICONSIAM', lat: 13.7267, lng: 100.5106, aliases: ['ไอคอนสยาม', 'iconsiam', 'icon siam'] },
  { key: 'asiatique', city: 'Bangkok', th: 'เอเชียทีค', en: 'Asiatique', lat: 13.7046, lng: 100.5033, aliases: ['เอเชียทีค', 'asiatique'] },
  { key: 'saphan_taksin', city: 'Bangkok', th: 'สะพานตากสิน', en: 'Saphan Taksin', lat: 13.7187, lng: 100.5143, aliases: ['สะพานตากสิน', 'saphan taksin'] },
  { key: 'patpong', city: 'Bangkok', th: 'พัฒน์พงศ์', en: 'Patpong', lat: 13.7286, lng: 100.5337, aliases: ['พัฒน์พงศ์', 'พัฒพงศ์', 'patpong'] },
  { key: 'suvarnabhumi', city: 'Bangkok', kind: 'airport', th: 'สนามบินสุวรรณภูมิ', en: 'Suvarnabhumi Airport', lat: 13.6900, lng: 100.7501, aliases: ['สนามบินสุวรรณภูมิ', 'สุวรรณภูมิ', 'suvarnabhumi', 'bkk airport'] },
  { key: 'don_mueang', city: 'Bangkok', kind: 'airport_secondary', th: 'สนามบินดอนเมือง', en: 'Don Mueang Airport', lat: 13.9126, lng: 100.6068, aliases: ['สนามบินดอนเมือง', 'ดอนเมือง', 'don mueang', 'don muang', 'dmk'] },

  // เชียงใหม่
  { key: 'tha_phae_gate', city: 'Chiang Mai', th: 'ประตูท่าแพ', en: 'Tha Phae Gate', lat: 18.7877, lng: 98.9933, aliases: ['ประตูท่าแพ', 'ท่าแพ', 'tha phae gate', 'thapae gate', 'tha phae', 'thapae'] },
  { key: 'wat_phra_singh', city: 'Chiang Mai', th: 'วัดพระสิงห์', en: 'Wat Phra Singh', lat: 18.7885, lng: 98.9820, aliases: ['วัดพระสิงห์', 'wat phra singh'] },
  { key: 'wat_chedi_luang', city: 'Chiang Mai', th: 'วัดเจดีย์หลวง', en: 'Wat Chedi Luang', lat: 18.7870, lng: 98.9867, aliases: ['วัดเจดีย์หลวง', 'เจดีย์หลวง', 'wat chedi luang', 'chedi luang'] },
  { key: 'sunday_walking_street', city: 'Chiang Mai', kind: 'walking_street', th: 'ถนนคนเดินวันอาทิตย์', en: 'Sunday Walking Street', lat: 18.7879, lng: 98.9880, aliases: ['ถนนคนเดินวันอาทิตย์', 'ถนนคนเดินราชดำเนิน', 'sunday walking street', 'sunday market'] },
  { key: 'doi_suthep', city: 'Chiang Mai', th: 'ดอยสุเทพ', en: 'Doi Suthep', lat: 18.8048, lng: 98.9216, aliases: ['วัดพระธาตุดอยสุเทพ', 'ดอยสุเทพ', 'doi suthep'] },
  { key: 'cm_night_bazaar', city: 'Chiang Mai', kind: 'night_market', th: 'ไนท์บาซาร์', en: 'Night Bazaar', lat: 18.7856, lng: 99.0005, aliases: ['ไนท์บาซาร์', 'ไนท์บาซ่าร์', 'night bazaar'] },
  { key: 'warorot', city: 'Chiang Mai', th: 'กาดหลวง (วโรรส)', en: 'Warorot Market', lat: 18.7903, lng: 99.0006, aliases: ['ตลาดวโรรส', 'กาดหลวง', 'วโรรส', 'warorot'] },
  { key: 'maya', city: 'Chiang Mai', th: 'เมญ่า', en: 'MAYA Mall', lat: 18.8023, lng: 98.9672, aliases: ['เมญ่า', 'เมย่า', 'maya mall', 'maya'] },
  { key: 'one_nimman', city: 'Chiang Mai', th: 'วัน นิมมาน', en: 'One Nimman', lat: 18.7999, lng: 98.9677, aliases: ['วัน นิมมาน', 'one nimman'] },
  { key: 'cmu', city: 'Chiang Mai', th: 'มหาวิทยาลัยเชียงใหม่', en: 'Chiang Mai University', lat: 18.8037, lng: 98.9530, aliases: ['มหาวิทยาลัยเชียงใหม่', 'chiang mai university', 'cmu'] },
  { key: 'cm_night_safari', city: 'Chiang Mai', th: 'เชียงใหม่ไนท์ซาฟารี', en: 'Night Safari', lat: 18.7426, lng: 98.9180, aliases: ['ไนท์ซาฟารี', 'night safari'] },
  { key: 'cnx_airport', city: 'Chiang Mai', kind: 'airport', th: 'สนามบินเชียงใหม่', en: 'Chiang Mai Airport', lat: 18.7668, lng: 98.9626, aliases: ['สนามบินเชียงใหม่', 'chiang mai airport', 'cnx'] },

  // ภูเก็ต
  { key: 'bangla_road', city: 'Phuket', kind: 'walking_street', th: 'ถนนบางลา', en: 'Bangla Road', lat: 7.8935, lng: 98.2965, aliases: ['ถนนบางลา', 'บางลา', 'bangla road', 'bangla'] },
  { key: 'jungceylon', city: 'Phuket', th: 'จังซีลอน', en: 'Jungceylon', lat: 7.8913, lng: 98.2989, aliases: ['จังซีลอน', 'jungceylon'] },
  { key: 'phuket_old_town', city: 'Phuket', th: 'เมืองเก่าภูเก็ต', en: 'Phuket Old Town', lat: 7.8847, lng: 98.3879, aliases: ['เมืองเก่าภูเก็ต', 'ย่านเมืองเก่า', 'ถนนถลาง', 'phuket old town', 'old town'] },
  { key: 'big_buddha', city: 'Phuket', th: 'พระใหญ่ภูเก็ต', en: 'Big Buddha', lat: 7.8278, lng: 98.3127, aliases: ['พระใหญ่', 'big buddha'] },
  { key: 'promthep', city: 'Phuket', th: 'แหลมพรหมเทพ', en: 'Promthep Cape', lat: 7.7618, lng: 98.3057, aliases: ['แหลมพรหมเทพ', 'พรหมเทพ', 'promthep'] },
  { key: 'wat_chalong', city: 'Phuket', th: 'วัดฉลอง', en: 'Wat Chalong', lat: 7.8468, lng: 98.3369, aliases: ['วัดฉลอง', 'wat chalong'] },
  { key: 'hkt_airport', city: 'Phuket', kind: 'airport', th: 'สนามบินภูเก็ต', en: 'Phuket Airport', lat: 8.1132, lng: 98.3169, aliases: ['สนามบินภูเก็ต', 'phuket airport', 'hkt'] },

  // กระบี่
  { key: 'krabi_town', city: 'Krabi', th: 'ตัวเมืองกระบี่', en: 'Krabi Town', lat: 8.0863, lng: 98.9063, aliases: ['ตัวเมืองกระบี่', 'krabi town'] },
  { key: 'tiger_cave', city: 'Krabi', th: 'วัดถ้ำเสือ', en: 'Tiger Cave Temple', lat: 8.1254, lng: 98.9258, aliases: ['วัดถ้ำเสือ', 'ถ้ำเสือ', 'tiger cave'] },
  { key: 'phra_nang', city: 'Krabi', th: 'หาดถ้ำพระนาง', en: 'Phra Nang Beach', lat: 8.0060, lng: 98.8366, aliases: ['หาดถ้ำพระนาง', 'ถ้ำพระนาง', 'พระนาง', 'phra nang'] },
  { key: 'kbv_airport', city: 'Krabi', kind: 'airport', th: 'สนามบินกระบี่', en: 'Krabi Airport', lat: 8.0993, lng: 98.9862, aliases: ['สนามบินกระบี่', 'krabi airport'] },

  // พัทยา
  { key: 'pattaya_walking_street', city: 'Pattaya', kind: 'walking_street', th: 'วอล์กกิ้งสตรีทพัทยา', en: 'Pattaya Walking Street', lat: 12.9270, lng: 100.8730, aliases: ['วอล์กกิ้งสตรีท', 'วอล์คกิ้งสตรีท', 'วอคกิ้งสตรีท', 'walking street pattaya', 'pattaya walking street'] },
  { key: 'pattaya_beach', city: 'Pattaya', th: 'หาดพัทยา', en: 'Pattaya Beach', lat: 12.9350, lng: 100.8830, aliases: ['หาดพัทยา', 'ชายหาดพัทยา', 'pattaya beach', 'beach road'] },
  { key: 'sanctuary_of_truth', city: 'Pattaya', th: 'ปราสาทสัจธรรม', en: 'Sanctuary of Truth', lat: 12.9727, lng: 100.8890, aliases: ['ปราสาทสัจธรรม', 'sanctuary of truth'] },
  { key: 'terminal21_pattaya', city: 'Pattaya', th: 'เทอร์มินอล 21 พัทยา', en: 'Terminal 21 Pattaya', lat: 12.9504, lng: 100.8889, aliases: ['เทอร์มินอล 21 พัทยา', 'terminal 21 pattaya'] },
  { key: 'central_pattaya', city: 'Pattaya', th: 'เซ็นทรัลพัทยา', en: 'Central Pattaya', lat: 12.9346, lng: 100.8840, aliases: ['เซ็นทรัลพัทยา', 'เซ็นทรัลเฟสติวัลพัทยา', 'central pattaya'] },
  { key: 'bali_hai_pier', city: 'Pattaya', th: 'ท่าเรือแหลมบาลีฮาย (ไปเกาะล้าน)', en: 'Bali Hai Pier (Koh Larn ferry)', lat: 12.9207, lng: 100.8692, aliases: ['ท่าเรือบาลีฮาย', 'บาลีฮาย', 'เกาะล้าน', 'bali hai', 'koh larn'] },
  { key: 'nong_nooch', city: 'Pattaya', th: 'สวนนงนุช', en: 'Nong Nooch Garden', lat: 12.7651, lng: 100.9340, aliases: ['สวนนงนุช', 'นงนุช', 'nong nooch'] },
  { key: 'pattaya_floating_market', city: 'Pattaya', th: 'ตลาดน้ำสี่ภาค', en: 'Pattaya Floating Market', lat: 12.8679, lng: 100.9050, aliases: ['ตลาดน้ำสี่ภาค', 'ตลาดน้ำพัทยา', 'pattaya floating market'] },

  // หัวหิน
  { key: 'huahin_night_market', city: 'Hua Hin', kind: 'night_market', th: 'ตลาดโต้รุ่งหัวหิน', en: 'Hua Hin Night Market', lat: 12.5706, lng: 99.9575, aliases: ['ตลาดโต้รุ่งหัวหิน', 'ตลาดฉัตรไชย', 'hua hin night market'] },
  { key: 'huahin_station', city: 'Hua Hin', kind: 'station', th: 'สถานีรถไฟหัวหิน', en: 'Hua Hin Railway Station', lat: 12.5677, lng: 99.9554, aliases: ['สถานีรถไฟหัวหิน', 'hua hin railway station', 'hua hin station'] },
  { key: 'huahin_beach', city: 'Hua Hin', th: 'หาดหัวหิน', en: 'Hua Hin Beach', lat: 12.5705, lng: 99.9622, aliases: ['หาดหัวหิน', 'ชายหาดหัวหิน', 'hua hin beach'] },
  { key: 'cicada_market', city: 'Hua Hin', th: 'ตลาดซิเคด้า', en: 'Cicada Market', lat: 12.5385, lng: 99.9661, aliases: ['ตลาดซิเคด้า', 'ซิเคด้า', 'cicada market', 'cicada'] },
  { key: 'khao_takiab', city: 'Hua Hin', th: 'เขาตะเกียบ', en: 'Khao Takiab', lat: 12.5112, lng: 99.9822, aliases: ['เขาตะเกียบ', 'khao takiab'] },
  { key: 'hhq_airport', city: 'Hua Hin', kind: 'airport', th: 'สนามบินหัวหิน', en: 'Hua Hin Airport', lat: 12.6362, lng: 99.9515, aliases: ['สนามบินหัวหิน', 'hua hin airport'] },

  // อยุธยา
  { key: 'ayutthaya_park', city: 'Ayutthaya', kind: 'historical_park', th: 'อุทยานประวัติศาสตร์อยุธยา', en: 'Ayutthaya Historical Park', lat: 14.3557, lng: 100.5582, aliases: ['อุทยานประวัติศาสตร์อยุธยา', 'วัดพระศรีสรรเพชญ์', 'ayutthaya historical park', 'wat phra si sanphet'] },
  { key: 'wat_mahathat', city: 'Ayutthaya', th: 'วัดมหาธาตุ', en: 'Wat Mahathat', lat: 14.3569, lng: 100.5674, aliases: ['วัดมหาธาตุ', 'wat mahathat'] },
  { key: 'wat_chaiwatthanaram', city: 'Ayutthaya', th: 'วัดไชยวัฒนาราม', en: 'Wat Chaiwatthanaram', lat: 14.3430, lng: 100.5417, aliases: ['วัดไชยวัฒนาราม', 'ไชยวัฒนาราม', 'wat chaiwatthanaram'] },
  { key: 'ayutthaya_station', city: 'Ayutthaya', kind: 'station', th: 'สถานีรถไฟอยุธยา', en: 'Ayutthaya Railway Station', lat: 14.3621, lng: 100.5831, aliases: ['สถานีรถไฟอยุธยา', 'ayutthaya railway station', 'ayutthaya station'] },
];

export const LANDMARK_BY_KEY = new Map(LANDMARKS.map((landmark) => [landmark.key, landmark]));

// คำกว้างๆ ที่ต้องรู้เมืองก่อนถึงจะรู้ว่าหมายถึงที่ไหน (kind → คำที่ผู้ใช้พิมพ์)
export const LANDMARK_KIND_WORDS = {
  airport: ['สนามบิน', 'airport'],
  walking_street: ['ถนนคนเดิน', 'walking street'],
  night_market: ['ตลาดกลางคืน', 'ตลาดโต้รุ่ง', 'night market'],
  station: ['สถานีรถไฟ', 'train station', 'railway station'],
  historical_park: ['อุทยานประวัติศาสตร์', 'historical park'],
};

// ระยะทางเส้นตรงบนผิวโลก (สูตร Haversine) หน่วยกิโลเมตร — ใช้คู่กับ SQL ใน lib/hotelSearch.js
export function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (degree) => (degree * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
