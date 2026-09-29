import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is not set');

// ใช้ pool นี้ร่วมกันทุก module — ห้ามสร้าง connection ใหม่เอง
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
