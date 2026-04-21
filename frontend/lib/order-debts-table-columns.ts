/** «Долги по заказам» — `useUserTablePrefs` / TableColumnSettingsDialog */
export const ORDER_DEBTS_TABLE_ID = "reports.order-debts.v1";

export const ORDER_DEBTS_COLUMN_IDS = [
  "order_request",
  "client",
  "currency",
  "address",
  "landmark",
  "phone",
  "agent",
  "expeditor",
  "warehouse",
  "total_sum",
  "payment_method",
  "shipped_at",
  "consignment_due",
  "allocated",
  "remainder",
  "unallocated",
  "balance"
] as const;

export type OrderDebtsColumnId = (typeof ORDER_DEBTS_COLUMN_IDS)[number];

const LABELS: Record<OrderDebtsColumnId, string> = {
  order_request: "Заявка",
  client: "Клиент",
  currency: "Валюта",
  address: "Адрес",
  landmark: "Ориентир",
  phone: "Телефон",
  agent: "Агент",
  expeditor: "Экспедитор",
  warehouse: "Склад",
  total_sum: "Сумма",
  payment_method: "Способ",
  shipped_at: "Дата отгрузки",
  consignment_due: "Срок конс.",
  allocated: "Оплачено",
  remainder: "Остаток",
  unallocated: "Нераспр.",
  balance: "Баланс"
};

/** Backend `sort_by` (GET reports/order-debts) — `unallocated` serverda yo‘q */
export const ORDER_DEBTS_SORT_BY: Partial<Record<OrderDebtsColumnId, string>> = {
  order_request: "order_number",
  client: "client_name",
  currency: "currency",
  address: "address",
  landmark: "landmark",
  phone: "phone",
  agent: "agent_name",
  expeditor: "expeditor_name",
  warehouse: "warehouse_name",
  total_sum: "total_sum",
  payment_method: "payment_method_ref",
  shipped_at: "shipped_at",
  consignment_due: "consignment_due_date",
  allocated: "allocated_sum",
  remainder: "remainder",
  balance: "client_balance"
};

export const ORDER_DEBTS_COLUMNS = ORDER_DEBTS_COLUMN_IDS.map((id) => ({
  id,
  label: LABELS[id]
}));
