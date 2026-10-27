import { formatDate } from '../../lib/format.js';

// ป้ายสถานะการจอง (status มาจาก server: awaiting_payment · confirmed · completed · cancelled · expired)
export const STATUS_META = {
  awaiting_payment: { label: (tx) => tx('รอชำระเงิน', 'Awaiting payment'), className: 'bg-amber-100 text-amber-800' },
  confirmed: { label: (tx) => tx('ยืนยันแล้ว', 'Confirmed'), className: 'bg-emerald-100 text-emerald-800' },
  completed: { label: (tx) => tx('เข้าพักแล้ว', 'Completed'), className: 'bg-slate-200 text-slate-700' },
  cancelled: { label: (tx) => tx('ยกเลิกแล้ว', 'Cancelled'), className: 'bg-rose-100 text-rose-700' },
  expired: { label: (tx) => tx('หมดเวลาชำระ', 'Expired'), className: 'bg-slate-200 text-slate-600' },
};

// วิธีชำระเงิน (payments.method) → ข้อความที่แสดง เช่น "บัตร •••• 4242", "PromptPay", "TrueMoney Wallet"
// viaGateway = จ่ายผ่าน Opn Payments จริง (ไม่ใช่แบบจำลอง) → ต่อท้าย "(Opn)"
export function paymentMethodLabel(method, cardLast4, tx, viaGateway = false) {
  const via = viaGateway ? ' (Opn)' : '';
  if (method === 'card') return `${tx('บัตร', 'Card')}${cardLast4 ? ` •••• ${cardLast4}` : ''}`;
  if (method === 'promptpay') return `PromptPay${via}`;
  if (method === 'promptpay_live') return tx('PromptPay (โอนเงินจริง)', 'PromptPay (real transfer)');
  if (method === 'truemoney') return `TrueMoney Wallet${via}`;
  return tx('ไม่ทราบวิธี', 'Unknown method');
}

// ข้อความในกล่องยืนยันการยกเลิก — บอกว่าห้องและเงินจะเป็นยังไง (ใช้ร่วมกันทุกหน้าที่มีปุ่มยกเลิก)
export function cancelNote(booking, tx, formatPrice) {
  const amount = formatPrice(booking.totalAmount);
  if (booking.paymentStatus !== 'Paid') return tx('ห้องที่ถือไว้จะถูกปล่อยให้ผู้อื่นจอง', 'The held room will be released.');
  if (booking.payment?.method === 'promptpay_live') {
    // PromptPay เงินจริงโอนเข้าบัญชีตรง ไม่ผ่าน gateway → ระบบสั่งคืนเงินเองไม่ได้
    return tx(`การจองนี้จ่ายด้วย PromptPay เงินจริง — ระบบโอนคืนอัตโนมัติไม่ได้ ต้องโอนคืน ${amount} เอง และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `This booking was paid with real PromptPay — it can't be refunded automatically; transfer ${amount} back yourself. The room will be released.`);
  }
  if (booking.payment?.manualRefund) {
    // PromptPay ผ่าน Opn: Opn คืนเงิน PromptPay ไม่ได้ → ผู้ดูแลระบบต้องโอนคืนเอง
    return tx(`การจองนี้จ่ายด้วย PromptPay ผ่าน Opn ซึ่งคืนเงินอัตโนมัติไม่ได้ — ผู้ดูแลระบบจะโอนคืน ${amount} ให้ภายหลัง และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `This booking was paid with PromptPay via Opn, which can't be refunded automatically — an admin will transfer ${amount} back to you later. The room will be released.`);
  }
  return tx(`ระบบจะคืนเงิน ${amount} ไปยังช่องทางที่ชำระ และห้องจะถูกปล่อยให้ผู้อื่นจอง`, `We'll refund ${amount} to your original payment method and release the room.`);
}

// กำหนดยกเลิกของการจองที่จ่ายแล้ว (cancelDeadline มาจาก server = วันก่อนเช็กอิน) → ข้อความที่แสดง
//   ยังยกเลิกได้  → "ยกเลิกฟรีได้ถึง อ. 27 ต.ค. 2569" (แสดงข้างปุ่มยกเลิก)
//   เลยกำหนดแล้ว → บอกว่าทำไมยกเลิกเองไม่ได้ + ให้ติดต่อที่พัก (แสดงแทนปุ่ม)
// ยังไม่จ่าย (ยกเลิกได้ตลอด) / ยกเลิกแล้ว / เข้าพักแล้ว → null
export function cancelDeadlineNote(booking, tx, lang) {
  if (booking.status !== 'confirmed' || !booking.cancelDeadline) return null;
  const date = formatDate(booking.cancelDeadline, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (booking.canCancel) return tx(`ยกเลิกฟรีได้ถึง ${date}`, `Free cancellation until ${date}`);
  return tx(
    `ยกเลิกเองไม่ได้แล้ว เพราะถึงวันเช็กอินแล้ว (ยกเลิกได้ถึง ${date}) — หากจำเป็นต้องยกเลิก กรุณาติดต่อที่พักโดยตรง`,
    `You can no longer cancel this booking yourself because check-in day has arrived (cancellation was open until ${date}). If you need to cancel, please contact the property directly.`,
  );
}

// payment_status ในฐานข้อมูล (Pending / Paid / Refunded / Expired) → ข้อความที่แสดง
export function paymentLabel(status, tx) {
  const labels = {
    pending: tx('รอชำระเงิน', 'Pending'),
    paid: tx('ชำระแล้ว', 'Paid'),
    refunded: tx('คืนเงินแล้ว', 'Refunded'),
    expired: tx('หมดเวลาชำระ', 'Expired'),
    failed: tx('ชำระไม่สำเร็จ', 'Payment failed'),
  };
  return labels[String(status).toLowerCase()] ?? status;
}
