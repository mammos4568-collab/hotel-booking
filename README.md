# Hotel Booking (React + Express + PostgreSQL)

## วิธีรันครั้งแรก

ต้องมี: Node.js 20+ และ Docker Desktop

```bash
# 1. เปิด database (สร้างตาราง + ใส่ seed data อัตโนมัติ)
docker compose up -d

# 2. ตั้งค่า server
cp server/.env.example server/.env   # Windows CMD: copy server\.env.example server\.env

# 3. ติดตั้ง package ทั้งหมด (ทำครั้งเดียว)
npm install

# 4. รัน server + หน้าเว็บพร้อมกัน
npm run dev
```

เปิด http://localhost:5173 ถ้าเห็นรายชื่อโรงแรม 5 แห่ง แปลว่าทุกอย่างต่อกันครบ

- เช็ก API: http://localhost:3000/api/health
- ถ้าแก้ `db/schema.sql` หรือ `db/seed.sql` ต้องล้าง DB แล้วสร้างใหม่: `docker compose down -v && docker compose up -d`

## ใครดูแลโฟลเดอร์ไหน

| คน | Module | Server | Client |
|---|---|---|---|
| A | ค้นหา & หน้าโรงแรม | `server/src/modules/search/` | `client/src/pages/search/`, `components/`, `styles.css` |
| B | จอง & ชำระเงิน | `server/src/modules/booking/` | `client/src/pages/booking/` |
| C | ผู้ใช้ & รีวิว | `server/src/modules/user/`, `middleware/auth.js` | `client/src/pages/user/` |
| D | หลังบ้าน | `server/src/modules/admin/` | `client/src/pages/admin/` |

`db/` เจ้าของคือ D — ใครจะแก้ schema ต้องแจ้งทีมก่อน

## กติกา

- ห้าม push เข้า `main` ตรงๆ — แตก branch เช่น `feature/booking-checkout` แล้วเปิด PR ให้เพื่อน review 1 คน
- API ตอบ error เป็น `{ "message": "..." }` เสมอ
- วันที่ส่งเป็น `YYYY-MM-DD`, ราคาเป็นบาท
- ระหว่างที่ login ยังไม่เสร็จ `req.user` จะเป็น user id 1 เสมอ (ดู `middleware/auth.js`)
- หา `TODO(ตัวอักษรของคุณ)` ในโค้ดเพื่อดูว่าต้องทำอะไรต่อ
