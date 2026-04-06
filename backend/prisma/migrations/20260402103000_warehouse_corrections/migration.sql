-- CreateTable
CREATE TABLE "warehouse_corrections" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "created_by_user_id" INTEGER,
    "kind" VARCHAR(32) NOT NULL,
    "price_type" VARCHAR(128),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" VARCHAR(2000),
    "total_qty_delta" DECIMAL(15,3) NOT NULL,
    "total_volume_m3" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'UZS',
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_correction_lines" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty_before" DECIMAL(15,3) NOT NULL,
    "qty_delta" DECIMAL(15,3) NOT NULL,
    "price_unit" DECIMAL(15,2),
    "line_amount" DECIMAL(15,2),
    "volume_m3" DECIMAL(14,6),

    CONSTRAINT "warehouse_correction_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_corrections_tenant_id_created_at_idx" ON "warehouse_corrections"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "warehouse_corrections_tenant_id_warehouse_id_idx" ON "warehouse_corrections"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "warehouse_corrections_tenant_id_kind_idx" ON "warehouse_corrections"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "warehouse_correction_lines_document_id_idx" ON "warehouse_correction_lines"("document_id");

-- CreateIndex
CREATE INDEX "warehouse_correction_lines_product_id_idx" ON "warehouse_correction_lines"("product_id");

-- AddForeignKey
ALTER TABLE "warehouse_corrections" ADD CONSTRAINT "warehouse_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_corrections" ADD CONSTRAINT "warehouse_corrections_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_corrections" ADD CONSTRAINT "warehouse_corrections_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_correction_lines" ADD CONSTRAINT "warehouse_correction_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "warehouse_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_correction_lines" ADD CONSTRAINT "warehouse_correction_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
