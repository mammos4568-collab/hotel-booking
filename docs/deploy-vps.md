# ขึ้นเว็บบน VPS จริง (HTTPS) — ทีละขั้น

ใช้ไฟล์ชุดเดียวกับตอนรัน production บนเครื่อง (`Dockerfile`, `docker-compose.prod.yml`) แล้วเพิ่ม `--profile https`
ให้ **Caddy** (`Caddyfile`) เป็นประตูหน้าเว็บ: ขอใบรับรอง HTTPS ฟรีจาก Let's Encrypt และต่ออายุให้เอง

```
ผู้ใช้ ──https (443)──▶ Caddy ──http ภายใน──▶ app:3000 (API + หน้าเว็บ) ──▶ db:5432 (PostgreSQL)
        http (80) → redirect ไป https        พอร์ต 8080 ผูกกับ 127.0.0.1    ไม่เปิดพอร์ตออกนอกเครื่อง
```

ทั้งหมดใช้ของฟรี: โดเมนย่อยฟรี (DuckDNS) · ใบรับรอง Let's Encrypt · Opn โหมดทดสอบ · VM ฟรี/เครดิตนักศึกษา

---

## 0. สิ่งที่ต้องมี

- **VM Ubuntu 22.04 หรือ 24.04** ที่มี IP สาธารณะ (x86 หรือ ARM ก็ได้ — image ที่ใช้รองรับทั้งคู่)
  RAM 2 GB ขึ้นไปสบายสุด (1 GB ได้ แต่ต้องเพิ่ม swap ในข้อ 1 ไม่งั้น build หน้าเว็บไม่ผ่าน) · ดิสก์ 10 GB ขึ้นไป
  ตัวอย่างที่ฟรี: Oracle Cloud Always Free, Google Cloud free tier (e2-micro), Azure for Students
  (เงื่อนไขของแต่ละเจ้าเปลี่ยนได้ เช็กหน้าเว็บผู้ให้บริการก่อนสมัคร)
