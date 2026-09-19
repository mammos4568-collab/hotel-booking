// [A] หน้าแรก — โครงหน้าตาเท่านั้น (ยังไม่มี logic ค้นหา)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

const DESTINATIONS = ['กรุงเทพฯ', 'เชียงใหม่', 'ภูเก็ต', 'พัทยา', 'กระบี่'];

export default function HomePage() {
  const [hotels, setHotels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/hotels').then(setHotels).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      {/* 1. แบนเนอร์ + กล่องค้นหา */}
      <section className="hero">
        <h1 className="hero-title">หาที่พักถูกใจ ในราคาที่ใช่</h1>

        <form className="search-card" onSubmit={(e) => e.preventDefault()}>
          <div className="search-tabs">
            <span className="tab active">โรงแรม</span>
          </div>

          <input className="field" placeholder="ใส่จุดหมายปลายทาง หรือชื่อที่พัก" />

          <div className="search-row">
            <input className="field" type="date" aria-label="วันเช็กอิน" />
            <input className="field" type="date" aria-label="วันเช็กเอาต์" />
            <div className="field">ผู้ใหญ่ 2 · 1 ห้อง</div>
            {/* TODO(A): popup เลือกจำนวนผู้ใหญ่/เด็ก/ห้อง */}
          </div>

          {/* TODO(A): กดแล้วค้นหาจริง */}
          <button className="search-btn" type="submit">ค้นหา</button>
        </form>
      </section>

      <div className="container">
        {/* 2. จุดหมายยอดนิยม */}
        <h2 className="section-title">จุดหมายยอดนิยมในประเทศไทย</h2>
        <div className="dest-row">
          {DESTINATIONS.map((name) => (
            <div key={name} className="dest-card">{name}</div>
          ))}
        </div>

        {/* 3. รายการที่พัก (ดึงจาก API จริง) */}
        <h2 className="section-title">ที่พักแนะนำ</h2>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          {hotels.map((h) => (
            <Link key={h.id} to={`/hotels/${h.id}`} className="card">
              <div className="hotel-img" />
              <h3>{h.name}</h3>
              <p>{h.city} · {'★'.repeat(h.stars)}</p>
              <p className="price">เริ่มต้น ฿{h.min_price.toLocaleString()} / คืน</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
