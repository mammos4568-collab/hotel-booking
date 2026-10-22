import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import searchRoutes from './modules/search/routes.js';
import bookingRoutes from './modules/booking/routes.js';
import userRoutes from './modules/user/routes.js';
import adminRoutes from './modules/admin/routes.js';
import reviewRoutes from './modules/reviews/routes.js';
import privacyRoutes from './modules/privacy/routes.js';
import assistantRoutes from './modules/assistant/routes.js';
import favoriteRoutes from './modules/favorites/routes.js';
import { rejectProfanity } from './lib/moderation.js';
import { rateLimit } from './lib/rateLimit.js';


const app = express();
app.disable('x-powered-by'); // ไม่บอกคนนอกว่าใช้ Express

// อยู่หลัง reverse proxy (Nginx/Caddy/Render ฯลฯ) ต้องตั้ง TRUST_PROXY=1
// ไม่งั้น req.ip จะเป็น IP ของ proxy → rate limit นับทุกคนรวมเป็นคนเดียว
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}

// header ความปลอดภัยพื้นฐาน (ไม่ต้องลง library เพิ่ม)
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',            // ห้ามเบราว์เซอร์เดาชนิดไฟล์เอง
    'X-Frame-Options': 'DENY',                      // ห้ามเว็บอื่นเอาหน้าเราไปใส่ iframe (กัน clickjacking)
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

const allowedClientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === allowedClientOrigin) return callback(null, true);
    const error = new Error('ไม่อนุญาตให้เรียก API จากเว็บไซต์นี้');
    error.status = 403;
    callback(error);
  },
  credentials: true,
}));
app.use(express.json());


// เช็กว่า server + DB ต่อกันได้
// (ต้องมี try/catch — Express 4 ไม่จับ error ของ async ให้ ถ้า DB ล่มจะทำให้ server ทั้งตัว crash)
app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// แต่ละ module ต่อเข้าที่นี่ — ไฟล์นี้แทบไม่ต้องแก้อีก
app.use('/api/hotels', searchRoutes);   // A
app.use('/api/bookings', bookingRoutes); // B
// กันเดารหัสผ่าน / สมัครสแปม — ใส่ก่อนถึง module ผู้ใช้ (ไม่ต้องแก้ไฟล์ของ module)
//   ล็อกอิน: ต่ออีเมล 10 ครั้ง / 15 นาที (กันเดารหัสบัญชีเดียว) + ต่อ IP 50 ครั้ง / 15 นาที
//   สมัครสมาชิก: ต่อ IP 50 ครั้ง / 15 นาที
const FIFTEEN_MINUTES = 15 * 60_000;
const loginPerEmail = rateLimit({
  windowMs: FIFTEEN_MINUTES, max: 10,
  key: (req) => `email:${String(req.body?.email ?? '').trim().toLowerCase()}`,
});
const loginPerIp = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 50, key: (req) => `ip:${req.ip}` });
const registerPerIp = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 50, key: (req) => `ip:${req.ip}` });
app.post('/api/auth/login', loginPerEmail, loginPerIp);
app.post('/api/auth/register', registerPerIp);
app.use('/api/auth', userRoutes);        // C
// รีวิวแสดงต่อสาธารณะ → ตรวจคำไม่สุภาพในความคิดเห็นก่อนถึง module รีวิว (ไม่ต้องแก้ไฟล์ของ module)
app.use('/api/reviews', rejectProfanity('comment', 'ความคิดเห็นมีถ้อยคำที่ไม่สุภาพ กรุณาแก้ไขก่อนส่ง'), reviewRoutes); // C
app.use('/api/privacy', privacyRoutes);  // PDPA: ขอสำเนาข้อมูล / ลบบัญชี
app.use('/api/assistant', assistantRoutes); // ผู้ช่วยแนะนำที่พัก (แชท แบบกฎ + คำสำคัญ ไม่ใช้ AI ภายนอก)
app.use('/api/favorites', favoriteRoutes); // รายการโปรด (ต้องล็อกอิน)
app.use('/api/admin', adminRoutes);      // D

// API ที่ไม่มีอยู่ → ตอบ JSON ตามรูปแบบของทีม (ไม่ใช่หน้า HTML "Cannot GET" ของ Express)
app.use('/api', (req, res) => res.status(404).json({ message: 'ไม่พบ API นี้' }));

// production: server ตัวเดียวเสิร์ฟหน้าเว็บที่ build แล้ว (client/dist) ด้วย — ดู Dockerfile
// ตอนพัฒนาไม่ต้องตั้ง เพราะ Vite (:5173) เสิร์ฟหน้าเว็บและ proxy /api มาที่นี่เอง
if (process.env.SERVE_CLIENT === 'true') {
  const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (!existsSync(dist)) throw new Error('ไม่พบ client/dist — สั่ง npm run build -w client ก่อน');
  // ไฟล์ใน /assets มี hash ในชื่อ (เปลี่ยนชื่อทุกครั้งที่ build) → ให้เบราว์เซอร์ cache ได้ยาว
  app.use('/assets', express.static(`${dist}/assets`, { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false }));
  // React Router จัดการ path ฝั่งหน้าเว็บเอง (/hotels/7, /my-bookings ...) → ตอบ index.html เสมอ
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache'); // ให้ได้ index.html ล่าสุดเสมอหลัง deploy ใหม่
    res.sendFile(`${dist}/index.html`);
  });
}


// error format เดียวกันทั้งระบบ: { message }
// PDPA: log เฉพาะที่จำเป็นต่อการแก้บั๊ก (method, path, status, code, stack) — ไม่ log body/query/cookie
// และไม่พิมพ์ทั้ง object ของ error เพราะ error จาก PostgreSQL มีช่อง detail ที่อาจมีอีเมล/ข้อมูลผู้ใช้
// error 5xx ตอบผู้ใช้เป็นข้อความกลางๆ ไม่ส่งรายละเอียดภายในของระบบออกไป
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    const path = req.originalUrl.split('?')[0]; // ตัด query string ทิ้ง (อาจมีข้อมูลที่ผู้ใช้กรอก)
    console.error(`[${new Date().toISOString()}] ${req.method} ${path} → ${status}${err.code ? ` (${err.code})` : ''}\n${err.stack}`);
  }
  res.status(status).json({
    message: status >= 500 ? 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง' : err.message || 'Request error',
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on http://localhost:${port}${process.env.SERVE_CLIENT === 'true' ? ' (+ หน้าเว็บ)' : ''}`));
