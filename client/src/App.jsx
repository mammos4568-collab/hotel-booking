import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/search/HomePage.jsx';
import HotelDetailPage from './pages/search/HotelDetailPage.jsx';
import MyBookingsPage from './pages/booking/MyBookingsPage.jsx';
import LoginPage from './pages/user/LoginPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />                   {/* A */}
        <Route path="/hotels/:id" element={<HotelDetailPage />} />  {/* A */}
        <Route path="/my-bookings" element={<MyBookingsPage />} />  {/* B */}
        <Route path="/login" element={<LoginPage />} />             {/* C */}
        <Route path="/admin" element={<AdminPage />} />             {/* D */}
      </Route>
    </Routes>
  );
}
