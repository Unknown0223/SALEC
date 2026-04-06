# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-04-02 — FAZA 5: `PHASE_GATES` korrektirovka + qoldiqlar vizuali yangilandi; keyingi navbat: PDF, nakladnoy/transfer UI.  
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
| FAZA 5 | **~60%** | Stock, receipts, transfers, picking, korrektirovka, qoldiqlar rangli qatorlar; qolgani: PDF, transfer/nakladnoy UI |
| FAZA 6 | **~35%** | Payments API bor; qolgani: allocation ulanishi, akt-sverka, qarzdorlik PDF |
| FAZA 7–10 | **0–15%** | GPS, hisobotlar grafiklari, Flutter, E2E — rejada |

**Butun loyiha (0–4 oralig‘i):** **100%** (MVP gate). **FAZA 5+** iteratsiya.

---

## Keyingi qadam — FAZA 5 (ustuvor)

1. **Picking:** ~~`/stock/picking` + aggregate + skaner maydoni + chop etish~~ (2026-04-02); yangilash tugmasi yuklanishda bloklanadi.  
2. **Platforma:** ~~`api-client` / `middleware`~~ (2026-04-02).  
3. **Korrektirovka:** ~~`/stock/correction` + bulk + audit~~ — `PHASE_GATES` da belgilandi.  
4. **Qoldiqlar UI:** jadval qatorlari holat bo‘yicha rang.  
5. **Keyingi navbat:** **PDF** nakladnoy; nakladnoy tugmalari + transfer sahifasi polish.

**2026-03-30:** `GET /api/:slug/stock`, `POST /api/:slug/stock/receipts` (admin), panel `/stock`; zakazlar SSE Redis orqali sinxron (ioredis).

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
