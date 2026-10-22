-- ============================================================
-- 04: ข้อมูลตัวอย่างเพิ่มเติม — โรงแรม 15 แห่ง, ประเภทห้อง, รูป, ราคาตามวัน และรีวิว
-- ให้หน้าค้นหา/ตัวกรอง/แบ่งหน้า/รีวิว มีข้อมูลพอให้ทดสอบและพรีเซนต์
-- รันซ้ำได้: ทุกคำสั่งกันข้อมูลซ้ำไว้แล้ว (WHERE NOT EXISTS / ON CONFLICT)
-- ============================================================

-- ------------------------------------------------------------
-- 1) รูปและสิ่งอำนวยความสะดวกของโรงแรม 3 แห่งเดิม (จาก 02-datas.sql)
-- ------------------------------------------------------------
UPDATE properties
   SET image_url = 'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?auto=format&fit=crop&q=80',
       amenities = ARRAY['wifi', 'pool', 'gym', 'spa', 'restaurant', 'bar', 'airport_shuttle']
 WHERE name = 'The Grand Sathorn Hotel' AND image_url IS NULL;

UPDATE properties
   SET image_url = 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80',
       amenities = ARRAY['wifi', 'pool', 'breakfast', 'parking', 'spa', 'restaurant']
 WHERE name = 'Chiang Mai Mountain Resort' AND image_url IS NULL;

UPDATE properties
   SET image_url = 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&q=80',
       amenities = ARRAY['wifi', 'pool', 'beach', 'kitchen', 'parking', 'airport_shuttle']
 WHERE name = 'Phuket Ocean View Villa' AND image_url IS NULL;

UPDATE rooms r
   SET image_url = v.image_url, bed_type = v.bed_type, size_sqm = v.size_sqm, breakfast_included = v.breakfast
  FROM (VALUES
    ('The Grand Sathorn Hotel',    'Deluxe King Room',       'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&q=80', 'King bed',            32,  FALSE),
    ('The Grand Sathorn Hotel',    'Executive Suite',        'https://images.unsplash.com/photo-1584132915807-fd1f5fbc078f?auto=format&fit=crop&q=80', 'King bed + sofa bed', 58,  TRUE),
    ('Chiang Mai Mountain Resort', 'Superior Mountain View', 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&q=80', 'Queen bed',           30,  TRUE),
    ('Phuket Ocean View Villa',    'Beachfront Pool Villa',  'https://images.unsplash.com/photo-1586611292717-f828b167408c?auto=format&fit=crop&q=80', '2 King beds',         120, TRUE)
  ) AS v(hotel, room_type_name, image_url, bed_type, size_sqm, breakfast),
       properties p
 WHERE p.name = v.hotel
   AND r.property_id = p.property_id
   AND r.room_type_name = v.room_type_name
   AND r.image_url IS NULL;

-- ------------------------------------------------------------
-- 2) โรงแรมใหม่
-- ------------------------------------------------------------
INSERT INTO properties (name, property_type, description, country, city, address,
                        latitude, longitude, star_rating, image_url, amenities)
