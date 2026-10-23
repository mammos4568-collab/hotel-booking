// ผู้ช่วยแนะนำที่พัก (แชท) — POST /api/assistant/chat
//
// ทำงานด้วยกฎ + คำสำคัญของเราเอง (interpret.js) แล้วค้นจากฐานข้อมูลจริง (respond.js)
// ไม่ใช้ AI ภายนอก → ไม่มีค่าใช้จ่าย ไม่ต้องมี API key และตอบได้เฉพาะเรื่องในเว็บเรา
//
// body: { message, context, lang, action?, remove? }
//   message   ข้อความที่ผู้ใช้พิมพ์ (ไม่เกิน 300 ตัวอักษร · ข้อความว่าง = ขอคำทักทาย)
//   context   filters ล่าสุดที่ server ส่งไป (หน้าเว็บส่งกลับมาเพื่อคุยต่อเนื่อง)
//   lang      'th' | 'en' ภาษาของคำตอบ
//   action    'refine' = ไม่ตีความข้อความ แค่ค้นใหม่ด้วย context (ใช้กับ remove = ป้ายเงื่อนไขที่กด ×)
//
// PDPA: ไม่บันทึกข้อความแชทลงฐานข้อมูลหรือ log — ประวัติแชทอยู่ในหน้าเว็บของผู้ใช้เท่านั้น
import { Router } from 'express';
import { pool } from '../../db.js';
import { todayInBangkok } from '../../lib/dates.js';
import { publicHotelSql } from '../../lib/hotelApproval.js';
import { containsProfanity } from '../../lib/moderation.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { MAX_MESSAGE_LENGTH, interpret, prepareCatalog, refine, sanitizeFilters } from './interpret.js';
import { respond } from './respond.js';

const router = Router();

// พิมพ์คุยได้ถี่ แต่กันสคริปต์ยิงรัว — 30 ข้อความ/นาที ต่อ IP (ไม่ต้องล็อกอินก็ใช้ได้)
const chatLimiter = rateLimit({ windowMs: 60_000, max: 30, key: (req) => `assistant:${req.ip}` });

// รายชื่อเมือง/โรงแรมที่ใช้จับคำ — โหลดจาก DB แล้วเก็บไว้ 1 นาที
// (ไม่ต้อง query ทุกข้อความ และถ้าแอดมินเพิ่มโรงแรมใหม่ ผู้ช่วยจะรู้จักภายใน 1 นาที)
const CATALOG_TTL_MS = 60_000;
let catalogCache = { loadedAt: 0, value: null };

async function loadCatalog() {
  if (catalogCache.value && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) return catalogCache.value;
  const [hotels, cities, capacity] = await Promise.all([
    // เฉพาะโรงแรมที่อนุมัติแล้ว — ผู้ช่วยต้องไม่รู้จัก/เอ่ยชื่อโรงแรมที่ยังรอตรวจหรือถูกระงับ
    pool.query(`SELECT p.property_id AS id, p.name, p.city FROM properties p WHERE ${publicHotelSql('p')} ORDER BY p.property_id`),
    pool.query(
      `SELECT p.city, COUNT(DISTINCT p.property_id)::int AS hotels, MIN(r.base_price_per_night)::float AS min_price
         FROM properties p
         LEFT JOIN rooms r ON r.property_id = p.property_id
        WHERE ${publicHotelSql('p')}
        GROUP BY p.city
        ORDER BY hotels DESC, p.city`,
    ),
    pool.query('SELECT COALESCE(MAX(max_guests), 1)::int AS max_guests FROM rooms'),
  ]);
  const value = prepareCatalog({
    hotels: hotels.rows,
    cities: cities.rows.map((row) => ({ city: row.city, hotels: row.hotels, minPrice: row.min_price })),
    maxGuests: capacity.rows[0].max_guests,
  });
  catalogCache = { loadedAt: Date.now(), value };
  return value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

router.post('/chat', chatLimiter, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const lang = body.lang === 'en' ? 'en' : 'th';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw httpError(400, `ข้อความยาวเกินไป (ไม่เกิน ${MAX_MESSAGE_LENGTH} ตัวอักษร)`);
    }

    const catalog = await loadCatalog();
    const today = todayInBangkok();
    // context มาจากหน้าเว็บ = ข้อมูลที่ผู้ใช้แก้ได้ → รับเฉพาะค่าที่รู้จักและอยู่ในช่วงที่ถูกต้อง
    const previous = sanitizeFilters(body.context, catalog);

    let result;
    if (body.action === 'refine') {
      result = refine(previous, { remove: body.remove, more: body.more === true, today });
    } else if (containsProfanity(message)) {
      result = { intent: 'moderation', filters: previous, found: {}, notes: [] };
    } else {
      result = interpret(message, { today, catalog, previous });
    }

    res.json(await respond(result, { lang, catalog }));
  } catch (error) {
    next(error);
  }
});

export default router;
