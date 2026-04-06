# SalesDoc REST API reference

Barcha marshrutlar `Authorization: Bearer <access>` bilan (auth istisno). Tenant: URL dagi `:slug` va JWT `tenantId` mos kelishi kerak.

**Prefiks:** `GET|POST|PUT|PATCH|DELETE /api/:slug/...`

Agar boshqa ko‘rsatilmasa, integratsiya bazasi: `backend/src/modules/*/*.route.ts`.

---

## Eski hujjatdan farqlar (muhim)

| Modul | Noto‘g‘ri (eski nom) | To‘g‘ri |
|--------|----------------------|---------|
| Qaytarishlar | `/sales-returns` | **`/returns`** va qo‘shimcha (`/orders/:id/returns`, …) |
| Kassa smenasi | `.../shift`, `.../shift/close` | **`GET/POST .../cash-desks/:id/shifts/open`**, **`POST .../shifts/:shiftId/close`**, **`GET .../shifts`**, **`GET .../shifts/open`** |
| Bildirishnoma o‘qildi | `POST .../notifications/:id/read` | **`PATCH .../notifications/:id/read`** |
| Inventarizatsiya qatorlar | `PATCH .../stock-takes` | **`PUT .../stock-takes/:id/lines`**, **`POST .../:id/post`**, **`POST .../:id/cancel`** |
| Buyurtma SSE | `/orders/sse` | **`GET /api/:slug/stream/orders`** |

---

## Auth (`/auth` va `/api/auth`)

| Metod | Yo‘l | Eslatma |
|-------|------|---------|
| POST | `/auth/login`, `/api/auth/login` | Rate limit |
| POST | `/auth/refresh`, `/api/auth/refresh` | |
| POST | `/auth/logout`, `/api/auth/logout` | |
| GET | `/auth/me`, `/api/auth/me` | JWT |

---

## Orders va stream

| Metod | Yo‘l |
|-------|------|
| GET | `/orders` |
| GET | `/orders/:id` |
| POST | `/orders` |
| PATCH | `/orders/:id` |
| PATCH | `/orders/:id/meta` |
| PATCH | `/orders/:id/status` |
| POST | `/orders/bulk/status` |
| GET | `/stream/orders` |

---

## Clients

| Metod | Yo‘l (tanlangan) |
|-------|------------------|
| GET, POST | `/clients` |
| GET, PATCH | `/clients/:id` |
| GET | `/clients/references`, `/clients/duplicate-groups`, `/clients/export`, … |
| POST | `/clients/import`, `/clients/merge`, `/clients/bulk-active`, … |
| GET | `/clients/:id/audit` |
| GET, POST | `/clients/:id/balance-movements` |

---

## Products

| Metod | Yo‘l (tanlangan) |
|-------|------------------|
| GET, POST | `/products` |
| GET, PATCH, DELETE | `/products/:id` |
| POST | `/products/import`, `/products/bulk`, `/products/import-catalog`, … |
| GET | `/products/import-template`, `/products/export-catalog` |

## Product catalog / prices

| Metod | Yo‘l |
|-------|------|
| CRUD | `/catalog/product-groups`, `/catalog/brands`, `/catalog/manufacturers`, `/catalog/segments`, `/catalog/interchangeable-groups` |
| POST | `/product-prices/resolve` |
| GET, PUT | `/products/prices/matrix` |
| GET, PUT | `/products/:id/prices` |
| POST | `/products/prices/import` |

---

## Bonus rules

| Metod | Yo‘l |
|-------|------|
| GET | `/bonus-rules` |
| GET | `/bonus-rules/:id` |
| POST | `/bonus-rules` |
| PUT | `/bonus-rules/:id` |
| PATCH | `/bonus-rules/:id/active` |
| DELETE | `/bonus-rules/:id` |
| POST | `/bonus-rules/:id/preview-qty` |

---

## Stock, kirim, ta’minotchilar, inventarizatsiya

| Metod | Yo‘l |
|-------|------|
| GET | `/stock`, `/stock/low`, `/stock/balances`, `/stock/balances/export` |
| GET | `/stock/import-template` |
| POST | `/stock/import`, `/stock/receipts` |
| GET, POST | `/goods-receipts`, `/goods-receipts/:id` |
| PATCH | `/goods-receipts/:id` |
| GET, POST | `/suppliers` |
| GET | `/stock-takes`, `/stock-takes/:id` |
| POST | `/stock-takes` |
| PUT | `/stock-takes/:id/lines` |
| POST | `/stock-takes/:id/post`, `/stock-takes/:id/cancel` |

