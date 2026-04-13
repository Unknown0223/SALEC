-- Drift tuzatish: avvalgi migratsiyalar "applied" deb yopilgan, lekin SQL qisman/umuman ishlamagan bo‘lishi mumkin.
-- PostgreSQL 11+.

-- clients: legal_name / client_type_code (20260401120000)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "legal_name" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "client_type_code" TEXT;

-- clients: lalaku parity (20260402140000)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "client_code" VARCHAR(32);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sales_channel" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "product_category_ref" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "bank_account" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "bank_mfo" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "client_pinfl" VARCHAR(20);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "oked" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "contract_number" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "vat_reg_code" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(11,8);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(11,8);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "zone" TEXT;

-- client_agent_assignments asosiy jadval (20260401120000)
CREATE TABLE IF NOT EXISTS "client_agent_assignments" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "agent_id" INTEGER,
    "visit_date" TIMESTAMP(3),
    "expeditor_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_agent_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_agent_assignments_client_id_slot_key"
  ON "client_agent_assignments"("client_id", "slot");
CREATE INDEX IF NOT EXISTS "client_agent_assignments_tenant_id_client_id_idx"
  ON "client_agent_assignments"("tenant_id", "client_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_agent_assignments_tenant_id_fkey') THEN
    ALTER TABLE "client_agent_assignments"
      ADD CONSTRAINT "client_agent_assignments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_agent_assignments_client_id_fkey') THEN
    ALTER TABLE "client_agent_assignments"
      ADD CONSTRAINT "client_agent_assignments_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_agent_assignments_agent_id_fkey') THEN
    ALTER TABLE "client_agent_assignments"
      ADD CONSTRAINT "client_agent_assignments_agent_id_fkey"
      FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "client_agent_assignments" ("tenant_id", "client_id", "slot", "agent_id", "visit_date", "expeditor_phone", "created_at", "updated_at")
SELECT c."tenant_id", c."id", 1, c."agent_id", c."visit_date", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "clients" c
WHERE c."merged_into_client_id" IS NULL
  AND (c."agent_id" IS NOT NULL OR c."visit_date" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "client_agent_assignments" a WHERE a."client_id" = c."id" AND a."slot" = 1
  );

-- lalaku: slot ustunlari
ALTER TABLE "client_agent_assignments" ADD COLUMN IF NOT EXISTS "visit_weekdays" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "client_agent_assignments" ADD COLUMN IF NOT EXISTS "expeditor_user_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_agent_assignments_expeditor_user_id_fkey') THEN
    ALTER TABLE "client_agent_assignments"
      ADD CONSTRAINT "client_agent_assignments_expeditor_user_id_fkey"
      FOREIGN KEY ("expeditor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
