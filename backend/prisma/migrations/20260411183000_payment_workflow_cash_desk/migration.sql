-- AlterTable
ALTER TABLE "client_payments" ADD COLUMN "cash_desk_id" INTEGER;
ALTER TABLE "client_payments" ADD COLUMN "workflow_status" VARCHAR(32) NOT NULL DEFAULT 'confirmed';
ALTER TABLE "client_payments" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "client_payments" ADD COLUMN "received_at" TIMESTAMP(3);
ALTER TABLE "client_payments" ADD COLUMN "confirmed_at" TIMESTAMP(3);

UPDATE "client_payments"
SET
  "paid_at" = COALESCE("paid_at", "created_at"),
  "received_at" = COALESCE("received_at", "created_at"),
  "confirmed_at" = COALESCE("confirmed_at", "created_at")
WHERE "paid_at" IS NULL OR "received_at" IS NULL OR "confirmed_at" IS NULL;

-- AddForeignKey
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "client_payments_tenant_id_workflow_status_idx" ON "client_payments"("tenant_id", "workflow_status");
CREATE INDEX "client_payments_cash_desk_id_idx" ON "client_payments"("cash_desk_id");
