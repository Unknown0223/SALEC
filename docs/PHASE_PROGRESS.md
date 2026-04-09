# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-04-09 — **FAZA bo‘yicha davom:** quyida «Keyingi navbat (tartib bilan)» — operatsion deploy (FAZA 10), `test:all` / `test:all:ci`, ixtiyoriy E2E kengaytirish, MV, Flutter. **Eslatma:** `backend/scripts/import-excel-bundle.ts` va qo‘shimcha Excel importlari — **migratsiya/ma’lumot yuklash** vositasi; ular `PHASE_GATES.md` dagi faza raqamlari bilan bir xil «navbat» emas — katta rejani davom ettirishda asosiy manba **shu hujjatdagi jadval**. **Texnik sifat:** backend `orders.integration.test.ts` — suite boshida asosiy omborda SKU-001/002/003 zaxirasi tiklanadi (`ensureOrdersIntegrationStock`).  
**Manba checklist:** [`PHASE_GATES.md`](./PHASE_GATES.md). **Testlar + brauzer silliq:** [`WEB-QA-CHECKLIST.md`](./WEB-QA-CHECKLIST.md). **Deploy:** [`PROD-CHECKLIST.md`](./PROD-CHECKLIST.md), [`RAILWAY-STAGING-CHECKLIST.md`](./RAILWAY-STAGING-CHECKLIST.md).

---

## Xulosa jadvali

| Bo‘lim | Foiz | Qisqa izoh |
|--------|------|------------|
| Platforma (doimiy) | **100%** | `NON_FUNCTIONAL.md`: tranzaksiyalar, kredit+balans, merge, audit, prod telefon UNIQUE tavsiyasi |
| FAZA 0 | **100%** | Docker, health, migratsiya, test:ci, `.env.example` |
| FAZA 1 | **100%** | Auth, tenant, seed, integratsiya testlar, CI |
| FAZA 2 | **100%** | Panel, mahsulot/narx/bonus, spravochniklar UI+API, kompaniya sozlamalari |
| FAZA 3 | **100%** | Klientlar, balans, kartochka tablari, audit, merge, kredit progress (dublikatlar UI olib tashlangan) |
| FAZA 4 | **100%** | Zakaz, bonus, status, SSE, UI, bonus unit test |
| FAZA 5 | **100%** | Yuqoridagilar + **Excel/PDF nakladnoy** (bulk endpoint + zakazlar UI) + transfer jurnalida **ko‘chirish PDF** (`/transfers/:id/pdf`, modal tugma). |
| FAZA 6 | **~90%** | To‘lovlar + taqsimlash + **to‘lov kartochkasi** `/payments/[id]`; **akt-sverka PDF**; **qarzdorlik** (Excel). Balans MV — ixtiyoriy. |
| FAZA 7 | **~80%** | `/visits`, `/clients/map` (Leaflet), tashriflar Excel; **GPS trek** API + `/routes/track`. Mobil ilova fon pinglari — FAZA 9. |
| FAZA 8 | **~95%** | Dashboard **Recharts** (bugungi faoliyat ustunlari); `/reports`: dinamika (line+area), holat **pie**, mahsulot top-10, kanallar **bar**; **xlsx** avvalgidek. |
| FAZA 9–10 | **~20–25%** | **Playwright:** login + dashboard shell + CI; ixtiyoriy real login; **zakaz yaratish** zanjiri (`order-create-full-stack.spec.ts`). **Load:** `load-smoke.mjs`. Keyin — k6/prod checklist. **Flutter** — FAZA 9. |

**Butun loyiha (0–4 oralig‘i):** **100%** (MVP gate). **FAZA 5+** iteratsiya.

---

## Nima uchun FAZA 5–6 «navbatda» turib, FAZA 10 ga «sakrab» ketilgan?

Bu **reja raqamini tartibsiz tashlab ketish emas**, balki **parallel va ustuvorlik** bilan bog‘liq:

