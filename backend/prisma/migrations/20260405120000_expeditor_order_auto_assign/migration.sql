-- Dastavchik avtobog'lash qoidalari va zakazga bog'lanish
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expeditor_assignment_rules" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expeditor_user_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_expeditor_user_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_expeditor_user_id_fkey"
      FOREIGN KEY ("expeditor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "orders_tenant_id_expeditor_user_id_idx" ON "orders" ("tenant_id", "expeditor_user_id");
