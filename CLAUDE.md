# CLAUDE.md — คู่มือสำหรับ Claude Code ในโปรเจกต์นี้

โปรเจกต์กลุ่ม **2 คน**: เว็บจองโรงแรมคล้าย Agoda (วิชาเรียน)
Stack: **React (Vite + Tailwind v4) + Express + PostgreSQL 15** รันผ่าน Docker

---

## ใครทำอะไร

| | ขอบเขต | ไฟล์ |
|---|---|---|
| **ผู้ใช้เครื่องนี้ (ตัวหลัก)** | ค้นหา, หน้าโรงแรม, **จอง, ชำระเงิน**, การจองของฉัน, รีวิว, รายการโปรด, ผู้ช่วยแนะนำที่พัก, **หลังบ้าน (แอดมิน/เจ้าของโรงแรม)**, PDPA, UI กลาง, ฐานข้อมูล, deploy | `server/src/modules/search/`, `server/src/modules/booking/`, `server/src/modules/favorites/`, `server/src/modules/assistant/`, `server/src/modules/admin/`, `server/src/modules/privacy/`, `server/src/lib/`, `server/scripts/`, `server/test/`, `client/src/pages/search/`, `client/src/pages/booking/`, `client/src/pages/admin/`, `client/src/pages/legal/`, `client/src/components/`, `client/src/context/FavoritesContext.jsx`, `client/src/lib/`, `client/src/styles.css`, `db/` (เฉพาะ `03-` ถึง `10-`), `Dockerfile`, `docker-compose.prod.yml`, `Caddyfile` |
| **เพื่อนอีกคน** | สมัครสมาชิก/เข้าสู่ระบบ (JWT) | `server/src/modules/user/`, `server/src/middleware/auth.js`, `client/src/pages/user/` |

> **ห้ามแก้ไฟล์ของเพื่อน** (`modules/user/`, `middleware/auth.js`, `pages/user/`)
> ถ้าคิดว่าจำเป็นต้องแก้ ให้**หยุดแล้วบอกผู้ใช้ก่อน**
> จะได้ไปคุยกับเพื่อน ไม่งั้นจะชนกันตอน merge

ไฟล์กลางที่ใช้ร่วมกัน — แก้ได้แต่ต้องบอกผู้ใช้ก่อนทุกครั้ง:
`server/src/index.js`, `client/src/App.jsx`, `client/src/api.js`, `package.json`, `.gitignore`

> งานในไฟล์ของเพื่อนที่ผู้ใช้สั่งให้ทำแทนแล้ว: rate limit ล็อกอิน, ข้อความไทยใน `modules/user/` + `middleware/auth.js`,
> แจ้ง PDPA ใน `AuthModal.jsx`, ปุ่มเข้าสู่ระบบที่ยังไม่ตั้งค่าให้พากลับหน้าเว็บพร้อมข้อความ
> (`modules/user/routes.js`, `AuthModal.jsx`, `pages/user/ProfilePage.jsx`), แปลหน้าเข้าสู่ระบบ + หน้าโปรไฟล์เป็น 2 ภาษา
> และแก้บันทึกโปรไฟล์ตอนไม่ใส่รูปไม่ได้ (`ProfilePage.jsx` ส่ง `avatarUrl: null`),
> `splitName()` ใน `modules/user/routes.js` ให้ชื่อคำเดียวได้นามสกุล `''` (`users.last_name` เป็น NOT NULL —
> เดิมสมัคร/ล็อกอิน GitHub ด้วยชื่อคำเดียวแล้ว error) · **หลังบ้านแอดมิน** (`modules/admin/`, `pages/admin/`) เดิมเป็นของเพื่อน
> ผู้ใช้สั่งให้ทำเองทั้งหมดเมื่อ 22 ต.ค. 2569 จึงย้ายมาเป็นงานของผู้ใช้แล้ว · **ตัดเข้าสู่ระบบด้วย Facebook ออก** (เหลือ Google / GitHub)
> และให้ error ของ Google บอกสาเหตุ — `modules/user/routes.js`, `AuthModal.jsx`, `ProfilePage.jsx` (23 ต.ค. 2569)
> · **รูปโปรไฟล์อัปจากเครื่อง** — `modules/user/avatar.js` (ไฟล์ใหม่), `modules/user/routes.js` (ผูก route + `PUT /me` ไม่รับลิงก์รูปแล้ว),
> `ProfilePage.jsx` (ช่องลิงก์ → ปุ่มเลือกรูปจากเครื่อง/ลบรูป) (24 ต.ค. 2569)