SELECT v.name, v.property_type, v.description, 'Thailand', v.city, v.address,
       v.latitude, v.longitude, v.star_rating,
       'https://images.unsplash.com/photo-' || v.photo || '?auto=format&fit=crop&q=80', v.amenities
  FROM (VALUES
    ('Riverside Heritage Hotel', 'Hotel', 'โรงแรมสไตล์โคโลเนียลริมแม่น้ำเจ้าพระยา ใกล้ท่าเรือและ BTS สะพานตากสิน',
     'Bangkok', 'ถนนเจริญกรุง บางรัก กรุงเทพฯ', 13.72360, 100.51360, 4.5, '1571896349842-33c89424de2d',
     ARRAY['wifi', 'pool', 'breakfast', 'restaurant', 'spa', 'airport_shuttle']),
    ('Sukhumvit Urban Suites', 'Apartment', 'ห้องชุดพร้อมครัว เดินถึง BTS พร้อมพงษ์ เหมาะกับการพักยาวและทำงาน',
     'Bangkok', 'สุขุมวิท ซอย 24 คลองเตย กรุงเทพฯ', 13.73000, 100.56900, 4.0, '1560448204-e02f11c3d0e2',
     ARRAY['wifi', 'pool', 'gym', 'kitchen', 'parking']),
    ('Silom Boutique Stay', 'Boutique Hotel', 'บูทีคโฮเทลตกแต่งด้วยต้นไม้ ใจกลางย่านสีลม ใกล้ MRT สีลมและตลาดกลางคืน',
     'Bangkok', 'สีลม ซอย 4 บางรัก กรุงเทพฯ', 13.72900, 100.53400, 3.5, '1512918728675-ed5a9ecdebfd',
     ARRAY['wifi', 'breakfast', 'bar']),
    ('Skyline Tower Bangkok', 'Hotel', 'โรงแรมหรูวิวเมืองแบบพาโนรามา พร้อมสระว่ายน้ำอินฟินิตี้บนชั้น 40',
     'Bangkok', 'ถนนรัชดาภิเษก ห้วยขวาง กรุงเทพฯ', 13.76500, 100.56900, 5.0, '1542314831-068cd1dbfeeb',
     ARRAY['wifi', 'pool', 'gym', 'spa', 'restaurant', 'bar', 'parking']),
    ('Nimman Garden Boutique', 'Boutique Hotel', 'บูทีคโฮเทลกลางย่านคาเฟ่นิมมาน ห้องพักล้อมสวนเขียวร่มรื่น',
     'Chiang Mai', 'ถนนนิมมานเหมินท์ ซอย 9 เชียงใหม่', 18.79900, 98.96800, 4.0, '1606402179428-a57976d71fa4',
     ARRAY['wifi', 'pool', 'breakfast', 'bar']),
    ('Old City Lanna House', 'Guesthouse', 'เรือนไม้สไตล์ล้านนาในคูเมือง เดินถึงวัดพระสิงห์และถนนคนเดินวันอาทิตย์',
     'Chiang Mai', 'ซอยราชมรรคา 6 ในคูเมือง เชียงใหม่', 18.78700, 98.98700, 3.0, '1566073771259-6a8506099945',
     ARRAY['wifi', 'breakfast', 'parking']),
    ('Patong Bay Beach Resort', 'Resort', 'รีสอร์ทติดหาดป่าตอง สระว่ายน้ำวิวทะเล เดินถึงถนนบางลา',
     'Phuket', 'ถนนทวีวงศ์ หาดป่าตอง กะทู้ ภูเก็ต', 7.89600, 98.29600, 4.5, '1540541338287-41700207dee6',
     ARRAY['wifi', 'pool', 'beach', 'breakfast', 'spa', 'restaurant', 'bar']),
    ('Kata Palm Retreat', 'Resort', 'รีสอร์ทบรรยากาศสบายๆ ห่างหาดกะตะ 300 เมตร เหมาะกับครอบครัว',
     'Phuket', 'ถนนกะตะ กะรน เมืองภูเก็ต', 7.82000, 98.29800, 4.0, '1551882547-ff40c63fe5fa',
     ARRAY['wifi', 'pool', 'breakfast', 'family', 'parking']),
    ('Ao Nang Cliffside Resort', 'Resort', 'รีสอร์ทบนหน้าผา วิวเขาหินปูนและทะเลอันดามัน เดินลงหาดอ่าวนางได้',
     'Krabi', 'อ่าวนาง เมืองกระบี่', 8.03100, 98.82300, 4.5, '1596394516093-501ba68a0ba6',
     ARRAY['wifi', 'pool', 'beach', 'breakfast', 'spa', 'restaurant']),
    ('Railay Jungle Villas', 'Villa', 'วิลล่าท่ามกลางป่าเขตร้อน ต้องนั่งเรือหางยาวเข้า เงียบสงบและเป็นส่วนตัว',
     'Krabi', 'หาดไร่เลย์ อ่าวนาง กระบี่', 8.01100, 98.83800, 4.0, '1551918120-9739cb430c6d',
     ARRAY['wifi', 'pool', 'beach', 'breakfast', 'restaurant']),
    ('Pattaya Seaside Hotel', 'Hotel', 'โรงแรมริมชายหาดพัทยา วิวทะเลจากทุกห้อง ใกล้ถนนคนเดิน',
     'Pattaya', 'ถนนเลียบชายหาดพัทยา บางละมุง ชลบุรี', 12.93500, 100.88300, 4.0, '1455587734955-081b22074882',
     ARRAY['wifi', 'pool', 'beach', 'gym', 'restaurant', 'parking']),
    ('Jomtien Family Resort', 'Resort', 'รีสอร์ทสำหรับครอบครัว มีสระเด็กและสวนน้ำขนาดเล็ก ใกล้หาดจอมเทียน',
     'Pattaya', 'หาดจอมเทียน บางละมุง ชลบุรี', 12.88000, 100.87000, 3.5, '1600011689032-8b628b8a8747',
     ARRAY['wifi', 'pool', 'family', 'breakfast', 'parking']),
    ('Hua Hin Beachfront Villas', 'Villa', 'วิลล่าหรูติดชายหาดหัวหิน มีสระส่วนตัวและพ่อบ้านดูแลตลอดการเข้าพัก',
     'Hua Hin', 'ถนนแนบเคหาสน์ หัวหิน ประจวบคีรีขันธ์', 12.57000, 99.96000, 5.0, '1613490493576-7fde63acd811',
     ARRAY['wifi', 'pool', 'beach', 'breakfast', 'spa', 'kitchen', 'parking']),
    ('Hua Hin Town Hotel', 'Hotel', 'โรงแรมใจกลางเมืองหัวหิน ใกล้ตลาดโต้รุ่งและสถานีรถไฟหัวหิน',
     'Hua Hin', 'ถนนเพชรเกษม หัวหิน ประจวบคีรีขันธ์', 12.56800, 99.95800, 3.5, '1564501049412-61c2a3083791',
     ARRAY['wifi', 'pool', 'breakfast', 'parking']),
    ('Ayutthaya Riverside Retreat', 'Resort', 'รีสอร์ทริมแม่น้ำ มองเห็นวัดเก่าแก่ ปั่นจักรยานชมอุทยานประวัติศาสตร์ได้',
     'Ayutthaya', 'ริมแม่น้ำเจ้าพระยา พระนครศรีอยุธยา', 14.35500, 100.56800, 4.0, '1561501900-3701fa6a0864',
     ARRAY['wifi', 'pool', 'breakfast', 'restaurant', 'parking'])
  ) AS v(name, property_type, description, city, address, latitude, longitude, star_rating, photo, amenities)
 WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.name = v.name);

