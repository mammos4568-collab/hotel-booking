// ============================================================
// ทดสอบรูปโปรไฟล์ที่อัปจากเครื่อง (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/avatar.js
//   (อ่าน DATABASE_URL จาก server/.env เอง — ใช้ตรวจในฐานข้อมูลและล้างข้อมูลทดสอบตอนจบ)
//
//   - ไม่ล็อกอิน 401 · ตรวจไฟล์ที่ server: ไม่ใช่ JPEG / ขนาดไม่ใช่ 400×400 / ใหญ่เกิน → 400/413
//   - อัปรูป → ได้ลิงก์ /api/auth/avatars/<รหัสสุ่ม> (ไม่มีเลขผู้ใช้ ไล่ดึงรูปทุกคนไม่ได้) · ไฟล์โหลดได้ cache แบบ private
//   - อัปรูปใหม่ = แทนรูปเดิม ได้ลิงก์ใหม่ ลิงก์เดิมใช้ไม่ได้ · แก้ชื่อในโปรไฟล์แล้วรูปยังอยู่ · PUT /me ไม่รับลิงก์รูปแล้ว
//   - ขอสำเนาข้อมูลมีตัวรูป (base64) · ลบรูปได้เฉพาะของตัวเอง · ลบบัญชี → รูปหายตาม
// ไฟล์ทดสอบเป็น "JPEG จำลอง" ที่มีแค่ header บอกขนาด (server อ่านขนาดจาก header ไม่ได้ถอดรหัสทั้งภาพ)
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วลบทุกอย่างที่สร้างตอนจบ
// ============================================================
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const API = process.env.API_URL || 'http://localhost:3000/api';
const ORIGIN = new URL(API).origin; // ลิงก์รูปเป็น path (/api/auth/avatars/...) ต่อกับ origin ของ server
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `  -> ${detail}` : ''}`);
};

async function call(path, method = 'GET', body, cookie = '') {
  const isImage = Buffer.isBuffer(body);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': isImage ? 'image/jpeg' : 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? (isImage ? body : JSON.stringify(body)) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function register(name) {
  const email = `avatar-test-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomUUID();
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json().catch(() => null);
  if (res.status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${res.status}) — เปิด server แล้วหรือยัง?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id: data.user.id, password, call: (path, method, body) => call(path, method, body, cookie) };
}

// JPEG จำลอง: SOI + segment SOF0 (บอกสูง×กว้าง) + ไบต์เติม + EOI · filler ต่างกันเพื่อแยกว่าเป็นรูปไหน
function fakeJpeg(width = 400, height = 400, filler = 0) {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]),
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 0xFF, width >> 8, width & 0xFF,
      0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.alloc(256, filler),
    Buffer.from([0xFF, 0xD9]),
  ]);
}

const fetchAvatar = (url) => fetch(`${ORIGIN}${url}`);
const users = [];

