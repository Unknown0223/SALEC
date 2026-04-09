-- Avvalgi migratsiyada tartib xatosi: jadvallar 20260429100000 da yaratiladi.
ALTER TABLE "kpi_groups" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "sales_channel_refs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "trade_directions" ALTER COLUMN "updated_at" DROP DEFAULT;
