/** GET `/api/:slug/reports/order-debts` javobi */
export type OrderDebtRow = {
  order_id: number;
  order_number: string;
  /** `orders.status` */
  order_status: string;
  client_id: number;
  client_name: string;
  /** API hozircha `UZS` qaytaradi */
  currency: string;
  address: string | null;
  landmark: string | null;
  phone: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  expeditor_user_id: number | null;
  expeditor_name: string | null;
  expeditor_code: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  total_sum: string;
  /** Zakazga taqsimlangan to‘lovlar (`payment_allocations`) */
  allocated_sum: string;
  payment_method_label: string | null;
  shipped_at: string | null;
  consignment_due_date: string | null;
  remainder: string;
  /** Mijoz bo‘yicha kassadan taqsimlanmagan pul (client_id bo‘yicha) */
  unallocated: string;
  /** `client_balances.balance` */
  client_balance: string;
};

export type OrderDebtsListResponse = {
  data: OrderDebtRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total_remainder: string; currency: string };
};
