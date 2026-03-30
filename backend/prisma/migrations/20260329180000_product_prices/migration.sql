-- CreateTable
CREATE TABLE "product_prices" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "price_type" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_prices_tenant_id_product_id_idx" ON "product_prices"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_tenant_id_product_id_price_type_key" ON "product_prices"("tenant_id", "product_id", "price_type");

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