1. **FAZA 5 va 6 ning asosiy gate bandlari** `PHASE_GATES.md` bo‘yicha **allaqachon yopilgan** (ombor, picking, korrektirovka, to‘lovlar, taqsimlash, qarzdorlik, akt-sverka va hok.). Shuning uchun ish **6 dan keyingi fazalarga** (7–8) va keyin **sifat / barqarorlik** bandlariga o‘tgan.
2. **FAZA 10** (Playwright, `next build`, CI) **ertaroq boshlangan**, chunki: frontend o‘zgarishlari ko‘payganda **regressiya** va **yig‘ish xatolari**ni avval ushlash arzonroq — aks holda keyinroq hamma fazani qayta tekshirish qiyinlashadi. Shuning uchun **10 dan bir qism** (login + dashboard shell + CI) 5–6 «rasmiy yopilish»dan oldin yoki **parallel** qilingan; bu **waterfall** emas, **xavfni kamaytirish**.
3. **FAZA 6** da `PHASE_GATES.md` da **bitta ixtiyoriy** `[ ]` qolgan: **balans materialized view** — bu «to‘liq 6 yopilmaguncha 7/8/10 ga o‘tmaslik» degani emas; gate hujjati ham shuni **ixtiyoriy** deb belgilagan.

**Xulosa:** raqamli ketma-ketlik **ideal loyiha rejasi**; amalda **funksiya bo‘yicha** (ombor → moliya → GPS → hisobotlar) va **texnik qaror** (E2E/CI) bir vaqtning o‘zida yuritilgan. Hujjatdagi eski «Keyingi qadam — FAZA 5» bandi tarixiy qolgan edi — quyida **haqiqiy navbat** yangilandi.

---

## Keyingi navbat (tartib bilan — faza bo‘yicha davom)

Reja mantiqiy tartib: avval **ishga tushirish va sifat panjarasi**, keyin **ixtiyoriy tezlashtirish**, eng oxirida **mobil**.

| # | Faza | Ish | Turi |
|---|------|-----|------|
| 1 | **10** | Staging/prod: [`RAILWAY-STAGING-CHECKLIST.md`](./RAILWAY-STAGING-CHECKLIST.md) yoki [`PROD-CHECKLIST.md`](./PROD-CHECKLIST.md) bo‘yicha **amalda** yopish (migratsiya, env, health, SSL, backup, monitoring) | Operatsion |
| 2 | **10** | `npm run test:all:ci` (CI ekvivalenti: alohida backend + frontend joblari); to‘liq `npm run test:all` yana `load:smoke` — **lokal**, backend `/health` bilan | Sifat |
| 3 | **10** | Playwright: smoke (qobiq + status + dialog) + **FIFO to‘liq stack** (`payment-allocate-fifo-full-stack`, `E2E_*`; smoke ro‘yxatiga kirmaydi) | Kod |
| 4 | **6** | Ixtiyoriy: balans **materialized view** — faqat ro‘yxat/sekund sekinlashganda (`PHASE_GATES.md`) | DB/perf |
| 5 | **9** | Flutter: agent/dastavchi (login, offline, sync, **fon GPS ping** — FAZA 7 veb treki bilan API allaqachon mos) | Mobil |
| 6 | **10** | Birinchi diler **go-live** / Play Store checklist (`PHASE_GATES.md` oxirgi band) | Biznes |

**Qisqa yo‘l-yo‘riq:** 1–2 dan keyin loyiha «production-ready» deb hisoblanadi; 3–4 sifat va hajm; 5–6 mobil va masshtab.

---

## Navbat (hozirgi holat bo‘yicha, 2026-04) — arxiv xulosasi

**1. FAZA 6 — qoldiq (ixtiyoriy)**  
- [ ] Balans **materialized view** + refresh strategiyasi — faqat hajm/performance talab qilganda (`PHASE_GATES.md`).

**2. FAZA 7 — qoldiq**  
- Mobil ilovadan **fon GPS pinglari** (asosan **FAZA 9** Flutter bilan bog‘liq).

