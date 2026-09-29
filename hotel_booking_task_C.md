# C --- ผู้ใช้และรีวิว (User & Reviews)

> **ผู้รับผิดชอบ:** สมาชิก C\
> **โปรเจกต์:** Hotel-Booking\
> **ทีม:** 4 คน\
> **ขอบเขต:** Authentication, User Profile, Reviews, Social Login,
> และงาน Git/Deploy ที่เกี่ยวข้อง

------------------------------------------------------------------------

## 1. เป้าหมายของงาน

รับผิดชอบระบบฝั่งผู้ใช้ให้ครบตั้งแต่การสมัครสมาชิก/เข้าสู่ระบบ ไปจนถึงการจัดการโปรไฟล์
การเขียนรีวิว และการเข้าสู่ระบบด้วย Social Login โดยต้องเชื่อมกับระบบ Booking ของทีม
B และระบบ Hotel ของทีม A/D ได้อย่างถูกต้อง

### สิ่งที่ต้องทำให้เสร็จ

-   [ ] Register / Login
-   [ ] JWT Authentication
-   [ ] `GET /api/auth/me`
-   [ ] `PUT /api/auth/me`
-   [ ] Middleware `requireAuth`
-   [ ] Middleware `requireRole`
-   [ ] เปลี่ยน password / จัดการ password อย่างปลอดภัย
-   [ ] Google Social Login
-   [ ] เชื่อม Social Account เข้ากับ User เดิมอย่างถูกต้อง
-   [ ] Reviews: สร้าง / อ่าน
-   [ ] จำกัดสิทธิ์การรีวิวตามเงื่อนไขการจอง
-   [ ] User Profile
-   [ ] AuthContext + API Authorization
-   [ ] Route Protection ฝั่ง Frontend
-   [ ] Logout
-   [ ] Error / Loading / Empty State
-   [ ] ทดสอบกรณีปกติและกรณีผิดพลาด
-   [ ] Git branch / PR / task board
-   [ ] เตรียม env สำหรับ deploy

------------------------------------------------------------------------

# 2. Backend

โครงสร้างหลัก:

``` text
server/src/modules/user/
server/src/modules/reviews/
server/src/middleware/auth.js
```

## 2.1 Register

### Endpoint

``` http
POST /api/auth/register
```

### Request

``` json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123!"
}
```

### Requirements

-   [ ] validate `name`
-   [ ] validate `email`
-   [ ] validate password
-   [ ] ตรวจ email ซ้ำ
-   [ ] hash password ด้วย `bcrypt`
-   [ ] ห้ามเก็บ password แบบ plain text
-   [ ] สร้าง user
-   [ ] ส่ง response ที่ไม่เปิดเผย password/hash
-   [ ] กำหนด role เริ่มต้นเป็น `user`

### Validation ที่ควรมี

-   email ต้องเป็นรูปแบบที่ถูกต้อง
-   password อย่างน้อย 8 ตัวอักษร
-   ควรมีตัวอักษร/ตัวเลข หรือ policy ที่ทีมกำหนด
-   trim ข้อมูลที่เหมาะสม
-   email ควร normalize เป็น lowercase

------------------------------------------------------------------------

# 3. Login

### Endpoint

``` http
POST /api/auth/login
```

### Flow

``` text
email + password
      ↓
ค้นหา user
      ↓
ตรวจ bcrypt
      ↓
สร้าง JWT
      ↓
ส่ง token / session กลับ
```

### Requirements

-   [ ] ตรวจว่า user มีอยู่จริง
-   [ ] `bcrypt.compare()`
-   [ ] สร้าง JWT
-   [ ] token มี `userId` และข้อมูลที่จำเป็นเท่านั้น
-   [ ] กำหนด expiration
-   [ ] ห้ามใส่ password/hash ลงใน JWT
-   [ ] response รูปแบบเดียวกันทั้งระบบ

ตัวอย่าง response:

``` json
{
  "user": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  },
  "token": "..."
}
```

> **หมายเหตุ:** ถ้า frontend เก็บ JWT ใน `localStorage` ต้องเข้าใจความเสี่ยงจาก
> XSS หากทีมต้องการความปลอดภัยมากขึ้น ควรพิจารณา
> `HttpOnly + Secure + SameSite cookie` แทน หรือใช้ access token
> อายุสั้นร่วมกับ refresh token

