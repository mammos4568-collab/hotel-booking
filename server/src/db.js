import pg from 'pg';

// ใช้ pool นี้ร่วมกันทุก module — ห้ามสร้าง connection ใหม่เอง
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
