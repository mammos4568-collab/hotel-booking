// [C] ชั่วคราว: แกล้งทำเป็นว่า user id 1 ล็อกอินอยู่เสมอ
// ทุก module ใช้ req.user ได้เลยตั้งแต่วันแรก
// พอ C ทำ login เสร็จ จะเปลี่ยนไฟล์นี้ให้อ่าน token จริง — module อื่นไม่ต้องแก้อะไร
export function requireAuth(req, res, next) {
  req.user = { id: 1, role: 'customer' };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    // ชั่วคราว: ให้ผ่านหมด
    next();
  };
}