สเปกงานละเอียด: `docs/booking.md` (จอง/ชำระเงิน/รายการโปรด/deploy) · `docs/search.md` (ค้นหา/หน้าโรงแรม) ·
`docs/assistant.md` (ผู้ช่วยแนะนำที่พัก) · `docs/admin.md` (หลังบ้าน)
**อ่านไฟล์ที่เกี่ยวข้องก่อนเริ่มเขียนโค้ดเสมอ**

---

## กฎสำคัญ

1. **ห้าม commit ลง `main` ตรงๆ** ทำงานบน branch แล้วเปิด PR
2. **ห้าม commit ไฟล์ `.env`** (อยู่ใน .gitignore แล้ว)
3. แก้ไฟล์ใน `db/` เมื่อไหร่ **ต้องบอกผู้ใช้ให้แจ้งเพื่อน**
   - `01-schema.sql`, `02-datas.sql` เป็นของทีม — อย่าแก้ ถ้าต้องเพิ่มตาราง/คอลัมน์ให้เพิ่มในไฟล์ใหม่
     แบบ `03-booking.sql` (ใช้ `IF NOT EXISTS` ให้รันซ้ำได้)
   - `03-booking.sql`, `04-demo-data.sql`, `05-admin.sql`, `06-payment-gateway.sql`, `07-hotel-images.sql`, `08-hotel-approval.sql`, `09-room-images.sql`, `10-user-avatars.sql` รันซ้ำได้ เพื่อนอัปเดตด้วย `psql -f` ได้เลยโดยไม่ต้องลบข้อมูล (ดูวิธีรัน)
4. ผู้ใช้เป็นนักศึกษาและกำลังเรียนอยู่ — โค้ดส่วนสำคัญ (ทรานแซกชัน, การล็อกแถว,
   การกันจองซ้อน) ให้**อธิบายเหตุผลสั้นๆ** ว่าทำไมต้องเขียนแบบนี้ ไม่ใช่โยนโค้ดให้เฉยๆ
   โปรเจกต์นี้ต้องพรีเซนต์ ผู้ใช้ต้องตอบคำถามอาจารย์ได้ทุกบรรทัด
5. ตอบเป็น**ภาษาไทย** โค้ดและชื่อตัวแปรเป็นภาษาอังกฤษ คอมเมนต์ในโค้ดภาษาไทยได้
6. **อย่าเพิ่ม dependency ใหม่โดยไม่ถาม** (ตอนนี้ server มี `express`, `pg`, `cors`, `bcryptjs`, `qrcode` (วาดรูป QR พร้อมเพย์) ·
   client มี `react`, `react-router-dom`, `tailwindcss` — ไอคอนใช้ `components/Icon.jsx` ไม่ต้องลง library)
   และ**อย่าติดตั้ง ORM** — ทีมใช้ `pg` เขียน SQL ตรงๆ เพื่อให้อธิบายได้ตอนพรีเซนต์

---

## วิธีรัน

