// ============================================================
// อนุมัติโรงแรมก่อนเผยแพร่ (db/08-hotel-approval.sql)
//   pending = รอ admin ตรวจ · approved = เผยแพร่ · rejected = ไม่อนุมัติ/ถูกระงับ
//   ลูกค้าเห็นและจองได้เฉพาะ approved → ทุก query ฝั่งลูกค้าต้องมี publicHotelSql() ใน WHERE:
//     ค้นหา (lib/hotelSearch.js), หน้าโรงแรม + ปลายทางยอดนิยม (modules/search), จอง + ใบเสนอราคา (modules/booking),
//     รายการโปรด (modules/favorites), ผู้ช่วยแนะนำที่พัก (modules/assistant)
//   ประวัติการจองของลูกค้าเองยังเห็นได้ตามปกติ แม้โรงแรมถูกระงับภายหลัง
// ============================================================

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

export const publicHotelSql = (alias = 'p') => `${alias}.approval_status = 'approved'`;
