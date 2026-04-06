# Sozlamalar strukturasini bosqichma-bosqich joriy etish

## Maqsad

- Sozlamalar bo'limini yagona katalog ko'rinishiga o'tkazish.
- Mavjud funksional sahifalarni yangi struktura elementlariga moslashtirish.
- Hali yo'q sahifalar uchun "rejalashtirilgan" holatda placeholder saqlash.

## Joriy holat (kod bilan sinxron)

- Frontendda `settings` katalog sahifasi: [`frontend/app/(dashboard)/settings/`](../frontend/app/(dashboard)/settings/).
- Universal marshrut: `/settings/catalog/:section/:item` — [`catalog/[section]/[item]/page.tsx`](../frontend/app/(dashboard)/settings/catalog/[section]/[item]/page.tsx).
- **Katalog ro‘yxati va havolalar** — bitta manba: [`frontend/lib/settings-structure.ts`](../frontend/lib/settings-structure.ts).
  - Har bir element `resolveSettingsItemHref()` orqali **mavjud modul sahifasiga** yo‘nadi (`existingHrefByItemTitle`); katalogdagi «placeholder» URL faqat map bo‘lmagan noyoz holatlar uchun.
- **`/settings` bosh sahifasi** — tezkor tugmalar: [`page.tsx`](../frontend/app/(dashboard)/settings/page.tsx) (`PRIORITY_QUICK_LINKS` + asosiy 4 ta havola).
- **Eslatma:** ombor operatsiyalari (qoldiq, korrektirovka) **sozlamalar katalogidan olib tashlangan** — ular asosiy menyu `Склад` orqali (`/stock`, `/stock/correction`).

## Tahlil: prioritet (1-navbat) va holati

Quyidagi bandlar **allaqachon** alohida sahifa + katalog map orqali bog‘langan (CRUD darajasi modulga qarab farq qiladi):

| Reja bandi | Asosiy frontend marshrut | Map kaliti (`settings-structure`) |
|------------|--------------------------|-----------------------------------|
| Единицы измерения | `/settings/units` | `единицы измерения` |
| Филиалы | `/settings/branches` | `филиалы` |
| Должности | `/settings/web-staff-position-presets` | `должности`, `должности веб-сотрудников`, … |
| Валюты | `/settings/currencies` | `валюты` |
| Цена | `/settings/prices` | `цена` (+ `тип цены`, `способ оплаты`) |
| Направление торговли | `/settings/sales-directions/trade` | `направление торговли` |
| Причины заявок | `/settings/reasons/request-types` | `причины заявок` |
| Типы задач | `/settings/reasons/task-types` | `типы задач` |
| Тип инвентаря | `/settings/inventory/type` | `тип инвентаря` |
| Принтеры | `/settings/equipment/printers` | `принтеры` |

**Xulosa:** 1-navbatdagi «ochish kerak» CRUD ko‘p qismi **bajarilgan**; reja matni ilgari «hamma narsa planned» deb qolgan edi — bu endi **noto‘g‘ri**.

## Hali ochiq / oxirigacha yetmagan (shu hujjat doirasi)

1. **Ruxsatlar** — katalog yon paneli va `/settings` tezkor havolalar uchun `requiredRoles` (hozircha **admin-only**: Аудит, Должности, должности веб-сотрудников); qolgan sahifalar — [`RBAC.md`](./RBAC.md) va modul `requireRoles` bilan sinxronlashtirish davom etadi.
2. **Audit** — `patch.profile` payloadda `references_keys` qo‘shildi; siyosat va retention: [`AUDIT_RETENTION.md`](./AUDIT_RETENTION.md).
3. **Migratsiya** — ikkala kirish (`/settings` va `/settings/spravochnik`) UI da bog‘langan; foydalanuvchi odatlari va qo‘shimcha yo‘riqnoma — jarayon.

## Backend API mapping (`/api/:slug/...`)

Barcha marshrutlar tenant kontekstida `slug` bilan ishlaydi. Quyidagi jadval **asosiy** sozlamalar va spravochnik bilan bog‘liq endpointlarni ko‘rsatadi (to‘liq ro‘yxat emas — batafsil uchun modul fayllarini qarang).

