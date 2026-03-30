/** Zakaz holatlari (ARCHITECTURE: WebSocket order:* hodisalari bilan mos). */
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

/** Oldinga ruxsat etilgan o‘tishlar. */
const forwardTransitions: Record<string, Set<string>> = {
  new: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["picking", "cancelled"]),
  picking: new Set(["delivering", "cancelled"]),
  delivering: new Set(["delivered", "cancelled"]),
  delivered: new Set(["returned"]),
  returned: new Set(),
  /** Qayta ishlash: faqat **admin** `PATCH` orqali (`orders.service`). */
  cancelled: new Set(["new"])
};

/**
 * Orqaga faqat **bir bosqich** — zanjirdan tashqari sakrashlar yo‘q.
 * Masalan: `delivered` → `new` yoki `delivered` → `confirmed` taqiqlanadi;
 * `delivered` → `delivering` ruxsat (yetkazish belgisini bekor qilish).
 */
const reverseTransitions: Record<string, Set<string>> = {
  confirmed: new Set(["new"]),
  picking: new Set(["confirmed"]),
  delivering: new Set(["picking"]),
  delivered: new Set(["delivering"])
};

export function isValidOrderStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

export function canTransitionOrderStatus(from: string, to: string): boolean {
  if (from === to) return false;
  if (!isValidOrderStatus(to)) return false;
  const fwd = forwardTransitions[from];
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
  options?: { omitBackward?: boolean }
): string[] {
  const fwd = forwardTransitions[from] ? [...forwardTransitions[from]] : [];
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

/** Kredit yuki: bu holatlardagi zakazlar `total_sum` yig‘indisiga kirmaydi. */
export const ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE = ["cancelled", "returned"] as const;
