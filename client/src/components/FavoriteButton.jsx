import Icon from './Icon.jsx';
import { useFavorites } from '../context/FavoritesContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// ปุ่มหัวใจ (รายการโปรด)
//   variant="overlay" ปุ่มกลมลอยบนรูป (การ์ดที่พัก) · variant="pill" ปุ่มมีข้อความ (หน้าโรงแรม)
// การ์ดทั้งใบเป็นลิงก์ → preventDefault กันไม่ให้กดหัวใจแล้วเปิดหน้าโรงแรมไปด้วย
export default function FavoriteButton({ hotelId, variant = 'overlay', className = '' }) {
  const favorites = useFavorites();
  const { tx } = useLanguage();
  if (!favorites) return null;

  const active = favorites.isFavorite(hotelId);
  const label = active ? tx('เอาออกจากรายการโปรด', 'Remove from favourites') : tx('บันทึกในรายการโปรด', 'Save to favourites');
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    favorites.toggle(hotelId);
  };
  const heart = (
    <Icon
      name="heart"
      filled={active}
      className={`h-[1.15rem] w-[1.15rem] transition ${active ? 'scale-110 text-rose-500' : 'text-slate-700'}`}
    />
  );

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition ${
          active ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600'
        } ${className}`}
      >
        {heart}
        {active ? tx('บันทึกแล้ว', 'Saved') : tx('บันทึก', 'Save')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110 hover:bg-white ${className}`}
    >
      {heart}
    </button>
  );
}
