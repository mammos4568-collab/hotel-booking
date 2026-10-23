// ============================================================
// ตรวจถ้อยคำไม่สุภาพ — คำขอพิเศษ, รีวิว, ข้อมูลโรงแรม/ห้องที่เจ้าของกรอก (ชื่อ คำอธิบาย ที่อยู่)
//   findProfanity()       = คำหยาบชัดเจน → ไม่ให้บันทึก
//   findSuspiciousWords() = คำก้ำกึ่ง (อาจเป็นคำปกติ/ชื่อจริงได้) → บันทึกได้ แต่ขึ้นเตือนให้ admin ดูตอนอนุมัติโรงแรม
// ============================================================
//
// ภาษาไทยไม่เว้นวรรคระหว่างคำ ถ้าค้นแบบ includes() ตรงๆ จะติดคำปกติ
// เช่น "สัด" อยู่ใน "สัดส่วน", "หี" อยู่ใน "หีบ" — จึงตัดคำก่อนด้วย Intl.Segmenter
// (มีใน Node อยู่แล้ว ใช้พจนานุกรมภาษาไทยของ ICU ไม่ต้องลง library เพิ่ม)
// แล้วเทียบ "ทั้งคำ" กับรายการคำต้องห้าม
//
// จับการเลี่ยงตัวกรองที่พบบ่อยด้วย:
//   - ตัวอักษรซ้ำ        "ควยยยย", "fuuuck"     → ยุบตัวซ้ำก่อนเทียบ
//   - คั่นทีละตัวอักษร    "ค.ว.ย", "f u c k"     → รวมชิ้นสั้นๆ ที่ถูกคั่นกลับเป็นคำ
//   - ตัวเลข/สัญลักษณ์แทน "sh1t", "$hit", "f*ck"
//   - ตัวอักษรล่องหน (zero-width) ที่แทรกกลางคำ
//
// ข้อจำกัด: ตัวกรองแบบรายการคำจับได้ไม่หมด เพิ่ม/ลดคำได้ที่รายการด้านล่างที่เดียว

const THAI_WORDS = [
  'ควย', 'เหี้ย', 'สัส', 'สัด', 'หี', 'แตด', 'เย็ด', 'มึง', 'อีดอก', 'อีตัว',
  'ร่าน', 'ระยำ', 'จัญไร', 'ชาติหมา', 'ส้นตีน', 'ไอ้สัตว์', 'อีสัตว์', 'ไอ้ควาย', 'ตอแหล',
];
// คำที่ตัวตัดคำไทยไม่รู้จัก (หั่นเป็น "เชี่ยม|าก", "ชิ|บ|หาย") → ตรวจด้วย pattern แทน
//   เชี่ย ที่ไม่ตามด้วย ว (ไม่ติด "เชี่ยวชาญ", "เชี่ยวกราก")
const THAI_PATTERNS = [/เชี่ย(?!ว)/u, /ชิบหาย/u];
// คำหนักที่ไม่ซ่อนอยู่ในคำปกติ → ตรวจแบบ "มีอยู่ในข้อความที่ถูกคั่น" ได้
const STRONG_THAI = ['ควย', 'เหี้ย', 'เย็ด', 'แตด', 'อีดอก', 'ชาติหมา', 'ส้นตีน', 'จัญไร', 'ระยำ'];
const ENGLISH_WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
  'asshole', 'dick', 'cunt', 'slut', 'whore', 'pussy',
];

// คำทับศัพท์ที่หยาบชัดเจน
//   - คำอังกฤษเขียนด้วยอักษรไทย เช่น "ฟัค" — ไม่มีอยู่ในคำไทยปกติ และตัวตัดคำไทยไม่รู้จักคำพวกนี้
//     (มักถูกหั่นเป็นพยางค์) จึงตรวจแบบ "มีอยู่ในข้อความ" แทนการเทียบทั้งคำ
//     ไม่ใส่คำที่ชนคำไทยจริง เช่น "ฟัก" (ผักฟัก) — คำแบบนั้นอยู่ในรายการก้ำกึ่งด้านล่างแทน
const THAI_SCRIPT_ENGLISH = ['ฟัค', 'ฟักยู', 'ฟักกิ้ง', 'บิทช์', 'บูลชิท', 'แอสโฮล', 'พุสซี่', 'คันท์', 'สลัท'];
//   - คำหยาบไทยเขียนด้วยอักษรอังกฤษ (คาราโอเกะ) — เทียบ "ทั้งคำ" เหมือนคำอังกฤษ จึงไม่ติดชื่อเมืองอย่าง Phuket
const THAI_IN_LATIN = [
  'kuay', 'kuey', 'heea', 'heear', 'yedmae', 'yedmea', 'eedok', 'edok', 'idok',
  'aisus', 'aisud', 'aihia', 'aikuay', 'santeen', 'sonteen',
];

