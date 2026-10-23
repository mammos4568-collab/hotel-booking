# ค้นหาและหน้าโรงแรม

ไฟล์: `server/src/modules/search/` · `server/src/lib/hotelSearch.js` · `client/src/pages/search/` ·
`client/src/components/` · `client/src/styles.css` · `client/src/lib/format.js`

---

## งาน

### Backend (`server/src/modules/search/routes.js` + `server/src/lib/hotelSearch.js`)

- [x] `GET /api/hotels` รับ query: `q` (หรือ `city`), `checkIn`, `checkOut`, `guests`, `rooms` (1–5),
      `minPrice`, `maxPrice` (ราคาเฉลี่ยต่อห้องต่อคืน), `stars` (ขั้นต่ำ),
      `amenities` (ต้องมีครบ เช่น `pool,spa`), `type` (เช่น `Resort,Villa`),
      `features` (วิว/บรรยากาศ เช่น `mountain_view,quiet`), `near` (จุดอ้างอิง เช่น `tha_phae_gate`),
      `sort` (`recommended` / `price_asc` / `price_desc` / `stars_desc` / `rating_desc` / `distance`), `page`, `limit`
      → ตอบ `{ hotels, total, page, limit, totalPages, nights, near, features }`
- [x] SQL ค้นหาอยู่ที่ `searchHotels()` ใน `server/src/lib/hotelSearch.js` ที่เดียว — หน้าค้นหาและผู้ช่วยแนะนำที่พัก
      ใช้ฟังก์ชันเดียวกัน ผลลัพธ์จึงตรงกันเสมอ (ทดสอบไว้ใน `server/test/assistant.js`)
- [x] ส่ง `checkIn`/`checkOut` มาด้วย → แสดงเฉพาะโรงแรมที่ยังมีห้องว่างครบทุกคืน **อย่างน้อย `rooms` ห้อง**
      และ `rooms` ห้องพักรวมกันได้ `guests` คน — ใช้ `roomAvailabilitySql()` จาก `server/src/lib/availability.js`
- [x] `near` → คำนวณระยะทางเส้นตรงด้วยสูตร Haversine จากพิกัด `properties.latitude/longitude`
      (`distanceKm` ในผลลัพธ์) และเรียงใกล้สุดก่อน · รายชื่อจุดอ้างอิง ~60 แห่งอยู่ที่ `server/src/lib/landmarks.js`
- [x] `features` → ฐานข้อมูลไม่มีคอลัมน์วิว/บรรยากาศ จึงค้นคำในชื่อ + คำอธิบายของโรงแรมและห้องพัก
      (`server/src/lib/hotelFeatures.js` — ระวังคำซ้อน เช่น "ป่า" ใน "ป่าตอง", "ครัว" ใน "ครอบครัว")
- [x] `GET /api/hotels/:id?checkIn&checkOut&guests&rooms` → ข้อมูลโรงแรม + ทุกประเภทห้อง
      พร้อมห้องว่าง, ราคารวมทั้งทริป (ต่อห้อง), `fitsGuests`, `enoughRooms`, คะแนนรีวิว, พิกัดแผนที่
- [x] `GET /api/hotels/destinations` → เมือง + จำนวนที่พัก + ราคาเริ่มต้น (หน้าแรก/คำแนะนำในกล่องค้นหา)

ทุก query ใช้ parameterized (`$1`, `$2`) · `ORDER BY` เลือกจาก whitelist (`SORTS`) เท่านั้น ·
ข้อความค้นหา escape ตัว `%` `_` ก่อนใช้กับ `ILIKE` · ค่าใน list (`amenities`, `type`, `features`) รับเฉพาะค่าที่รู้จัก

### Frontend

- [x] หน้าแรก `/`: hero + กล่องค้นหา (จุดหมายพร้อมคำแนะนำ, ปฏิทินเลือกช่วงวัน, ผู้ใหญ่/เด็ก/ห้อง),
      ทางลัด "สุดสัปดาห์นี้", จุดหมายยอดนิยม, ที่พักคะแนนรีวิวสูงสุด
- [x] หน้า `/search`: ตัวกรองด้านข้าง (ราคา/ดาว/ประเภทที่พัก/สิ่งอำนวยความสะดวก) — มือถือเป็นลิ้นชัก,
      ป้าย "ใกล้ …" และวิว/บรรยากาศ (มาจากลิงก์ของผู้ช่วย) กด × ลบได้, เรียงลำดับ (มี "ใกล้ที่สุด" เมื่อมีจุดอ้างอิง),
      การ์ดโรงแรม (บอกระยะทาง), skeleton ตอนโหลด, ข้อความตอนไม่เจอผลลัพธ์, แบ่งหน้า ·
      ค่าทั้งหมดอยู่ใน URL (แชร์ลิงก์/กดย้อนกลับได้)