| Sozlamalar / spravochnik mavzusi | Asosiy HTTP | Backend modul (route fayli) | Izoh |
|----------------------------------|-------------|-----------------------------|------|
| Profil, valyuta, to‘lov usullari, narx turlari, filiallar, birliklar, hudud daraxti, mijoz format/tur/kategoriya va boshqa `references.*` | `GET` / `PATCH` `/settings/profile` | [`tenant-settings.route.ts`](../backend/src/modules/tenant-settings/tenant-settings.route.ts) | Yagona `profilePatchSchema` orqali yoziladi |
| Bonus stack | `GET` / `PATCH` `/settings/bonus-stack` | [`tenant-settings.route.ts`](../backend/src/modules/tenant-settings/tenant-settings.route.ts) | |
| Omborlar (CRUD, jadval, pickers) | `GET`/`POST`/`PATCH`/`DELETE` `/warehouses` … | [`reference.route.ts`](../backend/src/modules/reference/reference.route.ts) | Sozlamalar katalogida emas; `/stock/warehouses` |
| Foydalanuvchilar ro‘yxati (picker) | `GET` `/users` | [`reference.route.ts`](../backend/src/modules/reference/reference.route.ts) | |
| Mahsulot kategoriyalari | `GET`/`POST`/`PATCH`/`DELETE` `/product-categories` … | [`reference.route.ts`](../backend/src/modules/reference/reference.route.ts) | |
| Narx turlari (distinct) | `GET` `/price-types` | [`reference.route.ts`](../backend/src/modules/reference/reference.route.ts) | Profildan mustaqil ro‘yxat |
| Moliya narx ko‘rinishi | `GET` `/finance/price-overview` | [`reference.route.ts`](../backend/src/modules/reference/reference.route.ts) | |
| Mahsulotlar, import/export, bulk | `/products` … | [`products.route.ts`](../backend/src/modules/products/products.route.ts) | |
| Narx matritsasi, mahsulot narxlari | `/products/prices/...`, `/product-prices/resolve` … | [`product-prices.route.ts`](../backend/src/modules/products/product-prices.route.ts) | |
| Katalog: guruhlar, brendlar, ishlab chiqaruvchi, segmentlar, o‘zaro almashtiriladigan | `/catalog/product-groups` …, `/catalog/interchangeable-groups` … | [`product-catalog.route.ts`](../backend/src/modules/products/product-catalog.route.ts) | |
| Savdo yo‘nalishlari, kanallar, KPI guruhlari | `/trade-directions`, `/sales-channels`, `/kpi-groups` … | [`sales-directions.route.ts`](../backend/src/modules/sales-directions/sales-directions.route.ts) | |
| Agentlar, supervizorlar, ekspeditorlar, operatorlar | `/agents` …, `/supervisors` …, `/expeditors` …, `/operators` … | [`staff.route.ts`](../backend/src/modules/staff/staff.route.ts) | Spravochnik «kadrlar» |
| Bonus qoidalari | `/bonus-rules` … | [`bonus-rules.route.ts`](../backend/src/modules/bonus-rules/bonus-rules.route.ts) | |
| Kassalar | `/cash-desks` … | [`cash-desks.route.ts`](../backend/src/modules/cash-desks/cash-desks.route.ts) | |
| Mijozlar | `/clients` … | [`clients.route.ts`](../backend/src/modules/clients/clients.route.ts) | |
| Qoldiq, picking, korrektirovka | `/stock` …, `/stock/correction-workspace`, `/stock/corrections/bulk` … | [`stock.route.ts`](../backend/src/modules/stock/stock.route.ts) | Asosiy menyu **Склад** |
| Agent tashriflari, vazifalar, marshrut kunlari | `/agent-visits` …, `/tenant-tasks` …, `/agent-route-days` … | [`field.route.ts`](../backend/src/modules/field/field.route.ts) | |
| Tenant audit jurnali | `GET` `/audit-events` | [`audit-events.route.ts`](../backend/src/modules/audit-events/audit-events.route.ts) | |

Agar alohida `API-reference.md` paydo bo‘lsa, shu jadvalni u yerga ko‘chirish yoki ikkala joyda qisqa indeks qoldirish mumkin.

Boshqa reja hujjatlari (umumiy loyiha):

- Jarayon foizi: [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md), [`PHASE_GATES.md`](./PHASE_GATES.md).
- Mijozlar UI qismi ustunlar: [`CLIENTS_ONE_PAGE_PLAN.md`](./CLIENTS_ONE_PAGE_PLAN.md) (qisman placeholder ustunlar).
- Fon ishlar: [`BACKGROUND_JOBS_PLAN.md`](./BACKGROUND_JOBS_PLAN.md) (importlar hali sinxron).

## Keyingi bosqichlar (yangilangan)

1. **Ruxsatlar:** `settings-structure` da `requiredRoles` kengaytirish (operator uchun faqat o‘qish ko‘rinadigan punktlar va h.k.).
2. **Audit:** boshqa sozlama modullarida jurnal qoplamasi — `AUDIT_RETENTION` bo‘yicha.
3. **Sozlamalar UX:** `/settings` ↔ `/settings/spravochnik` — bajarilgan.

## Prioritet (1-navbat) — tarixiy ro‘yxat

*(Yuqoridagi jadvalda holati ko‘rsatilgan; yangi vazifa sifatida takrorlanmasligi kerak.)*

- Единицы измерения
- Филиалы
- Должности
- Валюты
- Цена
- Направление торговли
- Причины заявок
- Типы задач
- Тип инвентаря
- Принтеры
