import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import searchRoutes from './modules/search/routes.js';
import bookingRoutes from './modules/booking/routes.js';
import userRoutes from './modules/user/routes.js';
import adminRoutes from './modules/admin/routes.js';


const app = express();
app.use(cors());
app.use(express.json());

// เช็กว่า server + DB ต่อกันได้
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

// แต่ละ module ต่อเข้าที่นี่ — ไฟล์นี้แทบไม่ต้องแก้อีก
app.use('/api/hotels', searchRoutes);   // A
app.use('/api/bookings', bookingRoutes); // B
app.use('/api/auth', userRoutes);        // C
app.use('/api/admin', adminRoutes);      // D


// error format เดียวกันทั้งระบบ: { message }
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
