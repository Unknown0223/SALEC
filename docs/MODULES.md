# Modullar xaritasi (4–19 bo‘limlar bilan mos)

API batafsil ro‘yxati: [API-reference.md](./API-reference.md). Kod: `backend/src/modules/<name>/`.

| Bo‘lim | Modul papkasi | Asosiy route fayllar |
|--------|---------------|----------------------|
| 4 Orders | `orders/` | `orders.route.ts`, `order-stream.route.ts` |
| 5 Bonus rules | `bonus-rules/` | `bonus-rules.route.ts` |
| 6 Stock | `stock/` | `stock.route.ts`, `goods-receipt.route.ts`, `stock-takes.route.ts`, `suppliers.route.ts` |
| 7 Payments | `payments/` | `payments.route.ts` |
| 8 Returns | `returns/` | `sales-returns.route.ts` |
| 9 Cash desks | `cash-desks/` | `cash-desks.route.ts` |
| 10 Staff | `staff/` | `staff.route.ts` |
| 11 Sales directions | `sales-directions/` | `sales-directions.route.ts` |
| 12 Dashboard | `dashboard/` | `dashboard.route.ts` |
| 13 Reports | `reports/` | `reports.route.ts` |
| 14 Tenant settings | `tenant-settings/` | `tenant-settings.route.ts` |
| 15 Reference | `reference/` | `reference.route.ts` (warehouses, categories, price-types, …) |
| 16 Audit | `audit-events/` | `audit-events.route.ts` |
| 17 Field | `field/` | `field.route.ts` |
| 18 Notifications | `notifications/` | `notifications.route.ts` |
| 19 Settings UI | — | Frontend: `frontend/app/(dashboard)/settings/` |

Qo‘shimcha: `products/`, `products/product-prices.route.ts` (`/products/prices/import/async`), `clients/`, `auth/`, `users/user-ui.route.ts`, `jobs/` (`jobs.route.ts`).