-- ------------------------------------------------------------
-- 3) ประเภทห้อง (รวมห้องเพิ่มของโรงแรมเดิมด้วย)
--    total_rooms บางประเภทตั้งไว้น้อย (1–2 ห้อง) เพื่อโชว์ "ห้องเหลือน้อย" และทดสอบจองพร้อมกัน
-- ------------------------------------------------------------
INSERT INTO rooms (property_id, room_type_name, description, max_guests, base_price_per_night,
                   total_rooms, image_url, bed_type, size_sqm, breakfast_included)
SELECT p.property_id, v.room_type_name, v.description, v.max_guests, v.price, v.total_rooms,
       'https://images.unsplash.com/photo-' || v.photo || '?auto=format&fit=crop&q=80',
       v.bed_type, v.size_sqm, v.breakfast
  FROM (VALUES
    ('The Grand Sathorn Hotel', 'Premier City View', 'ห้องมุมสูงวิวเมือง พร้อมโต๊ะทำงานและเครื่องชงกาแฟ', 2, 3200.00, 8, '1631049307264-da0ec9d70304', 'King bed', 38, FALSE),
    ('Chiang Mai Mountain Resort', 'Deluxe Pool Villa', 'วิลล่าพร้อมสระส่วนตัว มองเห็นดอยสุเทพ', 3, 3900.00, 4, '1573052905904-34ad8c27f0cc', 'King bed', 55, TRUE),
    ('Chiang Mai Mountain Resort', 'Family Mountain Suite', 'ห้องสวีทสำหรับครอบครัว มีมุมนั่งเล่นและระเบียงกว้าง', 4, 4500.00, 3, '1522771739844-6a9f6d5f14af', 'King bed + 2 Single beds', 62, TRUE),
    ('Phuket Ocean View Villa', 'Ocean View Suite', 'ห้องสวีทวิวทะเลอันดามัน อ่างอาบน้ำริมหน้าต่าง', 2, 7800.00, 4, '1602002418082-a4443e081dd1', 'King bed', 70, TRUE),

    ('Riverside Heritage Hotel', 'Superior Double', 'ห้องพักตกแต่งสไตล์โคโลเนียล หน้าต่างบานใหญ่', 2, 2100.00, 12, '1578683010236-d716f9a3f461', 'Queen bed', 28, TRUE),
    ('Riverside Heritage Hotel', 'River View Deluxe', 'ห้องวิวแม่น้ำเจ้าพระยา พร้อมระเบียงส่วนตัว', 2, 3400.00, 6, '1602002418082-a4443e081dd1', 'King bed', 36, TRUE),
    ('Riverside Heritage Hotel', 'Heritage Suite', 'ห้องสวีทเฟอร์นิเจอร์ไม้สัก ห้องนั่งเล่นแยก', 3, 6900.00, 2, '1590490360182-c33d57733427', 'King bed + sofa bed', 64, TRUE),

    ('Sukhumvit Urban Suites', 'Studio Suite', 'สตูดิโอพร้อมครัวเล็กและเครื่องซักผ้า', 2, 1800.00, 10, '1502672260266-1c1ef2d93688', 'Queen bed', 35, FALSE),
    ('Sukhumvit Urban Suites', 'One-Bedroom Suite', 'ห้องนอนแยกจากห้องนั่งเล่น ครัวครบชุด', 3, 2700.00, 6, '1609766857041-ed402ea8069a', 'King bed', 52, FALSE),

    ('Silom Boutique Stay', 'Standard Double', 'ห้องกะทัดรัด สะอาด ตกแต่งด้วยต้นไม้', 2, 1150.00, 8, '1590073242678-70ee3fc28e8e', 'Double bed', 22, TRUE),
    ('Silom Boutique Stay', 'Twin Room', 'ห้องเตียงคู่ เหมาะกับเพื่อนเดินทางด้วยกัน', 2, 1250.00, 6, '1595576508898-0ad5c879a061', '2 Single beds', 24, TRUE),

    ('Skyline Tower Bangkok', 'Deluxe City View', 'ห้องกระจกสูงจากพื้นถึงเพดาน วิวเมืองยามค่ำคืน', 2, 4200.00, 10, '1618773928121-c32242e63f39', 'King bed', 40, FALSE),
    ('Skyline Tower Bangkok', 'Club Room', 'สิทธิ์ใช้ Club Lounge พร้อมค็อกเทลยามเย็น', 2, 5900.00, 5, '1566665797739-1674de7a421a', 'King bed', 45, TRUE),
    ('Skyline Tower Bangkok', 'Sky Suite', 'ห้องสวีทมุมตึกชั้นสูงสุด วิวพาโนรามา 270 องศา', 3, 11500.00, 2, '1559599238-308793637427', 'King bed + sofa bed', 85, TRUE),

    ('Nimman Garden Boutique', 'Garden Double', 'ห้องติดสวน มีระเบียงนั่งจิบกาแฟ', 2, 1600.00, 8, '1505693416388-ac5ce068fe85', 'Queen bed', 26, TRUE),
    ('Nimman Garden Boutique', 'Loft Room', 'ห้องลอฟต์เพดานสูง มีโซฟาเบด', 3, 2300.00, 4, '1587874522487-fe10e954d035', 'King bed', 34, TRUE),

    ('Old City Lanna House', 'Lanna Double', 'ห้องเรือนไม้ หน้าต่างบานเฟี้ยม พัดลมเพดาน + แอร์', 2, 750.00, 6, '1590073242678-70ee3fc28e8e', 'Double bed', 20, TRUE),
    ('Old City Lanna House', 'Family Room', 'ห้องใหญ่สำหรับครอบครัว นอนได้ 4 คน', 4, 1300.00, 3, '1595576508898-0ad5c879a061', '1 Double + 2 Single beds', 32, TRUE),

    ('Patong Bay Beach Resort', 'Deluxe Sea View', 'ห้องวิวทะเลป่าตอง ระเบียงกว้าง', 2, 3600.00, 10, '1602002418082-a4443e081dd1', 'King bed', 38, TRUE),
    ('Patong Bay Beach Resort', 'Pool Access Room', 'ลงสระจากระเบียงห้องได้ทันที', 2, 4800.00, 4, '1586611292717-f828b167408c', 'King bed', 42, TRUE),
    ('Patong Bay Beach Resort', 'Family Suite', 'ห้องสวีทสองห้องนอน เหมาะกับครอบครัว', 4, 6200.00, 3, '1522771739844-6a9f6d5f14af', 'King bed + 2 Single beds', 60, TRUE),

    ('Kata Palm Retreat', 'Garden Room', 'ห้องพักวิวสวนปาล์ม เงียบสงบ', 2, 2200.00, 8, '1611892440504-42a792e24d32', 'Queen bed', 30, TRUE),
    ('Kata Palm Retreat', 'Family Room', 'ห้องกว้างสำหรับครอบครัว มีมุมเล่นสำหรับเด็ก', 4, 3300.00, 4, '1609766857041-ed402ea8069a', '1 King + 1 Single bed', 44, TRUE),

    ('Ao Nang Cliffside Resort', 'Cliff View Room', 'ระเบียงหน้าผา มองเห็นเขาหินปูนกลางทะเล', 2, 3100.00, 8, '1631049307264-da0ec9d70304', 'King bed', 34, TRUE),
    ('Ao Nang Cliffside Resort', 'Pool Villa', 'วิลล่าสระส่วนตัวขอบอินฟินิตี้ วิวพระอาทิตย์ตก', 2, 8900.00, 2, '1571003123894-1f0594d2b5d9', 'King bed', 75, TRUE),

    ('Railay Jungle Villas', 'Jungle Villa', 'วิลล่าไม้กลางป่า ห้องอาบน้ำกึ่งกลางแจ้ง', 2, 4200.00, 5, '1573052905904-34ad8c27f0cc', 'King bed', 48, TRUE),
    ('Railay Jungle Villas', 'Private Pool Villa', 'วิลล่าสระส่วนตัว ล้อมด้วยหน้าผาหินปูน', 3, 9800.00, 1, '1600566753190-17f0baa2a6c3', 'King bed', 80, TRUE),

    ('Pattaya Seaside Hotel', 'Deluxe Room', 'ห้องพักทันสมัย วิวทะเลบางส่วน', 2, 1900.00, 14, '1559599238-308793637427', 'Queen bed', 30, FALSE),
    ('Pattaya Seaside Hotel', 'Ocean Suite', 'ห้องสวีทวิวทะเลเต็มบาน พร้อมห้องนั่งเล่น', 3, 4100.00, 4, '1582719478250-c89cae4dc85b', 'King bed', 55, TRUE),

    ('Jomtien Family Resort', 'Superior Room', 'ห้องพักมาตรฐาน ใกล้สระว่ายน้ำ', 2, 1350.00, 12, '1590073242678-70ee3fc28e8e', 'Queen bed', 26, TRUE),
    ('Jomtien Family Resort', 'Family Room', 'ห้องครอบครัว มีเตียงเสริมสำหรับเด็ก', 4, 2400.00, 6, '1595576508898-0ad5c879a061', '1 Double + 2 Single beds', 40, TRUE),

    ('Hua Hin Beachfront Villas', 'Beachfront Villa', 'วิลล่าติดหาด เปิดประตูออกไปเจอทะเล', 2, 11200.00, 3, '1602002418082-a4443e081dd1', 'King bed', 90, TRUE),
    ('Hua Hin Beachfront Villas', 'Two-Bedroom Pool Villa', 'วิลล่าสองห้องนอน สระส่วนตัว และครัว', 4, 14500.00, 2, '1445019980597-93fa8acb246c', '2 King beds', 140, TRUE),

    ('Hua Hin Town Hotel', 'Standard Room', 'ห้องพักราคาประหยัด ใจกลางเมือง', 2, 1100.00, 15, '1587874522487-fe10e954d035', 'Double bed', 24, FALSE),
    ('Hua Hin Town Hotel', 'Deluxe Pool View', 'ห้องวิวสระว่ายน้ำ พร้อมระเบียง', 3, 1700.00, 8, '1578683010236-d716f9a3f461', 'King bed', 32, TRUE),

    ('Ayutthaya Riverside Retreat', 'River Deluxe', 'ห้องวิวแม่น้ำ มองเห็นวัดเก่าฝั่งตรงข้าม', 2, 2400.00, 6, '1590490360182-c33d57733427', 'King bed', 34, TRUE),
    ('Ayutthaya Riverside Retreat', 'Thai Pavilion Suite', 'เรือนไทยประยุกต์ ห้องนั่งเล่นแยก', 3, 4300.00, 2, '1573052905904-34ad8c27f0cc', 'King bed', 58, TRUE)
  ) AS v(hotel, room_type_name, description, max_guests, price, total_rooms, photo, bed_type, size_sqm, breakfast)
  JOIN properties p ON p.name = v.hotel
 WHERE NOT EXISTS (
   SELECT 1 FROM rooms r WHERE r.property_id = p.property_id AND r.room_type_name = v.room_type_name
 );

