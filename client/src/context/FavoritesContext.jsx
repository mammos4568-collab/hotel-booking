// รายการโปรด (หัวใจ) ที่ใช้ร่วมกันทุกหน้า
// โหลด id ที่ผู้ใช้กดไว้ครั้งเดียวหลังล็อกอิน → การ์ดทุกใบรู้ว่าต้องระบายหัวใจไหม โดยไม่ต้องถาม server ทีละใบ
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user, openAuthModal, authModal } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [error, setError] = useState('');
  // ยังไม่ล็อกอินแล้วกดหัวใจ → จำไว้ ล็อกอินเสร็จค่อยบันทึกให้ (ปิดหน้าต่างล็อกอินไปเฉยๆ = ยกเลิก)
  const pending = useRef(null);

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return undefined;
    }
    let ignore = false;
    (async () => {
      if (pending.current) {
        const hotelId = pending.current;
        pending.current = null;
        await api(`/favorites/${hotelId}`, { method: 'PUT' }).catch(() => {});
      }
      const data = await api('/favorites/ids').catch(() => null);
      if (!ignore && data) setIds(new Set(data.ids));
    })();
    return () => { ignore = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authModal && !user) pending.current = null;
  }, [authModal, user]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 3500);
    return () => clearTimeout(timer);
  }, [error]);

  const setFavorite = (hotelId, favorite) => setIds((prev) => {
    const next = new Set(prev);
    if (favorite) next.add(hotelId); else next.delete(hotelId);
    return next;
  });

  // เปลี่ยนสีหัวใจทันที (optimistic) แล้วค่อยบันทึก — บันทึกไม่สำเร็จก็เปลี่ยนกลับและบอกเหตุผล
  const toggle = async (hotelId) => {
    if (!user) {
      pending.current = hotelId;
      openAuthModal('login');
      return;
    }
    const wasFavorite = ids.has(hotelId);
    setFavorite(hotelId, !wasFavorite);
    try {
      await api(`/favorites/${hotelId}`, { method: wasFavorite ? 'DELETE' : 'PUT' });
    } catch (err) {
      setFavorite(hotelId, wasFavorite);
      setError(err.message);
    }
  };

  return (
    <FavoritesContext.Provider value={{ isFavorite: (hotelId) => ids.has(hotelId), toggle, count: ids.size }}>
      {children}
      {error && (
        <div role="status" className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 animate-fade-in rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
          {error}
        </div>
      )}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
