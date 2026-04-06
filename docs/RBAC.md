# Rol va kirish (RBAC) — modul xulosasi

JWT ichida `role` maydoni tekshiriladi. Umumiy yordamchi: [auth.prehandlers.ts](../backend/src/modules/auth/auth.prehandlers.ts).

## Global konstanta

| Nom | Rollar | Maqsad |
|-----|--------|--------|
| `DIRECTORY_READ_ROLES` | `admin`, `operator`, `supervisor`, `agent`, `expeditor` | Ko‘p o‘qish API (klientlar ro‘yxati, agentlar, ba’zi spravochniklar) |

Har bir marshrut odatda `jwtAccessVerify` + `requireRoles(...)` bilan himoyalangan.

## Modul bo‘yicha (asosiy naqshlar)

Quyidagi jadval **eng ko‘p uchraydigan** naqshlarni beradi; aniq marshrut uchun `*.route.ts` ni tekshiring.

| Modul | Fayl | O‘qish (typical) | Yozish / maxsus |
|-------|------|------------------|-----------------|
| Notifications | `notifications.route.ts` | barcha asosiy rollar | `POST /notifications` — `admin`, `operator` |
| Field | `field.route.ts` | `DIRECTORY_READ_ROLES` | vazifa yaratish, marshrut: `admin`, `operator`, `supervisor` |
| Stock takes | `stock-takes.route.ts` | `DIRECTORY_READ_ROLES` | `admin`, `operator` |
| Cash desks | `cash-desks.route.ts` | `DIRECTORY_READ_ROLES` | yaratish/tahrir/smena: `admin`, `operator` |
| Tenant settings | `tenant-settings.route.ts` | profil GET: `admin`, `operator` | profil PATCH, bonus-stack PATCH: `admin` |
| Stock | `stock.route.ts` | import/low/balances: `admin`, `operator` (turli) | import: ko‘pincha `admin` |
| Goods receipts | `goods-receipt.route.ts` | keng `catalogRoles` (agent/expeditor kirishi mumkin) | yozuv: `admin`, `operator` |
| Suppliers | `suppliers.route.ts` | `admin`, `operator`, `supervisor`, `agent`, `expeditor` | `admin`, `operator` |
| Reference / warehouses | `reference.route.ts` | omborlar: `admin`, `operator`; `/users`: `DIRECTORY_READ_ROLES` | kategoriya POST/PATCH/DELETE: `admin` |
| Products | `products.route.ts` | `admin`, `operator` | |
| Orders | `orders.route.ts` | `GET /orders`, `GET /orders/:id` — faqat **JWT** (filtrlash `listOrdersPaged` / `getOrderDetail` ichida rol bo‘yicha) | `PATCH` meta/lines/status, `POST`, bulk status: **`admin`, `operator`** (`catalogRoles`) |
| Clients | `clients.route.ts` | keng o‘qish | tahrir/import: `admin`, `operator` (marshrut bo‘yicha) |
| Payments | `payments.route.ts` | | odatda `admin`, `operator` |
| Returns | `sales-returns.route.ts` | | fayl ichidagi `requireRoles` |
| Dashboard | `dashboard.route.ts` | `admin`, `operator` | |
| Reports | `reports.route.ts` | Faqat **JWT** — marshrut darajasida `requireRoles` **yo‘q** (xavfsizlikni kuchaytirish uchun kelajakda rol qo‘shish mumkin) | |
| Bonus rules | `bonus-rules.route.ts` | | admin-heavy |
| Audit | `audit-events.route.ts` | cheklangan | |
| Sales directions | `sales-directions.route.ts` | | admin / operator naqshi |
| Staff | `staff.route.ts` | agent/supervisor/expeditor/operator ro‘yxatlari: turli | yaratish/tahrir: `catalogRoles` / `adminRoles` |

## Operator cheklovlari (buyurtma)

- Orqaga qaytish: `order-status.ts` + `orders.service` — ko‘pincha faqat **admin** yoki ruxsat etilgan orqaga o‘tish.
- Kech bekor qilish: `isOperatorLateStageCancelForbidden`.

## Frontend

Dashboard UI rollarni `useEffectiveRole` orqali filtrlashi mumkin; API baribir 403 qaytaradi.

**Sozlamalar katalogi** (`frontend/lib/settings-structure.ts`): ixtiyoriy `requiredRoles` — `SettingsShell` yon panelida punktlarni yashirish uchun (masalan, faqat `admin`: Аудит, Должности, должности веб-сотрудников). `/settings` bosh sahifasidagi tezkor «Должности» havolasi ham admin uchun.
