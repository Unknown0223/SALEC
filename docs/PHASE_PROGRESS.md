# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-04-07 — sidebar + dashboard: **Перемещение**, **Платежи**, **Расходы**, **Территории**; veb tekshiruv uchun to‘liq **localhost** havolalari.  
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
| FAZA 6 | **~85%** | To‘lovlar + taqsimlash; **akt-sverka PDF**; **qarzdorlik** (`reports/receivables` + tab, Excel `.xlsx`). Balans MV — ixtiyoriy. |
| FAZA 7 | **~25%** | `field` API + `/visits`; `/clients/map` (scatter). Leaflet, live trek, tashrif Excel — yo‘q. |
| FAZA 8 | **~95%** | Dashboard **Recharts** (bugungi faoliyat ustunlari); `/reports`: dinamika (line+area), holat **pie**, mahsulot top-10, kanallar **bar**; **xlsx** avvalgidek. |
| FAZA 9–10 | **~0–5%** | Flutter, Playwright E2E, prod checklist — rejada. |

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
8. **FAZA 6 navbat:** ~~qarzdorlik~~ (`reports/receivables`); keyin — ixtiyoriy **balans MV**; to‘lov **detail** sahifasi.

### Keyingi qadam — FAZA 6 (parallel ixtiyoriy)

- ~~To‘lovni zakazlarga taqsimlash: REST + panel~~ (2026-04-05).
- Qarzdorlik / akt-sverka / PDF (reja).

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
| GPS / Leaflet | **Qisman:** `/clients/map` oddiy xarita; Leaflet emas |
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
| Ombor ko‘chirishlari | [http://localhost:3000/stock/transfers](http://localhost:3000/stock/transfers) |
| Hududlar ro‘yxati | [http://localhost:3000/territories](http://localhost:3000/territories) |
| Mijozlar xaritasi (matn tuzatishlari) | [http://localhost:3000/clients/map](http://localhost:3000/clients/map) |

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
| `useSearchParams` + Suspense | `frontend/app/(dashboard)/layout.tsx` |

**Prod build tekshiruvi:** `cd frontend && npm run build` — muvaffaqiyatli yig‘ish kerak (ogohlantirishlar qolishi mumkin).

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
