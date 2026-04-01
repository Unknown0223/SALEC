-- AlterTable
ALTER TABLE "clients" ADD COLUMN "legal_name" TEXT;
ALTER TABLE "clients" ADD COLUMN "client_type_code" TEXT;

-- CreateTable
CREATE TABLE "client_agent_assignments" (
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

CREATE UNIQUE INDEX "client_agent_assignments_client_id_slot_key" ON "client_agent_assignments"("client_id", "slot");
CREATE INDEX "client_agent_assignments_tenant_id_client_id_idx" ON "client_agent_assignments"("tenant_id", "client_id");

ALTER TABLE "client_agent_assignments" ADD CONSTRAINT "client_agent_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_agent_assignments" ADD CONSTRAINT "client_agent_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_agent_assignments" ADD CONSTRAINT "client_agent_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill slot 1 from legacy agent_id / visit_date
INSERT INTO "client_agent_assignments" ("tenant_id", "client_id", "slot", "agent_id", "visit_date", "expeditor_phone", "created_at", "updated_at")
SELECT c."tenant_id", c."id", 1, c."agent_id", c."visit_date", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "clients" c
WHERE c."merged_into_client_id" IS NULL
  AND (c."agent_id" IS NOT NULL OR c."visit_date" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "client_agent_assignments" a WHERE a."client_id" = c."id" AND a."slot" = 1
  );
