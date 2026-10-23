// ป้ายสถานะการจอง (status มาจาก server: awaiting_payment · confirmed · completed · cancelled · expired)
export const STATUS_META = {
  awaiting_payment: { label: (tx) => tx('รอชำระเงิน', 'Awaiting payment'), className: 'bg-amber-100 text-amber-800' },
  confirmed: { label: (tx) => tx('ยืนยันแล้ว', 'Confirmed'), className: 'bg-emerald-100 text-emerald-800' },
  completed: { label: (tx) => tx('เข้าพักแล้ว', 'Completed'), className: 'bg-slate-200 text-slate-700' },
  cancelled: { label: (tx) => tx('ยกเลิกแล้ว', 'Cancelled'), className: 'bg-rose-100 text-rose-700' },
  expired: { label: (tx) => tx('หมดเวลาชำระ', 'Expired'), className: 'bg-slate-200 text-slate-600' },
};

// วิธีชำระเงิน (payments.method) → ข้อความที่แสดง เช่น "บัตร •••• 4242", "PromptPay", "TrueMoney Wallet"
export function paymentMethodLabel(method, cardLast4, tx) {
  if (method === 'card') return `${tx('บัตร', 'Card')}${cardLast4 ? ` •••• ${cardLast4}` : ''}`;
  if (method === 'promptpay') return 'PromptPay';
  if (method === 'truemoney') return 'TrueMoney Wallet';
  return tx('ไม่ทราบวิธี', 'Unknown method');
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
