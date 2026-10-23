// ============================================================
// ทดสอบรูปโรงแรม (ต้องเปิด server ก่อน: npm run dev)
// รัน: node server/test/hotel-images.js
//   (อ่าน DATABASE_URL จาก server/.env เอง — ใช้ตั้ง admin ด้วยสคริปต์ และล้างข้อมูลทดสอบตอนจบ)
//
//   - สิทธิ์: ไม่ล็อกอิน 401 · ลูกค้า 403 · owner คนอื่นดู/อัป/ลบรูปโรงแรมเราไม่ได้ 403
//   - ตรวจไฟล์ที่ server: ไม่ใช่ JPEG / ขนาดไม่ใช่ 1200×800 / ไฟล์ขาดกลางทาง / ไม่ส่งไฟล์ → 400
//   - สูงสุด 5 รูป: รูปที่ 6 → 409 · ยิงอัปพร้อมกัน 7 รูป ก็ได้แค่ 5 รูป ลำดับ 1–5 ไม่ซ้ำ (ล็อกแถวโรงแรม)
//   - เรียงลำดับใหม่ (ต้องครบทุกรูป ห้ามมีรูปโรงแรมอื่น) · ลบรูปแล้วลำดับต่อกัน · รูปปก = ลำดับแรก
//   - ฝั่งลูกค้า: หน้าโรงแรมได้รูปตามลำดับ · ผลค้นหาใช้รูปปก · ไฟล์รูปโหลดได้ + cache 1 ปี
//   - รูปประเภทห้อง (โค้ดชุดเดียวกัน): สิทธิ์ · ตรวจไฟล์ · หน้าโรงแรม/checkout/หลังบ้านใช้รูปหลักของห้อง · สูงสุด 5 รูป
//     · ลบประเภทห้อง → รูปห้องหายตาม
//   - ลบโรงแรม → รูปโรงแรมและรูปห้องถูกลบตาม
// ไฟล์ทดสอบเป็น "JPEG จำลอง" ที่มีแค่ header บอกขนาด (server อ่านขนาดจาก header ไม่ได้ถอดรหัสทั้งภาพ)
// สคริปต์สมัครผู้ใช้ทดสอบเอง (อีเมล @example.test) แล้วลบทุกอย่างที่สร้างตอนจบ
// ============================================================
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const SET_ROLE = fileURLToPath(new URL('../scripts/set-role.js', import.meta.url));
const API = process.env.API_URL || 'http://localhost:3000/api';
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
  return { status: res.status, data: await res.json().catch(() => null), res };
}

async function register(name) {
  const email = `image-test-${randomUUID().slice(0, 8)}@example.test`;
  const { status, data, res } = await call('/auth/register', 'POST', { name, email, password: randomUUID() });
  if (status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${status}) — เปิด server แล้วหรือยัง?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id: data.user.id, email, call: (path, method, body) => call(path, method, body, cookie) };
}

// JPEG จำลอง: SOI + segment SOF0 (บอกสูง×กว้าง) + ไบต์เติม + EOI · filler ต่างกันเพื่อแยกว่าเป็นรูปไหน
function fakeJpeg(width = 1200, height = 800, filler = 0) {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]),
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 0xFF, width >> 8, width & 0xFF,
      0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.alloc(256, filler),
    Buffer.from([0xFF, 0xD9]),
  ]);
}

const tag = randomUUID().slice(0, 6);
const hotelBody = {
  name: `Image Test Hotel ${tag}`, propertyType: 'Hotel', city: 'Chiang Mai', address: '1 Photo Road, Chiang Mai',
  description: 'โรงแรมทดสอบรูป', starRating: 4, amenities: ['wifi'], imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945',
};
const users = [];
const hotelIds = [];

