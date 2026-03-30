# Loyiha rejasi — jarayon hisoboti

**Oxirgi yangilanish:** 2026-03-29 — FAZA **0–4** `PHASE_GATES.md` bo‘yicha MVP yopildi: `client_audit_logs`, kredit+**balans** headroom, spravochniklar sahifasi, kategoriya **CRUD**, kompaniya **profile** + `references`/`feature_flags`, klient **Tarix** tab, dublikat **filtr**, bonus **unit test**, `NON_FUNCTIONAL.md` kengaytmasi. Migratsiya: `20260329300000_client_audit_logs`.  
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
| FAZA 5–10 | **0–5%** | Rejada — ombor chuqurligi, moliya, GPS, Flutter, E2E |

**Butun loyiha (0–4 oralig‘i):** **100%** (MVP gate). **FAZA 5+** alohida.

---

## Keyingi qadam (FAZA 5+)

1. **Ombor:** ~~prixod (API + panel),~~ picking, FOR UPDATE / stok rezervi zakaz bilan bog‘lash, korrektirovka.  
2. **SSE:** ~~Redis `order-events` kanali (ko‘p instans); Redis yo‘q bo‘lsa in-process.~~  
3. **Super-admin** dilerlar paneli.  
4. **E2E** (Playwright), load smoke, deploy runbook.

**2026-03-30:** `GET /api/:slug/stock`, `POST /api/:slug/stock/receipts` (admin), panel `/stock`; zakazlar SSE Redis orqali sinxron (ioredis).

---

## Seed ma’lumotlari (test uchun)

`npx prisma db seed` — `test1`, `demo`, mahsulotlar, kategoriyalar, dublikat mijozlar, bonus qoidalari, namuna zakaz. Batafsil: `backend/prisma/seed.ts`.
