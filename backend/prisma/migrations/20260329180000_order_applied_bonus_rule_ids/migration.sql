-- Avtomatik bonus qoidalari ID lari (once_per_client uchun tarix)

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "applied_auto_bonus_rule_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
