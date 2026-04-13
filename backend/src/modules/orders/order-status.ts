/**
 * Zakaz holatlari va hujjat tiplari bo‘yicha status zanjirlari.
 */

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "picking",
  "delivering",
  "delivered",
  "returned",
  "cancelled"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ─── Hujjat tiplari ────────────────────────────────────────────────────────

export const ORDER_TYPES = [
  "order",
  "return",
  "exchange",
  "partial_return",
  "return_by_order"
] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  order: "Заказ",
  return: "Возврат с полки",
  exchange: "Обмен",
  partial_return: "Заказ с частичным возвратом",
  return_by_order: "Возврат с полки по заказу"
};

// ─── Status chains per order type ───────────────────────────────────────────
// Har bir type uchun o'z status zanjiri (oldinga)
const forwardTransitionsByType: Record<OrderType, Record<string, Set<string>>> = {
  order: {
    new: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["picking", "cancelled"]),
    picking: new Set(["delivering", "cancelled"]),
    delivering: new Set(["delivered", "cancelled"]),
    delivered: new Set(["returned"]),
    returned: new Set(["cancelled"]),
    cancelled: new Set(["new"])
  },
  return: {
    new: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["delivered", "returned", "cancelled"]),
    picking: new Set(["delivered", "cancelled"]),
    delivering: new Set(["delivered", "cancelled"]),
    delivered: new Set(["returned"]),
    returned: new Set(),
    cancelled: new Set(["new"])
  },
  exchange: {
    new: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["picking", "cancelled"]),
    picking: new Set(["delivering", "cancelled"]),
    delivering: new Set(["delivered", "cancelled"]),
    delivered: new Set(["returned"]),
    returned: new Set(),
    cancelled: new Set(["new"])
  },
  partial_return: {
    new: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["picking", "cancelled"]),
    picking: new Set(["delivering", "cancelled"]),
    delivering: new Set(["delivered", "cancelled"]),
    delivered: new Set(["returned"]),
    returned: new Set(),
    cancelled: new Set(["new"])
  },
  return_by_order: {
    new: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["delivered", "returned", "cancelled"]),
    picking: new Set(["delivered", "cancelled"]),
    delivering: new Set(["delivered", "cancelled"]),
    delivered: new Set(["returned"]),
    returned: new Set(),
    cancelled: new Set(["new"])
  }
};

// ─── Backward transitions (bir qadam) ──────────────────────────────────────

const reverseTransitions: Record<string, Set<string>> = {
  confirmed: new Set(["new"]),
  picking: new Set(["confirmed"]),
  delivering: new Set(["picking"]),
  delivered: new Set(["delivering"])
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function forwardTransitionsForType(type: OrderType): Record<string, Set<string>> {
  return forwardTransitionsByType[type] ?? forwardTransitionsByType.order;
}

export function isValidOrderStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

export function isValidOrderType(s: string): s is OrderType {
  return (ORDER_TYPES as readonly string[]).includes(s);
}

export function normalizeOrderType(s: string | undefined | null): OrderType {
  if (!s || !isValidOrderType(s)) return "order";
  return s;
}

export function canTransitionOrderStatus(from: string, to: string, orderType?: OrderType): boolean {
  const type = normalizeOrderType(orderType);
  if (from === to) return false;
  if (!isValidOrderStatus(to)) return false;
  const fwd = forwardTransitionsForType(type)[from];
  if (fwd != null && fwd.has(to)) return true;
  const rev = reverseTransitions[from];
  return rev != null && rev.has(to);
}

/** Zanjirda orqaga bir qadam (`reverseTransitions`). */
export function isBackwardTransition(from: string, to: string): boolean {
  if (!isValidOrderStatus(from) || !isValidOrderStatus(to)) return false;
  const rev = reverseTransitions[from];
  return rev != null && rev.has(to);
}

/**
 * Ombor / «Отгружен» bosqichida `cancelled` — faqat **admin** (`orders.service`).
 */
export const ORDER_STATUSES_OPERATOR_CANNOT_CANCEL_FROM = new Set(["picking", "delivering"]);

export function isOperatorLateStageCancelForbidden(from: string, to: string): boolean {
  return to === "cancelled" && ORDER_STATUSES_OPERATOR_CANNOT_CANCEL_FROM.has(from);
}

export function getAllowedNextStatuses(
  from: string,
  options?: { omitBackward?: boolean; orderType?: OrderType }
): string[] {
  const type = normalizeOrderType(options?.orderType);
  const fwd = forwardTransitionsForType(type)[from]
    ? [...forwardTransitionsForType(type)[from]]
    : [];
  const rev = reverseTransitions[from] ? [...reverseTransitions[from]] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...fwd, ...rev]) {
    if (options?.omitBackward && isBackwardTransition(from, s)) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Kredit limiti / «ochiq yuk» (ombor oldi): bekor va qaytgan zakazlar summaga kirmaydi;
 * `new` … `delivering` gacha — hali yetkazilmagan majburiyat sifatida qatnashadi.
 * (Balansdagi «yetkazilgan qarz» bilan aralashtirilmasin.)
 */
export const ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE = ["cancelled", "returned"] as const;

/**
 * Debitor qarz — **faqat savdo zakazi** (`order_type === "order"`) va **faqat** `delivered` (Доставлен):
 * mijoz tovarni olgan, qarz shundan keyin. To‘lov taqsimlari ayiriladi.
 *
 * **Nega `delivering` (Отгружен) kirmaydi:** yolda / qaytarilish ehtimoli — hali «olgan» hisoblanmaydi.
 *
 * UI / modullar (bir xil qoida):
 * - Заявки: «Долг», «Баланс» (ledger + bu qarz)
 * - Балансы клиентов, ведомость, карточка: `loadDeliveryDebtByClient` + `mergeLedgerWithUnpaidDelivered`
 * - Консигнация (клиенты): `loadConsignmentDebtByClient`
 * - Дашборд `open_orders_total`, отчёты дебиторки (receivables CTE)
 *
 * **Kirmaydi:** `cancelled`, `returned`, `new`, `confirmed`, `picking`, `delivering`.
 *
 * Boshqa hujjat turlari (`return`, `exchange`, …): alohida jarayon; bu yerda qarz hisoblanmaydi.
 */
export const ORDER_STATUSES_OUTSTANDING_RECEIVABLE = ["delivered"] as const;

const receivableSet = new Set<string>(ORDER_STATUSES_OUTSTANDING_RECEIVABLE);

/** Savdo `order` + status `delivered` — qator «Долг» va balans blend. */
export function statusContributesToDeliveredReceivableDebt(status: string, orderType?: string): boolean {
  if (!orderTypeHasTradeReceivableDebtSemantics(orderType)) return false;
  return receivableSet.has(status);
}

/** Qarz formulasi faqat `order` turidagi savdo zakazlariga qo‘llanadi. */
export function orderTypeHasTradeReceivableDebtSemantics(orderType: string | undefined | null): boolean {
  return normalizeOrderType(orderType) === "order";
}
