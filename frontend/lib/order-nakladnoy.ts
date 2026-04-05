/** Backend `bulk/nakladnoy` `template` qiymatlari bilan mos. */
export const NAKLADNOY_TEMPLATE_OPTIONS = [
  { id: "nakladnoy_warehouse", label: "Загруз зав.склада 5.1.8" },
  { id: "nakladnoy_expeditor", label: "Накладные 2.1.0 (2 нусха)" }
] as const;

export type NakladnoyTemplateId = (typeof NAKLADNOY_TEMPLATE_OPTIONS)[number]["id"];

export type NakladnoyCodeColumn = "sku" | "barcode";
export type NakladnoyGroupBy = "territory" | "agent" | "expeditor";

/** Brauzerda saqlanadigan eksport sozlamalari (API body bilan mos). */
export type NakladnoyExportPrefs = {
  codeColumn: NakladnoyCodeColumn;
  /** «Отделить по листам» — Загрузочный лист: agent / ekspeditor / hudud bo‘yicha varaqlar */
  separateSheets: boolean;
  groupBy: NakladnoyGroupBy;
};

export const DEFAULT_NAKLADNOY_EXPORT_PREFS: NakladnoyExportPrefs = {
  codeColumn: "sku",
  separateSheets: false,
  groupBy: "agent"
};

const LS_KEY = "salesdoc.nakladnoy-export-prefs-v1";

function normalizePrefs(raw: unknown): NakladnoyExportPrefs {
  const d = DEFAULT_NAKLADNOY_EXPORT_PREFS;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const codeColumn = o.codeColumn === "barcode" ? "barcode" : "sku";
  const separateSheets = Boolean(o.separateSheets);
  let groupBy: NakladnoyGroupBy = "agent";
  if (o.groupBy === "territory" || o.groupBy === "expeditor") groupBy = o.groupBy;
  return { codeColumn, separateSheets, groupBy };
}

export function loadNakladnoyExportPrefs(): NakladnoyExportPrefs {
  if (typeof window === "undefined") return DEFAULT_NAKLADNOY_EXPORT_PREFS;
  try {
    const s = window.localStorage.getItem(LS_KEY);
    if (!s) return DEFAULT_NAKLADNOY_EXPORT_PREFS;
    return normalizePrefs(JSON.parse(s) as unknown);
  } catch {
    return DEFAULT_NAKLADNOY_EXPORT_PREFS;
  }
}

export function saveNakladnoyExportPrefs(prefs: NakladnoyExportPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function nakladnoyPrefsToApiBody(prefs: NakladnoyExportPrefs) {
  return {
    code_column: prefs.codeColumn,
    separate_sheets: prefs.separateSheets,
    group_by: prefs.groupBy
  };
}
