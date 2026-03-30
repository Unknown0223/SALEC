-- CreateTable
CREATE TABLE "client_balances" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_balance_movements" (
    "id" SERIAL NOT NULL,
    "client_balance_id" INTEGER NOT NULL,
    "delta" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_balance_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_balances_tenant_id_client_id_key" ON "client_balances"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "client_balances_tenant_id_idx" ON "client_balances"("tenant_id");

-- CreateIndex
CREATE INDEX "client_balance_movements_client_balance_id_idx" ON "client_balance_movements"("client_balance_id");

-- AddForeignKey
ALTER TABLE "client_balances" ADD CONSTRAINT "client_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_balances" ADD CONSTRAINT "client_balances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_balance_movements" ADD CONSTRAINT "client_balance_movements_client_balance_id_fkey" FOREIGN KEY ("client_balance_id") REFERENCES "client_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_balance_movements" ADD CONSTRAINT "client_balance_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