------------------------------------------------------------------------

# 4. JWT Middleware

ไฟล์:

``` text
server/src/middleware/auth.js
```

## `requireAuth`

หน้าที่:

1.  อ่าน token จาก request
2.  ตรวจรูปแบบ `Bearer <token>`
3.  verify JWT
4.  หา user ที่เกี่ยวข้อง
5.  ใส่ user ลงใน request
6.  ถ้าไม่ผ่านให้ `401 Unauthorized`

ตัวอย่างการใช้งาน:

``` js
router.get('/me', requireAuth, getMe);
```

### ต้องทดสอบ

-   [ ] ไม่มี Authorization header → 401
-   [ ] token ไม่ถูกต้อง → 401
-   [ ] token หมดอายุ → 401
-   [ ] token ถูกต้อง → ผ่าน
-   [ ] user ถูกลบหลัง token ถูกสร้าง → ควรจัดการอย่างเหมาะสม

------------------------------------------------------------------------

# 5. Role Middleware

สร้าง:

``` js
requireRole('admin')
```

หรือรูปแบบที่ทีมตกลงร่วมกัน

### ตัวอย่าง

``` js
router.get(
  '/api/admin/hotels',
  requireAuth,
  requireRole('admin'),
  controller
);
```

### Requirements

-   [ ] ไม่ login → 401
-   [ ] login แต่ role ไม่ตรง → 403
-   [ ] role ถูกต้อง → ผ่าน
-   [ ] อย่าเชื่อ role จาก frontend
-   [ ] backend เป็นผู้ตรวจสิทธิ์จริงเสมอ

------------------------------------------------------------------------

# 6. Current User

### Endpoint

``` http
GET /api/auth/me
```

ใช้สำหรับตรวจว่า token ปัจจุบันเป็นของใคร

Response:

``` json
{
  "user": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "avatarUrl": "..."
  }
}
```

### Requirements

-   [ ] ต้อง login
-   [ ] ไม่ส่ง password/hash กลับ
-   [ ] ใช้ได้เมื่อ reload หน้าเว็บ
-   [ ] frontend ใช้ endpoint นี้ restore session

------------------------------------------------------------------------

# 7. Update Profile

### Endpoint

``` http
PUT /api/auth/me
```

Fields ที่อนุญาต เช่น:

``` json
{
  "name": "John Doe",
  "phone": "0812345678",
  "avatarUrl": "https://..."
}
```

### Requirements

-   [ ] user แก้ข้อมูลของตัวเองได้
-   [ ] ห้ามส่ง `role` มาเปลี่ยนเอง
-   [ ] ห้ามแก้ `password` ผ่าน endpoint นี้ ถ้าทีมแยก change-password endpoint
-   [ ] validate ข้อมูลก่อนบันทึก
-   [ ] response ไม่เผยข้อมูลลับ

------------------------------------------------------------------------

# 8. Change Password

ควรเพิ่ม endpoint แยก:

``` http
PUT /api/auth/password
```

Request:

``` json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

### Requirements

-   [ ] ต้อง login
-   [ ] ตรวจ current password
-   [ ] validate new password
-   [ ] hash password ใหม่ด้วย bcrypt
-   [ ] ไม่เก็บ password plain text
-   [ ] พิจารณา invalidate session/token เก่าหลังเปลี่ยน password

> **แนะนำ:** เพิ่มฟีเจอร์นี้ เพราะระบบมีทั้ง password login และ social login
> การจัดการ credential ควรแยกชัดเจน

------------------------------------------------------------------------

# 9. Social Login --- Google

## เป้าหมาย

ผู้ใช้สามารถ:

``` text
Login with Google
       ↓
Google OAuth
       ↓
ตรวจ Google account
       ↓
หา user เดิม
       ↓
ถ้ามี → login
ถ้าไม่มี → สร้าง user
       ↓
สร้าง session/JWT
       ↓
กลับ frontend
```

### Endpoint ที่แนะนำ

ตัวอย่างหนึ่ง:

``` http
GET /api/auth/google
GET /api/auth/google/callback
```

หรือใช้ library/provider flow ที่ทีมเลือก

### User data ที่ควรเก็บ

อย่างน้อย:

``` text
provider
providerAccountId
email
name
avatarUrl
```

ถ้าฐานข้อมูลออกแบบแยก account table:

``` text
users
oauth_accounts
```

ตัวอย่าง:

``` text
users
- id
- name
- email
- password_hash
- role
- avatar_url
- created_at
- updated_at

