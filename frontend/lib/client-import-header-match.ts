import { CLIENT_IMPORT_MAPPABLE_FIELDS } from "./client-import-fields";

const VALID_KEYS = new Set(CLIENT_IMPORT_MAPPABLE_FIELDS.map((f) => f.key));

/** Backend `HEADER_ALIASES` bilan mos (avtomatik moslash uchun). */
const HEADER_ALIASES: Record<string, string> = {
  nom: "name",
  nomi: "name",
  mijoz: "name",
  mijoz_nomi: "name",
  telefon: "phone",
  tel: "phone",
  manzil: "address",
  kategoriya: "category",
  kredit: "credit_limit",
  kredit_limiti: "credit_limit",
  faol: "is_active",
  masul: "responsible_person",
  masul_shaxs: "responsible_person",
  orientir: "landmark",
  stir: "inn",
  logistika: "logistics_service",
  litsenziya_muddati: "license_until",
  ish_vaqti: "working_hours",
  viloyat: "region",
  tuman: "district",
  shahar: "city",
  gorod: "city",
  город: "city",
  city: "city",
  mahalla: "neighborhood",
  kocha: "street",
  uy: "house_number",
  xonadon: "apartment",
  gps: "gps_text",
  izoh: "notes",
  format: "client_format",
  legal_name: "legal_name",
  yuridik_nomi: "legal_name",
  имя: "name",
  название: "name",
  наименование: "name",
  наименование_полное: "name",
  наименование_клиента: "name",
  наименование_контрагента: "name",
  контрагент: "name",
  организация: "name",
  покупатель: "name",
  клиент: "name",
  фио: "name",
  телефон: "phone",
  адрес: "address",
  категория: "category",
  категория_клиента: "category",
  категория_клиента_код: "category",
  кредит: "credit_limit",
  кредитный_лимит: "credit_limit",
  активен: "is_active",
  активный: "is_active",
  ответственный: "responsible_person",
  ориентир: "landmark",
  инн: "inn",
  юридическое_название: "legal_name",
  юр_название: "legal_name",
  полное_наименование: "legal_name",
  регион: "region",
  область: "region",
  район: "district",
  зона: "zone",
  город_туман: "city",
  тип_клиента_код: "client_type_code",
  тип_клиента: "client_type_code",
  код_типа_клиента: "client_type_code",
  формат_код: "client_format",
  формат_клиента: "client_format",
  торговый_канал: "sales_channel",
  торговый_канал_код: "sales_channel",
  канал_продаж: "sales_channel",
  канал_продаж_код: "sales_channel",
  savdo_kanali: "sales_channel",
  sales_channel: "sales_channel",
  улица: "street",
  дом: "house_number",
  квартира: "apartment",
  примечание: "notes",
  комментарий: "notes",
  контактное_лицо: "responsible_person",
  контакт: "responsible_person",
  ид_клиента: "client_code",
  id_клиента: "client_code",
  ид: "client_db_id",
  код_клиента: "client_code",
  клиент_код: "client_code",
  код: "client_code",
  пинфл: "client_pinfl",
  широта: "latitude",
  долгота: "longitude",
  город_код: "city_code",
  категория_продукции: "product_category_ref",
  категория_товара: "product_category_ref"
};

function normalizeHeaderLabel(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s*[/\\]+\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[''`«»]/g, "");
}

export function headerToClientImportKey(header: string): string | null {
  const n = normalizeHeaderLabel(header);
  if (!n) return null;
  if (HEADER_ALIASES[n]) {
    const k = HEADER_ALIASES[n];
    if (VALID_KEYS.has(k)) return k;
  }
  if (VALID_KEYS.has(n)) return n;
  return null;
}

/** Sarlavha qatoridan avtomatik moslash (birinchi mos kelgan ustun g‘olib). */
export function suggestColumnMapping(headerCells: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  headerCells.forEach((raw, idx) => {
    const key = headerToClientImportKey(String(raw ?? ""));
    if (key && out[key] === undefined) out[key] = idx;
  });
  return out;
}

const AGENT_IMPORT_SLOTS = 10;

/** «Агент 1», «Агент 1 день», «Экспедитор 1» — backend `import_agent_*` kalitlari. */
export function headerToAgentImportKey(header: string): string | null {
  const n = normalizeHeaderLabel(header);
  const m1 = /^агент_(\d+)$/.exec(n);
  if (m1) {
    const slot = Number.parseInt(m1[1], 10);
    if (slot >= 1 && slot <= AGENT_IMPORT_SLOTS) return `import_agent_${slot}`;
  }
  const m2 = /^агент_(\d+)_день$/.exec(n);
  if (m2) {
    const slot = Number.parseInt(m2[1], 10);
    if (slot >= 1 && slot <= AGENT_IMPORT_SLOTS) return `import_agent_${slot}_days`;
  }
  const m3 = /^экспедитор_(\d+)$/.exec(n);
  if (m3) {
    const slot = Number.parseInt(m3[1], 10);
    if (slot >= 1 && slot <= AGENT_IMPORT_SLOTS) return `import_expeditor_${slot}`;
  }
  return null;
}

export function mergeAutoClientImportColumns(
  fileHeaders: string[],
  columnMap: Record<string, number>
): Record<string, number> {
  const out = { ...columnMap };
  fileHeaders.forEach((raw, idx) => {
    const ak = headerToAgentImportKey(String(raw ?? ""));
    if (ak && out[ak] === undefined) out[ak] = idx;
  });
  return out;
}

export function rowToHeaderLabels(row: unknown[] | undefined, maxCols = 80): string[] {
  if (!Array.isArray(row)) return [];
  const labels: string[] = [];
  const n = Math.min(row.length, maxCols);
  for (let i = 0; i < n; i++) {
    const c = row[i];
    if (c == null || c === "") labels.push(`Ustun ${i + 1}`);
    else labels.push(String(c).trim() || `Ustun ${i + 1}`);
  }
  return labels;
}
