-- Расходы клиента: тип строки + экспедитор без заказа
ALTER TABLE "client_payments" ADD COLUMN IF NOT EXISTS "entry_kind" VARCHAR(24) NOT NULL DEFAULT 'payment';
ALTER TABLE "client_payments" ADD COLUMN IF NOT EXISTS "expeditor_user_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_payments_expeditor_user_id_fkey'
  ) THEN
    ALTER TABLE "client_payments"
      ADD CONSTRAINT "client_payments_expeditor_user_id_fkey"
      FOREIGN KEY ("expeditor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_payments_tenant_id_entry_kind_idx" ON "client_payments"("tenant_id", "entry_kind");
CREATE INDEX IF NOT EXISTS "client_payments_expeditor_user_id_idx" ON "client_payments"("expeditor_user_id");
