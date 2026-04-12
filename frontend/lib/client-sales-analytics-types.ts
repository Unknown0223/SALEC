export type ClientSalesAnalyticsResponse = {
  kpi: {
    delivered_count: number;
    delivered_sales_sum: string;
  };
  products: Array<{
    product_id: number;
    name: string;
    sku: string | null;
    qty: string;
    share_percent: number;
  }>;
  total_qty: string;
  daily: Array<{ day: string; total_sum: string; order_count: number }>;
  daily_truncated: boolean;
};
