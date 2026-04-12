-- Tanlangan to'lov usuli (savdo zakazi yaratishda majburiy bo'ladi)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method_ref" VARCHAR(64);
