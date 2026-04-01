-- Mijoz: kod, savdo kanali, bank, PINFL, koordinatalar, zona
ALTER TABLE "clients" ADD COLUMN "client_code" VARCHAR(32);
ALTER TABLE "clients" ADD COLUMN "sales_channel" TEXT;
ALTER TABLE "clients" ADD COLUMN "product_category_ref" TEXT;
ALTER TABLE "clients" ADD COLUMN "bank_name" TEXT;
ALTER TABLE "clients" ADD COLUMN "bank_account" TEXT;
ALTER TABLE "clients" ADD COLUMN "bank_mfo" TEXT;
ALTER TABLE "clients" ADD COLUMN "client_pinfl" VARCHAR(20);
ALTER TABLE "clients" ADD COLUMN "oked" TEXT;
ALTER TABLE "clients" ADD COLUMN "contract_number" TEXT;
ALTER TABLE "clients" ADD COLUMN "vat_reg_code" TEXT;
ALTER TABLE "clients" ADD COLUMN "latitude" DECIMAL(11,8);
ALTER TABLE "clients" ADD COLUMN "longitude" DECIMAL(11,8);
ALTER TABLE "clients" ADD COLUMN "zone" TEXT;

-- Agent slot: hafta kunlari + ekspeditor foydalanuvchi
ALTER TABLE "client_agent_assignments" ADD COLUMN "visit_weekdays" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "client_agent_assignments" ADD COLUMN "expeditor_user_id" INTEGER;

ALTER TABLE "client_agent_assignments" ADD CONSTRAINT "client_agent_assignments_expeditor_user_id_fkey" FOREIGN KEY ("expeditor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