```bash
docker compose up -d     # เปิด PostgreSQL (container agoda_postgres_db)
npm install              # ครั้งแรกครั้งเดียว
npm run dev              # server :3000 + client :5173 พร้อมกัน
node server/test/concurrent-booking.js   # ทดสอบจองพร้อมกัน (เปิด server ก่อน)
node server/test/multi-room.js           # จองหลายห้อง + จองพร้อมกันแบบหลายห้อง
node server/test/protection.js           # ทดสอบ rate limit / เพดานจองค้าง / จ่ายผิด / คำหยาบ
node server/test/favorites.js            # รายการโปรด
node server/test/payment-methods.js      # วิธีชำระเงิน บัตร / PromptPay / TrueMoney Wallet (จำลอง · ตั้ง key Opn แล้วทดสอบผ่าน Opn + จำลองว่าลูกค้าจ่าย PromptPay)
node server/test/promptpay.js            # PromptPay เงินจริง 19 ข้อ (ข้อความใน QR + เฉพาะ admin · ส่วน admin ต้องตั้ง PROMPTPAY_ID)
node server/test/assistant.js            # ผู้ช่วยแนะนำที่พัก (~120 ข้อ · ส่วนตีความไม่ต้องเปิด server)
node server/test/admin.js                # หลังบ้าน 76 ข้อ (อ่าน server/.env เอง เพื่อตั้ง admin + ล้างข้อมูลทดสอบ)
node server/test/avatar.js               # รูปโปรไฟล์ 18 ข้อ (ตรวจไฟล์, ลิงก์รหัสสุ่ม, สำเนาข้อมูล, ลบบัญชี · อ่าน server/.env เอง)
node server/test/hotel-images.js         # รูปโรงแรม + รูปห้อง 43 ข้อ (สูงสุด 5 รูป, ตรวจไฟล์, อัปพร้อมกัน · อ่าน server/.env เอง)
node server/test/hotel-approval.js       # อนุมัติโรงแรม + คำหยาบ/ทับศัพท์ 56 ข้อ (อ่าน server/.env เอง)
node --env-file=server/.env server/scripts/set-role.js <email> admin   # ตั้ง/ถอด admin ได้ทางนี้ทางเดียว (owner: เพิ่ม --hotels=1,2)
```

- หน้าเว็บ http://localhost:5173 (vite proxy `/api` ไปที่ :3000 ให้แล้ว)
- เช็ก API http://localhost:3000/api/health
- เข้า psql: `docker compose exec postgres psql -U agoda_admin -d agoda_db`
- อัปเดต DB เดิมด้วยไฟล์ที่รันซ้ำได้ (ไม่ลบข้อมูล):
  `docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/03-booking.sql` (และ 04–10)
- `docker compose down -v` = **ลบข้อมูลทั้งหมด** ใช้เมื่อผู้ใช้สั่งเท่านั้น
- production: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` → http://localhost:8080
  (project แยกชื่อ `hotel-booking-prod` มี volume ของตัวเอง · `.env.production` ไม่ commit · ดู README หัวข้อ Deploy)
- ขึ้น VPS จริง (HTTPS): ตั้ง `PUBLIC_URL=https://<โดเมน>` + `TRUST_PROXY=1` แล้วเพิ่ม `--profile https`
  (Caddy ทำ HTTPS ให้ · แอปผูกพอร์ตกับ `127.0.0.1`) — ขั้นตอนเต็มที่ `docs/deploy-vps.md`

เครื่องนี้เป็น Windows — ใช้ `copy` ไม่ใช่ `cp`, ใช้ `cd /d D:\hotel-booking` เวลาเปลี่ยนไดรฟ์
เครื่องนี้มี PostgreSQL ของ Windows ใช้พอร์ต 5432 อยู่ → `docker-compose.override.yml` (ไม่ commit)
ย้าย DB ของโปรเจกต์ไปพอร์ต **5434** และ `server/.env` ชี้ไป `localhost:5434` แล้ว
ใน Git Bash ต้อง `export MSYS_NO_PATHCONV=1` ก่อนสั่ง `docker exec ... -f /docker-entrypoint-initdb.d/...` ไม่งั้น path เพี้ยน

---

## ข้อตกลงร่วม

