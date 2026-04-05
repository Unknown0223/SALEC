-- Omborlar ro'yxati (sklad) sahifasi uchun qo'shimcha maydonlar
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "code" VARCHAR(40);
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(200);
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "van_selling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
