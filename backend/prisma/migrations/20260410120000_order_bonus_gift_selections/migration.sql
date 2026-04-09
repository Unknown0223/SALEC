-- Qty bonus: bir nechta sovg'a mahsulotidan mijoz/operator tanlovi (rule_id -> product_id)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bonus_gift_selections" JSONB NOT NULL DEFAULT '{}';
