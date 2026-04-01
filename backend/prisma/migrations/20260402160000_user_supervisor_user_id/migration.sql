-- Foydalanuvchi ierarxiyasi: agentning «supervisor»i (klientlar filtri uchun)
ALTER TABLE "users" ADD COLUMN "supervisor_user_id" INTEGER;

ALTER TABLE "users"
  ADD CONSTRAINT "users_supervisor_user_id_fkey"
  FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_tenant_supervisor_user_id_idx" ON "users" ("tenant_id", "supervisor_user_id");