oauth_accounts
- id
- user_id
- provider
- provider_account_id
- created_at
```

### สำคัญมาก: Account Linking

กรณีนี้ต้องออกแบบให้ชัด:

``` text
User สมัครด้วย email/password
        +
Login Google ด้วย email เดียวกัน
        ↓
จะ link account หรือไม่?
```

**แนะนำให้กำหนด policy ตั้งแต่ต้น** เช่น:

-   ถ้า Google account มี `providerAccountId` อยู่แล้ว → login user เดิม
-   ถ้ายังไม่มี account แต่ email ตรงกับ user เดิม → อย่า merge แบบเงียบ ๆ
    โดยไม่มีการยืนยันตัวตนเพิ่มเติม
-   ถ้าจะ link Google เข้ากับ account เดิม → ให้ user ที่ login อยู่เป็นผู้กด
    "Connect Google"

เหตุผลคือ email อย่างเดียวไม่ควรถูกใช้เป็นหลักฐานเพียงอย่างเดียวสำหรับการ merge
identity โดยไม่ออกแบบ security ให้รัดกุม

### Security

-   [ ] เก็บ `GOOGLE_CLIENT_ID` ใน environment variable
-   [ ] เก็บ `GOOGLE_CLIENT_SECRET` ใน environment variable
-   [ ] ห้าม commit secret ลง GitHub
-   [ ] ตั้ง redirect URI ให้ตรงกับ environment
-   [ ] production และ local ใช้ config แยกกัน
-   [ ] ตรวจ OAuth `state` / flow ตาม library ที่เลือก
-   [ ] อย่าเอา client secret ไปไว้ frontend

### Environment ตัวอย่าง

``` env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
JWT_SECRET=
```

------------------------------------------------------------------------

# 10. Reviews

## Create Review

``` http
POST /api/reviews
```

ตัวอย่าง:

``` json
{
  "hotelId": "hotel-123",
  "rating": 5,
  "comment": "ห้องสะอาดและบริการดี"
}
```

### Business Rule

จาก requirement เดิม:

> รีวิวได้เฉพาะการจองของตัวเองที่จ่ายเงินแล้ว และเลยวันเช็กเอาต์แล้ว

ควรตรวจจาก **Backend + Database** เท่านั้น

Flow:

``` text
POST review
    ↓
requireAuth
    ↓
หา booking ของ user + hotel
    ↓
ตรวจ payment status = paid
    ↓
ตรวจ checkout date < now
    ↓
ตรวจว่าเคย review booking นี้หรือยัง
    ↓
