-- Konsignatsiya: agent limiti va konsignatsiya zakazlari
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "consignment_limit_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "consignment_ignore_previous_months_debt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consignment_updated_at" TIMESTAMP(3);

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "is_consignment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consignment_due_date" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "orders_tenant_agent_consignment_idx"
  ON "orders" ("tenant_id", "agent_id", "is_consignment");
