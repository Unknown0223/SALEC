# Phase Gates

This checklist is the release gate for each phase. A phase is complete only when all relevant boxes are checked.

> **Jarayon foizi, qisman bajarilgan bandlar va keyingi qadam:** [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md)

**Eslatma (2026-03-29):** FAZA **0–4** checklist MVP sifatida yopilgan. **FAZA 5+** (chuqur ombor, moliya, GPS, Flutter, E2E/deploy) alohida iteratsiyalar. **Super-admin / ko‘p diler** boshqaruvi va **Redis** orqali SSE ko‘p instans — keyingi ishlar.

## Platforma (doimiy)

- [x] Ko‘p foydalanuvchi: kritik yozuvlar **transaction** strategiyasi hujjatlangan (`docs/NON_FUNCTIONAL.md`) — zakaz/kredit/balans/merge; kilitleme rejasi Faza 5+ uchun qisqa reja
- [x] API xatolarda `requestId` va strukturalangan `error` maydoni
- [x] CI: migratsiya + testlar; o‘zgarishlar mavjud jarayonlarni buzmasligi
- [x] Yagona klientlar bazasi: `phone_normalized`, dublikat guruhlari, `check-duplicates`, `merge`, Web UI (filtr + qidiruv), audit; DB **qisman UNIQUE** tavsiyasi `NON_FUNCTIONAL.md` da (seed dublikatlari sinov uchun)

Batafsil: [`NON_FUNCTIONAL.md`](./NON_FUNCTIONAL.md)

## FAZA 0 - Fundamental zamin

- [x] `docker compose up -d` starts PostgreSQL and Redis
- [x] `backend` dependencies install successfully
- [x] `GET /health` returns `200` with `{ status: "ok", time }`
- [x] Prisma migration `init` applies successfully
- [x] `npm run test:ci` is green in `backend`
- [x] `.env.example` exists and is complete

## FAZA 1 - Server + DB + Auth + Tenant

- [x] `tenant.plugin` resolves tenant from slug or `X-Tenant-Slug`
- [x] `POST /auth/login` and `POST /api/auth/login` work for valid tenant user
- [x] `GET /auth/me` and `GET /api/auth/me` work with Bearer access token
- [x] `POST /auth/refresh` rotates refresh token
- [x] Protected route without token returns `401`
- [x] Wrong tenant slug/header returns `404` or `403`
- [x] Prisma domain tables (clients, products, warehouses, stock, orders, bonus_rules) migrated
- [x] `prisma db seed` creates `test1`, `demo`, admin/operator, mahsulotlar, kategoriyalar, omborlar, zakaz namunasi, bir nechta bonus qoidalari (batafsil: `PHASE_PROGRESS.md`)
- [x] `GET /api/:slug/clients` returns tenant-scoped list when DB is available
- [x] Integration tests are green (`auth.integration.test.ts`; `clients.integration.test.ts` runs when DB reachable)
- [x] CI workflow runs `migrate deploy`, `db seed`, tests, and build on `main` / `master`

## FAZA 2 - Next.js panel + spravochniklar (reja: hafta 3-4)

- [x] `frontend` builds (`npm run build`) and `middleware.ts` protects `/dashboard`
- [x] Login page calls backend `/auth/login`; session cookie + Zustand state aligned
- [x] Mahsulotlar API + UI (CRUD, jadval, Excel import)
- [x] Narxlar moduli (getProductPrice, `product_prices`, bulk import, panelda chakana ustuni) — zakazda qo‘llash Faza 4
- [x] Bonus qoidalari CRUD + toggle (`/api/:slug/bonus-rules`, `/bonus-rules`)
- [x] Boshqa spravochniklar: omborlar + foydalanuvchilar API; mahsulot kategoriyalari **CRUD** (admin); `GET .../price-types`; to‘lov / qaytarish / hududlar — `tenant.settings.references` + `/settings/company` + `/settings/spravochnik` UI
- [x] Sozlamalar: kompaniya profili (`GET/PATCH .../settings/profile`: nom, telefon, manzil, logo, `feature_flags`, `references`); super-admin dilerlar — keyingi bosqich (multi-tenant boshqaruv)

## FAZA 3 - Klientlar (reja: hafta 5)

- [x] Telefon normalizatsiyasi + dublikat guruhlari API + merge (zakazlarni saqlab)
- [x] Dublikatlar Web UI: qidiruv, **guruh hajmi filtri** (2+/3+/4+), merge tasdiq, ok/err xabarlar
- [x] Klientlar API: ro‘yxat filtrlari, `PATCH`, `client_balances` + harakatlar, **`GET .../clients/:id/audit`**
- [x] `client_balances` + zakazda kredit tekshiruvi: **headroom = credit_limit + account_balance** (ochiq zakazlar + yangi summa)
- [x] Web UI: ro‘yxat, kartochka (**Asosiy / Balans / Zakazlar / Tarix**), kredit progress bar, manzil uchun **xarita** havolasi
- [x] Qat’iy yagona telefon: ilova darajasida dublikatlar va merge; DB qisman UNIQUE — `NON_FUNCTIONAL.md` (prod ma’lumot tayyor bo‘lganda)

## FAZA 4 - Zakaz + bonus + status (reja: hafta 6-9)

- [x] `bonus.engine` (qty/sum/discount, stack, `once_per_client`) zakazda qo‘llanadi; **unit testlar** — `order-bonus-apply.pure.test.ts` (filtr funksiyalari)
- [x] Zakaz yaratish / qatorlarni yangilash — bitta **transaction** (narx, bonus, kredit+balans, loglar where implemented)
- [x] 7 status, `PATCH` o‘tishlar, rol cheklovlari, status/change loglar + UI
- [x] Real-time: **SSE** `GET .../stream/orders` (WebSocket shart emas — gate «yoki»)
- [x] Zakaz Web UI: ro‘yxat (URL filtrlari), tafsilot, tahrir, bonus qatorlari, jurnal; operator cheklovlari

## FAZA 5 - Ombor + nakladnoy (reja: hafta 10-12)

- [ ] Stock, prixod, picking, korrektirovka, filial transfer API
- [ ] PDF 518 / 210 / ko‘chirish (Puppeteer yoki worker)
- [ ] Ombor Web UI (qoldiq ranglari, picking, nakladnoy tugmalari)

## FAZA 6 - Moliya (reja: hafta 13)

- [ ] To‘lovlar API (naqd/karta, confirm, avans)
- [ ] Balans materialized view + refresh strategiyasi
- [ ] Qarzdorlik + akt-sverka + PDF

## FAZA 7 - GPS (reja: hafta 14)

- [ ] GPS va tashrif API (live, trek, visits)
- [ ] Web xarita (Leaflet) + tashrif jadvali + Excel eksport

## FAZA 8 - Hisobotlar + dashboard (reja: hafta 15)

- [ ] Dashboard API (KPI, cache)
- [ ] 5 ta hisobot + Excel eksport (`exceljs`)
- [ ] UI: dashboard grafiklari + hisobotlar sahifasi

## FAZA 9 - Flutter (reja: hafta 16-18)

- [ ] Agent va Dastavchi ilovalar (yoki flavor): URL sozlash, login, offline Hive, sync, GPS, FCM

## FAZA 10 - Test + deploy (reja: hafta 19)

- [ ] Playwright (yoki E2E) to‘liq zakaz zanjiri
- [ ] k6 yoki load smoke
- [ ] Production: Nginx wildcard, SSL, PM2, backup cron
- [ ] Play Store / birinchi diler go-live checklist