try {
  const [admin, owner, rival, guest] = await Promise.all(['Admin Img', 'Owner Img', 'Rival Img', 'Guest Img'].map(register));
  users.push(admin, owner, rival, guest);
  execFileSync(process.execPath, [SET_ROLE, admin.email, 'admin'], { env: process.env, stdio: 'pipe' });
  await admin.call(`/admin/users/${owner.id}/role`, 'PATCH', { role: 'owner' });
  await admin.call(`/admin/users/${rival.id}/role`, 'PATCH', { role: 'owner' });

  const created = await owner.call('/admin/hotels', 'POST', hotelBody);
  const hotelId = created.data?.hotel?.id;
  if (!hotelId) throw new Error(`สร้างโรงแรมทดสอบไม่สำเร็จ: ${JSON.stringify(created.data)}`);
  hotelIds.push(hotelId);
  const photoRoom = await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', { name: 'Photo Room', maxGuests: 2, basePrice: 1200, totalRooms: 1 });
  const roomId = photoRoom.data?.room?.id;
  await admin.call(`/admin/hotels/${hotelId}/approve`, 'POST'); // โรงแรมที่ owner เพิ่มต้องอนุมัติก่อน ลูกค้าถึงจะเห็น
  const imagesPath = `/admin/hotels/${hotelId}/images`;

  console.log('=== 1) สิทธิ์ ===');
  ok((await call(imagesPath, 'POST', fakeJpeg())).status === 401, 'ไม่ล็อกอิน → 401');
  ok((await guest.call(imagesPath, 'POST', fakeJpeg())).status === 403, 'ลูกค้าทั่วไป → 403');
  ok((await rival.call(imagesPath, 'POST', fakeJpeg())).status === 403, 'owner คนอื่นอัปรูปโรงแรมเรา → 403');
  ok((await rival.call(imagesPath)).status === 403, 'owner คนอื่นดูรายการรูปหลังบ้านของเรา → 403');

  console.log('\n=== 2) ตรวจไฟล์ที่ server ===');
  const notJpeg = await owner.call(imagesPath, 'POST', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  ok(notJpeg.status === 400 && /JPEG/.test(notJpeg.data?.message), 'ไฟล์ไม่ใช่ JPEG (แอบส่ง SVG) → 400', JSON.stringify(notJpeg.data));
  const wrongSize = await owner.call(imagesPath, 'POST', fakeJpeg(4000, 3000));
  ok(wrongSize.status === 400 && /1200×800/.test(wrongSize.data?.message), 'ขนาดไม่ใช่ 1200×800 → 400 บอกขนาดที่ได้', wrongSize.data?.message);
  const truncated = await owner.call(imagesPath, 'POST', fakeJpeg().subarray(0, 200));
  ok(truncated.status === 400, 'ไฟล์ขาดกลางทาง (ไม่มี EOI) → 400');
  const noFile = await owner.call(imagesPath, 'POST', { hello: 'world' });
  ok(noFile.status === 400 && /ไม่พบไฟล์/.test(noFile.data?.message), 'ส่ง JSON แทนไฟล์ → 400 ไม่พบไฟล์รูป', noFile.data?.message);
  const tooBig = await owner.call(imagesPath, 'POST', Buffer.concat([fakeJpeg().subarray(0, 23), Buffer.alloc(1_600_000), Buffer.from([0xFF, 0xD9])]));
  ok(tooBig.status === 413 && /ใหญ่เกิน/.test(tooBig.data?.message), 'ไฟล์ใหญ่เกิน 1.5 MB → 413 ภาษาไทย', JSON.stringify(tooBig.data));

  console.log('\n=== 3) อัปรูป สูงสุด 5 รูป ===');
  const first = await owner.call(imagesPath, 'POST', fakeJpeg(1200, 800, 1));
  ok(first.status === 201 && first.data.images.length === 1 && first.data.images[0].position === 1, 'อัปรูปแรก → ลำดับ 1 (รูปปก)', JSON.stringify(first.data));
  for (let i = 2; i <= 5; i += 1) await owner.call(imagesPath, 'POST', fakeJpeg(1200, 800, i));
  const full = await owner.call(imagesPath);
  ok(full.data?.images?.map((img) => img.position).join() === '1,2,3,4,5', 'อัปครบ 5 รูป ลำดับ 1–5', JSON.stringify(full.data?.images));
  const sixth = await owner.call(imagesPath, 'POST', fakeJpeg(1200, 800, 6));
  ok(sixth.status === 409 && /5 รูป/.test(sixth.data?.message), 'รูปที่ 6 → 409', JSON.stringify(sixth.data));
  ok((await admin.call(imagesPath)).status === 200, 'admin ดูรูปได้ทุกโรงแรม');

  console.log('\n=== 4) ฝั่งลูกค้าเห็นรูป ===');
  const ids = full.data.images.map((img) => img.id);
  const detail = await call(`/hotels/${hotelId}`);
  ok(detail.data?.images?.length === 5 && detail.data.imageUrl === `/api/hotels/images/${ids[0]}`, 'หน้าโรงแรม: รูป 5 รูปตามลำดับ · imageUrl = รูปปก', JSON.stringify(detail.data?.images));
  const search = await call(`/hotels?q=${encodeURIComponent(hotelBody.name)}`);
  ok(search.data?.hotels?.[0]?.imageUrl === `/api/hotels/images/${ids[0]}`, 'ผลค้นหาใช้รูปอัปโหลดลำดับแรกเป็นรูปปก (แทนลิงก์รูปเดิม)', JSON.stringify(search.data?.hotels?.[0]));
  const file = await fetch(`${API}/hotels/images/${ids[1]}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  ok(file.status === 200 && file.headers.get('content-type') === 'image/jpeg' && bytes.equals(fakeJpeg(1200, 800, 2)),
    'ไฟล์รูปโหลดได้ ตรงกับที่อัป · Content-Type image/jpeg', `${file.status} ${file.headers.get('content-type')}`);
  ok(/immutable/.test(file.headers.get('cache-control') ?? '') && /max-age=31536000/.test(file.headers.get('cache-control') ?? ''),
    'รูป cache ได้ 1 ปี (immutable)', file.headers.get('cache-control'));
  ok((await fetch(`${API}/hotels/images/999999999`)).status === 404, 'รูปที่ไม่มี → 404');

  console.log('\n=== 5) เรียงลำดับ / ลบ ===');
  const reversed = [...ids].reverse();
  const reorder = await owner.call(`${imagesPath}/order`, 'PUT', { imageIds: reversed });
  ok(reorder.status === 200 && reorder.data.images.map((img) => img.id).join() === reversed.join(), 'เรียงลำดับใหม่ (กลับด้าน) → สลับลำดับทุกรูปได้ในครั้งเดียว', JSON.stringify(reorder.data));
  ok((await call(`/hotels/${hotelId}`)).data?.imageUrl === `/api/hotels/images/${reversed[0]}`, 'รูปปกเปลี่ยนตามลำดับใหม่');
  ok((await owner.call(`${imagesPath}/order`, 'PUT', { imageIds: reversed.slice(1) })).status === 400, 'ลำดับใหม่ขาดไป 1 รูป → 400');
  ok((await owner.call(`${imagesPath}/order`, 'PUT', { imageIds: [...reversed.slice(1), reversed[1]] })).status === 400, 'ลำดับใหม่มีรูปซ้ำ → 400');

  const rivalHotel = await rival.call('/admin/hotels', 'POST', { ...hotelBody, name: `Rival Image Hotel ${tag}` });
  if (rivalHotel.data?.hotel?.id) hotelIds.push(rivalHotel.data.hotel.id);
  const rivalImage = await rival.call(`/admin/hotels/${rivalHotel.data.hotel.id}/images`, 'POST', fakeJpeg(1200, 800, 9));
  const rivalImageId = rivalImage.data?.images?.[0]?.id;
  ok((await owner.call(`${imagesPath}/order`, 'PUT', { imageIds: [...reversed.slice(1), rivalImageId] })).status === 400, 'แอบใส่รูปของโรงแรมอื่นในลำดับ → 400');
  ok((await owner.call(`${imagesPath}/${rivalImageId}`, 'DELETE')).status === 404, 'ลบรูปโรงแรมอื่นผ่านโรงแรมตัวเอง → 404');
  ok((await rival.call(`${imagesPath}/${reversed[0]}`, 'DELETE')).status === 403, 'owner คนอื่นลบรูปโรงแรมเรา → 403');

  const removed = await owner.call(`${imagesPath}/${reversed[0]}`, 'DELETE');
  ok(removed.status === 200 && removed.data.images.map((img) => img.position).join() === '1,2,3,4'
    && removed.data.images[0].id === reversed[1], 'ลบรูปปก → เหลือ 4 รูป ลำดับต่อกัน รูปถัดไปขึ้นเป็นรูปปก', JSON.stringify(removed.data));

  console.log('\n=== 6) อัปพร้อมกัน (ล็อกแถวโรงแรม) ===');
  for (const img of removed.data.images) await owner.call(`${imagesPath}/${img.id}`, 'DELETE');
  const burst = await Promise.all(Array.from({ length: 7 }, (_, i) => owner.call(imagesPath, 'POST', fakeJpeg(1200, 800, 20 + i))));
  const statuses = burst.map((r) => r.status).sort().join();
  const { rows: dbImages } = await db.query('SELECT position FROM property_images WHERE property_id = $1 ORDER BY position', [hotelId]);
  ok(statuses === '201,201,201,201,201,409,409', 'ยิงอัปพร้อมกัน 7 รูป → สำเร็จ 5 · ปฏิเสธ 2 (409)', statuses);
  ok(dbImages.map((row) => row.position).join() === '1,2,3,4,5', 'ในฐานข้อมูลมี 5 รูป ลำดับ 1–5 ไม่ซ้ำ', JSON.stringify(dbImages));

  console.log('\n=== 7) รูปประเภทห้อง ===');
  const roomPath = `/admin/rooms/${roomId}/images`;
  const roomImageUrl = (id) => `/api/hotels/room-images/${id}`;
  ok((await rival.call(roomPath, 'POST', fakeJpeg())).status === 403, 'owner คนอื่นอัปรูปห้องของเรา → 403');
  ok((await guest.call(roomPath)).status === 403, 'ลูกค้าทั่วไปดูรายการรูปห้องในหลังบ้าน → 403');
  ok((await owner.call(roomPath, 'POST', fakeJpeg(4000, 3000))).status === 400, 'รูปห้องขนาดไม่ใช่ 1200×800 → 400 (ตรวจแบบเดียวกับรูปโรงแรม)');
  const roomFirst = await owner.call(roomPath, 'POST', fakeJpeg(1200, 800, 31));
  const roomSecond = await owner.call(roomPath, 'POST', fakeJpeg(1200, 800, 32));
  const roomIds = roomSecond.data?.images?.map((img) => img.id) ?? [];
  ok(roomFirst.status === 201 && roomIds.length === 2 && roomSecond.data.images[1].position === 2, 'อัปรูปห้อง 2 รูป → ลำดับ 1, 2', JSON.stringify(roomSecond.data));

  const roomOnPage = (await call(`/hotels/${hotelId}`)).data?.rooms?.find((room) => room.id === roomId);
  ok(roomOnPage?.images?.join() === roomIds.map(roomImageUrl).join() && roomOnPage.imageUrl === roomImageUrl(roomIds[0]),
    'หน้าโรงแรม: ห้องมีรูปตามลำดับ · imageUrl = รูปแรก', JSON.stringify(roomOnPage));
  const roomFile = await fetch(`${API}/hotels/room-images/${roomIds[1]}`);
  const roomBytes = Buffer.from(await roomFile.arrayBuffer());
  ok(roomFile.status === 200 && roomBytes.equals(fakeJpeg(1200, 800, 32)) && /immutable/.test(roomFile.headers.get('cache-control') ?? ''),
    'ไฟล์รูปห้องโหลดได้ ตรงกับที่อัป + cache 1 ปี', `${roomFile.status} ${roomFile.headers.get('cache-control')}`);

  const bangkokDay = (offset) => {
    const date = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const quote = await call(`/bookings/quote?roomId=${roomId}&checkIn=${bangkokDay(30)}&checkOut=${bangkokDay(31)}&guests=1&rooms=1`);
  ok(quote.data?.room?.imageUrl === roomImageUrl(roomIds[0]), 'หน้า checkout (quote) ใช้รูปหลักของห้อง', JSON.stringify(quote.data?.room ?? quote.data));
  const adminRoom = (await owner.call(`/admin/hotels/${hotelId}`)).data?.hotel?.rooms?.find((room) => room.id === roomId);
  ok(adminRoom?.coverUrl === roomImageUrl(roomIds[0]) && adminRoom.photoCount === 2, 'หลังบ้าน: รายการห้องมีรูปหลัก + จำนวนรูป', JSON.stringify(adminRoom));

  const roomReorder = await owner.call(`${roomPath}/order`, 'PUT', { imageIds: [...roomIds].reverse() });
  const roomAfterReorder = (await call(`/hotels/${hotelId}`)).data?.rooms?.find((room) => room.id === roomId);
  ok(roomReorder.status === 200 && roomAfterReorder?.imageUrl === roomImageUrl(roomIds[1]), 'เรียงรูปห้องใหม่ → รูปหลักเปลี่ยนตาม');
  for (let i = 3; i <= 5; i += 1) await owner.call(roomPath, 'POST', fakeJpeg(1200, 800, 30 + i));
  const roomSixth = await owner.call(roomPath, 'POST', fakeJpeg(1200, 800, 36));
  ok(roomSixth.status === 409 && /ประเภทห้อง.*5 รูป/.test(roomSixth.data?.message), 'รูปห้องที่ 6 → 409', roomSixth.data?.message);
  const roomRemoved = await owner.call(`${roomPath}/${roomIds[1]}`, 'DELETE');
  ok(roomRemoved.status === 200 && roomRemoved.data.images.map((img) => img.position).join() === '1,2,3,4', 'ลบรูปหลักของห้อง → เหลือ 4 รูป ลำดับต่อกัน');

  const spare = await owner.call(`/admin/hotels/${hotelId}/rooms`, 'POST', { name: 'Spare Photo Room', maxGuests: 2, basePrice: 900, totalRooms: 1 });
  const spareId = spare.data?.room?.id;
  const spareImage = (await owner.call(`/admin/rooms/${spareId}/images`, 'POST', fakeJpeg(1200, 800, 40))).data?.images?.[0]?.id;
  const spareDeleted = await owner.call(`/admin/rooms/${spareId}`, 'DELETE');
  ok(spareDeleted.status === 200 && (await fetch(`${API}/hotels/room-images/${spareImage}`)).status === 404,
    'ลบประเภทห้อง (ยังไม่มีการจอง) → รูปห้องหายตาม (ON DELETE CASCADE)');

  console.log('\n=== 8) ลบโรงแรม → รูปหายตาม ===');
  const someImage = (await owner.call(imagesPath)).data.images[0].id;
  const someRoomImage = (await owner.call(roomPath)).data.images[0].id;
  const deleted = await owner.call(`/admin/hotels/${hotelId}`, 'DELETE');
  ok(deleted.status === 200, 'owner ลบโรงแรมที่ยังไม่มีการจอง', JSON.stringify(deleted.data));
  ok((await fetch(`${API}/hotels/images/${someImage}`)).status === 404, 'รูปของโรงแรมที่ลบแล้วโหลดไม่ได้ (ON DELETE CASCADE)');
  ok((await fetch(`${API}/hotels/room-images/${someRoomImage}`)).status === 404, 'รูปห้องของโรงแรมที่ลบแล้วก็หายตาม (โรงแรม → ห้อง → รูปห้อง)');
} catch (error) {
  failed += 1;
  console.error('ERROR', error.message);
} finally {
  // ล้างข้อมูลทดสอบตรงในฐานข้อมูล (รูปลบตามโรงแรมด้วย ON DELETE CASCADE)
  const userIds = users.map((user) => user.id);
  await db.query('DELETE FROM properties WHERE property_id = ANY($1::int[])', [hotelIds]);
  await db.query(`DELETE FROM admin_audit_log WHERE user_id = ANY($1::int[]) OR (user_id IS NULL AND entity_id = ANY($1::int[]) AND action = 'user.role')`, [userIds]);
  await db.query('DELETE FROM users WHERE user_id = ANY($1::int[])', [userIds]);
  await db.end();
}

console.log(failed ? `\n${failed} FAIL` : '\nผ่านทั้งหมด');
process.exitCode = failed ? 1 : 0;
