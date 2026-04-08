import type { OrderListRow } from "@/components/orders/order-detail-view";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatNumberGrouped } from "@/lib/format-numbers";

/** Zakazlar ro‘yxati — `useUserTablePrefs` / TableColumnSettingsDialog */
export const ORDERS_LIST_TABLE_ID = "orders.list.v1";

export const ORDER_LIST_COLUMN_IDS = [
  "number",
  "order_type",
  "created_at",
  "expected_ship_date",
  "shipped_at",
  "delivered_at",
  "status",
  "client_name",
  "client_legal_name",
  "client_id",
  "qty",
  "total_sum",
  "discount_sum",
  "bonus_qty",
  "balance",
  "debt",
  "price_type",
  "warehouse_name",
  "agent_name",
  "agent_code",
  "expeditors",
  "region",
  "city",
  "zone",
  "consignment",
  "day",
  "created_by",
  "comment",
  "created_by_role"
] as const;

const LABELS: Record<(typeof ORDER_LIST_COLUMN_IDS)[number], string> = {
  number: "№",
  order_type: "Тип",
  created_at: "Дата заказа",
  expected_ship_date: "Ожидаемая дата отгрузки",
  shipped_at: "Дата отгрузки",
  delivered_at: "Дата доставки",
  status: "Holat",
  client_name: "Клиент",
  client_legal_name: "Юр. наз. клиента",
  client_id: "Ид клиента",
  qty: "Кол-во",
  total_sum: "Сумма",
  discount_sum: "Скидка",
  bonus_qty: "Бонус (шт)",
  balance: "Баланс",
  debt: "Долг",
  price_type: "Тип цены",
  warehouse_name: "Склад",
  agent_name: "Агент",
  agent_code: "Код агента",
  expeditors: "Экспедиторы",
  region: "Область",
  city: "Город",
  zone: "Зона",
  consignment: "Консигнация",
  day: "День",
  created_by: "Кто создал",
  comment: "Комментарий",
  created_by_role: "Роль(кто создал)"
};

export const ORDER_LIST_COLUMNS = ORDER_LIST_COLUMN_IDS.map((id) => ({
  id,
  label: LABELS[id]
}));

export function orderListExportCell(o: OrderListRow, colId: string): string {
  switch (colId) {
    case "number":
      return o.number;
    case "order_type":
      return o.order_type ?? "";
    case "created_at":
      return new Date(o.created_at).toLocaleString();
    case "expected_ship_date":
      return o.expected_ship_date ? new Date(o.expected_ship_date).toLocaleDateString() : "";
    case "shipped_at":
      return o.shipped_at ? new Date(o.shipped_at).toLocaleDateString() : "";
    case "delivered_at":
      return o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : "";
    case "status":
      return ORDER_STATUS_LABELS[o.status] ?? o.status;
    case "client_name":
      return o.client_name;
    case "client_legal_name":
      return o.client_legal_name ?? "";
    case "client_id":
      return String(o.client_id);
    case "qty":
      return formatNumberGrouped(o.qty, { maxFractionDigits: 3 });
    case "total_sum":
      return formatNumberGrouped(o.total_sum, { maxFractionDigits: 2 });
    case "discount_sum":
      return formatNumberGrouped(o.discount_sum ?? "0", { maxFractionDigits: 2 });
    case "bonus_qty":
      return formatNumberGrouped(o.bonus_qty ?? "0", { maxFractionDigits: 3 });
    case "balance":
      return o.balance == null ? "" : formatNumberGrouped(o.balance, { maxFractionDigits: 2 });
    case "debt":
      return o.debt == null ? "" : formatNumberGrouped(o.debt, { maxFractionDigits: 2 });
    case "price_type":
      return o.price_type ?? "";
    case "warehouse_name":
      return o.warehouse_name ?? "";
    case "agent_name":
      return o.agent_name ?? "";
    case "agent_code":
      return o.agent_code ?? "";
    case "expeditors":
      return o.expeditor_display ?? o.expeditors ?? "";
    case "region":
      return o.region ?? "";
    case "city":
      return o.city ?? "";
    case "zone":
      return o.zone ?? "";
    case "consignment":
      return o.consignment == null ? "" : o.consignment ? "Ha" : "Yo‘q";
    case "day":
      return o.day ?? "";
    case "created_by":
      return o.created_by ?? "";
    case "comment":
      return o.comment ?? "";
    case "created_by_role":
      return o.created_by_role ?? "";
    default:
      return "";
  }
}
