import { api } from "@/lib/api";
import axios from "axios";
import { getUserFacingError } from "@/lib/error-utils";

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

function parseFilenameFromContentDisposition(cd: string | undefined): string | null {
  if (!cd) return null;
  const m = /filename="([^"]+)"/.exec(cd) ?? /filename=([^;\s]+)/.exec(cd);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/"/g, ""));
  } catch {
    return m[1].replace(/"/g, "");
  }
}

/**
 * `POST .../orders/bulk/nakladnoy` — bitta yoki bir nechta zakaz uchun Excel (.xlsx) yuklab oladi.
 */
export async function downloadOrdersNakladnoyXlsx(args: {
  tenantSlug: string;
  orderIds: number[];
  template: NakladnoyTemplateId;
  prefs: NakladnoyExportPrefs;
}): Promise<void> {
  const { tenantSlug, orderIds, template, prefs } = args;
  if (orderIds.length === 0) {
    throw new Error("Zakaz tanlanmagan.");
  }
  try {
    const res = await api.post<Blob>(
      `/api/${tenantSlug}/orders/bulk/nakladnoy`,
      {
        order_ids: orderIds,
        template,
        ...nakladnoyPrefsToApiBody(prefs)
      },
      { responseType: "blob" }
    );
    const ct = (res.headers["content-type"] ?? "").toLowerCase();
    if (ct.includes("application/json")) {
      const text = await (res.data as Blob).text();
      let msg = "Xato";
      try {
        const j = JSON.parse(text) as { error?: string; message?: string };
        msg = j.message ?? j.error ?? msg;
      } catch {
        msg = text.slice(0, 200) || msg;
      }
      throw new Error(msg);
    }
    const blob = res.data as Blob;
    const name =
      parseFilenameFromContentDisposition(res.headers["content-disposition"]) ??
      `nakladnoy_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
      const text = await e.response.data.text();
      let j: { error?: string };
      try {
        j = JSON.parse(text) as { error?: string };
      } catch {
        throw new Error(text.slice(0, 160) || "So‘rov xatosi");
      }
      if (j.error === "OrdersNotFound") throw new Error("Ba’zi zakazlar topilmadi.");
      if (j.error) throw new Error(String(j.error));
      throw new Error(text.slice(0, 160) || "So‘rov xatosi");
    }
    throw new Error(getUserFacingError(e, "Nakladnoyni yuklab bo‘lmadi."));
  }
}
