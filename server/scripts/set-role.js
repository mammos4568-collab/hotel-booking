// ============================================================
// ตั้งบทบาทผู้ใช้จาก command line — ใช้ตั้ง "admin คนแรก" (คนต่อไปตั้งจากหน้าหลังบ้าน เมนูผู้ใช้ ได้เลย)
//
//   node --env-file=server/.env server/scripts/set-role.js <email> <user|owner|admin> [--hotels=1,2]
//     --hotels  ใช้กับ owner: ยกโรงแรมรหัสเหล่านี้ให้เป็นของผู้ใช้คนนี้
//
//   บน production (รันใน container ที่มีค่า DATABASE_URL อยู่แล้ว):
//   docker compose -f docker-compose.prod.yml --env-file .env.production exec app node server/scripts/set-role.js <email> admin
//
// ทำไมไม่มี API ให้ตั้ง admin คนแรก: ถ้ามี ใครก็ยิง API ตั้งตัวเองเป็น admin ได้
// → คนที่เข้าถึงเครื่อง server/ฐานข้อมูลได้เท่านั้นที่ควรทำได้
// ============================================================
import { pool } from '../src/db.js';

const ROLES = ['user', 'owner', 'admin'];
const args = process.argv.slice(2);
const [email, role] = args.filter((arg) => !arg.startsWith('--'));
const hotelsFlag = args.find((arg) => arg.startsWith('--hotels='));
const hotelIds = hotelsFlag ? hotelsFlag.slice('--hotels='.length).split(',').map(Number) : [];

if (!email || !ROLES.includes(role) || hotelIds.some((id) => !Number.isInteger(id) || id <= 0) || (hotelIds.length && role !== 'owner')) {
  console.error('วิธีใช้: node --env-file=server/.env server/scripts/set-role.js <email> <user|owner|admin> [--hotels=1,2]');
  console.error('       (--hotels ใช้ได้กับ owner เท่านั้น)');
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: [user] } = await client.query(
    'SELECT user_id, role FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE',
    [email.trim()],
  );
  if (!user) throw new Error(`ไม่พบผู้ใช้อีเมล ${email} — สมัครสมาชิกผ่านหน้าเว็บก่อน`);

  await client.query('UPDATE users SET role = $2, updated_at = now() WHERE user_id = $1', [user.user_id, role]);
  // ไม่ใช่ owner แล้ว → ถอดออกจากโรงแรมที่เคยดูแล (เหมือนเปลี่ยนในหน้าหลังบ้าน)
  const unassigned = user.role === 'owner' && role !== 'owner'
    ? (await client.query('UPDATE properties SET owner_id = NULL WHERE owner_id = $1', [user.user_id])).rowCount
    : 0;
  let hotels = [];
  if (hotelIds.length) {
    ({ rows: hotels } = await client.query(
      'UPDATE properties SET owner_id = $1 WHERE property_id = ANY($2::int[]) RETURNING property_id, name',
      [user.user_id, hotelIds],
    ));
    if (hotels.length !== new Set(hotelIds).size) throw new Error('มีรหัสโรงแรมที่ไม่มีอยู่จริง (ดูรหัสได้ที่หน้าเว็บ /hotels/<รหัส>)');
  }
  // บันทึกการทำงาน: ไม่มีผู้ใช้ที่ล็อกอิน (user_id = NULL) + via: 'script' → หน้าบันทึกแสดงว่าเป็นสคริปต์ระบบ
  await client.query(
    `INSERT INTO admin_audit_log (user_id, action, entity_id, detail) VALUES (NULL, 'user.role', $1, $2)`,
    [user.user_id, JSON.stringify({ from: user.role, to: role, via: 'script', unassignedHotels: unassigned, hotelIds })],
  );
  await client.query('COMMIT');

  console.log(`ตั้งบทบาท ${email}: ${user.role} → ${role}`);
  for (const hotel of hotels) console.log(`  เป็นเจ้าของ: #${hotel.property_id} ${hotel.name}`);
  if (unassigned) console.log(`  ถอดออกจากโรงแรมเดิม ${unassigned} แห่ง (กลับไปให้ admin ดูแล)`);
  console.log('ให้ผู้ใช้รีเฟรชหน้าเว็บ — สิทธิ์ใหม่มีผลทันที ไม่ต้องล็อกอินใหม่');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
