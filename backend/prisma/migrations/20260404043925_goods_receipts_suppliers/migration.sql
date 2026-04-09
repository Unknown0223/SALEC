-- DropIndex (prod / qisman DB larda indeks nomi boshqacha bo‘lishi mumkin)
DROP INDEX IF EXISTS "cash_desks_tenant_id_code_key";

-- DropIndex
DROP INDEX IF EXISTS "clients_tenant_id_created_at_idx";

-- DropIndex
DROP INDEX IF EXISTS "users_tenant_supervisor_user_id_idx";

-- kpi_groups / sales_channel_refs / trade_directions ALTER lar keyinroq yaratiladi (20260429100000);
-- updated_at DROP DEFAULT — 20260430160000_drop_default_updated_at_sales_catalog

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(64),
    "phone" VARCHAR(64),
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "status" VARCHAR(16) NOT NULL DEFAULT 'posted',
    "receipt_at" TIMESTAMP(3),
    "comment" TEXT,
    "price_type" VARCHAR(128) NOT NULL,
    "external_ref" VARCHAR(128),
    "total_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "total_sum" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_volume_m3" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "line_total" DECIMAL(15,2) NOT NULL,
    "defect_qty" DECIMAL(15,3),
    "volume_m3" DECIMAL(14,6),
    "weight_kg" DECIMAL(12,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_is_active_idx" ON "suppliers"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_warehouse_id_idx" ON "goods_receipts"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_supplier_id_idx" ON "goods_receipts"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_status_idx" ON "goods_receipts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_created_at_idx" ON "goods_receipts"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_number_key" ON "goods_receipts"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_product_id_idx" ON "goods_receipt_lines"("product_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
