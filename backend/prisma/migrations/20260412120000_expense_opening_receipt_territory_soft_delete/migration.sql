-- Yumshoq arxiv: xarajatlar, boshlang‘ich balans, kirim (draft), hudud
ALTER TABLE "expenses" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" INTEGER,
ADD COLUMN "delete_reason_ref" VARCHAR(128);

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "expenses_tenant_id_deleted_at_idx" ON "expenses"("tenant_id", "deleted_at");

ALTER TABLE "client_opening_balance_entries" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" INTEGER,
ADD COLUMN "delete_reason_ref" VARCHAR(128);

ALTER TABLE "client_opening_balance_entries" ADD CONSTRAINT "client_opening_balance_entries_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "client_opening_balance_entries_tenant_deleted_at_idx" ON "client_opening_balance_entries"("tenant_id", "deleted_at");

ALTER TABLE "goods_receipts" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" INTEGER,
ADD COLUMN "delete_reason_ref" VARCHAR(128);

ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "goods_receipts_tenant_id_deleted_at_idx" ON "goods_receipts"("tenant_id", "deleted_at");

-- Hududlar moduli bo‘lmagan (eski) bazalar: jadval yo‘q bo‘lsa o‘tkazib yuboriladi.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'territories'
  ) THEN
    ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
    ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" INTEGER;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'territories_deleted_by_user_id_fkey'
    ) THEN
      ALTER TABLE "territories" ADD CONSTRAINT "territories_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    CREATE INDEX IF NOT EXISTS "territories_tenant_id_deleted_at_idx" ON "territories"("tenant_id", "deleted_at");
  END IF;
END $$;
