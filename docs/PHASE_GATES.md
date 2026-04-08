# Phase Gates

This checklist is the release gate for each phase. A phase is complete only when all relevant boxes are checked.

> **Jarayon foizi, qisman bajarilgan bandlar va keyingi qadam:** [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md)

**Eslatma (2026-04):** FAZA **0–4** MVP yopilgan. **FAZA 5–10** kodda qisman bajarilgan; **2026-04-05** kod bazasi audit (Excel nakladnoy, transfer `api-client`, hisobotlar MVP, `field`/`visits`, mijozlar xaritasi) + **to‘lov FIFO taqsimlash** REST va panel («Zakazlarga»). Qolgan `[ ]` bandlar `PHASE_PROGRESS.md` da navbat bilan.

## Platforma (doimiy)

- [x] Ko‘p foydalanuvchi: kritik yozuvlar **transaction** strategiyasi hujjatlangan (`docs/NON_FUNCTIONAL.md`) — zakaz/kredit/balans/merge; kilitleme rejasi Faza 5+ uchun qisqa reja
- [x] API xatolarda `requestId` va strukturalangan `error` maydoni
- [x] CI: migratsiya + testlar; o‘zgarishlar mavjud jarayonlarni buzmasligi
- [x] Yagona klientlar bazasi: `phone_normalized`, `merge`, Web UI (filtr + qidiruv), audit; DB **qisman UNIQUE** tavsiyasi `NON_FUNCTIONAL.md` da (seed dublikatlari sinov uchun)

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

- [x] Stock API: ro‘yxat, qoldiqlar, filtrlash, eksport (`GET .../stock`, balances)
- [x] Kirim: `POST .../stock/receipts` + `goods-receipts` hujjatlari
- [x] Inventarizatsiya: `stock-takes` (qatorlar, post → qoldiq tuzatish)
- [x] Omborlararo ko‘chirish: `transfers` (draft → start → receive / cancel)
- [x] Zakaz bilan rezerv: `stock.reserved_qty` (zakaz yaratish/tahrir — `orders.service`)
- [x] **Picking UI (MVP):** `/stock/picking` — `picking` zakazlar, ombor filtri, qidiruv, zakazga havola
- [x] **SKU jamlanma:** `GET .../stock/picking-aggregate` — barcha picking zakazlaridan mahsulot bo‘yicha SUM(qty), zakazlar soni
- [x] **Picking chuqurligi (MVP):** skaner maydoni (Enter → SKU/shtrix filtri), chop etish (`window.print` + sidebar yashirish)
- [x] **Korrektirovka:** panel `/stock/correction` — jurnal, kategoriya workspace, `POST .../stock/corrections/bulk`, audit (`warehouse-correction`). *(Eski «inventarsiz tezkor» alohida endpoint — ixtiyoriy keyingi iteratsiya.)*
- [x] **Nakladnoy (Excel, kodda bor):** `POST .../orders/bulk/nakladnoy` + `order-nakladnoy-xlsx.ts`; shablonlar 5.1.8 / 2.1.0; zakazlar paneli: yuklab olish tugmalari + sozlamalar (`frontend/lib/order-nakladnoy.ts`, `nakladnoy-export-settings-dialog`).
- [x] **PDF** blankalar (MVP): orders nakladnoy (`5.1.8` / `2.1.0`) uchun `POST .../orders/bulk/nakladnoy` da `format=pdf` + UI tugmalar; transfer uchun `GET .../transfers/:id/pdf` + jurnal modalidan yuklab olish.
- [x] Ombor Web UI: qoldiqlar jadvalida holat bo‘yicha qator foni (0 / manfiy dostup / to‘liq rezerv)
- [x] **Transfer UI:** `/stock/transfers` — `apiFetch` + `useTenant` (`frontend/lib/api-client.ts`); marshrut `middleware` orqali `/stock` himoyasida.

## FAZA 6 - Moliya (reja: hafta 13)

- [x] To‘lovlar API: yaratish, ro‘yxat, mijoz va zakaz bo‘yicha (`payments`)
- [x] To‘lovni zakazlarga taqsimlash: `GET/POST .../payments/:id/allocations|allocate` + panel **To‘lovlar** → «Zakazlarga» (FIFO, `payment_allocations`); **to‘lov kartochkasi** `GET .../payments/:id` + `/payments/[id]` (taqsimot jadvali, taqsimlash, admin: o‘chirish)
- [ ] Balans materialized view + refresh strategiyasi (agar kerak)
- [x] Akt-sverka **PDF** (mijoz bo‘yicha): `GET /api/:slug/clients/:id/reconciliation-pdf` (`date_from` / `date_to`, ixtiyoriy; default — joriy oy boshidan bugungi kunga) + klient kartochkasida davr + yuklab olish.
- [x] Qarzdorlik **ro‘yxati**: `GET /api/:slug/reports/receivables` (+ `/export` Excel `.xlsx`; alias `client-receivables`) — faqat **ochiq zakazlar yig‘indisi 0 dan katta** bo‘lgan mijozlar; qo‘shimcha filtrlar (`only_over_limit`, `active_only`), UI — **Hisobotlar** → **Qarzdorlik**.

## FAZA 7 - GPS (reja: hafta 14)

- [x] **Qisman:** `field` moduli API: agent-visits, route days, tenant tasks (`field.route.ts`); Web **`/visits`** — ro‘yxat va CRUD (MVP).
- [x] **Leaflet + OpenStreetMap** mijozlar xaritasi (`/clients/map`, `react-leaflet`); tashriflar **Excel** (`GET .../agent-visits/export` + **Визиты**, max 10000 qator).
- [x] **Agent GPS trek (veb + API):** `agent_location_pings`, `POST/GET .../agent-locations`, panel **`/routes/track`** (Leaflet polyline). **Mobil** fondda ping yuborish — FAZA 9 (shu POST).

## FAZA 8 - Hisobotlar + dashboard (reja: hafta 15)

- [x] Dashboard API: `GET .../dashboard/stats` (+ Redis cache invalidate)
- [x] **Hisobotlar MVP (kod bilan):** backend `reports.route.ts` — sales, order-trends, products, clients, agent-kpi, status-distribution, **qo‘shimcha** `channels`, `abc-analysis`, `xyz-analysis`, `client-churn`; frontend `/reports` — asosiy 6 ta oqim + **Excel eksport** (npm `xlsx` / SheetJS; `exceljs` emas).
- [x] Hisobotlar UI: `channels` / ABC / XYZ / churn tablari + har biri uchun **Excel** (`/reports`, `?tab=` + `churn_months`).
- [x] UI: dashboard va hisobotlarda **grafiklar** (**Recharts** — `components/charts/analytics-charts.tsx`).

## FAZA 9 - Flutter (reja: hafta 16-18)

- [ ] Agent va Dastavchi ilovalar (yoki flavor): URL sozlash, login, offline Hive, sync, GPS, FCM

## FAZA 10 - Test + deploy (reja: hafta 19)

- [ ] Playwright (yoki E2E) to‘liq zakaz zanjiri *(2026-04-08: login smoke + CI — `frontend/e2e`, `PHASE_PROGRESS.md`)*
- [ ] k6 yoki load smoke
- [ ] Production: Nginx wildcard, SSL, PM2, backup cron
- [ ] Play Store / birinchi diler go-live checklist