- [x] หน้า `/hotels/:id`: แกลเลอรี, สิ่งอำนวยความสะดวก, ปุ่มบันทึก (รายการโปรด), กล่องเลือกวัน/ผู้เข้าพัก/ห้อง (sticky),
      ห้องพักพร้อมห้องว่างและราคา × จำนวนคืน × จำนวนห้อง, ปุ่ม **จองห้องนี้ / จอง N ห้อง** →
      `/checkout?roomId=..&checkIn=..&checkOut=..&guests=..&rooms=..`, นโยบาย, แผนที่ OpenStreetMap
- [x] รีวิวในหน้าโรงแรม (`GET /api/reviews?hotelId=`) + เขียนรีวิวได้ถ้าเคยเข้าพักและจ่ายเงินแล้ว
- [x] หัวใจรายการโปรดบนการ์ดทุกหน้า + หน้า `/favorites`
- [x] ผู้ช่วยแนะนำที่พัก (ปุ่มลอยมุมขวาล่างทุกหน้า) — ดู `docs/assistant.md`
- [x] component กลางใน `client/src/components/`: `DatePicker`, `GuestPicker`, `SearchBar`, `HotelCard`,
      `FavoriteButton`, `AssistantWidget`, `Stars`, `RatingBadge`, `Loading`, `EmptyState`, `SmartImage`, `Icon`, `Footer`
- [x] ทุกหน้าดูได้บนมือถือ · การ์ดในคอลัมน์แคบใช้ container query (`@container`) จัด layout ตามพื้นที่จริง
- [x] สองภาษา (ไทย/อังกฤษ) ผ่าน `tx('ไทย', 'English')` จาก `LanguageContext` · สลับ THB/USD ได้

### ของเพื่อน (หลังบ้านแอดมิน)

- [x] แสดงเฉพาะโรงแรมที่ admin อนุมัติแล้ว (`publicHotelSql()` ใน `searchHotels` และหน้าโรงแรม) — ดู `docs/admin.md` หัวข้อ "อนุมัติโรงแรม"
- [x] อัปโหลดรูปจริง สูงสุด 5 รูปต่อโรงแรม ขนาดเท่ากันทุกรูป (1200×800) — ดู `docs/admin.md` หัวข้อ "รูปโรงแรม"
  (ยังไม่มีรูปอัปโหลด = ใช้ลิงก์รูปเดิมในคอลัมน์ `image_url`)
- [x] รูปประเภทห้องอัปโหลดได้เหมือนกัน สูงสุด 5 รูปต่อห้อง — การ์ดห้องขึ้นจำนวนรูป กดดูเต็มจอได้ · หน้า checkout ใช้รูปหลักของห้อง

---

## ข้อควรระวัง

- สี/ฟอนต์/แอนิเมชันประกาศเป็นตัวแปรใน `@theme` ของ `styles.css` (เช่น `brand-600`, `deal-600`)
  เพิ่มสีใหม่ให้ประกาศเป็นตัวแปร อย่าใส่ค่าสีดิบแบบ `bg-[#xxxxxx]`
- รูปที่อัปโหลดอยู่ในตาราง `property_images` (รูปโรงแรม · ดึงรูปปกด้วย `hotelCoverSql()`) และ `room_images` (รูปห้อง ·
  `roomCoverSql()`) · ลิงก์รูปสำรองอยู่ที่ `properties.image_url`, `rooms.image_url` · `sizedImage()` ใส่ความกว้างให้รูป Unsplash
- การ์ดห้องในหน้าโรงแรม: `rooms[].images` (รูปห้องตามลำดับ) → กดรูปดูเต็มจอทุกรูป (ตัวดูรูปอยู่ระดับหน้า ไม่อยู่ในการ์ดที่เป็น `@container`)
- ข้อมูลตัวอย่าง (18 โรงแรม, 41 ประเภทห้อง, รีวิว, ราคาสุดสัปดาห์/ปีใหม่) อยู่ใน `db/04-demo-data.sql`
  รันซ้ำได้ แก้แล้วต้องแจ้งเพื่อนให้รันไฟล์นี้ใหม่
- เพิ่มคำอธิบายโรงแรม/ห้องที่มีคำอย่าง "วิวภูเขา", "เงียบสงบ" → ผู้ช่วยและตัวกรองวิว/บรรยากาศหาเจอทันที
