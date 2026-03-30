/**
 * Backend `order-status.ts` kodlari bilan mos.
 * Ko‘rsatma: rus tili (operatorlar uchun yagona terminologiya).
 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  picking: "Комплектация",
  delivering: "Отгружен",
  delivered: "Доставлен",
  returned: "Возврат",
  cancelled: "Отменён"
};

export const ORDER_STATUS_VALUES = [
  "new",
  "confirmed",
  "picking",
  "delivering",
  "delivered",
  "returned",
  "cancelled"
] as const;

/** Filtr / select uchun (qiymat = API dagi `status` kodlari). */
export const ORDER_STATUS_FILTER_OPTIONS: { value: string; label: string }[] =
  ORDER_STATUS_VALUES.map((v) => ({
    value: v,
    label: ORDER_STATUS_LABELS[v] ?? v
  }));

/** Oldinga / keyinga — UI da ajratish (ixtiyoriy). */
export function orderStatusTransitionDirection(
  from: string,
  to: string
): "forward" | "backward" | "unknown" {
  if (from === "cancelled" && to === "new") return "forward";
  const chain = ["new", "confirmed", "picking", "delivering", "delivered"] as const;
  const i = chain.indexOf(from as (typeof chain)[number]);
  const j = chain.indexOf(to as (typeof chain)[number]);
  if (i < 0 || j < 0) return "unknown";
  if (j > i) return "forward";
  if (j < i) return "backward";
  return "unknown";
}
