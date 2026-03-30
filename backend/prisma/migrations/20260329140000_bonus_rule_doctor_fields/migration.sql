-- Bonus qoidalari: Doctor Sales uslubidagi filtrlar, bayroqlar va shartlar qatorlari

ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "client_category" TEXT;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "payment_type" TEXT;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "client_type" TEXT;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "sales_channel" TEXT;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "price_type" TEXT;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "product_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "bonus_product_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "product_category_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "target_all_clients" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "selected_client_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "is_manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "in_blocks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "once_per_client" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bonus_rules" ADD COLUMN IF NOT EXISTS "one_plus_one_gift" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "bonus_rule_conditions" (
    "id" SERIAL NOT NULL,
    "bonus_rule_id" INTEGER NOT NULL,
    "min_qty" DECIMAL(15,3),
    "max_qty" DECIMAL(15,3),
    "step_qty" DECIMAL(15,3) NOT NULL,
    "bonus_qty" DECIMAL(15,3) NOT NULL,
    "max_bonus_qty" DECIMAL(15,3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bonus_rule_conditions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bonus_rule_conditions_bonus_rule_id_idx" ON "bonus_rule_conditions"("bonus_rule_id");

DO $$ BEGIN
  ALTER TABLE "bonus_rule_conditions" ADD CONSTRAINT "bonus_rule_conditions_bonus_rule_id_fkey"
    FOREIGN KEY ("bonus_rule_id") REFERENCES "bonus_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "bonus_rule_conditions" ("bonus_rule_id", "min_qty", "max_qty", "step_qty", "bonus_qty", "max_bonus_qty", "sort_order")
SELECT br."id", NULL, NULL, br."buy_qty"::decimal, br."free_qty"::decimal, NULL, 0
FROM "bonus_rules" br
WHERE br."type" = 'qty'
  AND br."buy_qty" IS NOT NULL
  AND br."free_qty" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "bonus_rule_conditions" c WHERE c."bonus_rule_id" = br."id"
  );
