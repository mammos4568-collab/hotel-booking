# ============================================================
# Production image — build หน้าเว็บ (Vite) แล้วให้ Express เสิร์ฟทั้ง API และหน้าเว็บจาก container เดียว
# ใช้คู่กับ docker-compose.prod.yml (ดูวิธีรันใน README หัวข้อ Deploy)
# ============================================================

# ---------- 1) build หน้าเว็บ ----------
FROM node:22-alpine AS build
WORKDIR /app
# คัดลอก package.json ก่อนโค้ด → ถ้า dependency ไม่เปลี่ยน Docker ใช้ cache ชั้นนี้ได้ ไม่ต้องติดตั้งใหม่ทุกครั้ง
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client client
RUN npm run build -w client

# ---------- 2) image สำหรับรันจริง: เฉพาะ dependency ของ server + ไฟล์หน้าเว็บที่ build แล้ว ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY server/src server/src
# สคริปต์ตั้งบทบาท (ตั้ง admin คนแรก) — รันด้วย docker compose exec ดู README หัวข้อหลังบ้าน
COPY server/scripts server/scripts
COPY --from=build /app/client/dist client/dist

ENV PORT=3000 SERVE_CLIENT=true
EXPOSE 3000
# ไม่รันด้วย root — ถ้าแอปโดนเจาะ ผู้บุกรุกจะไม่ได้สิทธิ์สูงสุดใน container
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:3000/api/health || exit 1
# ค่า env (DATABASE_URL, JWT_SECRET ...) มาจาก docker-compose.prod.yml — ไม่มีไฟล์ .env ใน image
CMD ["node", "server/src/index.js"]