try {
  const [alice, bob] = await Promise.all(['Alice Avatar', 'Bob Avatar'].map(register));
  users.push(alice, bob);

  console.log('=== 1) สิทธิ์ + ตรวจไฟล์ ===');
  ok((await call('/auth/me/avatar', 'PUT', fakeJpeg())).status === 401, 'ไม่ล็อกอิน → 401');
  const wrongSize = await alice.call('/auth/me/avatar', 'PUT', fakeJpeg(1200, 800));
  ok(wrongSize.status === 400 && /400×400/.test(wrongSize.data?.message), 'ขนาดไม่ใช่ 400×400 → 400 บอกขนาดที่ได้', wrongSize.data?.message);
  const notJpeg = await alice.call('/auth/me/avatar', 'PUT', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  ok(notJpeg.status === 400 && /JPEG/.test(notJpeg.data?.message), 'ไฟล์ไม่ใช่ JPEG (แอบส่ง SVG) → 400', notJpeg.data?.message);
  const tooBig = await alice.call('/auth/me/avatar', 'PUT', Buffer.concat([fakeJpeg().subarray(0, 23), Buffer.alloc(600_000), Buffer.from([0xFF, 0xD9])]));
  ok(tooBig.status === 413 && /ใหญ่เกิน/.test(tooBig.data?.message), 'ไฟล์ใหญ่เกิน 500 KB → 413 ภาษาไทย', JSON.stringify(tooBig.data));

  console.log('\n=== 2) อัปรูป ===');
  const first = await alice.call('/auth/me/avatar', 'PUT', fakeJpeg(400, 400, 1));
  const url1 = first.data?.avatarUrl ?? '';
  ok(first.status === 200 && /^\/api\/auth\/avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(url1),
    'อัปรูป → ได้ลิงก์เป็นรหัสสุ่ม (UUID) ไม่ใช่เลขผู้ใช้', url1);
  ok((await alice.call('/auth/me')).data?.user?.avatarUrl === url1, 'GET /auth/me ได้ลิงก์รูปใหม่ (รีวิว/แถบเมนูใช้ค่านี้)');
  const file = await fetchAvatar(url1);
  const bytes = Buffer.from(await file.arrayBuffer());
  ok(file.status === 200 && file.headers.get('content-type') === 'image/jpeg' && bytes.equals(fakeJpeg(400, 400, 1)),
    'ไฟล์รูปโหลดได้ ตรงกับที่อัป', `${file.status} ${file.headers.get('content-type')}`);
  ok(/private/.test(file.headers.get('cache-control') ?? ''), 'cache แบบ private (proxy/CDN กลางทางไม่เก็บรูป)', file.headers.get('cache-control'));
  ok((await fetch(`${API}/auth/avatars/${alice.id}`)).status === 404, 'ดึงรูปด้วยเลขผู้ใช้ไม่ได้ → 404');

  console.log('\n=== 3) อัปใหม่ / แก้โปรไฟล์ ===');
  const second = await alice.call('/auth/me/avatar', 'PUT', fakeJpeg(400, 400, 2));
  const url2 = second.data?.avatarUrl ?? '';
  ok(second.status === 200 && url2 !== url1 && (await fetchAvatar(url1)).status === 404, 'อัปรูปใหม่ → ได้ลิงก์ใหม่ ลิงก์เดิมใช้ไม่ได้ทันที');
  const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int AS count FROM user_avatars WHERE user_id = $1', [alice.id]);
  ok(count === 1, '1 คนมีรูปเดียว (รูปใหม่แทนที่รูปเดิม ไม่ค้างในฐานข้อมูล)', `count = ${count}`);
  const renamed = await alice.call('/auth/me', 'PUT', { name: 'Alice Renamed', phone: '0812345678' });
  ok(renamed.status === 200 && renamed.data?.user?.avatarUrl === url2, 'แก้ชื่อ/เบอร์ในโปรไฟล์ → รูปยังอยู่', JSON.stringify(renamed.data));
  const external = await alice.call('/auth/me', 'PUT', { avatarUrl: 'https://tracker.example/pixel.gif' });
  ok(external.status === 400, 'PUT /auth/me ส่งลิงก์รูปภายนอก → 400 (เปลี่ยนรูปได้ทางอัปโหลดเท่านั้น)', JSON.stringify(external.data));

  console.log('\n=== 4) ขอสำเนาข้อมูล (PDPA) ===');
  const exported = await alice.call('/privacy/export');
  ok(exported.data?.uploadedAvatar?.image === `data:image/jpeg;base64,${fakeJpeg(400, 400, 2).toString('base64')}`,
    'สำเนาข้อมูลมีตัวรูปโปรไฟล์ (base64) ตรงกับที่อัป', JSON.stringify(exported.data?.uploadedAvatar)?.slice(0, 120));
  ok((await bob.call('/privacy/export')).data?.uploadedAvatar === null, 'คนที่ไม่ได้อัปรูป → uploadedAvatar = null');

  console.log('\n=== 5) ลบรูป ===');
  await bob.call('/auth/me/avatar', 'DELETE');
  ok((await fetchAvatar(url2)).status === 200, 'คนอื่นกดลบรูป → ลบได้แค่ของตัวเอง รูปเรายังอยู่');
  const removed = await alice.call('/auth/me/avatar', 'DELETE');
  ok(removed.status === 200 && (await alice.call('/auth/me')).data?.user?.avatarUrl === null && (await fetchAvatar(url2)).status === 404,
    'ลบรูป → /auth/me ไม่มีรูป · ไฟล์ 404');

  console.log('\n=== 6) ลบบัญชี → รูปหายตาม ===');
  const third = await alice.call('/auth/me/avatar', 'PUT', fakeJpeg(400, 400, 3));
  const deletedAccount = await alice.call('/privacy/account', 'DELETE', { password: alice.password, confirm: 'ลบบัญชี' });
  const { rows: left } = await db.query('SELECT 1 FROM user_avatars WHERE user_id = $1', [alice.id]);
  ok(deletedAccount.status === 200 && left.length === 0 && (await fetchAvatar(third.data?.avatarUrl ?? '')).status === 404,
    'ลบบัญชี → รูปโปรไฟล์ถูกลบตาม (ON DELETE CASCADE)', JSON.stringify(deletedAccount.data));
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // ล้างผู้ใช้ทดสอบที่เหลือ (รูปลบตามด้วย ON DELETE CASCADE)
  await db.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [users.map((user) => user.id)]);
  await db.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
