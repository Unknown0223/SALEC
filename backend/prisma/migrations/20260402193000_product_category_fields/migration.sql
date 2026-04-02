-- Product category: spravochnik maydonlari (sozlamalar UI)
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "code" VARCHAR(24);
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER;
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "default_unit" VARCHAR(64);
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "comment" TEXT;

CREATE INDEX IF NOT EXISTS "product_categories_tenant_id_parent_id_idx" ON "product_categories"("tenant_id", "parent_id");
