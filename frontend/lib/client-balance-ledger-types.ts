export type ClientBalancePaymentTypeSummary = {
  label: string;
  amount: string;
};

export type ClientLedgerRow = {
  row_kind: "order" | "payment";
  sort_at: string;
  order_id: number | null;
  payment_id: number | null;
  order_number: string | null;
  type_label: string;
  debt_amount: string | null;
  payment_amount: string | null;
  payment_type: string | null;
  agent_name: string | null;
  expeditor_name: string | null;
  is_consignment: boolean | null;
  cash_desk_name: string | null;
  note: string | null;
  created_by_login: string | null;
  entry_kind: string | null;
  type_code: 1 | 2;
  operation_type_code: string;
  order_kind_label: string | null;
  comment_primary: string | null;
  comment_transaction: string | null;
  created_by_display: string | null;
  balance_after: string | null;
};

export type AgentBalanceCard = {
  agent_id: number | null;
  agent_name: string;
  agent_code: string | null;
  remaining_on_orders: string;
  payment_by_type: ClientBalancePaymentTypeSummary[];
  /** Как колонки «Долг» / «Оплата» во вкладке «Общее» (с теми же фильтрами запроса). */
  ledger_general_debt_total: string;
  ledger_general_payment_total: string;
};

export type ClientBalanceLedgerResponse = {
  client: {
    id: number;
    name: string;
    phone: string | null;
    client_code: string | null;
    territory_label: string | null;
    agent_id: number | null;
  };
  /** Сальдо в БД (без сумм заказов). */
  account_balance: string;
  /** Оплата − долг по строкам ведомости с текущими фильтрами. */
  ledger_net_balance: string;
  summary_payment_by_type: ClientBalancePaymentTypeSummary[];
  agent_cards: AgentBalanceCard[];
  rows: ClientLedgerRow[];
  total: number;
  page: number;
  limit: number;
};

export type DebtorCreditorMonthCell = {
  debit: string;
  credit: string;
  saldo: string;
};

export type DebtorCreditorMonthRow = {
  month_key: string;
  month_label: string;
  this_month: DebtorCreditorMonthCell;
  cumulative: DebtorCreditorMonthCell;
};

export type ClientDebtorCreditorMonthlyResponse = {
  rows: DebtorCreditorMonthRow[];
};
