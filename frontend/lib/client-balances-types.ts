export type ClientBalanceViewMode = "clients" | "agents" | "clients_delivery";

export type ClientBalancePaymentTypeSummary = {
  label: string;
  amount: string;
};

export type ClientBalanceRow = {
  client_id: number;
  client_code: string | null;
  name: string;
  legal_name: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  agent_tags: string[];
  supervisor_name: string | null;
  trade_direction: string | null;
  inn: string | null;
  phone: string | null;
  license_until: string | null;
  days_overdue: number | null;
  last_order_at: string | null;
  last_payment_at: string | null;
  days_since_payment: number | null;
  balance: string;
  /** Те же способы оплаты и порядок, что в summary.payment_by_type */
  payment_amounts: ClientBalancePaymentTypeSummary[];
};

export type AgentBalanceRow = {
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  clients_count: number;
  balance: string;
  payment_amounts: ClientBalancePaymentTypeSummary[];
};

export type ClientBalanceListResponse = {
  view: ClientBalanceViewMode;
  data: ClientBalanceRow[] | AgentBalanceRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    balance: string;
    payment_by_type: ClientBalancePaymentTypeSummary[];
  };
};

export type ClientBalanceTerritoryOptions = {
  regions: string[];
  cities: string[];
  districts: string[];
  branches: string[];
};