- API ตอบ error เป็น `{ "message": "ข้อความภาษาไทย" }` เสมอ (จัดการรวมที่ `server/src/index.js`)
- วันที่รับ–ส่งเป็น string `YYYY-MM-DD` (ไม่ใช่ ISO timestamp)
- ราคาเป็นบาท เก็บเป็น `NUMERIC(10,2)` ส่งออกเป็น number
- **ราคาคำนวณที่ server เสมอ** ห้ามเชื่อราคาที่ client ส่งมา
- login จริงแล้ว (ของเพื่อน): `requireAuth` อ่าน JWT จาก cookie `hotel_session` แล้วใส่ `req.user`
  (`id`, `name`, `email`, `phone`, `role`) — endpoint ที่เป็นข้อมูลส่วนตัวต้องกรองด้วย `req.user.id` เสมอ
- หน้าเว็บเรียก API ผ่าน `api()` จาก `client/src/api.js` เท่านั้น อย่าใช้ `fetch` ตรงๆ
  (`body` เป็น object → ส่ง JSON · เป็น Blob/ไฟล์ → ส่งไบต์ตรงๆ ตามชนิดไฟล์ ใช้ตอนอัปรูป)
- ข้อความสองภาษาในหน้าเว็บใช้ `tx('ไทย', 'English')` จาก `useLanguage()` · ราคาแสดงผ่าน `formatPrice()`
- ห้องว่าง/ราคา คำนวณที่ `server/src/lib/availability.js` ที่เดียว (ค้นหา, หน้าโรงแรม, จอง ใช้ร่วมกัน)
  — นับห้องที่ถูกจองด้วย `SUM(num_rooms)` (การจองหนึ่งจองได้ 1–5 ห้อง)
- SQL ค้นหาโรงแรมอยู่ที่ `searchHotels()` ใน `server/src/lib/hotelSearch.js` ที่เดียว — หน้าค้นหาและผู้ช่วยใช้ร่วมกัน
  จุดเที่ยว + พิกัดอยู่ที่ `lib/landmarks.js` · วิว/บรรยากาศ (ค้นจากคำอธิบาย) อยู่ที่ `lib/hotelFeatures.js`
- ผู้ช่วยแนะนำที่พักทำเองแบบกฎ + คำสำคัญ (ไม่ใช้ AI ภายนอก ไม่มี API key) · คำใหม่เพิ่มที่
  `modules/assistant/lexicon.js` แล้วเพิ่มประโยคทดสอบใน `server/test/assistant.js` · ไม่บันทึกข้อความแชท
- endpoint ใหม่ที่รับข้อความจากผู้ใช้หรือทำงานหนัก ให้ใส่ `rateLimit()` (`lib/rateLimit.js`) และ
  ข้อความที่คนอื่นจะเห็นให้ตรวจด้วย `containsProfanity()` / middleware `rejectProfanity()` (`lib/moderation.js`)
  — ความคิดเห็นรีวิวกรองแบบครอบ route ใน `index.js` อยู่แล้ว
- PDPA: เก็บข้อมูลส่วนบุคคลเท่าที่จำเป็น · ห้าม log body/cookie/ข้อมูลส่วนตัว · เปลี่ยนวิธีเก็บ/ใช้ข้อมูลเมื่อไหร่
  ต้องแก้หน้า `client/src/pages/legal/PrivacyPage.jsx` ให้ตรงด้วย · ขอสำเนาข้อมูล/ลบบัญชีอยู่ที่ `modules/privacy/`
  (ข้อมูลใหม่ที่ผูกกับผู้ใช้ต้องใส่ใน export และจัดการตอนลบบัญชีด้วย) · สรุปงาน PDPA อยู่ที่ `docs/booking.md` ข้อ 9
- รูปโปรไฟล์: อัป/ลบที่ `PUT/DELETE /api/auth/me/avatar` เท่านั้น (`modules/user/avatar.js` · ตาราง `user_avatars`) · เบราว์เซอร์ย่อเป็น
  400×400 (`resizeAvatar()`) · ไฟล์เสิร์ฟด้วยรหัสสุ่ม `/api/auth/avatars/<uuid>` — **อย่าทำ URL รูปตามเลขผู้ใช้** (ไล่ดึงรูปทุกคนได้)
  · แสดงรูปผู้ใช้ด้วย `components/UserAvatar.jsx` (ไม่มีรูป/โหลดไม่ได้ → ตัวอักษรแรกของชื่อ)