// คำก้ำกึ่ง: อาจหยาบ หรืออาจเป็นคำปกติ/ชื่อจริงก็ได้ เช่น "sus", "hee", "mung" (ถั่วเขียว), "cock" (ไก่ตัวผู้)
// ไม่บล็อก — ส่งให้ admin ตัดสินตอนอนุมัติโรงแรม (findSuspiciousWords)
const SUSPICIOUS_LATIN = [
  'sus', 'sud', 'sas', 'hee', 'hia', 'yed', 'kuy', 'mueng', 'meung', 'mung', 'taed',
  'ass', 'damn', 'crap', 'piss', 'porn', 'sex', 'sexy', 'xxx', 'nude', 'cock', 'hoe',
];
// "แม่ง" ชน "แม่งาน", "กะหรี่" ชน "แกงกะหรี่" → เตือนให้คนดูแทนการบล็อก
const SUSPICIOUS_THAI_PARTS = ['แม่ง', 'ชิท', 'บิช', 'ดิ๊ก', 'เซ็กซ์', 'เซ็กซี่']; // ตรวจแบบ "มีอยู่ในข้อความ"
const SUSPICIOUS_THAI_WORDS = ['กะหรี่', 'โป๊', 'เวร', 'ห่า'];                      // ตรวจแบบ "ทั้งคำ" (ไม่ติด "โป๊ะ")

const THAI_SET = new Set(THAI_WORDS);
const LATIN_SET = new Set([...ENGLISH_WORDS, ...THAI_IN_LATIN]);
const LATIN_WORDS = [...LATIN_SET];
const SUSPICIOUS_LATIN_SET = new Set(SUSPICIOUS_LATIN);
const SUSPICIOUS_THAI_SET = new Set(SUSPICIOUS_THAI_WORDS);
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });

