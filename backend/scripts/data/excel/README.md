# Excel import fayllari

Standart nomlar (ixtiyoriy): `supervisors.xlsx`, `expeditors.xlsx`, `agents.xlsx`, `categories.xlsx`, `price-list.xlsx`.

Yoki `IMPORT_EXCEL_DIR` / alohida `IMPORT_EXCEL_*` — batafsil: `backend/scripts/import-excel-bundle.ts` fayl boshidagi izoh.

## Qisman import

Faqat prays (xodimlarni tegmasdan): `IMPORT_EXCEL_SKIP_SUPERVISORS=1`, `IMPORT_EXCEL_SKIP_EXPEDITORS=1`, `IMPORT_EXCEL_SKIP_AGENTS=1`, `IMPORT_EXCEL_SKIP_CATEGORIES=1` (prays qoldi). Yoki `IMPORT_EXCEL_SKIP_PRICE_LIST=1` — faqat prays o‘tkaziladi. To‘liq ro‘yxat: `import-excel-bundle.ts` boshidagi izoh.

Katta prays **dry-run**da chiqishni qisqartirish: `IMPORT_EXCEL_QUIET_DRY=1`.

## Fazalar (tartib)

1. **Spravochniklar + omborlar:** `npm run import:once` (yoki faqat `npm run import:refs`).
2. **Excel (xodimlar, kategoriya, prays):** `npm run import:excel-bundle`.
3. **Bittada:** `npm run import:tenant-data` (xuddi shu env bilan ikkala bosqich ketma-ket).

## Ombor aliaslari

Exceldagi nom bazadagidan farq qilsa: `warehouse-aliases.example.json` ni `warehouse-aliases.json` qilib nusxalang, kalit/qiymatni to‘ldiring. Ixtiyoriy yo‘l: `IMPORT_WAREHOUSE_ALIASES_JSON`.

**Railway:** fayllarni artefakt/volume; `DATABASE_URL`, `IMPORT_TENANT_SLUG`, `ALLOW_PROD_REF_IMPORT=true`, kerakli `IMPORT_EXCEL_*` yoki `IMPORT_EXCEL_DIR`; buyruq: `cd backend && npm run import:excel-bundle`.
