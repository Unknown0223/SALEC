-- Kengaytirilgan klient kartochkasi (bo‘sh maydonlar keyinroq to‘ldiriladi)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "responsible_person" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "landmark" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "inn" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "pdl" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "logistics_service" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "license_until" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "working_hours" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "neighborhood" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "street" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "house_number" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "apartment" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "gps_text" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "visit_date" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "client_format" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "contact_persons" JSONB NOT NULL DEFAULT '[]'::jsonb;
