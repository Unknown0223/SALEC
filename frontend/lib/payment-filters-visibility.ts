/** Qaysi filtr maydonlari ko‘rinadi — brauzerda saqlanadi */

export type PaymentFilterVisibility = {
  status: boolean;
  cash_desk: boolean;
  agent: boolean;
  expeditor: boolean;
  payment_type: boolean;
  trade_direction: boolean;
  territory1: boolean;
  territory2: boolean;
  territory3: boolean;
  territory4: boolean;
  territory5: boolean;
  amount: boolean;
  deal_type: boolean;
  date_range: boolean;
};

export const DEFAULT_PAYMENT_FILTER_VISIBILITY: PaymentFilterVisibility = {
  status: true,
  cash_desk: true,
  agent: true,
  expeditor: true,
  payment_type: true,
  trade_direction: true,
  territory1: true,
  territory2: true,
  territory3: true,
  /** Faqat tenantda 4–5 daraja bo‘lsa panelda ma’noga ega */
  territory4: false,
  territory5: false,
  amount: true,
  deal_type: true,
  date_range: true
};

const LS_KEY = "salesdoc.payment-filters-visibility-v1";

function normalize(raw: unknown): PaymentFilterVisibility {
  const d = DEFAULT_PAYMENT_FILTER_VISIBILITY;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const b = (k: keyof PaymentFilterVisibility) => (typeof o[k] === "boolean" ? o[k] : d[k]);
  return {
    status: b("status"),
    cash_desk: b("cash_desk"),
    agent: b("agent"),
    expeditor: b("expeditor"),
    payment_type: b("payment_type"),
    trade_direction: b("trade_direction"),
    territory1: b("territory1"),
    territory2: b("territory2"),
    territory3: b("territory3"),
    territory4: b("territory4"),
    territory5: b("territory5"),
    amount: b("amount"),
    deal_type: b("deal_type"),
    date_range: b("date_range")
  };
}

export function loadPaymentFilterVisibility(): PaymentFilterVisibility {
  if (typeof window === "undefined") return DEFAULT_PAYMENT_FILTER_VISIBILITY;
  try {
    const s = window.localStorage.getItem(LS_KEY);
    if (!s) return DEFAULT_PAYMENT_FILTER_VISIBILITY;
    return normalize(JSON.parse(s) as unknown);
  } catch {
    return DEFAULT_PAYMENT_FILTER_VISIBILITY;
  }
}

export function savePaymentFilterVisibility(v: PaymentFilterVisibility): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Profilda kamroq hudud darajasi bo‘lsa, ortiqcha territoryN kalitlarini o‘chiradi */
export function clampPaymentFilterVisibilityToTerritoryLevels(
  v: PaymentFilterVisibility,
  territoryLevelCount: number
): PaymentFilterVisibility {
  const n = Math.max(0, Math.min(5, Math.floor(territoryLevelCount)));
  const next = { ...v };
  for (let i = 1; i <= 5; i++) {
    if (i > n) {
      const k = `territory${i}` as keyof PaymentFilterVisibility;
      next[k] = false;
    }
  }
  return next;
}

/** Hudud qatorlari alohida — `territoryFilterSpecs` bo‘yicha dialogda qo‘shiladi */
export const PAYMENT_FILTER_VISIBILITY_META_CORE: {
  key: keyof PaymentFilterVisibility;
  label: string;
}[] = [
  { key: "status", label: "Статус" },
  { key: "cash_desk", label: "Касса" },
  { key: "agent", label: "Агент" },
  { key: "expeditor", label: "Экспедитор" },
  { key: "payment_type", label: "Способ оплаты" },
  { key: "trade_direction", label: "Направление торговли" },
  { key: "amount", label: "Сумма (от — до)" },
  { key: "deal_type", label: "Тип сделки" },
  { key: "date_range", label: "Диапазон дат" }
];

export function buildPaymentFilterVisibilityMeta(
  territoryRows: { key: keyof PaymentFilterVisibility; label: string }[]
): { key: keyof PaymentFilterVisibility; label: string }[] {
  return [
    ...PAYMENT_FILTER_VISIBILITY_META_CORE.slice(0, 6),
    ...territoryRows,
    ...PAYMENT_FILTER_VISIBILITY_META_CORE.slice(6)
  ];
}

/** @deprecated faqat qidiruv / eski importlar uchun */
export const PAYMENT_FILTER_VISIBILITY_META: {
  key: keyof PaymentFilterVisibility;
  label: string;
}[] = [
  ...PAYMENT_FILTER_VISIBILITY_META_CORE.slice(0, 6),
  { key: "territory1", label: "Территория — уровень 1" },
  { key: "territory2", label: "Территория — уровень 2" },
  { key: "territory3", label: "Территория — уровень 3" },
  { key: "territory4", label: "Территория — уровень 4" },
  { key: "territory5", label: "Территория — уровень 5" },
  ...PAYMENT_FILTER_VISIBILITY_META_CORE.slice(6)
];
