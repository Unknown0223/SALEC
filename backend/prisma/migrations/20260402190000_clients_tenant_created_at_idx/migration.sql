-- Ro‘yxatda created_at bo‘yicha saralash uchun (tenant filtri bilan)
CREATE INDEX "clients_tenant_id_created_at_idx" ON "clients"("tenant_id", "created_at" DESC);
