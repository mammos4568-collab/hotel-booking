import { Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import HomePage from './pages/search/HomePage.jsx';
import SearchPage from './pages/search/SearchPage.jsx';
import HotelDetailPage from './pages/search/HotelDetailPage.jsx';
import CheckoutPage from './pages/booking/CheckoutPage.jsx';
import PaymentPage from './pages/booking/PaymentPage.jsx';
import BookingDetailPage from './pages/booking/BookingDetailPage.jsx';
import MyBookingsPage from './pages/booking/MyBookingsPage.jsx';
import FavoritesPage from './pages/booking/FavoritesPage.jsx';
import PrivacyPage from './pages/legal/PrivacyPage.jsx';
import MyDataPage from './pages/legal/MyDataPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';
import ProfilePage from './pages/user/ProfilePage.jsx';


export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />          {/* A */}
          <Route path="/search" element={<SearchPage />} />  {/* A */}
          <Route path="/hotels/:id" element={<HotelDetailPage />} />  {/* A */}
          <Route path="/checkout" element={<CheckoutPage />} />  {/* B — ยังไม่ล็อกอินก็เปิดดูราคาได้ ตอนกดจองค่อยให้ล็อกอิน */}
          <Route path="/checkout/pay/:id" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />  {/* B */}
          <Route path="/booking/success/:id" element={<ProtectedRoute><BookingDetailPage justBooked /></ProtectedRoute>} />  {/* B */}
          <Route path="/bookings/:id" element={<ProtectedRoute><BookingDetailPage /></ProtectedRoute>} />  {/* B */}
          <Route path="/my-bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />  {/* B */}
          <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />  {/* รายการโปรด */}
          <Route path="/privacy" element={<PrivacyPage />} />  {/* นโยบายความเป็นส่วนตัว (PDPA) */}
          <Route path="/privacy/my-data" element={<ProtectedRoute><MyDataPage /></ProtectedRoute>} />  {/* ขอสำเนาข้อมูล / ลบบัญชี */}
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} /> {/* C */}
          <Route path="/admin/*" element={<ProtectedRoute roles={['owner', 'admin']}><AdminPage /></ProtectedRoute>} /> {/* D — หน้าย่อยอยู่ใน AdminPage */}
          </Route>
        </Routes>
      </AuthProvider>
    </LanguageProvider>
  );
}
