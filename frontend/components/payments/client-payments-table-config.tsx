import type { PaymentListApiRow } from "@/lib/payment-list-types";
import type { ColumnDefItem } from "@/components/data-table/table-column-settings-dialog";

export const PAYMENTS_TABLE_ID = "finance.client_payments.v1";

export const PAYMENT_TABLE_COLUMNS: ColumnDefItem[] = [
  { id: "id", label: "ID" },
  { id: "created_at", label: "Дата создания" },
  { id: "paid_at", label: "Дата оплаты" },
  { id: "received_at", label: "Дата получения" },
  { id: "confirmed_at", label: "Дата подтверждения" },
  { id: "client_name", label: "Клиент (название)" },
  { id: "legal_name", label: "Клиент (юр. название)" },
  { id: "client_code", label: "Ид клиента" },
  { id: "balance", label: "Баланс" },
  { id: "kind", label: "Тип" },
  { id: "method", label: "Способ оплаты" },
  { id: "amount", label: "Сумма" },
  { id: "agent", label: "Агент" },
  { id: "trade", label: "Направление торговли" },
  { id: "consignment", label: "Консигнация" },
  { id: "agent_code", label: "Код агента" },
  { id: "expeditor", label: "Экспедитор" },
  { id: "cash_desk", label: "Касса" },
  { id: "note", label: "Комментарий" },
  { id: "order", label: "Заказ" }
];

export const DEFAULT_PAYMENT_COLUMN_ORDER = PAYMENT_TABLE_COLUMNS.map((c) => c.id);

/** Dastlab yashirin — kerak bo‘lsa sozlamalardan yoqiladi */
export const DEFAULT_HIDDEN_PAYMENT_COLUMNS = ["received_at", "confirmed_at"] as const;

export const PAYMENT_COL_TH: Record<string, string> = {
  balance: "text-right",
  amount: "text-right",
  note: "max-w-[140px]"
};

export const PAYMENT_COL_TD: Record<string, string> = {
  balance: "text-right tabular-nums text-xs",
  amount: "text-right tabular-nums text-xs font-medium",
  note: "max-w-[140px] truncate text-xs text-muted-foreground"
};
