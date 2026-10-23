# Hotel Booking (React + Express + PostgreSQL)

เว็บจองโรงแรมแบบ Agoda (โปรเจกต์รายวิชา): ค้นหาตามวัน/จำนวนคน/งบ/สิ่งอำนวยความสะดวก, หน้าโรงแรมพร้อมห้องว่างจริง,
จองหลายห้องในครั้งเดียว (กันจองซ้อนด้วย transaction + row lock), ชำระเงินจำลอง, ยกเลิก/คืนเงิน, รีวิว, รายการโปรด,
ผู้ช่วยแนะนำที่พัก (แชท ทำเองแบบกฎ + คำสำคัญ ไม่ใช้ AI ภายนอก), หลังบ้านเจ้าของโรงแรม/ผู้ดูแลระบบ,
เข้าสู่ระบบด้วยอีเมลหรือ Google / GitHub / Facebook, หน้า PDPA (ขอสำเนาข้อมูล/ลบบัญชี), สองภาษา ไทย/อังกฤษ

## วิธีรันครั้งแรก

ต้องมี: Node.js 20+ และ Docker Desktop

```bash
# 1. เปิด database (สร้างตาราง + ใส่ seed data อัตโนมัติ)
docker compose up -d

# 2. ตั้งค่า server
cp server/.env.example server/.env   # Windows CMD: copy server\.env.example server\.env
# ตั้ง JWT_SECRET เป็นค่าสุ่มที่ยาวอย่างน้อย 32 ตัวอักษรก่อนรัน server
# เข้าสู่ระบบด้วย Google / GitHub / Facebook ไม่บังคับ — ดูหัวข้อด้านล่าง (ยังไม่ตั้ง = กดปุ่มแล้วขึ้นว่ายังไม่เปิด)

# 3. ติดตั้ง package ทั้งหมด (ทำครั้งเดียว)
npm install

# 4. รัน server + หน้าเว็บพร้อมกัน
npm run dev
```

เปิด http://localhost:5173 ถ้าหน้าแรกขึ้นจุดหมายยอดนิยมและรายชื่อโรงแรม (ข้อมูลตัวอย่าง 18 แห่ง) แปลว่าทุกอย่างต่อกันครบ

- เช็ก API: http://localhost:3000/api/health
- SQL ใน `db/` จะทำงานอัตโนมัติเมื่อสร้าง PostgreSQL volume ใหม่เท่านั้น หากมีฐานข้อมูลเดิมต้องสำรองข้อมูลก่อน แล้วจึงใช้ขั้นตอน migration/recreate ที่ทีมตกลงกัน
- `db/03-booking.sql` (ส่วนเพิ่มของระบบจอง), `db/04-demo-data.sql` (ข้อมูลตัวอย่าง), `db/05-admin.sql` (หลังบ้าน) และ `db/06-payment-gateway.sql` (ชำระเงินผ่าน Opn)
  รันซ้ำได้โดยไม่ลบข้อมูลเดิม ถ้ามีฐานข้อมูลอยู่แล้วให้สั่งเพิ่มแค่ไฟล์เหล่านี้ (ตามลำดับ):
  ```bash
  docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/03-booking.sql
  docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/04-demo-data.sql
  docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/05-admin.sql
  docker compose exec -T postgres psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/06-payment-gateway.sql
  ```
- ถ้าเครื่องมี PostgreSQL ตัวอื่นใช้พอร์ต 5432 อยู่แล้ว ให้สร้าง `docker-compose.override.yml` (ไม่ต้อง commit) เปลี่ยนพอร์ต เช่น
  `ports: !override ["5434:5432"]` ใต้ `services.postgres` แล้วแก้ `DATABASE_URL` ใน `server/.env` เป็นพอร์ตเดียวกัน
- ทดสอบ (ต้องเปิด server ก่อน):
  ```bash
  node server/test/concurrent-booking.js   # จองพร้อมกัน 10 คำขอ → สำเร็จเท่าจำนวนห้องพอดี
  node server/test/multi-room.js           # จองหลายห้อง + จองพร้อมกันแบบหลายห้อง
  node server/test/protection.js           # rate limit, จำกัดการจองค้างชำระ, จ่ายผิดซ้ำ, คำหยาบ
  node server/test/favorites.js            # รายการโปรด
  node server/test/payment-methods.js      # วิธีชำระเงิน: บัตร / PromptPay / TrueMoney Wallet (จำลอง)
  node server/test/assistant.js            # ผู้ช่วยแนะนำที่พัก (ส่วนตีความรันได้โดยไม่เปิด server)
  node server/test/admin.js                # หลังบ้าน: สิทธิ์, ห้อง/ปฏิทินราคา, ยกเลิก+คืนเงิน, admin คนสุดท้าย
  ```

