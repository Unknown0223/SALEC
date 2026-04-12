-- Yumshoq bekor: to‘lov qatori saqlanadi, tarix va qayta tiklash uchun.
ALTER TABLE "client_payments" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" INTEGER,
ADD COLUMN "delete_reason_ref" VARCHAR(128);

ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "client_payments_tenant_id_deleted_at_idx" ON "client_payments"("tenant_id", "deleted_at");
