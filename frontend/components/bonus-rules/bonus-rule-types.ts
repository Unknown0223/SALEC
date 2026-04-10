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
  conditions: BonusConditionRow[];
};
