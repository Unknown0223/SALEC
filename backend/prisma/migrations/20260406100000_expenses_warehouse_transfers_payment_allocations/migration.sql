-- Expenses, warehouse transfers, payment_allocations.
-- Idempotent: local DB may already have `expenses` (db push / partial apply) without this migration row.

-- Expenses (Prisma model Expense — @@map("expenses"))
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "expense_type" VARCHAR(64) NOT NULL,
    "agent_id" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'UZS',
    "warehouse_id" INTEGER,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" INTEGER,
    "approved_by_user_id" INTEGER,
    "rejection_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_status_idx" ON "expenses"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "expenses_tenant_id_expense_date_idx" ON "expenses"("tenant_id", "expense_date" DESC);
CREATE INDEX IF NOT EXISTS "expenses_tenant_id_expense_type_idx" ON "expenses"("tenant_id", "expense_type");
CREATE INDEX IF NOT EXISTS "expenses_tenant_id_agent_id_idx" ON "expenses"("tenant_id", "agent_id");
CREATE INDEX IF NOT EXISTS "expenses_tenant_id_warehouse_id_idx" ON "expenses"("tenant_id", "warehouse_id");

DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Warehouse transfers
CREATE TABLE IF NOT EXISTS "warehouse_transfers" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "number" VARCHAR(128) NOT NULL,
    "source_warehouse_id" INTEGER NOT NULL,
    "destination_warehouse_id" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "comment" TEXT,
    "planned_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" INTEGER,
    "received_by_user_id" INTEGER,

    CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "warehouse_transfers_tenant_id_created_at_idx" ON "warehouse_transfers"("tenant_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "warehouse_transfer_lines" (
    "id" SERIAL NOT NULL,
    "transfer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(15,4) NOT NULL,
    "received_qty" DECIMAL(15,4),
    "batch_no" VARCHAR(256),
    "comment" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "warehouse_transfer_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "warehouse_transfer_lines_transfer_id_idx" ON "warehouse_transfer_lines"("transfer_id");

DO $$ BEGIN
  ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "warehouse_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment allocations
CREATE TABLE IF NOT EXISTS "payment_allocations" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_id_payment_id_idx" ON "payment_allocations"("tenant_id", "payment_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_id_order_id_idx" ON "payment_allocations"("tenant_id", "order_id");

DO $$ BEGIN
  ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
