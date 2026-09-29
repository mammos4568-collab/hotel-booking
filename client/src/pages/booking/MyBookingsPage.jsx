// [B] การจองของฉัน — แสดงลิสต์ bookings ของ user ที่ login อยู่
// *** หมายเหตุ: GET /api/bookings/me ยังเป็น 501 (TODO ของทีม B) ***
// เมื่อทีม B implement แล้ว หน้านี้จะแสดงข้อมูลอัตโนมัติ

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

const STATUS_STYLES = {
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const PAYMENT_STYLES = {
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-600',
};

function statusLabel(status) {
  const map = { confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิกแล้ว', completed: 'เสร็จสิ้น' };
  return map[String(status).toLowerCase()] ?? status;
}

function paymentLabel(status) {
  const map = { paid: 'ชำระแล้ว', pending: 'รอชำระ', failed: 'ชำระไม่สำเร็จ', refunded: 'คืนเงินแล้ว' };
  return map[String(status).toLowerCase()] ?? status;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/bookings/me')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.bookings ?? []);
        setBookings(list);
      })
      .catch((err) => {
        // ทีม B ยังไม่ implement — แสดง empty state แทน error
        if (err.message?.includes('501')) {
          setBookings([]);
        } else {
          setError(err.message || 'ไม่สามารถโหลดข้อมูลการจองได้');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center">
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-900">การจองของฉัน</h1>
        <p className="text-sm text-slate-500 mt-1">ประวัติและสถานะการจองทั้งหมด</p>
      </header>

      {bookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <div className="text-4xl">📋</div>
          <p className="font-bold text-slate-800">ยังไม่มีการจอง</p>
          <p className="text-sm text-slate-500">เมื่อคุณจองห้องพักแล้ว รายการจะปรากฏที่นี่</p>
          <Link
            to="/"
            className="inline-block mt-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            ค้นหาที่พัก
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const bookingId = booking.id ?? booking.booking_id ?? booking.bookingId;
            const reference = booking.bookingReference ?? booking.booking_reference ?? `#${bookingId}`;
            const hotelName = booking.hotelName ?? booking.property_name ?? booking.propertyName ?? 'ที่พัก';
            const roomName = booking.roomName ?? booking.room_type_name ?? booking.roomTypeName ?? '';
            const checkIn = booking.checkIn ?? booking.check_in_date;
            const checkOut = booking.checkOut ?? booking.check_out_date;
            const bookingStatus = (booking.bookingStatus ?? booking.booking_status ?? 'confirmed').toLowerCase();
            const paymentStatus = (booking.paymentStatus ?? booking.payment_status ?? 'pending').toLowerCase();
            const totalAmount = booking.totalAmount ?? booking.total_amount;

            return (
              <div key={bookingId} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
                {/* Top row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-400 mb-1">{reference}</p>
                    <h2 className="font-extrabold text-slate-900 text-base leading-tight">{hotelName}</h2>
                    {roomName && <p className="text-xs text-slate-500 mt-0.5">{roomName}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                    <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLES[bookingStatus] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {statusLabel(bookingStatus)}
                    </span>
                    <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full ${PAYMENT_STYLES[paymentStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                      {paymentLabel(paymentStatus)}
                    </span>
                  </div>
                </div>

                {/* Dates */}
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                  <div>
                    <span className="text-xs text-slate-400 block">เช็คอิน</span>
                    <span className="font-semibold">{formatDate(checkIn)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">เช็คเอาต์</span>
                    <span className="font-semibold">{formatDate(checkOut)}</span>
                  </div>
                  {totalAmount != null && (
                    <div className="ml-auto text-right">
                      <span className="text-xs text-slate-400 block">ยอดรวม</span>
                      <span className="font-black text-slate-900">฿{Number(totalAmount).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Link to hotel */}
                {(booking.hotelId ?? booking.property_id ?? booking.propertyId) && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <Link
                      to={`/hotels/${booking.hotelId ?? booking.property_id ?? booking.propertyId}`}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      ดูรายละเอียดที่พัก →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
