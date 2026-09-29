import { Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import HomePage from './pages/search/HomePage.jsx';
import HotelDetailPage from './pages/search/HotelDetailPage.jsx';
import MyBookingsPage from './pages/booking/MyBookingsPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';
import ProfilePage from './pages/user/ProfilePage.jsx';


export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />          {/* A */}
          <Route path="/hotels/:id" element={<HotelDetailPage />} />  {/* A */}
          <Route path="/my-bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />  {/* B */}
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} /> {/* C */}
          <Route path="/admin" element={<ProtectedRoute roles={['owner', 'admin']}><AdminPage /></ProtectedRoute>} /> {/* D */}
          </Route>
        </Routes>
      </AuthProvider>
    </LanguageProvider>
  );
}
