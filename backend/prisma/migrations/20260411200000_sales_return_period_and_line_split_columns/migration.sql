-- Period return (polki) fields on sales_returns and paid/bonus split on lines.
-- Prisma schema expects these; initial 20260404143000 created narrower tables.

ALTER TABLE "sales_returns" ADD COLUMN IF NOT EXISTS "date_from" TIMESTAMP(3);
ALTER TABLE "sales_returns" ADD COLUMN IF NOT EXISTS "date_to" TIMESTAMP(3);
ALTER TABLE "sales_returns" ADD COLUMN IF NOT EXISTS "return_type" VARCHAR(20) NOT NULL DEFAULT 'partial';

ALTER TABLE "sales_return_lines" ADD COLUMN IF NOT EXISTS "bonus_qty" DECIMAL(15,3);
ALTER TABLE "sales_return_lines" ADD COLUMN IF NOT EXISTS "paid_qty" DECIMAL(15,3);
