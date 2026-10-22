// ทดสอบรายการโปรด (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/favorites.js
//   - ต้องล็อกอิน · เพิ่ม/ลบซ้ำได้ไม่ error · เห็นเฉพาะของตัวเอง · โรงแรมที่ไม่มีจริง → 404
//   - อยู่ในไฟล์ขอสำเนาข้อมูล (PDPA) และหายไปเมื่อลบบัญชี
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL || 'http://localhost:3000/api';
let failed = 0;
const ok = (pass, label, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `  -> ${detail}` : ''}`);
};

async function register() {
  const password = randomUUID();
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Fav Tester', email: `fav-${randomUUID().slice(0, 8)}@example.test`, password }),
  });
  if (!res.ok) throw new Error(`สมัครสมาชิกไม่สำเร็จ (${res.status}) — เปิด server แล้วหรือยัง?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie, password };
}

function client(cookie) {
  return async (path, method = 'GET', body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

const anonymous = client('');
ok((await anonymous('/favorites')).status === 401, 'ยังไม่ล็อกอิน → 401');

const alice = await register();
const bob = await register();
const asAlice = client(alice.cookie);
const asBob = client(bob.cookie);

const first = await asAlice('/favorites/7', 'PUT');
const again = await asAlice('/favorites/7', 'PUT');
ok(first.status === 200 && again.status === 200, 'กดหัวใจซ้ำได้ ไม่ error (idempotent)');
await asAlice('/favorites/3', 'PUT');
const ids = await asAlice('/favorites/ids');
ok(JSON.stringify([...ids.data.ids].sort()) === JSON.stringify([3, 7]), 'ได้ id ที่กดไว้ครบ ไม่ซ้ำ', JSON.stringify(ids.data));
const list = await asAlice('/favorites');
ok(list.data.hotels[0]?.id === 3 && list.data.hotels.length === 2 && list.data.hotels[0].nightlyFrom > 0, 'รายการเรียงล่าสุดก่อน พร้อมราคาเริ่มต้น');

const bobIds = await asBob('/favorites/ids');
ok(bobIds.data.ids.length === 0, 'คนอื่นไม่เห็นรายการโปรดของเรา');

ok((await asAlice('/favorites/999999', 'PUT')).status === 404, 'โรงแรมที่ไม่มีจริง → 404');
ok((await asAlice('/favorites/abc', 'PUT')).status === 400, 'id ไม่ใช่ตัวเลข → 400');

const removed = await asAlice('/favorites/7', 'DELETE');
const removedAgain = await asAlice('/favorites/7', 'DELETE');
const afterRemove = await asAlice('/favorites/ids');
ok(removed.status === 200 && removedAgain.status === 200 && afterRemove.data.ids.join() === '3', 'เอาออกได้ และเอาออกซ้ำไม่ error');

const exported = await asAlice('/privacy/export');
ok(exported.data.favorites?.length === 1, 'อยู่ในไฟล์ขอสำเนาข้อมูล (PDPA)');

for (const [user, ask] of [[alice, asAlice], [bob, asBob]]) {
  const deleted = await ask('/privacy/account', 'DELETE', { password: user.password, confirm: 'ลบบัญชี' });
  if (deleted.status !== 200) ok(false, 'ลบบัญชีทดสอบ', JSON.stringify(deleted.data));
}
ok((await asAlice('/favorites/ids')).status === 401, 'ลบบัญชีแล้วใช้ต่อไม่ได้ (รายการโปรดลบตามด้วย ON DELETE CASCADE)');

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