- หลังบ้าน `/api/admin`: ทุกเส้นผ่าน `requireRole('owner', 'admin')` · owner จำกัดเฉพาะโรงแรมตัวเองด้วย `ownedBy()` /
  `loadHotel()` / `loadRoom()` ใน `modules/admin/scope.js` · ทุกการแก้ไขเรียก `logAction()` ใน transaction เดียวกับงาน
  (ห้ามใส่ข้อมูลส่วนตัวลูกค้าใน detail) · แก้จำนวนห้อง/ปฏิทินต้องล็อกแถว `rooms` ก่อนนับการจอง (แบบเดียวกับตอนจอง)
  · **ตั้ง/ถอด admin ด้วย `server/scripts/set-role.js` เท่านั้น** — API/หน้าเว็บเปลี่ยนได้แค่ลูกค้า ↔ เจ้าของโรงแรม
  (แตะบัญชี admin = 403 · อย่าเพิ่มทางตั้ง admin ผ่านเว็บ) · กฎ "เหลือ admin ≥ 1 คน" อยู่ในสคริปต์ — ดู `docs/admin.md`
- ชำระเงินจริงผ่าน Opn Payments (ตั้ง `OMISE_SECRET_KEY` = เปิด · TrueMoney + PromptPay): สถานะ "จ่ายแล้ว" ต้องมาจากการ
  ดึงรายการจาก Opn ด้วย secret key เท่านั้น (`retrieveCharge`) ห้ามเชื่อ query string หรือข้อมูลใน webhook ·
  อัปเดตผลผ่าน `applyGatewayCharge()` ใน transaction ที่ล็อกแถวการจองเสมอ · ยกเลิก = คืนเงินที่ Opn ก่อนแก้ DB — ดู `docs/booking.md` ข้อ 12
  · PromptPay ผ่าน Opn: QR หมดอายุก่อนเวลาถือห้อง 1 นาที (`promptpayExpiry()`) · หน้าเว็บถามผลด้วย `POST /:id/pay/verify { method }`
  ทุก 4 วินาที (ไม่ต้องอัปสลิป/กดยืนยัน) · **Opn คืนเงิน PromptPay ไม่ได้** → ห้ามเรียก `refundCharge` กับ PromptPay ใช้ `opnCanRefund()` /
  `needsManualRefund()` (ยกเลิกแล้วต้องโอนคืนเอง หน้าเว็บเตือนจาก `payment.manualRefund`) · ส่ง secret key ไปเฉพาะ `https://api.omise.co`
  (รูป QR ขอเป็น PNG · ลิงก์ดาวน์โหลดรูปไม่ต้องใช้ key → ไม่แนบ)
- PromptPay เงินจริง (ตั้ง `PROMPTPAY_ID` = เปิด): **เฉพาะ admin กับการจองของตัวเอง** — ห้ามเปิดให้ลูกค้าทั่วไป (เว็บเป็นโรงแรมสมมติ) ·
  ข้อความใน QR สร้างที่ `lib/promptpay.js` (EMVCo + CRC) ยอดจาก server เสมอ · ธนาคารไม่แจ้งผล → admin ยืนยันเองด้วย
  `POST /:id/pay { method: "promptpay_live" }` (ผ่านล็อกแถวการจองเหมือนวิธีอื่น) · ยกเลิกแล้วต้องโอนคืนเอง — ดู `docs/booking.md` ข้อ 13
- จ่ายด้วยบัตร (จำลอง) รับเฉพาะบัตรทดสอบ — รายการ `TEST_CARDS` มี 2 ที่ต้องตรงกัน: `modules/booking/routes.js` (ตรวจซ้ำ)
  และ `pages/booking/PaymentPage.jsx` (บล็อกก่อนส่ง → เลขบัตรจริงไม่ออกจากเบราว์เซอร์)
