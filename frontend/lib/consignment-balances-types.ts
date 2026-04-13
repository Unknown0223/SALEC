export type ConsignmentPaymentTypeAmount = {
  label: string;
  amount: string;
};

export type ConsignmentBalanceRow = {
  client_id: number;
  client_code: string | null;
  client_name: string;
  agent_name: string | null;
  agent_code: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  trade_direction: string | null;
  inn: string | null;
  phone: string | null;
  due_date: string | null;
  overdue_days: number | null;
  total_debt: string;
  total_paid: string;
  balance: string;
  payment_amounts: ConsignmentPaymentTypeAmount[];
};

export type ConsignmentBalanceListResponse = {
  data: ConsignmentBalanceRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total_debt: string;
    cash_debt: string;
    payment_by_type: ConsignmentPaymentTypeAmount[];
  };
};