สร้าง review
```

### ต้องป้องกัน

-   [ ] user รีวิวโรงแรมที่ไม่เคยจองไม่ได้
-   [ ] user รีวิว booking ของคนอื่นไม่ได้
-   [ ] ยังไม่จ่ายเงิน → รีวิวไม่ได้
-   [ ] ยังไม่ถึง checkout → รีวิวไม่ได้
-   [ ] booking เดียวรีวิวซ้ำไม่ได้
-   [ ] rating ต้องอยู่ในช่วงที่กำหนด เช่น 1--5
-   [ ] comment จำกัดความยาว
-   [ ] sanitize/validate input
-   [ ] ไม่เชื่อ `userId` จาก request body

> **ข้อสำคัญ:** ควรอ้างอิง `bookingId` ตอนสร้าง review มากกว่าอ้างแค่ `hotelId`
> เพื่อป้องกันการรีวิวซ้ำและตรวจสิทธิ์ได้ชัดเจน

แนะนำ request:

``` json
{
  "bookingId": "booking-123",
  "rating": 5,
  "comment": "ห้องสะอาดและบริการดี"
}
```

------------------------------------------------------------------------

# 11. Review API

## Get Reviews by Hotel

``` http
GET /api/reviews?hotelId=123
```

ควรคืนข้อมูล:

``` json
{
  "reviews": [
    {
      "id": "review-1",
      "rating": 5,
      "comment": "ดีมาก",
      "user": {
        "id": "user-1",
        "name": "John",
        "avatarUrl": "..."
      },
      "createdAt": "..."
    }
  ]
}
```

### เพิ่มเติมที่แนะนำ

-   [ ] pagination
-   [ ] sort ล่าสุดก่อน
-   [ ] average rating
-   [ ] จำนวน review
-   [ ] rating breakdown เช่น 5 ดาวกี่คน
-   [ ] ไม่เปิดเผยข้อมูลส่วนตัวเกินจำเป็น

ตัวอย่าง:

``` json
{
  "averageRating": 4.6,
  "reviewCount": 128,
  "ratingBreakdown": {
    "5": 90,
    "4": 25,
    "3": 8,
    "2": 3,
    "1": 2
  }
}
```

------------------------------------------------------------------------

# 12. Review Ownership

ควรมี endpoint สำหรับ user จัดการ review ของตัวเอง เช่น:

``` http
GET /api/reviews/me
PUT /api/reviews/:id
DELETE /api/reviews/:id
```

ถ้าขอบเขตงานไม่พอ สามารถทำเป็น optional ได้ แต่ควรออกแบบ database
รองรับตั้งแต่แรก

### Rules

-   [ ] user แก้ review ของตัวเองได้
-   [ ] user ลบ review ของตัวเองได้
-   [ ] user แก้/ลบ review ของคนอื่นไม่ได้
-   [ ] admin จัดการ review ได้ถ้า requirement ของทีมต้องการ

------------------------------------------------------------------------

# 13. Frontend

โครงสร้าง:

``` text
client/src/pages/user/
client/src/components/
client/src/context/
```

## หน้า Login

``` text
/login
```

ต้องมี:

-   [ ] email
-   [ ] password
-   [ ] Login
-   [ ] link ไป Register
-   [ ] Google Login
-   [ ] loading state
-   [ ] error message
-   [ ] ป้องกันกดปุ่มซ้ำระหว่าง request

------------------------------------------------------------------------

# 14. Register

``` text
/register
```

Fields:

-   [ ] name
-   [ ] email
-   [ ] password
-   [ ] confirm password
-   [ ] validation
-   [ ] error state
-   [ ] success → redirect ไป login/home

------------------------------------------------------------------------

# 15. AuthContext

แนะนำ:

``` text
client/src/context/AuthContext.jsx
```

State:

``` js
user
loading
isAuthenticated
```

Methods:

``` js
login()
logout()
register()
refreshUser()
```

Flow ตอนเปิดเว็บ:

``` text
App Start
   ↓
AuthContext
   ↓
มี token/session ?
   ↓
GET /api/auth/me
   ↓
setUser()
```

### ต้องระวัง

อย่าให้ทุก component เรียก `/me` ซ้ำโดยไม่จำเป็น

------------------------------------------------------------------------

# 16. API Client

ถ้าใช้ Axios:

``` text
client/src/api.js
```

ตั้ง Authorization อัตโนมัติ เช่น:

``` http
Authorization: Bearer <token>
```

### แนะนำ

สร้าง interceptor สำหรับ:

-   [ ] attach token
-   [ ] จัดการ 401
-   [ ] logout เมื่อ session หมดอายุ
-   [ ] error handling แบบกลาง

------------------------------------------------------------------------

# 17. Protected Route

สร้าง component เช่น:

``` jsx
<ProtectedRoute>
  <Profile />
</ProtectedRoute>
```

ใช้กับ:

``` text
/profile
/bookings
/reviews
```

### Behavior

``` text
ยังไม่ login
     ↓
redirect /login
```

แต่ต้องจำไว้ว่า **Protected Route เป็น UX layer เท่านั้น**\
การป้องกันข้อมูลจริงต้องทำที่ Backend ด้วย `requireAuth`

------------------------------------------------------------------------

# 18. Profile Page

``` text
/profile
```

ควรมี:

-   [ ] avatar
-   [ ] name
-   [ ] email
-   [ ] phone
-   [ ] edit profile
-   [ ] change password
-   [ ] connected social accounts
-   [ ] logout

### Social Account Section

ตัวอย่าง:

``` text
Connected Accounts

Google      Connected
            [Disconnect]
```

หรือ:

``` text
Google      Not connected
            [Connect]