**3. FAZA 9**  
- [ ] Flutter agent / dastavchi ilovalari (offline, sync, FCM).

**4. FAZA 10 — davom etish (ustuvor texnik)**  
- [x] Playwright: **to‘liq zakaz zanjiri** (mijoz + ombor + miqdor → yaratish → ro‘yxat; `E2E_*` + seed `test1`).  
- [x] Load smoke: `load-smoke.mjs` (k6 keyingi bosqich).  
- [x] Production checklist hujjati: `docs/PROD-CHECKLIST.md`.  
- [x] Railway staging checklist hujjati: `docs/RAILWAY-STAGING-CHECKLIST.md`.  
- [ ] Production checklistni amalda yopish (Nginx, SSL, backup, go-live).

**Bajarilgan (arxiv — eski «FAZA 5 navbat»):** inventarizatsiya, picking, korrektirovka, nakladnoy Excel/PDF, transfer UI+PDF, FAZA 6 asosiy moliya UI/API, FAZA 7–8 ning veb qismi, Recharts, qarzdorlik hisoboti — batafsil `PHASE_GATES.md`.

**2026-03-30:** `GET /api/:slug/stock`, `POST /api/:slug/stock/receipts` (admin), panel `/stock`; zakazlar SSE Redis orqali sinxron (ioredis).

---

## Kod vs reja — tekshiruv xulosasi (2026-04-05)

| Rejada [ ] yoki «kerak» | Kodda aniqlangan holat |
|-------------------------|-------------------------|
| Nakladnoy tugmalari (FAZA 5) | **Bor:** `orders/page.tsx` + `downloadOrdersNakladnoyXlsx`, `POST /orders/bulk/nakladnoy` |
| Transfer + api-client | **Bor:** `stock/transfers/page.tsx` → `apiFetch` |
| PDF 518/210 | **Bor (MVP):** `POST /orders/bulk/nakladnoy` da `format=pdf`; zakazlar UI’da `.pdf` yuklab olish |
| To‘lov allocations HTTP | **Bor:** `GET/POST .../payments/:id/allocations|allocate`, UI dialog |
| 5+ hisobot + Excel | **Bor:** `/reports` + `xlsx`; backend 10 ta endpoint, UI 9 ta tab (shu jumladan kanallar, ABC, XYZ, churn) |
| Dashboard grafiklar | **Bor:** `recharts` — dashboard + `/reports` (dinamika, pie, mahsulot, kanal) |
| GPS / Leaflet | **Qisman:** `/clients/map` — Leaflet + OSM; **agent trek** `/routes/track` + `agent-locations` API |
| `ROADMAP` ombor transferlari | **Yangilandi:** transferlar amalda bor |
| `ROADMAP` byudjet / chiqimlar | **Qisman:** `expenses` moduli + `/expenses` sahifa bor; to‘liq moliya gate emas |
| Shadcn `Table` / `Select` | **Bor:** `components/ui/table.tsx`, `select.tsx` (`@radix-ui/react-select`); `/expenses`, `/stock/transfers`, `/territories` jadvallar ishlaydi |
| `next build` (frontend) | **2026-04-06:** ESLint **error**lar tuzatildi; `Map`/`Set` iteratsiya — `Array.from`; `orderTypeLabel` — `null`; dashboard `(layout)` da **`Suspense`** (`AppShell` + `useSearchParams`). Qolganlari — ESLint **warning** (hooks). |

---

## Vebda tekshirish (lokal — bosib ochiladigan havolalar)

**Old shart:** `frontend` da `npm run dev`, brauzer **`http://localhost:3000`**, backend (`4000`) va DB ishlayotgan bo‘lsin. Deployda `localhost` o‘rniga o‘z domeningizni qo‘ying.

### Asosiy sahifalar

