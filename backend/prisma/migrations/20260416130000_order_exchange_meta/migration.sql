-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "exchange_meta" JSONB;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "exchange_line_kind" VARCHAR(16);
