/**
 * Ustunlar tartibi va ruscha sarlavhalar.
 * Mantiqiy bog‘lash: `lib/client-column-display.ts`
 */
export type ClientColumnId = string;

export type ClientColumnDef = {
  id: ClientColumnId;
  label: string;
};

const agentCols: ClientColumnDef[] = [];
for (let i = 1; i <= 10; i++) {
  agentCols.push(
    { id: `agent_${i}`, label: i === 1 ? "Агент" : `Агент ${i}` },
    { id: `agent_${i}_day`, label: i === 1 ? "День" : `День ${i}` },
    { id: `expeditor_${i}`, label: i === 1 ? "Экспедитор" : `Эксп. ${i}` }
  );
}

/** Klientlar jadvali — siz bergan ustunlar tartibi */
export const CLIENT_TABLE_COLUMNS: ClientColumnDef[] = [
  { id: "name", label: "Наименование" },
  { id: "client_ref", label: "Ид клиента" },
  { id: "legal_name", label: "Юридическое название" },
  { id: "address", label: "Адрес" },
  { id: "phone", label: "Телефон" },
  { id: "contact_person", label: "Контактное лицо" },
  { id: "landmark", label: "Ориентир" },
  { id: "inn", label: "ИНН" },
  { id: "pinfl", label: "ПИНФЛ" },
  { id: "trade_channel_code", label: "Торговый канал" },
  { id: "client_category_code", label: "Категория клиента" },
  { id: "client_type_code", label: "Тип клиента" },
  { id: "format_code", label: "Формат" },
  { id: "client_region", label: "Территория (область)" },
  { id: "client_district", label: "Район" },
  { id: "client_zone", label: "Зона" },
  { id: "city_code", label: "Город" },
  { id: "latitude", label: "Широта" },
  { id: "longitude", label: "Долгота" },
  ...agentCols,
  { id: "_actions", label: "Действия" }
];

/** `ui_preferences` / ustunlar dialogi uchun (_actions bundan mustasno) */
export const CLIENT_TABLE_PREF_COLUMN_IDS = CLIENT_TABLE_COLUMNS.map((c) => c.id).filter((id) => id !== "_actions");

export function getDefaultHiddenClientColumnIds(): string[] {
  const vis = getDefaultColumnVisibility();
  return CLIENT_TABLE_PREF_COLUMN_IDS.filter((id) => !vis[id]);
}

/** Eski saqlangan ustunlar (v1) bilan aralashmasin */
const LS_KEY = "salesdoc.clients.table.columns.v2";

export function getDefaultColumnVisibility(): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const c of CLIENT_TABLE_COLUMNS) {
    m[c.id] = [
      "name",
      "client_ref",
      "legal_name",
      "address",
      "phone",
      "client_category_code",
      "format_code",
      "client_region",
      "client_zone",
      "city_code",
      "landmark",
      "inn",
      "agent_1",
      "agent_1_day",
      "expeditor_1",
      "_actions"
    ].includes(c.id);
  }
  return m;
}

export function loadColumnVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return getDefaultColumnVisibility();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return getDefaultColumnVisibility();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const base = getDefaultColumnVisibility();
    for (const col of CLIENT_TABLE_COLUMNS) {
      if (typeof parsed[col.id] === "boolean") base[col.id] = parsed[col.id];
    }
    return base;
  } catch {
    return getDefaultColumnVisibility();
  }
}

export function saveColumnVisibility(v: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
