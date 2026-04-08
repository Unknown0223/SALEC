# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-04-08 — FAZA 10: **Playwright** dastlabki smoke (`/login` formasi); `playwright.config.ts`, CI qadam (`frontend` job oxirida `playwright install` + `playwright test`).  
**Manba checklist:** [`PHASE_GATES.md`](./PHASE_GATES.md)

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
| FAZA 9–10 | **~10–15%** | **Playwright:** login smoke + CI; keyin — to‘liq zakaz zanjiri, k6, prod checklist. **Flutter** — FAZA 9, hali ochiq. |

**Butun loyiha (0–4 oralig‘i):** **100%** (MVP gate). **FAZA 5+** iteratsiya.

---

## Keyingi qadam — FAZA 5 (ustuvor)

1. **Inventarizatsiya:** ~~API + foydalanuvchi UI (qidiruv, jadval, saqlash/provesti/otmen)~~ (2026-04-05).  
2. **Picking:** ~~`/stock/picking` + aggregate + skaner maydoni + chop etish~~ (2026-04-02).  
3. **Platforma:** ~~`api-client` / `middleware`~~ (2026-04-02).  
4. **Korrektirovka:** ~~`/stock/correction` + bulk + audit~~.  
5. **Qoldiqlar UI:** ~~jadval qatorlari holat bo‘yicha rang~~.  
6. **Keyingi navbat:** FAZA 6 — qarzdorlik / akt-sverka / PDF. ~~Excel nakladnoy + transfer UI~~, ~~orders nakladnoy PDF~~ va ~~transfer PDF~~ kodda bor (`PHASE_GATES` yangilandi).  
7. **FAZA 8 navbat:** ~~`channels` / ABC / XYZ / churn UI~~; ~~dashboard + hisobotlarda **Recharts**~~ (`analytics-charts.tsx`, 2026-04-06).  
8. **FAZA 6 navbat:** ~~qarzdorlik~~; ~~to‘lov detail~~; keyin — ixtiyoriy **balans MV**.

### Keyingi qadam — FAZA 7 (GPS / maydon)

- ~~`/clients/map` — Leaflet~~; ~~tashriflar Excel~~; ~~agent GPS trek~~ (`agent_location_pings`, `/routes/track`).
- Keyin: **mobil** ilovadan fon pinglari + FAZA 9 Flutter integratsiyasi.

### Keyingi qadam — FAZA 6 (parallel ixtiyoriy)

- ~~To‘lovni zakazlarga taqsimlash: REST + panel~~ (2026-04-05).
- ~~Qarzdorlik / akt-sverka / PDF~~ (asosiy qismi bajarilgan).

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
| `frontend/e2e/login-smoke.spec.ts` | `/login` — «Вход», slug/login/parol, «Войти» |
| `npm run test:e2e` / `test:e2e:ci` / `test:e2e:ui` / `test:e2e:install` | `package.json` |

**Eslatma:** `next start` (Playwright `webServer`) uchun `.next` oxirgi `npm run build` bilan mos bo‘lishi kerak. `npm run dev` bilan bir vaqtda bir papkani bo‘lish xatolarga olib kelishi mumkin — E2E oldidan `dev` ni to‘xtating yoki `npm run clean && npm run build` qiling.

**Keyingi E2E bandlar (gate):** login → dashboard → zakaz yaratish zanjiri; keyin k6 smoke va prod checklist (`PHASE_GATES.md` FAZA 10).

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
