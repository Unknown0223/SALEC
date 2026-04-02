-- Product catalog spravochniklar + mahsulot qo‘shimcha maydonlari

CREATE TABLE "product_catalog_groups" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(24),
    "sort_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_catalog_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_brands" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(24),
    "sort_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_manufacturers" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(24),
    "sort_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_manufacturers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_segments" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(24),
    "sort_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interchangeable_product_groups" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(24),
    "sort_order" INTEGER,
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interchangeable_product_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interchangeable_group_products" (
    "group_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,

    CONSTRAINT "interchangeable_group_products_pkey" PRIMARY KEY ("group_id","product_id")
);

CREATE TABLE "interchangeable_group_price_types" (
    "group_id" INTEGER NOT NULL,
    "price_type" VARCHAR(128) NOT NULL,

    CONSTRAINT "interchangeable_group_price_types_pkey" PRIMARY KEY ("group_id","price_type")
);

CREATE INDEX "product_catalog_groups_tenant_id_idx" ON "product_catalog_groups"("tenant_id");
CREATE INDEX "product_brands_tenant_id_idx" ON "product_brands"("tenant_id");
CREATE INDEX "product_manufacturers_tenant_id_idx" ON "product_manufacturers"("tenant_id");
CREATE INDEX "product_segments_tenant_id_idx" ON "product_segments"("tenant_id");
CREATE INDEX "interchangeable_product_groups_tenant_id_idx" ON "interchangeable_product_groups"("tenant_id");
CREATE INDEX "interchangeable_group_products_product_id_idx" ON "interchangeable_group_products"("product_id");

ALTER TABLE "product_catalog_groups" ADD CONSTRAINT "product_catalog_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_brands" ADD CONSTRAINT "product_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_manufacturers" ADD CONSTRAINT "product_manufacturers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_segments" ADD CONSTRAINT "product_segments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interchangeable_product_groups" ADD CONSTRAINT "interchangeable_product_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interchangeable_group_products" ADD CONSTRAINT "interchangeable_group_products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "interchangeable_product_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interchangeable_group_products" ADD CONSTRAINT "interchangeable_group_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interchangeable_group_price_types" ADD CONSTRAINT "interchangeable_group_price_types_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "interchangeable_product_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_group_id" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_id" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "manufacturer_id" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "segment_id" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_kg" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "volume_m3" DECIMAL(14,6);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "qty_per_block" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "dimension_unit" VARCHAR(8);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_cm" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_cm" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_cm" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ikpu_code" VARCHAR(64);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hs_code" VARCHAR(32);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sell_code" VARCHAR(64);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_blocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products" ADD CONSTRAINT "products_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "product_catalog_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "product_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "product_manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "product_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "products_tenant_id_product_group_id_idx" ON "products"("tenant_id", "product_group_id");
CREATE INDEX IF NOT EXISTS "products_tenant_id_brand_id_idx" ON "products"("tenant_id", "brand_id");
CREATE INDEX IF NOT EXISTS "products_tenant_id_segment_id_idx" ON "products"("tenant_id", "segment_id");
