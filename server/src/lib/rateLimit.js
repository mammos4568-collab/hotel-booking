// ============================================================
// จำกัดจำนวนคำขอต่อช่วงเวลา (rate limit) แบบ fixed window — กันการยิงคำขอรัวๆ / สแปม
// ============================================================
//
// หลักการ: นับคำขอของแต่ละ key (ปกติคือ user id) ในหน้าต่างเวลา windowMs
//   เกิน max ครั้ง → ตอบ 429 Too Many Requests พร้อมบอกว่าต้องรออีกกี่วินาที
//   ครบเวลา → เริ่มนับใหม่
//
// ข้อจำกัด: เก็บตัวนับในหน่วยความจำของ server ตัวเดียว (restart แล้วนับใหม่)
// ถ้าวันหนึ่งรันหลาย server พร้อมกัน ต้องย้ายตัวนับไปไว้ที่ Redis หรือฐานข้อมูลแทน

export function rateLimit({ windowMs, max, key = (req) => req.user?.id ?? req.ip, message }) {
  const hits = new Map(); // key → { count, resetAt }

  // ล้าง key ที่หมดเวลาแล้วเป็นระยะ จะได้ไม่กินหน่วยความจำเพิ่มเรื่อยๆ
  // (unref = ไม่ทำให้ process ค้างรอ timer นี้ตอนปิด server)
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = String(key(req));
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      const wait = retryAfter >= 120 ? `${Math.ceil(retryAfter / 60)} นาที` : `${retryAfter} วินาที`;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        message: message ?? `ส่งคำขอถี่เกินไป กรุณารอ ${wait} แล้วลองใหม่`,
      });
    }
    next();
  };
}
