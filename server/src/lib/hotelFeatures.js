// ============================================================
// วิว / บรรยากาศของที่พัก — ฐานข้อมูลไม่มีคอลัมน์เรื่องนี้โดยตรง
// จึงดูจาก "คำในชื่อและคำอธิบายของโรงแรมและห้องพัก" (ค้นแบบ ILIKE เหมือนช่องค้นหา)
//   patterns = ที่พักต้องมีคำใดคำหนึ่งในนี้อยู่ในคำอธิบาย ถึงจะนับว่ามีคุณลักษณะนั้น
// ใช้ร่วมกันระหว่างหน้าค้นหา (?features=...) และผู้ช่วยแนะนำที่พัก
//
// ระวังคำที่ซ้อนอยู่ในคำอื่น: "ป่า" อยู่ใน "ป่าตอง", "สวน" อยู่ใน "สวนน้ำ",
// "ครัว" อยู่ใน "ครอบครัว", "ส่วนตัว" อยู่ใน "ระเบียงส่วนตัว" → เลือกใช้คำที่เจาะจงกว่า
// ============================================================

export const FEATURES = {
  // "วิวสวย" แบบไม่บอกว่าวิวอะไร = มีคำว่าวิวในคำอธิบาย
  view: {
    th: 'มีวิวสวย', en: 'A nice view',
    patterns: ['วิว', 'มองเห็น', 'พาโนรามา', 'view'],
  },
  sea_view: {
    th: 'วิวทะเล', en: 'Sea view',
    patterns: ['วิวทะเล', 'ทะเลอันดามัน', 'กลางทะเล', 'ติดหาด', 'ติดชายหาด', 'ริมชายหาด', 'ริมหาด', 'sea view', 'ocean view'],
  },
  mountain_view: {
    th: 'วิวภูเขา', en: 'Mountain view',
    patterns: ['วิวภูเขา', 'ขุนเขา', 'ดอย', 'เขาหินปูน', 'หน้าผา', 'mountain'],
  },
  city_view: {
    th: 'วิวเมือง', en: 'City view',
    patterns: ['วิวเมือง', 'ชั้นสูง', 'city view'],
  },
  river_view: {
    th: 'ริมแม่น้ำ', en: 'Riverside',
    patterns: ['แม่น้ำ', 'ริมน้ำ', 'river'],
  },
  sunset: {
    th: 'ชมพระอาทิตย์ตก', en: 'Sunset view',
    patterns: ['พระอาทิตย์ตก', 'sunset'],
  },
  garden: {
    th: 'สวน/ต้นไม้ร่มรื่น', en: 'Garden & greenery',
    patterns: ['ร่มรื่น', 'สวนเขียว', 'ล้อมสวน', 'ติดสวน', 'วิวสวน', 'ต้นไม้', 'garden'],
  },
  quiet: {
    th: 'เงียบสงบ เป็นส่วนตัว', en: 'Quiet & private',
    patterns: ['เงียบสงบ', 'เป็นส่วนตัว', 'ท่ามกลางธรรมชาติ', 'กลางป่า'],
  },
  nature: {
    th: 'ใกล้ชิดธรรมชาติ', en: 'Close to nature',
    patterns: ['ธรรมชาติ', 'ขุนเขา', 'กลางป่า', 'ป่าเขตร้อน', 'เขาหินปูน', 'jungle'],
  },
  central: {
    th: 'ใจกลางเมือง เดินทางสะดวก', en: 'Central & well connected',
    patterns: ['ใจกลาง', 'bts', 'mrt', 'สถานีรถไฟ'],
  },
  nightlife: {
    th: 'ใกล้แหล่งกิน-เที่ยวยามค่ำ', en: 'Near nightlife & night markets',
    patterns: ['ถนนคนเดิน', 'บางลา', 'ตลาดกลางคืน', 'ตลาดโต้รุ่ง', 'ค็อกเทล'],
  },
  heritage: {
    th: 'กลิ่นอายประวัติศาสตร์', en: 'Heritage & culture',
    patterns: ['โคโลเนียล', 'ล้านนา', 'เรือนไทย', 'เรือนไม้', 'ไม้สัก', 'วัด', 'ประวัติศาสตร์', 'heritage'],
  },
  work: {
    th: 'เหมาะทำงาน/พักยาว', en: 'Good for work & long stays',
    patterns: ['ทำงาน', 'พักยาว'],
  },
  cafe: {
    th: 'ใกล้ย่านคาเฟ่', en: 'Near cafés',
    patterns: ['คาเฟ่', 'cafe', 'café'],
  },
  private_pool: {
    th: 'สระว่ายน้ำส่วนตัว', en: 'Private pool',
    patterns: ['สระส่วนตัว', 'สระว่ายน้ำส่วนตัว', 'pool villa', 'private pool'],
  },
  // "โรแมนติก" เป็นความรู้สึก → บอกผู้ใช้ตรงๆ ในชื่อว่าดูจากอะไร
  romantic: {
    th: 'โรแมนติก (สระส่วนตัว/วิวพระอาทิตย์ตก)', en: 'Romantic (private pool or sunset view)',
    patterns: ['สระส่วนตัว', 'พระอาทิตย์ตก', 'pool villa'],
  },
};

export const FEATURE_KEYS = Object.keys(FEATURES);

// คำอธิบายที่ทำให้ที่พักนี้นับว่ามีคุณลักษณะนั้น (ไว้โชว์เป็นหลักฐานให้ผู้ใช้เห็น)
// texts: [{ room: 'Garden Room' | null, text: 'ห้องพักวิวสวนปาล์ม เงียบสงบ' }, ...]
// ไล่ตามลำดับคำใน patterns (คำที่ชัดที่สุดอยู่หน้า) → ได้ประโยคที่ตรงที่สุด เช่น "วิวภูเขา" ก่อน "ขุนเขา"
export function featureEvidence(featureKey, texts) {
  for (const pattern of FEATURES[featureKey]?.patterns ?? []) {
    const hit = texts.find(({ text }) => text.toLowerCase().includes(pattern.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}
