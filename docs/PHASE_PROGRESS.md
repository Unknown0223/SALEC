# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-04-05 — kod audit + **to‘lov zakazlarga taqsimlash** (API + UI), reja hujjatlari sinxron, `git push` bilan arxivlangan.  
**Manba checklist:** [`PHASE_GATES.md`](./PHASE_GATES.md)

---

## Xulosa jadvali

| Bo‘lim | Foiz | Qisqa izoh |
|--------|------|------------|
| Platforma (doimiy) | **100%** | `NON_FUNCTIONAL.md`: tranzaksiyalar, kredit+balans, merge, audit, prod telefon UNIQUE tavsiyasi |
| FAZA 0 | **100%** | Docker, health, migratsiya, test:ci, `.env.example` |
| FAZA 1 | **100%** | Auth, tenant, seed, integratsiya testlar, CI |
| FAZA 2 | **100%** | Panel, mahsulot/narx/bonus, spravochniklar UI+API, kompaniya sozlamalari |
| FAZA 3 | **100%** | Klientlar, balans, kartochka tablari, audit, dublikatlar, kredit progress |
| FAZA 4 | **100%** | Zakaz, bonus, status, SSE, UI, bonus unit test |
| FAZA 5 | **~90%** | Yuqoridagilar + **Excel nakladnoy** (bulk endpoint + zakazlar UI) + **transfer** sahifasi `apiFetch` bilan. **Qolgan [ ]:** faqat **PDF** blankalar (Puppeteer/worker). |
| FAZA 6 | **~50%** | To‘lovlar CRUD + **taqsimlash** REST va dialog; `deletePayment` allocation qatorlarini ham o‘chiradi; akt-sverka / qarzdorlik PDF — yo‘q. |
| FAZA 7 | **~25%** | `field` API + `/visits`; `/clients/map` (scatter). Leaflet, live trek, tashrif Excel — yo‘q. |
| FAZA 8 | **~55%** | Dashboard stats API; `/reports` 6 tab + **xlsx** eksport; backendda `channels`/ABC/XYZ/churn — **UI ulangan emas**; **grafiklar** yo‘q. |
| FAZA 9–10 | **~0–5%** | Flutter, Playwright E2E, prod checklist — rejada. |

**Butun loyiha (0–4 oralig‘i):** **100%** (MVP gate). **FAZA 5+** iteratsiya.

---

## Keyingi qadam — FAZA 5 (ustuvor)

1. **Inventarizatsiya:** ~~API + foydalanuvchi UI (qidiruv, jadval, saqlash/provesti/otmen)~~ (2026-04-05).  
2. **Picking:** ~~`/stock/picking` + aggregate + skaner maydoni + chop etish~~ (2026-04-02).  
3. **Platforma:** ~~`api-client` / `middleware`~~ (2026-04-02).  
4. **Korrektirovka:** ~~`/stock/correction` + bulk + audit~~.  
5. **Qoldiqlar UI:** ~~jadval qatorlari holat bo‘yicha rang~~.  
6. **Keyingi navbat (gate [ ]):** faqat **PDF** nakladnoy (518/210/ko‘chirish). ~~Excel nakladnoy + transfer UI~~ kodda bor (`PHASE_GATES` yangilandi).  
7. **FAZA 8 navbat:** hisobotlarda `channels` / ABC / XYZ / churn UI; keyin Recharts.  
8. **FAZA 6 navbat:** qarzdorlik / akt-sverka / PDF; ixtiyoriy alohida to‘lov **detail** sahifasi.

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
| PDF 518/210 | **Yo‘q:** `puppeteer` / `.pdf` generator topilmadi |
| To‘lov allocations HTTP | **Bor:** `GET/POST .../payments/:id/allocations|allocate`, UI dialog |
| 5+ hisobot + Excel | **Bor:** `/reports` + `xlsx`; backend 10 ta endpoint, UI ~6 ta |
| Dashboard grafiklar | **Yo‘q:** `recharts` / `chart.js` import yo‘q |
| GPS / Leaflet | **Qisman:** `/clients/map` oddiy xarita; Leaflet emas |
| `ROADMAP` ombor transferlari | **Yangilandi:** transferlar amalda bor |
| `ROADMAP` byudjet / chiqimlar | **Qisman:** `expenses` moduli + `/expenses` sahifa bor; to‘liq moliya gate emas |

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
