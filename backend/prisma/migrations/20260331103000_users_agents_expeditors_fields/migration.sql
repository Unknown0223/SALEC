-- Alter users table for agent/expeditor profile fields
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "first_name" TEXT,
  ADD COLUMN IF NOT EXISTS "last_name" TEXT,
  ADD COLUMN IF NOT EXISTS "middle_name" TEXT,
  ADD COLUMN IF NOT EXISTS "product" TEXT,
  ADD COLUMN IF NOT EXISTS "agent_type" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "pinfl" TEXT,
  ADD COLUMN IF NOT EXISTS "consignment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "apk_version" TEXT,
  ADD COLUMN IF NOT EXISTS "device_name" TEXT,
  ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "can_authorize" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "price_type" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "trade_direction" TEXT,
  ADD COLUMN IF NOT EXISTS "branch" TEXT,
  ADD COLUMN IF NOT EXISTS "position" TEXT,
  ADD COLUMN IF NOT EXISTS "app_access" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "territory" TEXT,
  ADD COLUMN IF NOT EXISTS "return_warehouse_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_warehouse_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_return_warehouse_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_return_warehouse_id_fkey"
      FOREIGN KEY ("return_warehouse_id") REFERENCES "warehouses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
