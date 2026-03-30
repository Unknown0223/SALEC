# Bonus qo‘llash strategiyasi — reja va holat

Bu hujjat **avtomatik (Auto)** va **qo‘lda (Manual)** bonus yo‘nalishlarini, hamda keyingi bosqichlarni belgilaydi.

## 1. Maqsad

- **Hozir (joriy kod):** bitta zakazda shartga mos **barcha** avtomatik bonuslar birga hisoblanishi mumkin (chegirma + summa + miqdor).
- **Ixtiyoriy rejim:** tenant sozlamasida **nechta** «bonus sloti» qo‘llanishini cheklash:
  - `all` — barcha mos kelganlar (standart).
  - `first_only` — faqat **eng yuqori `priority`** li **bitta** slot (chegirma **yoki** summa **yoki** bitta mahsulot bo‘yicha qty).
  - `capped` — eng ko‘pi bilan `max_units` ta slot; `forbid_apply_all_eligible: true` bo‘lsa, mos keluvchilar soni `N` bo‘lganda **hammasini** berish taqiqlanadi (`N−1` gacha).

**Slot** — bitta qo‘llanadigan effekt: `(discount)`, `(sum-sovg‘a)`, yoki `(qty: qoida + sotib olingan mahsulot juftligi)`.

## 2. Sozlama joyi (backend + UI)

`tenants.settings` (JSON) ichida; **API:** `GET/PATCH /api/:slug/settings/bonus-stack` (PATCH faqat **admin**; **operator** faqat **GET**).

```json
{
  "bonus_stack": {
    "mode": "all",
    "max_units": null,
    "forbid_apply_all_eligible": false
  }
}
```

- `mode`: `"all"` | `"first_only"` | `"capped"`
- `max_units`: `capped` uchun musbat butun son (masalan 2 yoki 3); `null` yoki yo‘q = cheksiz (faqat `capped` + `forbid` bilan ma’noli).
- `forbid_apply_all_eligible`: `true` bo‘lsa va mos slotlar soni `N > 1` bo‘lsa, **hech qachon barcha `N` tasini** bir vaqtda bermaymiz (`min(..., N−1)` qoidasi bilan uyg‘unlashtiriladi).

## 3. Auto vs «qo‘lda» (hozirgi model)

| Bo‘lim | Tavsif | Holat |
|--------|--------|--------|
| **Auto** | `is_manual: false` qoidalar, zakaz **yaratish** va **to‘lov qatorlarini** `PATCH` orqali yangilaganda `bonus_stack` siyosati bilan | **Joriy** |
| **`is_manual: true` qoidalar** | Skema/seedda qolishi mumkin, lekin alohida «qo‘lda qo‘shish» oqimi **yo‘q** — operator zakazni tahrirlab to‘lov qatorlarini o‘zgartirsa, bonuslar qayta hisoblanadi (faqat avtomatik qoidalar). | Panelda qo‘lda bonus UI/API yo‘q |

Zakaz tahriri: [`ORDER_EDIT_ROADMAP.md`](./ORDER_EDIT_ROADMAP.md) (`PATCH /orders/:id`). Audit — keyin.

## 4. Misol (4 slot, max 2, hammasini taqiqlash)

Mos keluvchilar: chegirma (P=5), summa (P=8), qty A (P=10), qty B (P=7).  
`mode=capped`, `max_units=2`, `forbid_apply_all_eligible=true`.

- Priority bo‘yicha tartib: 10, 8, 7, 5.
- `max_units=2` → oldindan 2 ta.
- Agar keyinroq `max_units=4` va `N=4` bo‘lsa, `forbid` tufayli **3** tagacha beriladi.

## 5. Texnik eslatmalar

- Summa cheklov ( `min_sum` ) **chegirmadan oldingi** yig‘indiga qarab tekshiriladi (joriy mantiq).
- Chegirma tanlanmasa, to‘lov qatorlari boshlang‘ich narxda qoladi.
- Bir xil sovg‘a mahsuloti bir nechta qty slotdan kelsa, qatorlar **birlashtiriladi** (`mergeBonusLineDrafts`).

## 6. Keyingi bosqichlar (navbat)

1. ~~Admin UI: tenant **Sozlamalar**da `bonus_stack` formasi.~~ (panel: `/settings/bonus-stack`)
2. ~~Qo‘lda bonus API/UI.~~ — o‘rniga zakaz **qatorlarini tahrirlash** (`PATCH` + panel).
3. «Har bir qatorga alohida chegirma» (hozir chegirma butun zakazga proporsional).
4. ~~`once_per_client` avtomatik tekshiruvi (buyurtmalar tarixiga qarab).~~ — `orders.applied_auto_bonus_rule_ids` bilan joriy.
