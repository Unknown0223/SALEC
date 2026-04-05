# Moliya spravochniklari: valyuta, to‘lov usuli, narx turi

Rejadagi **20.1** bandi uchun alohida Prisma jadval **talab qilinmaydi**: ma’lumotlar tenant profilining `references` JSON qismida saqlanadi va `PATCH /api/:slug/settings/profile` orqali yangilanadi.

## Backend

- Validatsiya va merge: [tenant-settings.route.ts](../backend/src/modules/tenant-settings/tenant-settings.route.ts) (`profilePatchSchema.references`).
- Normalizatsiya: [tenant-settings.service.ts](../backend/src/modules/tenant-settings/tenant-settings.service.ts), [finance-refs.ts](../backend/src/modules/tenant-settings/finance-refs.ts).

### Maydonlar (qisqa)

| Kalit | Tavsif |
|-------|--------|
| `currency_entries` | `id`, `name`, `code`, `sort_order`, `active`, `is_default` |
| `payment_method_entries` | `id`, `name`, `code`, `currency_code`, `sort_order`, `color`, … |
| `price_type_entries` | `id`, `name`, `code`, `payment_method_id`, … |

Eski `payment_types: string[]` qatorlari `payment_method_entries` bilan avtomatik moslashtiriladi (legacy).

### O‘qish API

- `GET /api/:slug/settings/profile` — `references` ichida barcha yozuvlar (rol: `admin`, `operator` profil uchun).

### Narx kalitlari mahsulot bilan

- `GET /api/:slug/price-types?kind=sale|purchase` — profildan hisoblangan kalitlar ro‘yxati ([reference.route.ts](../backend/src/modules/reference/reference.route.ts)).

## Frontend

| Sahifa | Komponent |
|--------|-----------|
| `/settings/currencies` | `finance-currencies-settings.tsx` |
| `/settings/payment-methods` | `finance-payment-methods-settings.tsx` |
| `/settings/price-types` | `finance-price-types-settings.tsx` |

Tahrirlash: odatda faqat **admin** (komponentlar `isAdmin` bilan himoyalangan); backend PATCH profil faqat **admin**.

## Reja holati

- **Schema:** `Tenant.settings` / profil `references` (mavjud).
- **API:** `GET/PATCH settings/profile` (mavjud).
- **UI:** uchala sahifa mavjud.

Keyingi yaxshilash (ixtiyoriy): alohida CRUD endpointlar yoki audit yozuvlari har bir o‘zgarish uchun.
