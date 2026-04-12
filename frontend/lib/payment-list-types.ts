/** GET `/api/:slug/payments` qatorlari (backend `PaymentListRow`) */
export type PaymentListApiRow = {
  id: number;
  client_id: number;
  client_name: string;
  client_legal_name: string | null;
  client_code: string | null;
  client_balance: string;
  order_id: number | null;
  order_number: string | null;
  cash_desk_id?: number | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  trade_direction: string | null;
  consignment: boolean;
  expeditor_user_id: number | null;
  expeditor_name: string | null;
  cash_desk_name: string | null;
  payment_kind: string;
  /** payment | client_expense */
  entry_kind?: string;
  workflow_status: string;
  paid_at: string | null;
  received_at: string | null;
  confirmed_at: string | null;
  /** Mijoz hududi (chek / guruhlash); eski javoblarda bo‘lmasligi mumkin */
  client_region?: string | null;
  client_city?: string | null;
  client_district?: string | null;
  /** Yumshoq bekor (arxiv) */
  deleted_at?: string | null;
  deleted_by_user_id?: number | null;
  deleted_by_name?: string | null;
  delete_reason_ref?: string | null;
};

export type PaymentListApiResponse = {
  data: PaymentListApiRow[];
  total: number;
  page: number;
  limit: number;
};
