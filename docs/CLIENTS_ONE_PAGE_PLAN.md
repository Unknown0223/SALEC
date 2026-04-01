# Clients One-Page Plan

Goal: bring `clients` page to a single-page workflow close to target UI (table + dense filters), keep existing working fields, and phase in missing data model blocks safely.

## 1) Already implemented (current system)

- Client table columns are aligned to requested Russian headers in `frontend/lib/client-table-columns.ts`.
- Display mapping layer exists in `frontend/lib/client-column-display.ts`.
- Clients list page has:
  - global search
  - status filter
  - category/region/district/neighborhood filters
  - sorting + pagination
  - column chooser
- New references API exists:
  - `GET /api/:slug/clients/references`
  - implemented in `backend/src/modules/clients/clients.route.ts`
  - source logic in `backend/src/modules/clients/clients.service.ts`
- List API now accepts extra filters:
  - `region`, `district`, `neighborhood`
  - route parsing in `clients.route.ts`, query execution in `clients.service.ts`
- Edit dialog uses references (`datalist`) for:
  - category, client_format, logistics_service, region, district, neighborhood.

## 2) Requested columns: support status

### Fully backed by DB/API now

- `Наименование` -> `clients.name`
- `Адрес` -> `clients.address` (+ composed address fallback)
- `Телефон` -> `clients.phone`
- `Контактное лицо` -> `clients.responsible_person`
- `Ориентир` -> `clients.landmark`
- `ИНН` -> `clients.inn`
- `ПИНФЛ` -> `clients.pdl`
- `Торговый канал (код)` -> `clients.logistics_service` (currently text/code-like)
- `Категория клиента (код)` -> `clients.category`
- `Формат (код)` -> `clients.client_format`
- `Город (код)` -> derived from `district/region`
- `Широта/Долгота` -> parsed from `gps_text` (or explicit optional fields if present in payload)
- `Агент 1` -> `agent_id/agent_name`
- `Агент 1 день` -> `visit_date`
- `Экспедитор 1..10` -> currently proxied from `contact_persons[N-1].phone`

### Partially supported (placeholder behavior)

- `Юридическое название` -> UI placeholder only, no dedicated DB field yet.
- `Тип клиента (код)` -> UI placeholder only, no dedicated DB field yet.
- `Агент 2..10`, `Агент 2..10 день` -> UI placeholders only.

## 3) Missing blocks to add (and where)

### A) Master dictionaries for strict "code" fields

Add dedicated dictionaries for:
- legal name policy (optional if free text)
- trade channel code
- client category code
- client type code
- client format code
- city code

Suggested placement:
- Prisma models: `backend/prisma/schema.prisma`
- Service/route layer: `backend/src/modules/reference/*` (extend existing reference module)
- Admin UI: `frontend/app/(dashboard)/settings/spravochnik/*`

### B) Multi-agent model (1..10 with visit day and expeditor)

**Done (2026-04):** `ClientAgentAssignment` (`slot` 1..10, `agent_id`, `visit_date`, `expeditor_phone`) + `legal_name`, `client_type_code` on `Client`. List/detail/PATCH in `clients.service.ts`; filters in `client-column-display.ts`. Edit UI: full page `app/(dashboard)/clients/[id]/edit/page.tsx` + `client-edit-form.tsx` (modal olib tashlangan).

### C) Server-side filter parity with target UI

Target UI has many filters (agent, type, category, format, supervisor, sales channel, day, expeditor, status, location, equipment type, MNN, inventory, phone, credit flags, etc.).
Plan:
1. add query params in clients route,
2. implement where-clause in clients service,
3. wire form controls in `clients-table-toolbar.tsx`,
4. include params from `app/(dashboard)/clients/page.tsx`.

## 4) Recommended implementation phases

1. **Phase 1 (safe):**
   - add dictionary tables + CRUD + references API expansion.
   - migrate existing free-text values into dictionary values.
2. **Phase 2:** *(asosiy qismi bajarildi — jadval slotlari + API + tahrirlash sahifasi)*
   - keyinroq: `visit_day` hafta kuni enum, `expeditor_id` alohida foydalanuvchiga bog‘lash.
3. **Phase 3:**
   - add remaining target filters + performance indexing.
4. **Phase 4:**
   - finalize UX parity (toolbar/actions/date-range/Excel sync/group actions).

## 5) Performance and indexing notes

For 5k+ clients, add indexes for frequent filters:
- `(tenant_id, is_active)`
- `(tenant_id, category)`
- `(tenant_id, region, district, neighborhood)`
- `(tenant_id, phone_normalized)`
- if multi-agent is added: `(tenant_id, slot_no, agent_id, visit_day)` on assignment table.