- รูปโรงแรม + รูปประเภทห้อง (อย่างละสูงสุด 5 รูป): เบราว์เซอร์ครอป/ย่อเป็น 1200×800 JPEG (`client/src/lib/imageResize.js`) · server ตรวจซ้ำด้วย
  `checkHotelImage()` · เก็บในตาราง `property_images` / `room_images` · SELECT ที่แสดงรูปโรงแรมให้ใช้ `hotelCoverSql()` รูปห้องใช้ `roomCoverSql()` จาก
  `lib/hotelImages.js` (รูปอัปโหลดลำดับแรก ไม่มีใช้ `image_url`) อย่าเลือก `p.image_url` / `r.image_url` ตรงๆ — ดู `docs/admin.md` หัวข้อรูปโรงแรม
  · API หลังบ้านของรูปทั้งสองแบบมาจาก `photoRouter()` ตัวเดียวใน `modules/admin/hotelImages.js` · หน้าเพิ่มโรงแรม/เพิ่มห้องเก็บรูปที่เลือกไว้
  ในเบราว์เซอร์ แล้วอัป "ทีละรูปตามลำดับ" หลังบันทึกเสร็จ (`PhotoDraft` + `uploadDraftPhotos()` ใน `pages/admin/HotelPhotos.jsx`)
- อนุมัติโรงแรม: owner เพิ่ม = `pending` · admin เพิ่ม = `approved` · อนุมัติครั้งเดียวตอนสร้าง (admin ระงับได้ตลอด) ·
  **query ฝั่งลูกค้าทุกตัวที่แตะ `properties` ต้องมี `publicHotelSql()` จาก `lib/hotelApproval.js`** (ค้นหา, หน้าโรงแรม, จอง, ขอราคา,
  รายการโปรด, ผู้ช่วย) — ประวัติการจองของลูกค้าเองไม่ต้องกรอง · ข้อความโรงแรม/ห้องผ่าน `findProfanity()` (บล็อก) และ
  `findSuspiciousWords()` (เตือน admin) ใน `lib/moderation.js` — คำใหม่เพิ่มที่รายการในไฟล์นั้น + ประโยคทดสอบใน `test/hotel-approval.js`

---

## โครงฐานข้อมูล (ของจริงดูที่ `db/01-schema.sql` + `db/03-booking.sql`)

```
users(user_id, first_name, last_name, email, password_hash, phone_number, avatar_url, role, ...)   -- role ∈ user|owner|admin
properties(property_id, name, property_type, description, country, city, address,
           latitude, longitude, star_rating, image_url*, amenities*, owner_id†,
           approval_status¶, approval_note¶, submitted_at¶, reviewed_at¶, reviewed_by¶)  -- = โรงแรม (owner_id = เจ้าของ)
rooms(room_id, property_id, room_type_name, description, max_guests,
      base_price_per_night, total_rooms, image_url*, bed_type*, size_sqm*, breakfast_included*)
                                                                            -- = ประเภทห้อง (มีห้องจริง total_rooms ห้อง)
room_inventories(room_id, date, available_rooms, price)                     -- ปรับราคา/จำนวนเปิดขายรายวัน
bookings(booking_id, booking_reference, user_id, property_id, room_id,
         check_in_date, check_out_date, num_guests, num_rooms*, total_amount,
         payment_status, booking_status, guest_name*, guest_email*, guest_phone*, special_requests*, ...)
payments*(payment_id, booking_id, amount, method, card_last4, status, paid_at, gateway_charge_id‡)  -- status: Success|Failed|Refunded|Pending
                                                                            -- method: card|promptpay|promptpay_live|truemoney
favorites*(user_id, property_id, created_at)                                -- รายการโปรด PK (user_id, property_id)
reviews(review_id, booking_id UNIQUE, user_id, property_id, rating, comment, ...)
oauth_accounts(...)                                                         -- ของเพื่อน (login ผ่าน Google ฯลฯ)
admin_audit_log†(log_id, user_id, action, entity_id, detail JSONB, created_at)  -- บันทึกการทำงานหลังบ้าน
property_images§(image_id, property_id, position, mime_type, data BYTEA, byte_size, created_at)  -- รูปโรงแรม ลำดับ 1–5 ไม่ซ้ำ
room_images◊(image_id, room_id, position, mime_type, data BYTEA, byte_size, created_at)  -- รูปประเภทห้อง ลำดับ 1–5 ไม่ซ้ำ
user_avatars△(user_id PK, avatar_key UUID, mime_type, data BYTEA, byte_size, updated_at)  -- รูปโปรไฟล์ 1 คน 1 รูป
```
`*` = เพิ่มใน `03-booking.sql` · `†` = เพิ่มใน `05-admin.sql` · `‡` = เพิ่มใน `06-payment-gateway.sql` · `§` = เพิ่มใน `07-hotel-images.sql` · `¶` = เพิ่มใน `08-hotel-approval.sql` · `◊` = เพิ่มใน `09-room-images.sql` · `△` = เพิ่มใน `10-user-avatars.sql`

