# Railway Staging Checklist (FAZA 10)

Bu hujjat `SALEC` ni Railway’da staging sifatida tez va xavfsiz ishga tushirish uchun.

---

## 1) Architecture (tavsiya)

1. `backend` service (`/backend`)
2. `frontend` service (`/frontend`)
3. Railway Postgres plugin
4. (Ixtiyoriy) Railway Redis plugin

Tashqi URL:

- Frontend: `https://<frontend>.up.railway.app`
- Backend: `https://<backend>.up.railway.app`

### Siz tanlagan domen bilan (amaliy misol)

- Frontend (asosiy): `https://xens.up.railway.app`
- Backend (alohida service domeni): masalan `https://xens-api.up.railway.app`
- Frontend env:
  - `NEXT_PUBLIC_API_URL=https://xens-api.up.railway.app`
- Backend env:
  - `CORS_ALLOWED_ORIGINS=https://xens.up.railway.app`

---

## 2) Backend service sozlamasi

- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm run start`

### Backend env (minimal)

- `NODE_ENV=production`
- `DATABASE_URL=<Railway Postgres URL>`
- `REDIS_URL=<Railway Redis URL yoki tashqi Redis>`
- `JWT_ACCESS_SECRET=<min 32 belgi>`
- `JWT_REFRESH_SECRET=<min 32 belgi>`
- `CORS_ALLOWED_ORIGINS=https://<frontend>.up.railway.app`
- `AUTH_LOGIN_RATE_MAX=30`
- `AUTH_LOGIN_RATE_WINDOW_MS=900000`

`PORT` ni Railway o‘zi beradi (backend `0.0.0.0`da tinglaydi).

---

## 3) Frontend service sozlamasi

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Start command: `npm run start`

### Frontend env (minimal)

- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app`

---

## 4) Birinchi deploydan keyin

Backend service shell/command’da:

```bash
npm run db:deploy
```

Test seed kerak bo‘lsa stagingda:

```bash
npm run db:seed
```

---

## 5) Smoke test (staging URL bilan)

1. `GET https://<backend>.up.railway.app/health` -> `200`
2. `GET https://<backend>.up.railway.app/ready` -> `status: ready`
3. `https://<frontend>.up.railway.app/login` ochiladi
4. Login -> dashboard
5. `/orders/new` -> zakaz yaratish -> `/orders`
6. `/reports` ochilishi

`xens` uchun tayyor tekshiruv:

1. `GET https://xens-api.up.railway.app/health` -> `200`
2. `GET https://xens-api.up.railway.app/ready` -> `status: ready`
3. `https://xens.up.railway.app/login` ochiladi
4. Login -> dashboard
5. `/orders/new` -> zakaz yaratish -> `/orders`
6. `/reports` ochilishi

---

## 6) Tez-tez uchraydigan muammolar

- **CORS xato**: `CORS_ALLOWED_ORIGINS` faqat frontend domen bo‘lsin, vergul bilan ko‘p domain ham mumkin.
- **500 / Prisma schema xatosi**: `npm run db:deploy` ishlatilmagan.
- **Auth ishlamaydi**: `JWT_*` default emasligini tekshiring (prod’da default bilan start bo‘lmaydi).
- **Frontend APIga urolmayapti**: `NEXT_PUBLIC_API_URL` backend URLga tengligini tekshiring.

---

## 7) Reja bilan bog‘lanishi

- FAZA 10 deploy testi uchun staging sifatida aynan shu hujjat ishlatiladi.
- Prodga chiqishda: `docs/PROD-CHECKLIST.md`.