-- ------------------------------------------------------------
-- 4) ราคาตามวัน (dynamic pricing) ใน room_inventories
--    คืนวันศุกร์–เสาร์ +15% ล่วงหน้า 6 เดือน และช่วงปีใหม่ +40%
--    available_rooms = total_rooms คือเปิดขายครบทุกห้อง (ห้องว่างจริงคำนวณจากการจอง)
-- ------------------------------------------------------------
INSERT INTO room_inventories (room_id, date, available_rooms, price)
SELECT r.room_id, d::date, r.total_rooms,
       ROUND(r.base_price_per_night * CASE
         WHEN to_char(d, 'MM-DD') IN ('12-30', '12-31', '01-01') THEN 1.40
         ELSE 1.15
       END, -1)
  FROM rooms r
 CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 180, interval '1 day') AS d
 WHERE EXTRACT(ISODOW FROM d) IN (5, 6)
    OR to_char(d, 'MM-DD') IN ('12-30', '12-31', '01-01')
ON CONFLICT (room_id, date) DO NOTHING;

-- ------------------------------------------------------------
-- 5) รีวิว — รีวิวต้องผูกกับการจองที่จ่ายเงินและเข้าพักเสร็จแล้ว จึงสร้างการจองในอดีตคู่กัน
--    ผู้ใช้ตัวอย่างไม่มีรหัสผ่าน (password_hash = NULL) จึงล็อกอินไม่ได้
-- ------------------------------------------------------------
INSERT INTO users (first_name, last_name, email, password_hash, role, membership_tier) VALUES
  ('Ploy',      'Srisuk',  'ploy.demo@example.com',      NULL, 'user', 'Gold'),
  ('Kittipong', 'Wong',    'kittipong.demo@example.com', NULL, 'user', 'Silver'),
  ('Emily',     'Carter',  'emily.demo@example.com',     NULL, 'user', 'Standard'),
  ('Nattapong', 'Chai',    'natt.demo@example.com',      NULL, 'user', 'Silver'),
  ('Mai',       'Tanaka',  'mai.demo@example.com',       NULL, 'user', 'Standard'),
  ('Somchai',   'Rakdee',  'somchai.demo@example.com',   NULL, 'user', 'Gold')
