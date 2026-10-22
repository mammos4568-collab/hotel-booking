// ============================================================
// ตรวจถ้อยคำไม่สุภาพ (ใช้กับ "คำขอพิเศษ" ที่ส่งถึงโรงแรม)
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
  'ร่าน', 'ระยำ', 'จัญไร', 'ชาติหมา', 'ส้นตีน', 'ไอ้สัตว์', 'อีสัตว์', 'ไอ้ควาย',
];
// คำหนักที่ไม่ซ่อนอยู่ในคำปกติ → ตรวจแบบ "มีอยู่ในข้อความที่ถูกคั่น" ได้
const STRONG_THAI = ['ควย', 'เหี้ย', 'เย็ด', 'แตด', 'อีดอก', 'ชาติหมา', 'ส้นตีน', 'จัญไร', 'ระยำ'];
const ENGLISH_WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
  'asshole', 'dick', 'cunt', 'slut', 'whore', 'pussy',
];

const THAI_SET = new Set(THAI_WORDS);
const ENGLISH_SET = new Set(ENGLISH_WORDS);
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

function isEnglishBadWord(token) {
  const word = token.replace(/[013457@$!]/g, (ch) => LEET[ch]);
  if (word.includes('*')) {
    // "f*ck", "sh**" → ให้ * แทนตัวอักษรใดก็ได้ 1 ตัว
    const pattern = new RegExp(`^${word.replace(/[^a-z*]/g, '').replace(/\*/g, '.')}$`);
    return ENGLISH_WORDS.some((bad) => pattern.test(bad));
  }
  return ENGLISH_SET.has(word) || ENGLISH_SET.has(collapseRepeats(word));
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

  // 2) ภาษาอังกฤษ (รวม leetspeak และ *) — ตัดคำด้วยช่องว่าง/เครื่องหมาย
  for (const token of value.split(/[^a-z0-9@$!*]+/)) {
    if (token && /[a-z]/.test(token) && isEnglishBadWord(token)) found.add(token);
  }

  // 3) ตัวอักษรที่ถูกคั่นทีละตัว
  for (const run of spacedOutRuns(value)) {
    const joined = collapseRepeats(run);
    if (isThaiBadWord(joined) || STRONG_THAI.some((bad) => joined.includes(bad)) || isEnglishBadWord(joined)) {
      found.add(run);
    }
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
