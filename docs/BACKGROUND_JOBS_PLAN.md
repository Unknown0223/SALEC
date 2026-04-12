# Og‘ir operatsiyalar va navbat (reja)

Katta Excel import/eksport, oylik hisobotlar, massiv yangilanishlar sinxron HTTP orqali API ni bloklaydi va timeout beradi.

## Maqsad

- **BullMQ + Redis** (stackda reja qilingan) orqali fon ishlar.
- API job `id` qaytaradi; holat **`GET /api/:slug/jobs/:jobId`** (hozir `ping` uchun; kelajakda boshqa job nomlari).

## Bosqichlar

1. **Redis** productionda barqaror; `REDIS_URL` sozlangan (`.env.example` ga qarang).
2. **Worker** jarayoni: lokal `npm run worker:dev` (backend) yoki `npm run worker:dev` (monorepo ildizidan); productionda `npm run worker:start --prefix backend` (builddan keyin) yoki alohida PM2 protsess — kirish nuqtasi `backend/src/worker/index.ts` (navbat: `background-default`).
3. **Navbatlar:** `import_clients_xlsx`, `import_stock_xlsx`, mahsulot importlari, **`import_product_prices_xlsx`** (`POST .../products/prices/import/async`), kelajakda `export-report`, boshqa og‘ir eksportlar.
4. **Xatoliklar:** job `failed` + log + foydalanuvchiga xabar.

Hozircha importlar API ichida qoladi; yuk oshganda shu hujjat bo‘yicha ajratish qilinadi.

## Qo'shimcha reja: Sozlamalar struktura migratsiyasi

Sozlamalar bo'limini bo'linmalar bo'yicha to'liq katalogga o'tkazish rejasi alohida hujjatda yuritiladi:

- `docs/SETTINGS_STRUCTURE_PLAN.md`
