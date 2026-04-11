import type { PaymentListApiRow } from "@/lib/payment-list-types";

/** Печать чеков / квитанций (как группировка накладной в заявках) */
export type PaymentReceiptGroupBy = "none" | "territory" | "agent" | "expeditor";

export type PaymentReceiptPrintPrefs = {
  groupBy: PaymentReceiptGroupBy;
  showPaymentId: boolean;
  showDates: boolean;
  showClient: boolean;
  showClientCode: boolean;
  showLegalName: boolean;
  showAmount: boolean;
  showMethod: boolean;
  showCashDesk: boolean;
  showAgent: boolean;
  showExpeditor: boolean;
  showTerritory: boolean;
  showTradeDirection: boolean;
  showConsignment: boolean;
  showNote: boolean;
};

export const DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS: PaymentReceiptPrintPrefs = {
  groupBy: "none",
  showPaymentId: true,
  showDates: true,
  showClient: true,
  showClientCode: true,
  showLegalName: true,
  showAmount: true,
  showMethod: true,
  showCashDesk: true,
  showAgent: true,
  showExpeditor: true,
  showTerritory: true,
  showTradeDirection: true,
  showConsignment: true,
  showNote: true
};

const LS_KEY = "salesdoc.payment-receipt-print-prefs-v1";

function normalize(raw: unknown): PaymentReceiptPrintPrefs {
  const d = DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  let groupBy: PaymentReceiptGroupBy = d.groupBy;
  if (o.groupBy === "territory" || o.groupBy === "agent" || o.groupBy === "expeditor" || o.groupBy === "none") {
    groupBy = o.groupBy;
  }
  const bool = (k: keyof PaymentReceiptPrintPrefs, def: boolean) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : def;
  return {
    groupBy,
    showPaymentId: bool("showPaymentId", d.showPaymentId),
    showDates: bool("showDates", d.showDates),
    showClient: bool("showClient", d.showClient),
    showClientCode: bool("showClientCode", d.showClientCode),
    showLegalName: bool("showLegalName", d.showLegalName),
    showAmount: bool("showAmount", d.showAmount),
    showMethod: bool("showMethod", d.showMethod),
    showCashDesk: bool("showCashDesk", d.showCashDesk),
    showAgent: bool("showAgent", d.showAgent),
    showExpeditor: bool("showExpeditor", d.showExpeditor),
    showTerritory: bool("showTerritory", d.showTerritory),
    showTradeDirection: bool("showTradeDirection", d.showTradeDirection),
    showConsignment: bool("showConsignment", d.showConsignment),
    showNote: bool("showNote", d.showNote)
  };
}

export function loadPaymentReceiptPrintPrefs(): PaymentReceiptPrintPrefs {
  if (typeof window === "undefined") return DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS;
  try {
    const s = window.localStorage.getItem(LS_KEY);
    if (!s) return DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS;
    return normalize(JSON.parse(s) as unknown);
  } catch {
    return DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS;
  }
}

export function savePaymentReceiptPrintPrefs(prefs: PaymentReceiptPrintPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function receiptGroupKey(row: PaymentListApiRow, groupBy: PaymentReceiptGroupBy): string {
  switch (groupBy) {
    case "territory": {
      const parts = [row.client_region, row.client_city, row.client_district].filter((x) => x?.trim());
      return parts.length ? parts.join(" / ") : "Территория не указана";
    }
    case "agent":
      return row.agent_name?.trim() || "Без агента";
    case "expeditor":
      return row.expeditor_name?.trim() || "Без экспедитора";
    default:
      return "";
  }
}

export function sortPaymentsForReceiptPrint(
  rows: PaymentListApiRow[],
  groupBy: PaymentReceiptGroupBy
): PaymentListApiRow[] {
  if (groupBy === "none") return [...rows].sort((a, b) => a.id - b.id);
  return [...rows].sort((a, b) => {
    const ga = receiptGroupKey(a, groupBy);
    const gb = receiptGroupKey(b, groupBy);
    const c = ga.localeCompare(gb, "ru");
    if (c !== 0) return c;
    return a.id - b.id;
  });
}

export function chunkReceiptRowsByGroup(
  rows: PaymentListApiRow[],
  groupBy: PaymentReceiptGroupBy
): { key: string; items: PaymentListApiRow[] }[] {
  const sorted = sortPaymentsForReceiptPrint(rows, groupBy);
  if (groupBy === "none") return [{ key: "", items: sorted }];
  const out: { key: string; items: PaymentListApiRow[] }[] = [];
  for (const r of sorted) {
    const k = receiptGroupKey(r, groupBy);
    const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(r);
    else out.push({ key: k, items: [r] });
  }
  return out;
}
