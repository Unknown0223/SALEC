-- Начальные балансы клиентов (отдельные записи + движение client_balance_movements)
CREATE TABLE "client_opening_balance_entries" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "balance_type" VARCHAR(24) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_type" VARCHAR(64) NOT NULL,
    "cash_desk_id" INTEGER,
    "trade_direction" VARCHAR(128),
    "note" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" INTEGER,

    CONSTRAINT "client_opening_balance_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_opening_balance_entries_tenant_id_created_at_idx" ON "client_opening_balance_entries"("tenant_id", "created_at" DESC);
CREATE INDEX "client_opening_balance_entries_tenant_id_client_id_idx" ON "client_opening_balance_entries"("tenant_id", "client_id");

ALTER TABLE "client_opening_balance_entries" ADD CONSTRAINT "client_opening_balance_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_opening_balance_entries" ADD CONSTRAINT "client_opening_balance_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_opening_balance_entries" ADD CONSTRAINT "client_opening_balance_entries_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_opening_balance_entries" ADD CONSTRAINT "client_opening_balance_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