| Nima tekshiriladi | Havola |
|-------------------|--------|
| Dashboard + Recharts «Bugungi faoliyat» | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) |
| Hisobotlar (tablar, grafiklar, Excel) | [http://localhost:3000/reports](http://localhost:3000/reports) |
| Hisobot: kanallar | [http://localhost:3000/reports?tab=channels](http://localhost:3000/reports?tab=channels) |
| Hisobot: ABC | [http://localhost:3000/reports?tab=abc](http://localhost:3000/reports?tab=abc) |
| Hisobot: XYZ | [http://localhost:3000/reports?tab=xyz](http://localhost:3000/reports?tab=xyz) |
| Hisobot: Churn | [http://localhost:3000/reports?tab=churn&churn_months=3](http://localhost:3000/reports?tab=churn&churn_months=3) |
| Hisobot: Qarzdorlik (ochiq zakazlar) | [http://localhost:3000/reports?tab=receivables](http://localhost:3000/reports?tab=receivables) |
| Chiqimlar (Table + Select) | [http://localhost:3000/expenses](http://localhost:3000/expenses) |
| To‘lovlar | [http://localhost:3000/payments](http://localhost:3000/payments) |
| To‘lov kartochkasi (masalan id=1) | [http://localhost:3000/payments/1](http://localhost:3000/payments/1) |
| Ombor ko‘chirishlari | [http://localhost:3000/stock/transfers](http://localhost:3000/stock/transfers) |
| Hududlar ro‘yxati | [http://localhost:3000/territories](http://localhost:3000/territories) |
| Mijozlar xaritasi (Leaflet / OSM) | [http://localhost:3000/clients/map](http://localhost:3000/clients/map) |
| Agent tashriflari (Excel) | [http://localhost:3000/visits](http://localhost:3000/visits) |
| Agent GPS treki (Leaflet) | [http://localhost:3000/routes/track](http://localhost:3000/routes/track) |

### Navigatsiya (2026-04-07)

Chap menyu (Sklad): **Перемещение** → `/stock/transfers`. Asosiy qator: **Территории**, **Платежи**, **Расходы**, **Отчёты**. Boshqaruv sahifasida tezkor kartalar: «Ombor ko‘chirish», «Chiqimlar», «Hududlar».

### Kod ↔ veb (qayerda o‘zgardi)

| Mavzu | Asosiy fayllar |
|-------|----------------|
| Hisobot grafiklari / tablar | `frontend/components/charts/analytics-charts.tsx`, `frontend/app/(dashboard)/reports/page.tsx` |
| Dashboard diagramma | `frontend/components/dashboard/dashboard-home.tsx` |
| Table / Select UI | `frontend/components/ui/table.tsx`, `frontend/components/ui/select.tsx` |
| Chiqimlar / transfer / hududlar sahifalari | `frontend/app/(dashboard)/expenses/page.tsx`, `stock/transfers/page.tsx`, `territories/page.tsx` |
| Sidebar tartibi | `frontend/components/dashboard/nav-config.ts` |
| To‘lov kartochkasi | `frontend/app/(dashboard)/payments/[id]/page.tsx`, `backend/src/modules/payments/payments.service.ts` (`getPaymentDetail`) |
| Xarita Leaflet | `frontend/components/clients/clients-leaflet-map.tsx`, `frontend/app/(dashboard)/clients/map/page.tsx` |
| Tashriflar eksport | `backend/src/modules/field/field.service.ts` (`exportAgentVisitsXlsx`), `field.route.ts`, `frontend/app/(dashboard)/visits/page.tsx` |
| Agent GPS trek | `prisma` `AgentLocationPing`, `field.service.ts` (`recordAgentLocationPing`, `listAgentLocationPings`), `field.route.ts`, `frontend/app/(dashboard)/routes/track/page.tsx`, `components/field/agent-track-leaflet-map.tsx` |
| `useSearchParams` + Suspense | `frontend/app/(dashboard)/layout.tsx` |

**Prod build tekshiruvi:** `cd frontend && npm run build` — muvaffaqiyatli yig‘ish kerak (ogohlantirishlar qolishi mumkin).

### E2E (Playwright, FAZA 10)

**CI:** `push`/`pull_request` da `frontend` job builddan keyin `npx playwright install --with-deps chromium` va `npx playwright test` (`CI=true` — `next start` avtomatik `webServer` orqali).

**Lokal (tavsiya):** `npm run build`, so‘ng `npm run test:e2e:ci` (`cross-env CI=true` — `webServer` bilan `next start`). **Dev server allaqachon ishlayotgan bo‘lsa:** `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test`. **3000 band + production:** `PLAYWRIGHT_PORT=3005` ni `test:e2e:ci` dan oldin o‘rnatish (PowerShell: `$env:PLAYWRIGHT_PORT='3005'`). Brauzer bir marta: `npm run test:e2e:install`.

| Fayl / skript | Vazifa |
|----------------|--------|
| `frontend/playwright.config.ts` | `baseURL`, CI da `cross-env PORT=… npm run start` |
| `frontend/e2e/fake-session.ts` | Playwright uchun soxta admin sessiya (`test1`) |
| `frontend/e2e/login-smoke.spec.ts` | `/login` — «Вход», slug/login/parol, «Войти» |
| `frontend/e2e/dashboard-shell-smoke.spec.ts` | `sd_auth` + `savdo-auth` → `/dashboard` sarlavha + statistikada muvaffaqiyat yoki xato |
| `frontend/e2e/dashboard-routes-smoke.spec.ts` | ~30 ta asosiy URL `/login` ga qaytmasligi |
| `frontend/e2e/login-full-stack.spec.ts` | Haqiqiy `POST /auth/login` (env bor bo‘lsa); aks holda `skip` |
| `frontend/e2e/order-create-full-stack.spec.ts` | Login → yangi zakaz → seed mijoz/ombor → miqdor → `/orders` (`E2E_*`; `skip` agar env yo‘q) |
| `frontend/e2e/payment-allocate-order-status-smoke.spec.ts` | `/orders` status `<select>` → URL `status=`; `/payments` «Zakazlarga» → dialog (`payment-allocate-dialog`) |
| `frontend/e2e/payment-allocate-fifo-full-stack.spec.ts` | Login → `/payments/new` → saqlash → «Zakazlarga» → `payment-allocate-fifo` (`E2E_*` bo‘lmasa `skip`) |
| `npm run test:e2e` / `test:e2e:smoke` / `test:e2e:ci` / `test:e2e:ui` / `test:e2e:install` | Ildiz va `frontend/package.json` |
| `npm run test:quality` (`frontend`) | `typecheck` + `lint` + `vitest` |
| `npm run load:smoke` | `node scripts/load-smoke.mjs` — GET `/health` (yoki `--path`), **k6** gate uchun sodda alternativa |

**Eslatma:** `next start` (Playwright `webServer`) uchun `.next` oxirgi `npm run build` bilan mos bo‘lishi kerak. `npm run dev` bilan bir vaqtda bir papkani bo‘lish xatolarga olib kelishi mumkin — E2E oldidan `dev` ni to‘xtating yoki `npm run clean && npm run build` qiling.

**Keyingi E2E bandlar (gate):** ~~login~~, ~~dashboard qobig‘i~~, ~~zakaz yaratish (env + seed)~~, ~~zakaz/to‘lov qobig‘i~~, ~~status + dialog smoke~~, ~~**FIFO taqsimlash** to‘liq stack (`payment-allocate-fifo-full-stack.spec.ts`, `E2E_*` + `npx playwright test e2e/payment-allocate-fifo-full-stack.spec.ts`)~~; **load:** `load-smoke.mjs`; prod checklist (`PHASE_GATES.md` FAZA 10).

**Monorepo `test:all` (ildiz):** `test:all:ci` = backend `test:ci` + frontend `test:all` (typecheck+lint+vitest + smoke E2E); to‘liq `test:all` = `test:all:ci` + `load:smoke` (lokalda API `:4000` /health ishlashi kerak).

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
