/** Backend `client-import-masks.ts` bilan mos — UI yorliqlari. */

export const CLIENT_IMPORT_DUPLICATE_KEY_OPTIONS: { key: string; label: string }[] = [
  { key: "client_code", label: "Код клиента" },
  { key: "client_pinfl", label: "ПИНФЛ" },
  { key: "inn", label: "ИНН / STIR" },
  { key: "phone", label: "Телефон" },
  { key: "name", label: "Наименование" },
  { key: "city", label: "Город (после сопоставления)" },
  { key: "city_code", label: "Город (код) — в ключе как город" }
];

/** Default: kod + shahar (telefon/INN/PINFL emas). */
export const DEFAULT_DUPLICATE_KEY_FIELDS = ["client_code", "city"];

export function buildUpdateApplyFieldOptions(): { key: string; label: string }[] {
  const base: { key: string; label: string }[] = [
    { key: "name", label: "Наименование" },
    { key: "legal_name", label: "Юридическое название" },
    { key: "phone", label: "Телефон" },
    { key: "address", label: "Адрес" },
    { key: "client_code", label: "Код клиента" },
    { key: "client_pinfl", label: "ПИНФЛ" },
    { key: "category_name", label: "Категория" },
    { key: "category_code", label: "Категория (код)" },
    { key: "category", label: "Категория (общ.)" },
    { key: "client_type_name", label: "Тип клиента" },
    { key: "client_type_code", label: "Тип клиента (код)" },
    { key: "client_format_name", label: "Формат" },
    { key: "client_format_code", label: "Формат (код)" },
    { key: "sales_channel_name", label: "Канал продаж" },
    { key: "sales_channel_code", label: "Канал продаж (код)" },
    { key: "region", label: "Область / регион" },
    { key: "district", label: "Район" },
    { key: "city", label: "Город" },
    { key: "city_code", label: "Город (код)" },
    { key: "neighborhood", label: "Махалля" },
    { key: "zone", label: "Зона" },
    { key: "street", label: "Улица" },
    { key: "house_number", label: "Дом" },
    { key: "apartment", label: "Квартира" },
    { key: "credit_limit", label: "Кредитный лимит" },
    { key: "is_active", label: "Активность" },
    { key: "responsible_person", label: "Ответственное лицо" },
    { key: "landmark", label: "Ориентир" },
    { key: "inn", label: "ИНН" },
    { key: "pdl", label: "P-D-L" },
    { key: "logistics_service", label: "Логистика" },
    { key: "license_until", label: "Срок лицензии" },
    { key: "working_hours", label: "Часы работы" },
    { key: "gps_text", label: "GPS текст" },
    { key: "latitude", label: "Широта" },
    { key: "longitude", label: "Долгота" },
    { key: "notes", label: "Примечание" },
    { key: "product_category_ref", label: "Категория товара" },
    { key: "contact1_firstName", label: "Контакт 1 — имя" },
    { key: "contact1_lastName", label: "Контакт 1 — фамилия" },
    { key: "contact1_phone", label: "Контакт 1 — телефон" },
    { key: "contact2_firstName", label: "Контакт 2 — имя" },
    { key: "contact2_lastName", label: "Контакт 2 — фамилия" },
    { key: "contact2_phone", label: "Контакт 2 — телефон" }
  ];
  for (let s = 1; s <= 10; s++) {
    base.push(
      { key: `import_agent_${s}`, label: `Агент ${s}` },
      { key: `import_agent_${s}_days`, label: `Агент ${s} — дни визита` },
      { key: `import_expeditor_${s}`, label: `Экспедитор ${s}` }
    );
  }
  return base;
}