- **โดเมน** — ไม่มีก็ใช้โดเมนย่อยฟรีของ [DuckDNS](https://www.duckdns.org): ล็อกอิน → ตั้งชื่อ เช่น `myhotel`
  → ช่อง current ip ใส่ IP ของ VM → ได้ `myhotel.duckdns.org`
- เปิดพอร์ตขาเข้า **22, 80, 443** ที่หน้า console ของผู้ให้บริการ (Security group / Network security group / Security list)

> ด้านล่างใช้ `myhotel.duckdns.org` เป็นตัวอย่าง — เปลี่ยนเป็นโดเมนของคุณทุกที่

---

## 1. เตรียมเครื่อง (SSH เข้า VM)

```bash
# ติดตั้ง Docker + Docker Compose (สคริปต์ทางการของ Docker)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # แล้ว logout / login ใหม่ จะใช้ docker ได้โดยไม่ต้อง sudo
docker compose version              # เช็กว่าติดตั้งแล้ว

# firewall ในเครื่อง (อนุญาต SSH ก่อนเปิด ไม่งั้นตัดตัวเองออกจากเครื่อง)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

- **Oracle Cloud** ไม่ใช้ ufw — ต้องเปิดใน iptables ของเครื่องแทน:
  `sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save`
- **RAM 1 GB** เพิ่ม swap 2 GB ก่อน build:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

เช็กว่าโดเมนชี้มาถูกเครื่อง: `getent hosts myhotel.duckdns.org` ต้องได้ IP ของ VM

---

## 2. ดึงโค้ด + ตั้งค่าความลับ

```bash
git clone https://github.com/mammos4568-collab/hotel-booking.git
cd hotel-booking
git checkout main                   # branch ที่จะโชว์ (งานต้อง merge เข้าแล้ว)

cp .env.production.example .env.production
openssl rand -hex 24                # คัดลอกไปเป็น POSTGRES_PASSWORD
openssl rand -hex 32                # คัดลอกไปเป็น JWT_SECRET
nano .env.production
chmod 600 .env.production           # ให้เจ้าของเครื่องอ่านได้คนเดียว
```

ค่าที่ต้องแก้ใน `.env.production`:

| ค่า | ตั้งเป็น | ทำไม |
|---|---|---|
| `POSTGRES_PASSWORD` | ค่าสุ่มจาก `openssl` | รหัสฐานข้อมูล (ตั้งได้ครั้งเดียวตอนสร้างฐานข้อมูลครั้งแรก) |
| `JWT_SECRET` | ค่าสุ่มจาก `openssl` | กุญแจเซ็นคุกกี้ล็อกอิน — รู้ค่านี้ = ปลอมตัวเป็นใครก็ได้ |
| `PUBLIC_URL` | `https://myhotel.duckdns.org` (ไม่มี `/` ท้าย) | Caddy ใช้ขอใบรับรอง · แอปใช้ตรวจ CORS, callback ล็อกอิน, ลิงก์กลับจาก TrueMoney |
| `TRUST_PROXY` | `1` | เชื่อ IP ที่ Caddy ส่งต่อมา → rate limit นับรายคน ไม่ใช่นับทุกคนเป็น IP ของ Caddy |

repo เป็น private: ตอน `git clone` ใส่ชื่อผู้ใช้ GitHub + Personal Access Token แทนรหัสผ่าน · **ห้าม commit `.env.production`**

---

## 3. รัน

ตั้งชื่อย่อคำสั่งไว้ก่อน (ต้องรันในโฟลเดอร์ `hotel-booking`) — ทุกคำสั่งข้างล่างใช้ `dc`:

```bash
echo "alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production --profile https'" >> ~/.bashrc
source ~/.bashrc

dc up -d --build                    # ครั้งแรก build หลายนาที
dc ps                               # db, app, caddy ต้อง Up (app ขึ้น healthy)
dc logs caddy | grep -i "certificate obtained"   # ขอใบรับรองสำเร็จแล้ว
```

เปิด `https://myhotel.duckdns.org` — ครั้งแรกฐานข้อมูลสร้างตาราง + ข้อมูลตัวอย่างจาก `db/01–06` ให้เอง

**ตั้ง admin คนแรก:** สมัครสมาชิกผ่านหน้าเว็บก่อน แล้ว

```bash
dc exec app node server/scripts/set-role.js <อีเมลที่สมัคร> admin
```

---

## 4. ล็อกอินด้วย Google / GitHub · ชำระเงินผ่าน Opn (ไม่บังคับ)

**Google** — ใช้ OAuth client เดิมที่ใช้กับ localhost ได้เลย (Google ใส่ redirect URI ได้หลายอัน)
Google Auth Platform → Clients → เลือก client → Authorized redirect URIs กด Add URI:
`https://myhotel.duckdns.org/api/auth/google/callback` (ถ้า Google ให้เพิ่มโดเมนใน Branding → Authorized domains ก็ใส่ `myhotel.duckdns.org`)
แล้วใส่ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ใน `.env.production` → `dc up -d`
ยังเป็นโหมด Testing อยู่ → ล็อกอินได้เฉพาะอีเมลใน Test users (เพิ่มอีเมลอาจารย์/เพื่อนไว้ก่อนวันพรีเซนต์)

**GitHub** — OAuth App ของ GitHub ใส่ callback ได้ที่เดียว จึงต้อง **สร้างอันใหม่** สำหรับเว็บจริง (อันเดิมใช้กับ localhost ต่อ)
GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

- Homepage URL: `https://myhotel.duckdns.org`
- Authorization callback URL: `https://myhotel.duckdns.org/api/auth/github/callback`

ใส่ `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` ใน `.env.production` แล้ว `dc up -d` (สร้าง container แอปใหม่ด้วยค่าใหม่)

**Opn (TrueMoney โหมดทดสอบ)** — ใส่ `OMISE_SECRET_KEY` / `OMISE_PUBLIC_KEY` (key ทดสอบ `skey_test_…` / `pkey_test_…`)
ใน `.env.production` แล้ว `dc up -d` · ใน dashboard ของ Opn (โหมด Test) ตั้ง webhook เป็น
`https://myhotel.duckdns.org/api/bookings/gateway/webhook` — ลูกค้าจ่ายแล้วปิดแอปไม่กลับมาเว็บ ระบบก็ยังได้ผล

---

## 5. ตรวจหลังขึ้นเว็บ

- [ ] `https://myhotel.duckdns.org` เปิดได้ มีรูปกุญแจ · พิมพ์ `http://` แล้วเด้งไป `https://`
- [ ] `https://myhotel.duckdns.org/api/health` ได้ `{"ok":true}`
- [ ] สมัคร / ล็อกอิน / ออกจากระบบได้ (คุกกี้เป็น `Secure` ต้องผ่าน https เท่านั้น)
- [ ] จอง + จ่ายด้วยบัตรทดสอบ `4242 4242 4242 4242` ได้ · พิมพ์เลขบัตรอื่นแล้วหน้าเว็บไม่ยอมส่ง
- [ ] เข้าหลังบ้าน `/admin` ได้หลังตั้ง admin
- [ ] จากเครื่องตัวเอง `curl -m 5 http://<IP ของ VM>:8080` ต้อง **เข้าไม่ได้** (แอปเปิดแค่ใน VM ให้ Caddy)
- [ ] (ถ้าตั้ง) ล็อกอินด้วย Google / GitHub · จ่าย TrueMoney ผ่าน Opn แล้วกด Successful

---

## 6. ดูแลหลังขึ้นเว็บ

```bash
# อัปเดตโค้ด
git pull
dc up -d --build

# ไฟล์ db ที่รันซ้ำได้ (03–06) — ฐานข้อมูลเดิมไม่รันให้เองอีก ต้องสั่งเมื่อมีไฟล์ใหม่/แก้ เช่น
dc exec -T db psql -U agoda_admin -d agoda_db -f /docker-entrypoint-initdb.d/06-payment-gateway.sql

# สำรองข้อมูล — ไฟล์มีข้อมูลส่วนบุคคล เก็บไว้นอกโฟลเดอร์โปรเจกต์ (กันเผลอ commit) และห้ามแชร์
dc exec -T db pg_dump -U agoda_admin agoda_db > ~/backup-$(date +%F).sql

dc logs -f app                      # ดู log แอป (ไม่มีข้อมูลส่วนตัว — แอปไม่ log body/cookie)
dc down                             # หยุดทั้งหมด (ข้อมูลยังอยู่)
```

`dc down -v` = **ลบฐานข้อมูลและใบรับรองทิ้งทั้งหมด** — อย่าใช้ถ้าไม่ได้ตั้งใจล้างเว็บ

---

## ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `dc logs caddy` มี `challenge failed` / `timeout` | โดเมนยังไม่ชี้มาที่ IP ของ VM หรือพอร์ต 80/443 ถูกปิด (เช็ก console ของผู้ให้บริการ + ufw/iptables) |
| build หยุดกลางทาง `exit code 137` | RAM ไม่พอ → เพิ่ม swap (ข้อ 1) |
| เปิดเว็บได้ `502` | แอปยังไม่ขึ้น → `dc ps`, `dc logs app` |
| ล็อกอินแล้วเด้งออก / เรียก API ได้ `403` | `PUBLIC_URL` ไม่ตรงกับที่พิมพ์ในเบราว์เซอร์ (ต้อง `https://` และไม่มี `/` ท้าย) แก้แล้ว `dc up -d` |
| ล็อกอิน GitHub ขึ้น `redirect_uri is not associated` | callback ใน OAuth App ไม่ตรงกับ `<PUBLIC_URL>/api/auth/github/callback` |
| ล็อกอิน Google ขึ้น `Error 400: redirect_uri_mismatch` | ยังไม่ได้เพิ่ม `<PUBLIC_URL>/api/auth/google/callback` ใน Authorized redirect URIs ของ client |
| ล็อกอิน Google ขึ้น `access_denied` / ไม่ให้เข้า | แอปยังเป็นโหมด Testing และอีเมลนั้นไม่อยู่ใน Test users |

---

## ตอบอาจารย์: เว็บจริงปลอดภัยแค่ไหน

- **HTTPS ทุกหน้า** — Caddy ขอใบรับรองเอง, redirect http → https, ส่ง HSTS ให้เบราว์เซอร์ใช้ https ตลอด
- **เปิดออกอินเทอร์เน็ตแค่ 22 / 80 / 443** — ฐานข้อมูลไม่มีพอร์ตออกนอก, แอปผูกกับ `127.0.0.1`
  (บน Linux พอร์ตที่ Docker เปิดแบบ `0.0.0.0` ทะลุ ufw ได้ จึงต้องผูกเอง)
- **ความลับอยู่ใน `.env.production` บน VM เท่านั้น** — ไม่อยู่ใน git, ไม่อยู่ใน image (`.dockerignore` กัน `.env*` ไว้)
- **คุกกี้ล็อกอิน `HttpOnly` + `Secure` + `SameSite=Lax`** — JavaScript อ่านไม่ได้ และส่งผ่าน https เท่านั้น
- **ชำระด้วยบัตรเป็นการจำลอง รับเฉพาะบัตรทดสอบ** — หน้าเว็บบล็อกเลขอื่นก่อนส่ง ถ้ามีคนเผลอพิมพ์บัตรจริง เลขไม่ออกจากเบราว์เซอร์
- **PDPA** — Caddy ไม่เก็บ access log, แอปไม่ log body / cookie, ขอสำเนาข้อมูล/ลบบัญชีได้เองที่หน้า "ข้อมูลส่วนบุคคลของฉัน" (`/privacy/my-data`)
