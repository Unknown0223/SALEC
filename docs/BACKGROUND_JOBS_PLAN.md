# Og‘ir operatsiyalar va navbat (reja)

Katta Excel import/eksport, oylik hisobotlar, massiv yangilanishlar sinxron HTTP orqali API ni bloklaydi va timeout beradi.

## Maqsad

- **BullMQ + Redis** (stackda reja qilingan) orqali fon ishlar.
- API faqat job `id` qaytaradi; holat `GET /api/:slug/jobs/:id` yoki WebSocket orqali (keyingi bosqich).

## Bosqichlar

1. **Redis** productionda barqaror; `REDIS_URL` sozlangan.
2. **Worker** jarayoni (alohida `node dist/worker.js` yoki alohida PM2 protsess).
3. **Navbatlar:** `import-clients`, `export-report`, `bulk-price-update`.
4. **Xatoliklar:** job `failed` + log + foydalanuvchiga xabar.

Hozircha importlar API ichida qoladi; yuk oshganda shu hujjat bo‘yicha ajratish qilinadi.

## Qo'shimcha reja: Sozlamalar struktura migratsiyasi

Sozlamalar bo'limini bo'linmalar bo'yicha to'liq katalogga o'tkazish rejasi alohida hujjatda yuritiladi:

- `docs/SETTINGS_STRUCTURE_PLAN.md`
