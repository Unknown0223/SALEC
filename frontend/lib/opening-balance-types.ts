export type OpeningBalanceListRow = {
  id: number;
  created_at: string;
  client_id: number;
  client_name: string;
  agent_id: number | null;
  agent_name: string | null;
  trade_direction: string | null;
  cash_desk_name: string | null;
  balance_type: string;
  balance_type_label: string;
  payment_type: string;
  amount: string;
  note: string | null;
  paid_at: string | null;
  deleted_at?: string | null;
  deleted_by_user_id?: number | null;
  deleted_by_name?: string | null;
  delete_reason_ref?: string | null;
};

export type OpeningBalanceListResponse = {
  data: OpeningBalanceListRow[];
  total: number;
  page: number;
  limit: number;
};
