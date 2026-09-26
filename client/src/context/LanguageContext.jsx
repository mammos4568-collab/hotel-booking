import { createContext, useContext, useState } from 'react';

const translations = {
  th: {
    nav_hotels: 'โรงแรม',
    nav_my_bookings: 'การจองของฉัน',
    nav_list_property: 'ลงประกาศที่พัก',
    nav_signin: 'เข้าสู่ระบบ',
    nav_register: 'สมัครสมาชิก',
    nav_mobile_menu: 'เมนูนำทาง',
    lang_modal_title: 'เลือกภาษาที่ต้องการ',
    lang_recommended: 'ภาษาแนะนำ',
    currency_modal_title: 'เลือกสกุลเงินที่ต้องการ',
    currency_recommended: 'สกุลเงินแนะนำ',
    lang_close: 'ปิดหน้าต่าง',
    currency_label: 'สกุลเงิน',

    badge_best_price: '⚡ ราคาคุ้มค่าที่สุด',
    hero_title: 'ค้นหาโรงแรมและที่พักทั่วไทย',
    hero_subtitle: 'เปรียบเทียบข้อเสนอที่ดีที่สุด จองง่าย ปลอดภัย พร้อมข้อเสนอพิเศษ',
    popular_destinations: 'ปลายทางยอดฮิต:',
    search_dest_label: 'จุดหมายปลายทาง / เมือง',
    search_dest_placeholder: 'เช่น Bangkok, Chiang Mai, Phuket...',
    search_dates_label: 'วันเช็คอิน - เช็คเอาท์',
    search_checkin_ph: 'วันเช็คอิน',
    search_checkout_ph: 'วันเช็คเอาท์',
    search_guests_label: 'ผู้เข้าพัก & ห้องพัก',
    guest_opt_1: 'ผู้ใหญ่ 1 คน (1 ห้อง)',
    guest_opt_2: 'ผู้ใหญ่ 2 คน (1 ห้อง)',
    guest_opt_3: 'ผู้ใหญ่ 3 คน (1 ห้อง)',
    guest_opt_4: 'ผู้ใหญ่ 4 คน (ครอบครัว)',
    btn_search: 'ค้นหาที่พัก',

    filter_title: 'ตัวกรองละเอียด',
    filter_reset: 'รีเซ็ต',
    filter_sort_label: 'เรียงตาม',
    sort_recommended: 'คะแนนรีวิวและความนิยม',
    sort_price_asc: 'ราคา: ต่ำสุด ไป สูงสุด',
    sort_price_desc: 'ราคา: สูงสุด ไป ต่ำสุด',
    sort_stars_desc: 'ระดับดาว: มากที่สุด',
    filter_stars_label: 'ระดับดาวที่พัก',
    star_opt_5: '⭐⭐⭐⭐⭐ 5 ดาว (หรูหราพิเศษ)',
    star_opt_4: '⭐⭐⭐⭐ 4 ดาวขึ้นไป (ยอดเยี่ยม)',
    star_opt_3: '⭐⭐⭐ 3 ดาวขึ้นไป (มาตรฐาน)',
    star_opt_all: 'ทุกระดับดาว',
    filter_budget_label: 'งบประมาณต่อคืน',
    filter_min: 'ต่ำสุด',
    filter_max: 'สูงสุด',
    btn_apply_filter: 'ปรับใช้ตัวกรอง',

    results_found_prefix: 'ผลการค้นหา',
    results_count_prefix: 'พบทั้งหมด',
    results_count_suffix: 'แห่ง',
    loading_hotels: 'กำลังโหลดข้อมูลโรงแรม...',
    no_hotels_found: 'ไม่พบโรงแรมตามเงื่อนไขที่เลือก',
    no_hotels_sub: 'ลองขยายช่วงราคา หรือค้นหาโดยใช้ชื่อเมืองอื่นๆ',
    badge_special_deal: 'ดีลพิเศษ',
    verified_hotel: 'โรงแรมรับรอง',
    perk_breakfast: '✓ รวมอาหารเช้าฟรี',
    perk_free_cancel: 'ยกเลิกการจองฟรี',
    perk_wifi: 'Free Wi-Fi',
    review_excellent: 'ยอดเยี่ยม',
    review_sub: '(รีวิวจริงจากผู้เข้าพัก)',
    badge_few_rooms: 'ห้องพักเหลือน้อย',
    per_room_night: 'ต่อห้อง / คืน (รวมภาษี)',
    btn_select_room: 'เลือกห้องพัก →',
  },
  en: {
    nav_hotels: 'Hotels',
    nav_my_bookings: 'My Bookings',
    nav_list_property: 'List your property',
    nav_signin: 'Sign in',
    nav_register: 'Register',
    nav_mobile_menu: 'Navigation Menu',
    lang_modal_title: 'Select your language',
    lang_recommended: 'Suggested languages',
    currency_modal_title: 'Select your currency',
    currency_recommended: 'Suggested currencies',
    lang_close: 'Close',
    currency_label: 'Currency',

    badge_best_price: '⚡ Best Price Guaranteed',
    hero_title: 'Find Hotels & Accommodations in Thailand',
    hero_subtitle: 'Compare best deals, book securely with exclusive member discounts',
    popular_destinations: 'Popular destinations:',
    search_dest_label: 'Destination / City',
    search_dest_placeholder: 'e.g. Bangkok, Chiang Mai, Phuket...',
    search_dates_label: 'Check-in - Check-out',
    search_checkin_ph: 'Check-in',
    search_checkout_ph: 'Check-out',
    search_guests_label: 'Guests & Rooms',
    guest_opt_1: '1 Adult (1 Room)',
    guest_opt_2: '2 Adults (1 Room)',
    guest_opt_3: '3 Adults (1 Room)',
    guest_opt_4: '4 Adults (Family)',
    btn_search: 'Search Hotels',

    filter_title: 'Filters',
    filter_reset: 'Reset',
    filter_sort_label: 'Sort by',
    sort_recommended: 'Reviews & Popularity',
    sort_price_asc: 'Price: Low to High',
    sort_price_desc: 'Price: High to Low',
    sort_stars_desc: 'Star Rating: High to Low',
    filter_stars_label: 'Star Rating',
    star_opt_5: '⭐⭐⭐⭐⭐ 5 Stars (Luxury)',
    star_opt_4: '⭐⭐⭐⭐ 4 Stars & up (Very Good)',
    star_opt_3: '⭐⭐⭐ 3 Stars & up (Standard)',
    star_opt_all: 'All Stars',
    filter_budget_label: 'Nightly Budget',
    filter_min: 'Min',
    filter_max: 'Max',
    btn_apply_filter: 'Apply Filters',

    results_found_prefix: 'Search results for',
    results_count_prefix: 'Found',
    results_count_suffix: 'properties',
    loading_hotels: 'Loading hotels...',
    no_hotels_found: 'No hotels found matching your criteria',
    no_hotels_sub: 'Try widening your price range or searching for other cities',
    badge_special_deal: 'Special Deal',
    verified_hotel: 'Verified Stay',
    perk_breakfast: '✓ Free Breakfast',
    perk_free_cancel: 'Free Cancellation',
    perk_wifi: 'Free Wi-Fi',
    review_excellent: 'Excellent',
    review_sub: '(Verified guest reviews)',
    badge_few_rooms: 'Few rooms left',
    per_room_night: 'per room / night (inc. taxes)',
    btn_select_room: 'Select Room →',
  }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('app_lang') || 'th');
  const [currency, setCurrency] = useState(() => localStorage.getItem('app_currency') || 'THB');

  const switchLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  const switchCurrency = (newCurrency) => {
    setCurrency(newCurrency);
    localStorage.setItem('app_currency', newCurrency);
  };

  // ฟังก์ชันแปลงและจัดฟอร์แมตราคาตามสกุลเงิน
  const formatPrice = (thbPrice) => {
    const num = Number(thbPrice) || 0;
    if (currency === 'USD') {
      const usd = (num / 35).toFixed(0);
      return `$ ${Number(usd).toLocaleString()}`;
    }
    return `฿ ${num.toLocaleString()}`;
  };

  const t = (key, params = {}) => {
    let text = translations[lang]?.[key] || translations['th']?.[key] || key;
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(`{${paramKey}}`, params[paramKey]);
    });
    return text;
  };

  return (
    <LanguageContext.Provider value={{ lang, switchLanguage, currency, switchCurrency, formatPrice, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);