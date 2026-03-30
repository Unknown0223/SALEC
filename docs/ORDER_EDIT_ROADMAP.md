# Zakaz tahriri — yo‘l xaritasi

**Maqsad:** ruxsat etilgan holatlarda zakaz tarkibini (to‘lov qatorlari, narxlar, bonuslar) xavfsiz qayta hisoblash bilan yangilash.

## Bajarilgan (2026-03-29)

- **`PATCH /api/:slug/orders/:id`** (admin / operator): faqat **`new`** / **`confirmed`** holatda — to‘lov qatorlarini to‘liq almashtiradi, avtomatik bonuslarni `resolveOrderBonusesForCreate` bilan qayta hisoblaydi, `applied_auto_bonus_rule_ids` va kredit limitini yangilaydi. Ixtiyoriy: `warehouse_id`, `agent_id` (yuborilmasa — joriy qiymat).
- **UI:** zakaz tafsiloti **alohida sahifa** `/orders/[id]` (modal emas): bo‘limlar tartibida — asosiy ma’lumotlar, holat, tarix, qatorlar jadvali; «**Tahrirlash**» — to‘lov qatorlari, **Saqlash** / **Bekor**. Bonuslar avtomatik qayta hisoblanadi; klient o‘zgarmaydi.
- **Qo‘lda bonus** alohida API/UI **yo‘q** (`manual-bonus`, `manual-bonus-preview`, `DELETE .../items/:itemId` olib tashlangan).

## Holatlar (backend)

- Ichki kodlar: `new` → `confirmed` → `picking` → `delivering` → `delivered` → `returned`; `cancelled` istalgan bosqichdan (ruxsat etilgan yo‘l bilan).
- **Orqaga** faqat zanjirda **bir qadam**: masalan `delivered` → `delivering`, `delivering` → `picking`; **`delivered` → `new` taqiqlanadi**.
- **Rol:** `operator` orqaga o‘tisha olmaydi (`403` `ForbiddenRevert`); `allowed_next_statuses` ro‘yxatida ← variantlar ko‘rinmaydi. **`picking` / `delivering` dan `cancelled`** — faqat **admin** (`403` `ForbiddenOperatorCancelLate`). To‘lov qatorlari `PATCH .../orders/:id` — faqat **admin** (`403` `ForbiddenOperatorOrderLinesEdit`). **Admin** holat va qatorlarda to‘liqroq.
- Panelda ko‘rinadigan nomlar: ruscha (`Новый`, `Подтверждён`, `Комплектация`, `Отгружен`, `Доставлен`, `Возврат`, `Отменён`).

## Keyingi bosqichlar (navbat)

1. **Audit / log:** ~~`order_change_logs` jadvali; `lines` / `meta` yozuvlari (JWT `sub` → `user_id`, login tafsilotda); UI «Tahrir jurnali».~~ Holatlar alohida `order_status_logs` da.
2. **Rollar:** ~~to‘lov qatorlari~~; ~~kech bekor (`picking`/`delivering` → `cancelled`) faqat admin~~. Yana: boshqa maydonlar bo‘yicha cheklovlar.
3. ~~**Ombor / agent**~~ — `GET /api/:slug/warehouses`, `GET /api/:slug/users`; zakaz sahifasida tanlash + `PATCH /api/:slug/orders/:id/meta` (faqat `new` / `confirmed`).

Batafsil bonus: [`BONUS_STACKING_PLAN.md`](./BONUS_STACKING_PLAN.md), jarayon: [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md).
