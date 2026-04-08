-- Agent GPS pinglari (maydon trek, mobil sinxron uchun API)

CREATE TABLE "agent_location_pings" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "latitude" DECIMAL(11,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_location_pings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_location_pings_tenant_id_agent_id_recorded_at_idx" ON "agent_location_pings" ("tenant_id", "agent_id", "recorded_at");

ALTER TABLE "agent_location_pings" ADD CONSTRAINT "agent_location_pings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_location_pings" ADD CONSTRAINT "agent_location_pings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