## หลังบ้าน (เจ้าของโรงแรม / ผู้ดูแลระบบ)

เปิด http://localhost:5173/admin — ต้องเป็นบัญชีที่มีบทบาท `owner` (จัดการเฉพาะโรงแรมของตัวเอง) หรือ `admin` (ทั้งระบบ)
ตั้ง admin คนแรกด้วยสคริปต์บนเครื่อง server (สมัครสมาชิกผ่านหน้าเว็บก่อน) — คนต่อไปตั้งจากเมนู "ผู้ใช้และสิทธิ์" ได้เลย:

```bash
node --env-file=server/.env server/scripts/set-role.js you@example.com admin
node --env-file=server/.env server/scripts/set-role.js owner@example.com owner --hotels=1,2   # เจ้าของ + ยกโรงแรมให้
```

รายละเอียด (สิทธิ์, API, จุดที่ล็อกแถวกันจองเกิน, PDPA): `docs/admin.md`

## เข้าสู่ระบบด้วย Google / GitHub / Facebook (ไม่บังคับ)

โค้ดพร้อมแล้ว (`server/src/modules/user/routes.js`) ขาดแค่ Client ID / Secret ของแต่ละเจ้า — ช่องไหนยังไม่ตั้ง
กดปุ่มแล้วหน้าเว็บจะบอกว่ายังไม่เปิด ใช้อีเมล + รหัสผ่านได้ตามปกติ สมัครแอปกับแต่ละเจ้าแล้วใส่ callback ตามนี้:

| เจ้า | สมัครที่ | callback (ตอนพัฒนา) | ใส่ใน `server/.env` |
|---|---|---|---|
| GitHub (ง่ายสุด) | github.com → Settings → Developer settings → OAuth Apps → New OAuth App | `http://localhost:3000/api/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Google | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web application) | `http://localhost:3000/api/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Facebook | developers.facebook.com → Create App → เพิ่ม Facebook Login | `http://localhost:3000/api/auth/facebook/callback` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |

- Google: หน้า OAuth consent screen ตั้งเป็น Testing แล้วเพิ่มอีเมลที่จะใช้ทดสอบใน Test users
- Facebook: ตอนแอปเป็นโหมด Development ล็อกอินได้เฉพาะคนที่อยู่ใน App roles (ผู้ดูแล/ผู้ทดสอบของแอป)
- ช่อง `*_CALLBACK_URL` ใน `server/.env` ตั้งไว้แล้ว ต้องตรงกับที่ลงทะเบียนทุกตัวอักษร
- แก้ `server/.env` แล้วต้องปิดเปิด `npm run dev` ใหม่ (server ไม่โหลด `.env` ซ้ำเอง) · **ห้าม commit ค่า Secret**
- อีเมลที่สมัครไว้แล้วจะไม่ถูกรวมบัญชีอัตโนมัติ (กันการยึดบัญชีคนอื่น) → ล็อกอินด้วยรหัสผ่านก่อนแล้วกด "เชื่อมต่อ" ที่หน้าโปรไฟล์

## ชำระเงินผ่าน Opn Payments (โหมดทดสอบ · ไม่บังคับ · ฟรี)

ตอนนี้ต่อจริงเฉพาะ **TrueMoney Wallet** (บัตร/PromptPay ยังเป็นแบบจำลอง) — ไม่ตั้ง key ระบบใช้การชำระเงินแบบจำลองตามเดิม

1. สมัครฟรีที่ https://dashboard.omise.co (Opn Payments) → เมนู **Keys** คัดลอก key โหมด **Test** (`skey_test_…`, `pkey_test_…`)
2. วางใน `server/.env` ช่อง `OMISE_SECRET_KEY` / `OMISE_PUBLIC_KEY` แล้วบันทึก (server รีสตาร์ตเอง) · **ห้าม commit**
3. ฐานข้อมูลเดิมรัน `db/06-payment-gateway.sql` (คำสั่งเดียวกับไฟล์ 03–05)
4. ลองจอง → ชำระเงิน → TrueMoney Wallet → หน้าของ Opn เลือก **Successful** (หรือ Failed) → กลับมาหน้าเว็บเป็น "ชำระแล้ว"
   ยกเลิกการจองแล้วระบบสั่งคืนเงินที่ Opn ให้เอง (ดูใน dashboard ได้)

