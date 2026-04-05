/**
 * Hujjat tiplari — backend `order-type.ts` bilan mos.
 * Ko'rsatma: rus tili (operatorlar uchun yagona terminologiya).
 */
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

export const ORDER_TYPE_VALUES = [...ORDER_TYPES] as const;

/** Filtr / select uchun */
export const ORDER_TYPE_FILTER_OPTIONS: { value: OrderType; label: string }[] = [
  { value: "order", label: "Заказ" },
  { value: "return", label: "Возврат с полки" },
  { value: "exchange", label: "Обмен" },
  { value: "partial_return", label: "Заказ с частичным возвратом" },
  { value: "return_by_order", label: "Возврат с полки по заказу" }
];

/** order_type uchun rang (badge) */
export const ORDER_TYPE_COLOR: Record<OrderType, string> = {
  order: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  return: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  exchange: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  partial_return: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  return_by_order: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
};

export function orderTypeLabel(type: string | undefined): string {
  if (!type || !(type in ORDER_TYPE_LABELS)) return "Заказ";
  return ORDER_TYPE_LABELS[type as OrderType];
}

export function orderTypeColor(type: string | undefined): string {
  if (!type || !(type in ORDER_TYPE_COLOR)) return ORDER_TYPE_COLOR.order;
  return ORDER_TYPE_COLOR[type as OrderType];
}
