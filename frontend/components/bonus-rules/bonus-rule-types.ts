export type BonusConditionRow = {
  id: number;
  min_qty: number | null;
  max_qty: number | null;
  step_qty: number;
  bonus_qty: number;
  max_bonus_qty: number | null;
  sort_order: number;
};

export type BonusRuleRow = {
  id: number;
  name: string;
  type: string;
  buy_qty: number | null;
  free_qty: number | null;
  min_sum: number | null;
  /** `sum` va `qty`: `order` | `calendar_month` */
  sum_threshold_scope?: string;
  discount_pct: number | null;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  client_category: string | null;
  payment_type: string | null;
  client_type: string | null;
  sales_channel: string | null;
  price_type: string | null;
  product_ids: number[];
  bonus_product_ids: number[];
  product_category_ids: number[];
  target_all_clients: boolean;
  selected_client_ids: number[];
  is_manual: boolean;
  in_blocks: boolean;
  once_per_client: boolean;
  one_plus_one_gift: boolean;
  /** Oldindan bajarilishi kerak bo‘lgan qoidalar (API eski bo‘lsa bo‘sh). */
  prerequisite_rule_ids?: number[];
  /** Bo‘sh = barcha filiallar (cheklov yo‘q). */
  scope_branch_codes?: string[];
  /** Bo‘sh = barcha agentlar (cheklov yo‘q). Filial bilan birga — OR. */
  scope_agent_user_ids?: number[];
  /** Bo‘sh = barcha yo‘nalishlar (cheklov yo‘q). */
  scope_trade_direction_ids?: number[];
  /** Ro‘yxat API: har bir bog‘langan qoida uchun qisqa shart matni (nomisiz). */
  prerequisite_summaries?: string[];
  conditions: BonusConditionRow[];
};
