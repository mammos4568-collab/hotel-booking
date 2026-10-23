// หลังบ้าน: ผู้ใช้และสิทธิ์ — /api/admin/users (admin เท่านั้น)
import { Router } from 'express';
import { pool } from '../../db.js';
import { logAction } from './audit.js';
import { httpError, readId, requireAdmin, withTransaction } from './scope.js';

const router = Router();
router.use(requireAdmin);

const ROLES = ['user', 'owner', 'admin'];
// หน้าเว็บเปลี่ยนได้แค่ ลูกค้า ↔ เจ้าของโรงแรม · ตั้ง/ถอดผู้ดูแลระบบได้ทางเดียวคือ server/scripts/set-role.js บนเครื่อง server
// เหตุผล: ถ้าบัญชี admin บนเว็บหลุด (รหัสผ่าน/cookie ถูกขโมย) คนร้ายจะตั้งบัญชีตัวเองเป็น admin เพิ่ม (ประตูหลัง)
// หรือถอด admin ตัวจริงออกไม่ได้ — ต้องมีสิทธิ์เข้าเครื่อง server (กุญแจ SSH) ด้วยถึงจะแตะสิทธิ์ admin ได้
const WEB_ROLES = ['user', 'owner'];
const ADMIN_BY_SCRIPT_ONLY = 'ตั้งหรือถอดผู้ดูแลระบบได้จากคำสั่งบน server เท่านั้น (server/scripts/set-role.js)';
const PAGE_SIZE = 20;

// GET /api/admin/users?q=&role=&page=
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    if (ROLES.includes(req.query.role)) {
      params.push(req.query.role);
      where.push(`AND u.role = $${params.length}`);
    }
    const q = String(req.query.q ?? '').trim().slice(0, 100);
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      where.push(`AND (u.email ILIKE $${params.length} OR (u.first_name || ' ' || u.last_name) ILIKE $${params.length})`);
    }
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 1000);
    params.push((page - 1) * PAGE_SIZE);
    // ไม่ดึง password_hash มาเด็ดขาด — เลือกเฉพาะคอลัมน์ที่หน้าจอต้องใช้
    const { rows } = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.role, u.created_at,
              (SELECT COUNT(*)::int FROM bookings WHERE user_id = u.user_id) AS bookings,
              (SELECT COUNT(*)::int FROM properties WHERE owner_id = u.user_id) AS hotels,
              COUNT(*) OVER () AS total_count
         FROM users u
        WHERE TRUE ${where.join(' ')}
        ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END, u.user_id DESC
        LIMIT ${PAGE_SIZE} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      users: rows.map((row) => ({
        id: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        bookings: row.bookings,
        hotels: row.hotels,
        isMe: row.user_id === req.user.id,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/owners — รายชื่อเจ้าของโรงแรม (ใช้เลือกเจ้าของในหน้าแก้โรงแรม)
router.get('/owners', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, TRIM(first_name || ' ' || last_name) AS name, email FROM users WHERE role = 'owner' ORDER BY first_name`,
    );
    res.json({ owners: rows.map((row) => ({ id: row.user_id, name: row.name, email: row.email })) });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/role  body: { role: 'user' | 'owner' }
router.patch('/:id/role', async (req, res, next) => {
  try {
    const userId = readId(req.params.id, 'รหัสผู้ใช้');
    const role = req.body?.role;
    if (role === 'admin') throw httpError(403, ADMIN_BY_SCRIPT_ONLY);
    if (!WEB_ROLES.includes(role)) throw httpError(400, `บทบาทต้องเป็น ${WEB_ROLES.join(' หรือ ')}`);
    // เปลี่ยนสิทธิ์ตัวเองไม่ได้ — กันกดพลาดแล้วล็อกตัวเองออกจากหลังบ้าน
    if (userId === req.user.id) throw httpError(400, 'เปลี่ยนบทบาทของตัวเองไม่ได้');

    const result = await withTransaction(pool, async (client) => {
      // 🔒 ล็อกแถวผู้ใช้ก่อนดูบทบาท — ถ้ามีคนรันสคริปต์ตั้งคนนี้เป็น admin พร้อมกัน ฝั่งหนึ่งต้องรออีกฝั่ง COMMIT
      //    จึงไม่มีทางที่หน้าเว็บจะลดสิทธิ์ admin ที่เพิ่งถูกตั้งด้วยสคริปต์ได้
      const { rows: [target] } = await client.query('SELECT user_id, role FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!target) throw httpError(404, 'ไม่พบผู้ใช้นี้');
      if (target.role === 'admin') throw httpError(403, ADMIN_BY_SCRIPT_ONLY);
      if (target.role === role) return { role, unassignedHotels: 0 };

      await client.query('UPDATE users SET role = $2, updated_at = now() WHERE user_id = $1', [userId, role]);
      // ไม่ใช่เจ้าของแล้ว → ถอดออกจากโรงแรมที่เคยดูแล (โรงแรมกลับไปให้ admin ดูแล) — สิทธิ์มีผลทันทีเพราะ
      // requireAuth อ่าน role จากฐานข้อมูลทุกคำขอ ไม่ได้เชื่อค่าที่ฝังใน token
      let unassignedHotels = 0;
      if (target.role === 'owner') {
        const updated = await client.query('UPDATE properties SET owner_id = NULL WHERE owner_id = $1', [userId]);
        unassignedHotels = updated.rowCount;
      }
      await logAction(client, req, 'user.role', userId, { from: target.role, to: role, unassignedHotels });
      return { role, unassignedHotels };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