## Warehouses / reference

| Metod | Yo‘l |
|-------|------|
| GET, POST | `/warehouses`, `/warehouses/table`, `/warehouses/pickers` |
| GET, PATCH, DELETE | `/warehouses/:warehouseId` |
| GET | `/users` |
| GET, POST | `/product-categories`, `/product-categories/:categoryId` |
| GET | `/price-types` |
| GET | `/finance/price-overview` |

---

## Payments

| Metod | Yo‘l |
|-------|------|
| GET, POST | `/payments` |
| GET | `/payments/:id/allocations` — taqsimot qatorlari |
| POST | `/payments/:id/allocate` — FIFO bo‘yicha zakazlarga taqsimlash |
| DELETE | `/payments/:id` |
| GET | `/orders/:id/payments`, `/clients/:id/payments` |

---

## Returns

| Metod | Yo‘l |
|-------|------|
| GET, POST | `/returns` |
| GET | `/orders/:id/returns` |
| POST | `/returns/client-data`, `/returns/period`, `/returns/full-order` |

---

## Cash desks

| Metod | Yo‘l |
|-------|------|
| GET | `/cash-desks/pickers`, `/cash-desks`, `/cash-desks/:id` |
| POST | `/cash-desks` |
| PATCH | `/cash-desks/:id` |
| GET | `/cash-desks/:id/shifts`, `/cash-desks/:id/shifts/open` |
| POST | `/cash-desks/:id/shifts/open`, `/cash-desks/:id/shifts/:shiftId/close` |

---

## Staff (agents, supervisors, expeditors, operators)

Ko‘p sonli `GET/POST/PATCH` marshrutlar: `/agents`, `/supervisors`, `/expeditors`, `/operators` (+ `filter-options`, `sessions`, `meta/...`). Batafsil: [staff.route.ts](../backend/src/modules/staff/staff.route.ts).

---

## Sales directions

| Metod | Yo‘l |
|-------|------|
| CRUD | `/trade-directions`, `/trade-directions/:id` |
| CRUD | `/sales-channels`, `/sales-channels/:id` |
| CRUD | `/kpi-groups`, `/kpi-groups/:id` |

---

## Dashboard, reports

| Metod | Yo‘l |
|-------|------|
| GET | `/dashboard/stats` |
| GET | `/reports/sales`, `/reports/order-trends`, `/reports/products`, `/reports/clients`, `/reports/agent-kpi`, `/reports/status-distribution`, `/reports/channels` |

**Eslatma:** hisobot marshrutlarida hozircha faqat JWT tekshiriladi; rol cheklovi marshrut darajasida yo‘q ([RBAC.md](./RBAC.md)).

---

## Tenant settings

| Metod | Yo‘l | Rol (qisqa) |
|-------|------|-------------|
| GET | `/settings/profile` | admin, operator |
| PATCH | `/settings/profile` | admin |
| GET/PATCH | `/settings/bonus-stack` | o‘qish: admin, operator; yozish: admin |

Profil `references` ichida valyuta, to‘lov usuli, narx turlari va boshqa spravochniklar — [FINANCE_REFERENCES.md](./FINANCE_REFERENCES.md).

---

## Audit, UI

| Metod | Yo‘l |
|-------|------|
| GET | `/audit-events` |
| GET, PATCH | `/me/ui-preferences` |

---

## Field (visits, tasks, routes)

| Metod | Yo‘l |
|-------|------|
| GET, POST | `/agent-visits` |
| POST | `/agent-visits/:id/checkout` |
| GET, POST, PATCH | `/tenant-tasks` |
| GET, PUT | `/agent-route-days`, `/agent-route-days/one` |

---

## Notifications

| Metod | Yo‘l |
|-------|------|
| GET | `/notifications` |
| PATCH | `/notifications/:id/read` |
| POST | `/notifications/read-all` |
| POST | `/notifications` (admin, operator — boshqa foydalanuvchiga yuborish) |

---

## Health (tenant emas)

| Metod | Yo‘l |
|-------|------|
| GET | `/health`, `/ready` |
| GET | `/api/:slug/protected` | JWT test |

---

*Oxirgi yangilanish: kod bazasi bilan qo‘lda sinxron; avto OpenAPI hozircha yo‘q.*
