// บันทึกการทำงานในหลังบ้าน (ใครทำอะไร เมื่อไร) + หน้าดูบันทึกสำหรับ admin
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAdmin } from './scope.js';

// เรียกใน transaction เดียวกับงานที่ทำ → งานสำเร็จบันทึกด้วย งานพังบันทึกก็ไม่เกิด (ROLLBACK พร้อมกัน)
// detail: เก็บแค่ชื่อฟิลด์/ตัวเลขอ้างอิง ห้ามใส่ข้อมูลส่วนบุคคลของลูกค้า (PDPA)
export async function logAction(db, req, action, entityId, detail = {}) {
  await db.query(
    'INSERT INTO admin_audit_log (user_id, action, entity_id, detail) VALUES ($1, $2, $3, $4)',
    [req.user.id, action, entityId ?? null, JSON.stringify(detail)],
  );
}

const router = Router();

// GET /api/admin/audit?page= — ล่าสุดก่อน หน้าละ 30 รายการ
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 1000);
    const { rows } = await pool.query(
      `SELECT a.log_id, a.action, a.entity_id, a.detail, a.created_at,
              TRIM(u.first_name || ' ' || u.last_name) AS actor_name, u.role AS actor_role,
              COUNT(*) OVER () AS total_count
         FROM admin_audit_log a
         LEFT JOIN users u ON u.user_id = a.user_id
        ORDER BY a.created_at DESC, a.log_id DESC
        LIMIT 30 OFFSET $1`,
      [(page - 1) * 30],
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      logs: rows.map((row) => ({
        id: row.log_id,
        action: row.action,
        entityId: row.entity_id,
        detail: row.detail,
        createdAt: row.created_at,
        actor: row.actor_name ? { name: row.actor_name, role: row.actor_role } : null,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / 30)),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
