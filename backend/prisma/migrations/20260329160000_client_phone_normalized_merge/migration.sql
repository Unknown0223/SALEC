-- Yagona klientlar bazasi: telefon normalizatsiyasi va birlashtirish izi

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "phone_normalized" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "merged_into_client_id" INTEGER;

DO $$ BEGIN
  ALTER TABLE "clients" ADD CONSTRAINT "clients_merged_into_client_id_fkey"
    FOREIGN KEY ("merged_into_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clients_tenant_id_phone_normalized_idx" ON "clients"("tenant_id", "phone_normalized");

UPDATE "clients"
SET "phone_normalized" = NULLIF(regexp_replace(trim(COALESCE("phone", '')), '[^0-9]', '', 'g'), '')
WHERE "phone" IS NOT NULL AND trim("phone") <> '';