// ตัวเลข/สัญลักษณ์ที่ใช้แทนตัวอักษร (leetspeak)
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
// อักขระที่ใช้คั่นตัวอักษรเพื่อเลี่ยงตัวกรอง
const SEPARATORS = /[\s.\-_*•·,|/\\~+=^`'"]+/u;

function normalize(text) {
  return String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍⁠﻿]/g, '');
}

function collapseRepeats(text) {
  return text.replace(/(.)\1+/gu, '$1');
}

// คำที่เขียนด้วยอักษรอังกฤษ (คำอังกฤษ + คำไทยแบบคาราโอเกะ) — เทียบทั้งคำ หลังแปลง leetspeak/ยุบตัวซ้ำ
function isLatinBadWord(token) {
  const word = token.replace(/[013457@$!]/g, (ch) => LEET[ch]);
  if (word.includes('*')) {
    // "f*ck", "sh**" → ให้ * แทนตัวอักษรใดก็ได้ 1 ตัว
    const pattern = new RegExp(`^${word.replace(/[^a-z*]/g, '').replace(/\*/g, '.')}$`);
    return LATIN_WORDS.some((bad) => pattern.test(bad));
  }
  return LATIN_SET.has(word) || LATIN_SET.has(collapseRepeats(word));
}

// แยกข้อความเป็นคำอักษรอังกฤษ (ตัดที่ช่องว่าง/เครื่องหมาย แต่เก็บตัวเลข/สัญลักษณ์ที่ใช้แทนตัวอักษรไว้)
function latinTokens(value) {
  return value.split(/[^a-z0-9@$!*]+/).filter((token) => /[a-z]/.test(token));
}

function isThaiBadWord(word) {
  return THAI_SET.has(word) || THAI_SET.has(collapseRepeats(word));
}

// "ค.ว.ย" / "f u c k" → รวมชิ้นสั้นๆ (ไม่เกิน 2 ตัวอักษร) ที่อยู่ติดกันตั้งแต่ 2 ชิ้นขึ้นไปกลับเป็นคำเดียว
function spacedOutRuns(text) {
  const runs = [];
  let run = '';
  let pieces = 0;
  for (const token of text.split(SEPARATORS)) {
    if (token && token.length <= 2) {
      run += token;
      pieces += 1;
      continue;
    }
    if (pieces >= 2) runs.push(run);
    run = '';
    pieces = 0;
  }
  if (pieces >= 2) runs.push(run);
  return runs;
}

// คืนรายการคำไม่สุภาพที่เจอ (ว่าง = ผ่าน)
export function findProfanity(text) {
  if (!text) return [];
  const value = normalize(text);
  const found = new Set();

  // 1) ตัดคำ (ทั้งข้อความปกติ และข้อความที่ยุบตัวซ้ำแล้ว) แล้วเทียบทั้งคำ
  for (const version of [value, collapseRepeats(value)]) {
    for (const { segment, isWordLike } of segmenter.segment(version)) {
      if (isWordLike && isThaiBadWord(segment)) found.add(segment);
    }
  }

  // 1b) คำอังกฤษที่เขียนด้วยอักษรไทย เช่น "ฟัค", "บิทช์" — ตรวจแบบมีอยู่ในข้อความ (รวมแบบยุบตัวซ้ำ "ฟัคคคค")
  //     + คำไทยที่ตัวตัดคำไม่รู้จัก ตรวจด้วย pattern
  for (const version of [value, collapseRepeats(value)]) {
    for (const bad of THAI_SCRIPT_ENGLISH) if (version.includes(bad)) found.add(bad);
    for (const pattern of THAI_PATTERNS) {
      const match = version.match(pattern);
      if (match) found.add(match[0]);
    }
  }

  // 2) อักษรอังกฤษ (คำอังกฤษ + คำไทยแบบคาราโอเกะ เช่น "kuay") รวม leetspeak และ * — เทียบทั้งคำ
  const tokens = latinTokens(value);
  for (const token of tokens) {
    if (isLatinBadWord(token)) found.add(token);
  }
  // 2b) คำที่ถูกเว้นวรรคแยกเป็นสองท่อน เช่น "ai sus", "yed mae" → ลองต่อคู่คำที่อยู่ติดกัน
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (!isLatinBadWord(tokens[i]) && !isLatinBadWord(tokens[i + 1]) && isLatinBadWord(tokens[i] + tokens[i + 1])) {
      found.add(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }

  // 3) ตัวอักษรที่ถูกคั่นทีละตัว
  for (const run of spacedOutRuns(value)) {
    const joined = collapseRepeats(run);
    if (isThaiBadWord(joined) || STRONG_THAI.some((bad) => joined.includes(bad)) || isLatinBadWord(joined)) {
      found.add(run);
    }
  }

  return [...found];
}

// คำก้ำกึ่งที่ควรให้คนดู (ไม่บล็อก) — ใช้ตอน admin อนุมัติโรงแรม และขึ้นเตือนในรายการโรงแรมหลังบ้าน
export function findSuspiciousWords(text) {
  if (!text) return [];
  const value = normalize(text);
  const found = new Set();
  for (const token of latinTokens(value)) {
    const word = token.replace(/[013457@$!]/g, (ch) => LEET[ch]);
    if (SUSPICIOUS_LATIN_SET.has(word) || SUSPICIOUS_LATIN_SET.has(collapseRepeats(word))) found.add(token);
  }
  for (const part of SUSPICIOUS_THAI_PARTS) if (value.includes(part)) found.add(part);
  for (const { segment, isWordLike } of segmenter.segment(value)) {
    if (isWordLike && SUSPICIOUS_THAI_SET.has(segment)) found.add(segment);
  }
  return [...found];
}

export function containsProfanity(text) {
  return findProfanity(text).length > 0;
}

// middleware: ตรวจช่องข้อความใน body ก่อนส่งต่อให้ route ข้างหลัง (ใช้กับ POST/PUT/PATCH)
// ใช้ครอบ route ของ module อื่นได้โดยไม่ต้องแก้ไฟล์ของ module นั้น เช่น
//   app.use('/api/reviews', rejectProfanity('comment', 'ข้อความ...'), reviewRoutes)
export function rejectProfanity(field, message) {
  return (req, res, next) => {
    const value = req.body?.[field];
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && typeof value === 'string' && containsProfanity(value)) {
      return res.status(400).json({ message });
    }
    next();
  };
}