```

> ถ้าผู้ใช้มี login method เดียว ควรระวังไม่ให้ปุ่ม Disconnect ทำให้ account ไม่มีวิธี
> login เหลืออยู่

------------------------------------------------------------------------

# 19. Navbar

Navbar ควรเปลี่ยนตาม authentication:

### Guest

``` text
Login | Register
```

### Logged in

``` text
Hi, John
Profile
My Bookings
Logout
```

### Admin

ถ้า role เป็น admin:

``` text
Admin
```

แต่การแสดงปุ่มบน frontend **ไม่ใช่ security mechanism**\
Backend ต้องตรวจ role ทุกครั้ง

------------------------------------------------------------------------

# 20. Review UI

หน้า Hotel Detail ควรมี:

``` text
Hotel
├── Information
├── Room Types
├── Availability
├── Booking
└── Reviews
```

Review section:

``` text
★★★★★ 4.6 / 5
128 reviews

John
★★★★★
ห้องสะอาดและบริการดี
```

ถ้า user มีสิทธิ์รีวิว:

``` text
[Write a review]
```

ถ้าไม่มี:

``` text
คุณสามารถรีวิวได้หลังจากเข้าพักและชำระเงินเรียบร้อยแล้ว
```

------------------------------------------------------------------------

# 21. Integration กับทีม B

ทีม C ต้องประสานกับทีม B เรื่อง Booking API

อย่างน้อยต้องรู้:

``` text
GET /api/bookings/me
GET /api/bookings/:id
POST /api/bookings/:id/pay
POST /api/bookings/:id/cancel
```

และข้อมูล:

``` text
booking.id
booking.userId
booking.hotelId
booking.status
booking.paymentStatus
booking.checkIn
booking.checkOut
```

### จุดสำคัญ

Review ไม่ควรตัดสินสิทธิ์จาก frontend เช่น:

``` js
if (booking.status === 'paid') {
  showReviewButton();
}
```

frontend ใช้เพื่อแสดง UI ได้ แต่ Backend ต้องตรวจซ้ำเสมอ

------------------------------------------------------------------------

# 22. Database ที่ควรคุยกับทีม

ตารางขั้นต่ำ:

``` text
users
reviews
```

และสำหรับ Social Login:

``` text
oauth_accounts
```

## users

``` text
id
name
email
password_hash
phone
avatar_url
role
created_at
updated_at
```

## reviews

``` text
id
booking_id
user_id
hotel_id
rating
comment
created_at
updated_at
```

## oauth_accounts

``` text
id
user_id
provider
provider_account_id
created_at
```

### Constraints ที่แนะนำ

ควรพิจารณา:

``` text
UNIQUE(users.email)

UNIQUE(
  oauth_accounts.provider,
  oauth_accounts.provider_account_id
)

