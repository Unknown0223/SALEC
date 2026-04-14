-- Performance indexes for client balances and consignment reports.
-- Safe for repeated deploys.

CREATE INDEX IF NOT EXISTS orders_tenant_client_order_type_status_idx
  ON orders (tenant_id, client_id, order_type, status);

CREATE INDEX IF NOT EXISTS orders_tenant_client_created_at_desc_idx
  ON orders (tenant_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_status_logs_order_to_status_created_desc_idx
  ON order_status_logs (order_id, to_status, created_at DESC);

CREATE INDEX IF NOT EXISTS client_payments_tenant_client_deleted_entry_kind_idx
  ON client_payments (tenant_id, client_id, deleted_at, entry_kind);

CREATE INDEX IF NOT EXISTS client_payments_tenant_order_deleted_entry_kind_idx
  ON client_payments (tenant_id, order_id, deleted_at, entry_kind);

CREATE INDEX IF NOT EXISTS client_balance_movements_balance_created_desc_idx
  ON client_balance_movements (client_balance_id, created_at DESC);