ON CONFLICT (email) DO NOTHING;

WITH demo(ref, email, hotel, room, check_in, nights, guests, rating, comment) AS (VALUES
  ('AGD-2026-D0001', 'ploy.demo@example.com', 'Riverside Heritage Hotel', 'River View Deluxe', DATE '2026-08-14', 2, 2, 5.0, 'วิวแม่น้ำตอนเย็นสวยมาก พนักงานใส่ใจทุกจุด อาหารเช้าอร่อย'),
  ('AGD-2026-D0002', 'emily.demo@example.com', 'Riverside Heritage Hotel', 'Superior Double', DATE '2026-09-02', 3, 2, 4.5, 'Lovely colonial vibe and very close to the river pier. Rooms are compact but spotless.'),
  ('AGD-2026-D0003', 'kittipong.demo@example.com', 'Sukhumvit Urban Suites', 'One-Bedroom Suite', DATE '2026-07-20', 5, 2, 4.0, 'ห้องกว้าง มีครัวครบ เหมาะกับการมาทำงาน เดินไป BTS ไม่ไกล'),
  ('AGD-2026-D0004', 'mai.demo@example.com', 'Silom Boutique Stay', 'Standard Double', DATE '2026-08-05', 2, 2, 4.0, 'Cute boutique hotel with lots of plants. Great location for night markets.'),
  ('AGD-2026-D0005', 'natt.demo@example.com', 'Silom Boutique Stay', 'Twin Room', DATE '2026-09-10', 1, 2, 3.5, 'ห้องเล็กไปหน่อย แต่สะอาดและคุ้มราคา ทำเลดีมาก'),
  ('AGD-2026-D0006', 'somchai.demo@example.com', 'Skyline Tower Bangkok', 'Club Room', DATE '2026-08-22', 2, 2, 5.0, 'สระว่ายน้ำชั้นบนวิวดีที่สุดในกรุงเทพฯ บริการระดับห้าดาวจริง'),
  ('AGD-2026-D0007', 'emily.demo@example.com', 'Skyline Tower Bangkok', 'Deluxe City View', DATE '2026-07-11', 3, 1, 4.5, 'Stunning skyline views and a great gym. Breakfast is pricey but worth it.'),
  ('AGD-2026-D0008', 'ploy.demo@example.com', 'Nimman Garden Boutique', 'Garden Double', DATE '2026-07-28', 3, 2, 4.5, 'บรรยากาศร่มรื่น เดินไปคาเฟ่ได้ทั่วนิมมาน เจ้าของใจดีมาก'),
  ('AGD-2026-D0009', 'natt.demo@example.com', 'Old City Lanna House', 'Lanna Double', DATE '2026-09-05', 2, 2, 4.0, 'บ้านไม้สวย เงียบสงบ อยู่ใกล้วัดพระสิงห์ เดินเที่ยวสะดวก'),
  ('AGD-2026-D0010', 'mai.demo@example.com', 'Old City Lanna House', 'Family Room', DATE '2026-08-16', 2, 4, 3.5, 'Charming house but the walls are thin. Staff were very helpful.'),
  ('AGD-2026-D0011', 'kittipong.demo@example.com', 'Chiang Mai Mountain Resort', 'Superior Mountain View', DATE '2026-08-09', 2, 2, 5.0, 'ตื่นมาเจอหมอกบนภูเขา อากาศดีมาก อยากกลับไปอีก'),
  ('AGD-2026-D0012', 'somchai.demo@example.com', 'Patong Bay Beach Resort', 'Deluxe Sea View', DATE '2026-07-15', 4, 2, 4.5, 'ห้องวิวทะเลสวย สระใหญ่ เดินไปบางลาได้ แต่กลางคืนเสียงดังนิดหน่อย'),
  ('AGD-2026-D0013', 'emily.demo@example.com', 'Patong Bay Beach Resort', 'Pool Access Room', DATE '2026-09-12', 3, 2, 5.0, 'The pool access room was amazing. Would definitely stay again!'),
  ('AGD-2026-D0014', 'natt.demo@example.com', 'Kata Palm Retreat', 'Family Room', DATE '2026-08-01', 3, 4, 4.5, 'เหมาะกับครอบครัวมาก ลูกๆ ชอบสระว่ายน้ำ เดินไปหาดกะตะใกล้'),
  ('AGD-2026-D0015', 'ploy.demo@example.com', 'Phuket Ocean View Villa', 'Ocean View Suite', DATE '2026-09-18', 2, 2, 5.0, 'วิวทะเลอันดามันสวยที่สุด ห้องกว้างมาก บริการเป็นส่วนตัว'),
  ('AGD-2026-D0016', 'mai.demo@example.com', 'Ao Nang Cliffside Resort', 'Cliff View Room', DATE '2026-08-25', 3, 2, 4.5, 'Breathtaking limestone views from the balcony. The walk down to the beach is steep but worth it.'),
  ('AGD-2026-D0017', 'kittipong.demo@example.com', 'Ao Nang Cliffside Resort', 'Pool Villa', DATE '2026-07-04', 2, 2, 5.0, 'พูลวิลล่าเป็นส่วนตัวมาก เหมาะกับฮันนีมูน'),
  ('AGD-2026-D0018', 'somchai.demo@example.com', 'Railay Jungle Villas', 'Jungle Villa', DATE '2026-09-01', 2, 2, 4.0, 'ธรรมชาติล้วนๆ ต้องนั่งเรือหางยาวเข้าไป แต่คุ้มค่ามาก'),
  ('AGD-2026-D0019', 'emily.demo@example.com', 'Pattaya Seaside Hotel', 'Deluxe Room', DATE '2026-08-12', 2, 2, 4.0, 'Great beachfront location. The room was clean and modern.'),
  ('AGD-2026-D0020', 'natt.demo@example.com', 'Pattaya Seaside Hotel', 'Ocean Suite', DATE '2026-09-20', 2, 3, 4.5, 'ห้องสวีทวิวทะเลกว้างมาก เหมาะพาพ่อแม่มาเที่ยว'),
  ('AGD-2026-D0021', 'ploy.demo@example.com', 'Jomtien Family Resort', 'Family Room', DATE '2026-07-18', 3, 4, 4.0, 'เด็กๆ สนุกกับสวนน้ำมาก ห้องกว้างพอสำหรับ 4 คน'),
  ('AGD-2026-D0022', 'mai.demo@example.com', 'Hua Hin Beachfront Villas', 'Beachfront Villa', DATE '2026-08-29', 2, 2, 5.0, 'Absolutely perfect villa right on the beach. Best stay of the year.'),
  ('AGD-2026-D0023', 'kittipong.demo@example.com', 'Hua Hin Town Hotel', 'Deluxe Pool View', DATE '2026-09-08', 2, 2, 3.5, 'ราคาคุ้มค่า ใกล้ตลาดโต้รุ่ง แต่ห้องน้ำค่อนข้างเก่า'),
  ('AGD-2026-D0024', 'somchai.demo@example.com', 'Ayutthaya Riverside Retreat', 'River Deluxe', DATE '2026-08-03', 1, 2, 4.5, 'ปั่นจักรยานเที่ยววัดได้สบาย ตอนเย็นนั่งริมแม่น้ำบรรยากาศดีมาก'),
  ('AGD-2026-D0025', 'natt.demo@example.com', 'The Grand Sathorn Hotel', 'Executive Suite', DATE '2026-07-24', 2, 2, 4.5, 'ห้องสวีทหรูหรา สระว่ายน้ำบนดาดฟ้าวิวสวย เดินทางสะดวก'),
  ('AGD-2026-D0026', 'emily.demo@example.com', 'Chiang Mai Mountain Resort', 'Deluxe Pool Villa', DATE '2026-09-14', 3, 2, 4.5, 'Peaceful mountain escape with a lovely private pool.')
),
inserted AS (
  INSERT INTO bookings (booking_reference, user_id, property_id, room_id, check_in_date, check_out_date,
                        num_guests, total_amount, payment_status, booking_status, guest_name, guest_email)
  SELECT d.ref, u.user_id, p.property_id, r.room_id, d.check_in, d.check_in + d.nights,
         d.guests, r.base_price_per_night * d.nights, 'Paid', 'Completed',
         u.first_name || ' ' || u.last_name, u.email
    FROM demo d
    JOIN users u ON u.email = d.email
    JOIN properties p ON p.name = d.hotel
    JOIN rooms r ON r.property_id = p.property_id AND r.room_type_name = d.room
  ON CONFLICT (booking_reference) DO NOTHING
  RETURNING booking_id, booking_reference, user_id, property_id
)
INSERT INTO reviews (booking_id, user_id, property_id, rating, comment, created_at, updated_at)
SELECT i.booking_id, i.user_id, i.property_id, d.rating, d.comment,
       (d.check_in + d.nights + 1)::timestamptz, (d.check_in + d.nights + 1)::timestamptz
  FROM inserted i
  JOIN demo d ON d.ref = i.booking_reference;

-- ------------------------------------------------------------
-- 6) การชำระเงินของการจองตัวอย่าง — การจองที่ "จ่ายแล้ว" ต้องมีรายการชำระเงินคู่กัน
--    (หน้าภาพรวมหลังบ้านนับรายได้จากตาราง payments) · ให้จอง/จ่ายเงิน 14 วันก่อนเช็กอิน
--    รันซ้ำได้: แก้เฉพาะการจองตัวอย่าง (AGD-2026-D…) และเพิ่มรายการชำระเงินเฉพาะที่ยังไม่มี
-- ------------------------------------------------------------
UPDATE bookings
   SET created_at = (check_in_date - 14)::timestamptz + interval '10 hours'
 WHERE booking_reference LIKE 'AGD-2026-D%';

INSERT INTO payments (booking_id, amount, method, card_last4, status, paid_at)
SELECT b.booking_id, b.total_amount, 'card', '4242', 'Success', b.created_at + interval '5 minutes'
  FROM bookings b
 WHERE b.booking_reference LIKE 'AGD-2026-D%'
   AND LOWER(b.payment_status) = 'paid'
   AND NOT EXISTS (SELECT 1 FROM payments pm WHERE pm.booking_id = b.booking_id);