UNIQUE(reviews.booking_id)
```

`UNIQUE(reviews.booking_id)` เหมาะถ้า business rule คือ 1 booking = 1
review

------------------------------------------------------------------------

# 23. Error Response

แนะนำให้ Backend ใช้ format กลาง:

``` json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect"
  }
}
```

ตัวอย่าง code:

``` text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
EMAIL_ALREADY_EXISTS
INVALID_CREDENTIALS
REVIEW_NOT_ALLOWED
REVIEW_ALREADY_EXISTS
NOT_FOUND
```

Frontend จะจัดการ error ได้ง่ายขึ้น

------------------------------------------------------------------------

# 24. Security Checklist

-   [ ] bcrypt password
-   [ ] JWT secret อยู่ใน `.env`
-   [ ] Google Client Secret อยู่ใน `.env`
-   [ ] `.env` อยู่ใน `.gitignore`
-   [ ] ไม่ commit secret ลง GitHub
-   [ ] validate input ฝั่ง backend
-   [ ] authorization ทุก protected endpoint
-   [ ] ไม่เชื่อ `userId` จาก frontend
-   [ ] ไม่ส่ง password/hash ใน response
-   [ ] จำกัดความยาว review
-   [ ] ตรวจ ownership ของ booking/review
-   [ ] ตั้ง token expiration
-   [ ] CORS จำกัด origin ตาม environment
-   [ ] พิจารณา rate limit สำหรับ login/register
-   [ ] พิจารณา rate limit สำหรับ review
-   [ ] production ใช้ HTTPS

------------------------------------------------------------------------

# 25. Testing

## Auth

-   [ ] Register สำเร็จ
-   [ ] Register email ซ้ำ
-   [ ] Register password ไม่ผ่าน validation
-   [ ] Login สำเร็จ
-   [ ] Login password ผิด
-   [ ] Login email ไม่มี
-   [ ] GET `/me` พร้อม token
-   [ ] GET `/me` ไม่มี token
-   [ ] token หมดอายุ
-   [ ] Logout

## Social Login

-   [ ] Google login ครั้งแรก
-   [ ] Google login ครั้งถัดไป
-   [ ] Google account เดิมเข้า user เดิม
-   [ ] OAuth callback ผิดพลาด
-   [ ] redirect URI ผิดใน development
-   [ ] production callback ใช้งานได้
-   [ ] ไม่ expose client secret

## Profile

-   [ ] ดู profile
-   [ ] แก้ชื่อ
-   [ ] แก้เบอร์
-   [ ] เปลี่ยน password
-   [ ] เปลี่ยนข้อมูลโดยไม่ login
-   [ ] พยายามแก้ role ผ่าน request

## Review

-   [ ] รีวิว booking ที่จ่ายแล้วและ checkout แล้ว
-   [ ] รีวิวก่อน checkout
-   [ ] รีวิวก่อนจ่ายเงิน
-   [ ] รีวิว booking ของคนอื่น
-   [ ] รีวิวซ้ำ
-   [ ] rating ต่ำกว่า 1
-   [ ] rating สูงกว่า 5
-   [ ] comment ยาวเกินกำหนด
-   [ ] แก้ review ของตัวเอง
-   [ ] แก้ review ของคนอื่น

------------------------------------------------------------------------

# 26. Git / GitHub Workflow

ไม่ควรทำทุกอย่างบน `main`

แนะนำ:

``` text
main
 └── develop
      ├── feature/auth
      ├── feature/google-login
      ├── feature/reviews
      └── feature/user-profile
```

หรือถ้าทีมใช้ trunk-based ก็ใช้ feature branch + PR ได้

## Commit ตัวอย่าง

``` text
feat(auth): add user registration
feat(auth): add JWT login
feat(auth): add Google OAuth
feat(review): add create review endpoint
feat(review): add hotel review listing
feat(user): add profile page
fix(auth): handle expired JWT
fix(review): prevent duplicate reviews
test(auth): add login tests
```

## Pull Request Checklist

-   [ ] อธิบายว่าทำอะไร
-   [ ] บอก endpoint ที่เพิ่ม/แก้
-   [ ] บอก database migration ที่เกี่ยวข้อง
-   [ ] มี screenshot ถ้าแก้ frontend
-   [ ] ทดสอบแล้ว
-   [ ] ไม่มี `.env` / secret
-   [ ] ไม่แก้ไฟล์ของเพื่อนโดยไม่จำเป็น

------------------------------------------------------------------------

# 27. Definition of Done

งาน C ถือว่าเสร็จเมื่อ:

### Backend

-   [ ] Register ใช้งานได้
-   [ ] Login ใช้งานได้
-   [ ] JWT middleware ใช้งานได้
-   [ ] Role middleware ใช้งานได้
-   [ ] `/me` ใช้งานได้
-   [ ] Update profile ใช้งานได้
-   [ ] Google Login ใช้งานได้
-   [ ] Reviews ใช้งานได้
-   [ ] ตรวจสิทธิ์การรีวิวจาก booking จริง
-   [ ] Review ซ้ำไม่ได้
-   [ ] API error เป็นมาตรฐาน

### Frontend

-   [ ] Login
-   [ ] Register
-   [ ] Google Login
-   [ ] AuthContext
-   [ ] Protected Routes
-   [ ] Navbar ตามสถานะ login
-   [ ] Profile
-   [ ] Change Password
-   [ ] Review UI
-   [ ] Loading / Error / Empty State

### Security

-   [ ] password hash
-   [ ] secrets ใน env
-   [ ] backend authorization
-   [ ] validation
-   [ ] ownership checks
-   [ ] ไม่มี secret ใน Git

### Integration

-   [ ] ทดสอบร่วมกับทีม B เรื่อง booking
-   [ ] ทดสอบร่วมกับทีม A/D เรื่อง hotel
-   [ ] API contract ตรงกัน
-   [ ] deploy environment มี OAuth config
-   [ ] production login ใช้งานได้

------------------------------------------------------------------------

# 28. สิ่งที่ควรเพิ่มจาก Requirement เดิม

## Priority สูง

### 1. Google Social Login

ต้องเพิ่มเพราะเป็น requirement ใหม่ของโปรเจกต์

``` text
Google OAuth
→ account linking
→ session/JWT
→ frontend AuthContext
```

### 2. Change Password

ไม่ควรรวมกับ update profile

``` text
PUT /api/auth/me
PUT /api/auth/password
```

### 3. Review ผูกกับ Booking

จากเดิมใช้ `hotelId` อย่างเดียว แนะนำให้ใช้:

``` text
bookingId
```

เพื่อยืนยันว่า user เคยใช้บริการจริง

### 4. Review Duplicate Protection

เพิ่ม database constraint:

``` text
UNIQUE(booking_id)
```

ถ้า business rule เป็น 1 review ต่อ 1 booking

### 5. OAuth Account Table

ไม่ควรใส่ Google ID แบบ hard-code ไว้ใน `users` ถ้ามีโอกาสรองรับ provider
อื่นในอนาคต

------------------------------------------------------------------------

# 29. สิ่งที่ควรเพิ่มถ้ามีเวลา

## Optional

-   [ ] Forgot Password
-   [ ] Reset Password ผ่าน email
-   [ ] Email verification
-   [ ] Resend verification email
-   [ ] Google account linking/disconnecting
-   [ ] User's booking history
-   [ ] My Reviews
-   [ ] Edit/Delete Review
-   [ ] Review pagination
-   [ ] Review summary
-   [ ] Avatar upload
-   [ ] Login rate limiting
-   [ ] Audit log
-   [ ] Refresh token / session management

------------------------------------------------------------------------

# 30. ลำดับการทำงานที่แนะนำ

อย่าทำ Social Login ก่อนระบบพื้นฐาน เพราะจะทำให้ debug ยาก

``` text
1. Database User
       ↓