โหมดทดสอบไม่มีการตัดเงินจริงและไม่มีค่าใช้จ่าย · ยอดขั้นต่ำต่อครั้ง ฿20 · รายละเอียดและเหตุผลของแต่ละขั้น: `docs/booking.md` ข้อ 12

## Deploy (Docker production)

build หน้าเว็บแล้วให้ Express เสิร์ฟทั้ง API และหน้าเว็บจาก container เดียว + PostgreSQL อีก container

```bash
# 1. ตั้งค่าความลับ (ห้าม commit .env.production)
copy .env.production.example .env.production   # macOS/Linux: cp
#    แก้ POSTGRES_PASSWORD และ JWT_SECRET เป็นค่าสุ่มยาวๆ

# 2. build + รัน
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 3. เปิด http://localhost:8080  ·  หยุด: ... down  (เพิ่ม -v = ลบฐานข้อมูล production ทิ้งด้วย)
```

- ฐานข้อมูลสร้างตาราง + ข้อมูลตัวอย่างจาก `db/` อัตโนมัติครั้งแรก และไม่เปิดพอร์ตออกนอกเครื่อง
- ใช้งานจริงต้องเป็น **HTTPS** (คุกกี้ล็อกอินเป็น `Secure` เมื่อ `NODE_ENV=production`) — อยู่หลัง reverse proxy
  (Nginx / Caddy / Render ฯลฯ) ให้ตั้ง `TRUST_PROXY=1` และ `PUBLIC_URL` เป็นโดเมนจริง
- เข้าสู่ระบบด้วย Google / GitHub / Facebook บน production: ใส่ Client ID / Secret ใน `.env.production`
  แล้วลงทะเบียน callback กับแต่ละเจ้าเป็น `<PUBLIC_URL>/api/auth/<google|github|facebook>/callback` (ระบบต่อ URL ให้เอง)
- ตั้ง admin คนแรกบน production:
  `docker compose -f docker-compose.prod.yml --env-file .env.production exec app node server/scripts/set-role.js <email> admin`
- รายละเอียด: `docs/booking.md` ข้อ 11

## ใครดูแลโฟลเดอร์ไหน (ทีม 2 คน)

| | ขอบเขต | Server | Client |
|---|---|---|---|
| คนที่ 1 | ค้นหา, หน้าโรงแรม, จอง, ชำระเงิน, รีวิว, รายการโปรด, ผู้ช่วยแนะนำที่พัก, หลังบ้าน (แอดมิน/เจ้าของโรงแรม), PDPA, UI กลาง, DB, deploy | `modules/search/`, `modules/booking/`, `modules/favorites/`, `modules/assistant/`, `modules/admin/`, `modules/privacy/`, `lib/`, `scripts/`, `db/` | `pages/search/`, `pages/booking/`, `pages/admin/`, `pages/legal/`, `components/`, `lib/`, `styles.css` |
| คนที่ 2 | สมัครสมาชิก / เข้าสู่ระบบ (JWT, Google ฯลฯ) | `modules/user/`, `middleware/auth.js` | `pages/user/` |

ไฟล์กลางที่ใช้ร่วมกัน (`server/src/index.js`, `client/src/App.jsx`, `client/src/api.js`,
`package.json`) แก้ได้ แต่ต้องแจ้งอีกคนก่อน

สเปกงานละเอียดอยู่ใน `docs/` · คู่มือสำหรับ Claude Code อยู่ที่ `CLAUDE.md`

## กติกา

- ห้าม push เข้า `main` ตรงๆ — แตก branch เช่น `feature/booking-checkout` แล้วเปิด PR ให้อีกคน review
- API ตอบ error เป็น `{ "message": "..." }` เสมอ
- วันที่ส่งเป็น `YYYY-MM-DD`, ราคาเป็นบาท, ราคาคำนวณที่ server เสมอ
- API ที่ต้องล็อกอินใส่ `requireAuth` (JWT ใน cookie, ดู `middleware/auth.js`) แล้วใช้ `req.user.id` กรองข้อมูลของผู้ใช้เสมอ
- แก้ `db/*.sql` เมื่อไหร่ ต้องแจ้งอีกคน — `03-booking.sql`, `04-demo-data.sql`, `05-admin.sql`, `06-payment-gateway.sql` รันซ้ำด้วย `psql -f` ได้เลยไม่เสียข้อมูล
  (ดูด้านบน) ส่วน `01`/`02` ต้องสร้างฐานข้อมูลใหม่ด้วย `docker compose down -v && docker compose up -d` (ข้อมูลเดิมหายหมด)
- หา `TODO(...)` ในโค้ดเพื่อดูว่าต้องทำอะไรต่อ
