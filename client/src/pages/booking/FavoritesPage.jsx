// รายการโปรด — ที่พักที่ผู้ใช้กดหัวใจเก็บไว้ (ต้องล็อกอิน: ครอบด้วย ProtectedRoute ใน App.jsx)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import HotelCard from '../../components/HotelCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { HotelCardSkeleton } from '../../components/Loading.jsx';
import { useFavorites } from '../../context/FavoritesContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function FavoritesPage() {
  const { tx } = useLanguage();
  const favorites = useFavorites();
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    api('/favorites')
      .then((data) => { if (!ignore) setHotels(data.hotels); })
      .catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  // กดหัวใจออกจากหน้านี้ → การ์ดหายไปทันที (ไม่ต้องโหลดใหม่)
  const visible = hotels.filter((hotel) => !favorites || favorites.isFavorite(hotel.id));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-900">
            <Icon name="heart" filled className="h-7 w-7 text-rose-500" />
            {tx('รายการโปรด', 'Favourites')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {tx('ที่พักที่คุณกดหัวใจเก็บไว้ — ราคาที่แสดงเป็นราคาเริ่มต้น เลือกวันในหน้าที่พักเพื่อดูราคาจริง', 'Places you saved — prices shown are starting prices; pick dates on the property page for real prices.')}
          </p>
        </div>
        <Link to="/search" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700">
          {tx('ค้นหาที่พักเพิ่ม', 'Find more stays')} <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </header>

      <div className="mt-6 space-y-4">
        {loading && Array.from({ length: 2 }).map((_, i) => <HotelCardSkeleton key={i} />)}
        {!loading && error && <EmptyState icon="alert" tone="error" title={tx('โหลดรายการโปรดไม่สำเร็จ', 'Could not load favourites')} description={error} />}
        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon="heart"
            title={tx('ยังไม่มีรายการโปรด', 'No favourites yet')}
            description={tx('กดรูปหัวใจบนการ์ดที่พักเพื่อเก็บไว้ดูทีหลัง', 'Tap the heart on any property to save it for later.')}
            action={<Link to="/search" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{tx('เริ่มค้นหาที่พัก', 'Start searching')}</Link>}
          />
        )}
        {!loading && !error && visible.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} />)}
      </div>
    </div>
  );
}
