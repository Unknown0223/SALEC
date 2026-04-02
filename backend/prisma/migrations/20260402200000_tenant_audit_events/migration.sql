-- CreateTable
CREATE TABLE "tenant_audit_events" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_audit_events_tenant_id_created_at_idx" ON "tenant_audit_events"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_audit_events_tenant_id_entity_type_entity_id_idx" ON "tenant_audit_events"("tenant_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "tenant_audit_events" ADD CONSTRAINT "tenant_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_audit_events" ADD CONSTRAINT "tenant_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