**สิ่งที่ต้องรู้เกี่ยวกับ `bookings`:**

- ช่วงวันเป็นแบบ `[check_in_date, check_out_date)` — **ไม่นับคืนวัน check_out**
  คนหนึ่งเช็กเอาต์วันที่ 12 อีกคนเช็กอินวันที่ 12 ได้ ไม่ถือว่าทับกัน
- `payment_status` ∈ `Pending` | `Paid` | `Refunded` | `Expired` · `booking_status` ∈ `Confirmed` | `Cancelled` | `Completed`
- การจองที่ยังไม่จ่ายถือห้องไว้ **15 นาที** (`HOLD_MINUTES`) เกินแล้วไม่นับว่ากินห้อง
- การจองหนึ่ง = `num_rooms` ห้อง (1–5) ของประเภทเดียวกัน · ราคารวม = ราคาต่อห้อง × จำนวนห้อง ·
  ต้อง `num_guests <= max_guests × num_rooms` และ `num_rooms <= num_guests`
- **กันจองซ้อน:** ตอนจองต้อง `SELECT ... FROM rooms WHERE room_id = $1 FOR UPDATE` (ล็อกประเภทห้อง)
  ใน transaction เดียวกับการนับห้องว่างและ INSERT — ดูเหตุผลเต็มใน `docs/booking.md`
  **ห้ามเขียน INSERT bookings ที่อื่นโดยไม่ผ่านล็อกนี้**

ข้อมูลทดสอบ: `02-datas.sql` (ของทีม: 3 โรงแรม, ผู้ใช้ 3 คน — รหัสผ่านเป็นค่าหลอก ล็อกอินไม่ได้) +
`04-demo-data.sql` (เพิ่มเป็น 18 โรงแรม, 41 ประเภทห้อง, รีวิว, ราคาสุดสัปดาห์ +15% / ปีใหม่ +40%)
ผู้ใช้ทดสอบให้สมัครใหม่ผ่านหน้าเว็บ หรือให้สคริปต์ทดสอบสมัครเอง (อีเมล `@example.test`)

---

## Git

```bash
git checkout -b feature/booking          # ตั้งชื่อตามงาน เช่น feature/search
git add . && git commit -m "feat(booking): ..."
git push -u origin feature/booking
```

- commit message: `feat(...)` / `fix(...)` / `test(...)` วงเล็บใส่ชื่อ module
- ก่อนเริ่มงานใหม่ทุกครั้ง: `git checkout main && git pull && git checkout <branch> && git merge main`

---

## แนวทางการทำงาน

- งานใหญ่ให้แตกเป็นขั้นย่อย ทำทีละขั้น ให้ผู้ใช้ตรวจก่อนไปต่อ
- เขียน endpoint เสร็จ ให้เสนอคำสั่งทดสอบ (`curl` หรือสคริปต์) ด้วยเสมอ
- งานที่ทำแล้วให้ติ๊ก `- [x]` ในไฟล์ `docs/*.md` ที่เกี่ยวข้อง
