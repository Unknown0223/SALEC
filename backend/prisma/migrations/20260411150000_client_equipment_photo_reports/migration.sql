-- Client equipment (inventory) and photo reports for client profile hub

CREATE TABLE "client_equipment" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "inventory_type" VARCHAR(256) NOT NULL,
    "equipment_kind" VARCHAR(256),
    "serial_number" VARCHAR(128),
    "inventory_number" VARCHAR(128),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "note" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_photo_reports" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "image_url" VARCHAR(4000) NOT NULL,
    "caption" VARCHAR(1000),
    "order_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_photo_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_equipment_tenant_id_client_id_idx" ON "client_equipment"("tenant_id", "client_id");
CREATE INDEX "client_equipment_tenant_id_client_id_removed_at_idx" ON "client_equipment"("tenant_id", "client_id", "removed_at");

CREATE INDEX "client_photo_reports_tenant_id_client_id_idx" ON "client_photo_reports"("tenant_id", "client_id");
CREATE INDEX "client_photo_reports_tenant_id_created_at_idx" ON "client_photo_reports"("tenant_id", "created_at" DESC);

ALTER TABLE "client_equipment" ADD CONSTRAINT "client_equipment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_equipment" ADD CONSTRAINT "client_equipment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_photo_reports" ADD CONSTRAINT "client_photo_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_photo_reports" ADD CONSTRAINT "client_photo_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_photo_reports" ADD CONSTRAINT "client_photo_reports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_photo_reports" ADD CONSTRAINT "client_photo_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