2. Register
       ↓
3. Login
       ↓
4. JWT Middleware
       ↓
5. /me
       ↓
6. AuthContext
       ↓
7. Protected Route
       ↓
8. Profile
       ↓
9. Booking integration
       ↓
10. Review API
       ↓
11. Review UI
       ↓
12. Google OAuth
       ↓
13. Account Linking
       ↓
14. Testing
       ↓
15. Deploy
```

------------------------------------------------------------------------

# 31. API Contract ที่ควรส่งให้เพื่อนในทีม

ส่งรายการนี้ให้ทีม B และทีม A/D เพื่อให้ทุกคนใช้ชื่อ field ตรงกัน:

``` text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
PUT    /api/auth/me
PUT    /api/auth/password

GET    /api/auth/google
GET    /api/auth/google/callback

POST   /api/reviews
GET    /api/reviews?hotelId=:hotelId
GET    /api/reviews/me
PUT    /api/reviews/:id
DELETE /api/reviews/:id
```

และตกลง field หลัก:

``` text
User:
id
name
email
phone
avatarUrl
role

Booking:
id
userId
hotelId
paymentStatus
checkIn
checkOut

Review:
id
bookingId
userId
hotelId
rating
comment
createdAt
updatedAt
```

------------------------------------------------------------------------

# 32. สรุป Scope ของสมาชิก C

**Core**

``` text
Authentication
├── Register
├── Login
├── JWT
├── Logout
├── /me
├── Profile
└── Change Password

Social Login
├── Google OAuth
├── OAuth Account
└── Account Linking

Reviews
├── Create Review
├── List Reviews
├── Ownership
├── Booking Validation
└── Duplicate Protection

Frontend
├── Login
├── Register
├── Google Login
├── AuthContext
├── Protected Route
├── Profile
├── Navbar
└── Review UI
```

**เป้าหมายหลัก:** ทำให้ระบบรู้ว่า "ใครเป็นคนใช้ระบบ", "ผู้ใช้มีสิทธิ์ทำอะไร", และ
"ผู้ใช้มีสิทธิ์รีวิวโรงแรมไหน" โดยให้ Backend เป็นผู้ตัดสินสิทธิ์จริง และ Frontend
ทำหน้าที่แสดงประสบการณ์ใช้งานให้เหมาะสม
