# Client Data Parity Map

Maqsad: backend va frontend orasida client maydonlari bir xil semantika bilan ishlashini ta'minlash.

## Asosiy maydonlar (API'da mavjud)
- `name` -> `Наименование`
- `address` + manzil bo'laklari (`region`, `district`, `street`, `house_number`, `apartment`) -> `Адрес`
- `phone` -> `Телефон`
- `responsible_person` + `contact_persons` -> `Контактное лицо`
- `landmark` -> `Ориентир`
- `inn` -> `ИНН`
- `agent_name` -> `Агент 1`
- `visit_date` -> `Агент 1 день` (vaqtincha mapping)
- `pdl` -> `Экспедитор 1` (vaqtincha mapping)
- `gps_text` -> `Широта/Долгота` parse fallback

## Hozircha placeholder maydonlar (to'liq backend wiring kutilmoqda)
- `legal_name`
- `pinfl`
- `trade_channel_code`
- `client_category_code`
- `client_type_code`
- `format_code`
- `city_code`
- `latitude`
- `longitude`
- `agent_2..agent_10`
- `agent_N_day`
- `expeditor_N`

## Contract qoidalari
- `list`, `detail`, `update` da bir xil naming ishlatiladi.
- Bo'sh qiymatlar UI'da `—` ko'rinishida chiqadi.
- Placeholder maydonlar mavjud bo'lmasa UI xatoga tushmaydi (`ClientRow` index signature).
