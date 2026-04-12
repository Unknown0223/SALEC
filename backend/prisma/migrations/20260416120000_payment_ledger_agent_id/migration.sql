-- Vedoma: to'lov/rasxod qatorida agentni aniq ko'rsatish
ALTER TABLE "client_payments" ADD COLUMN "ledger_agent_id" INTEGER;

ALTER TABLE "client_payments"
  ADD CONSTRAINT "client_payments_ledger_agent_id_fkey"
  FOREIGN KEY ("ledger_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "client_payments_ledger_agent_id_idx" ON "client_payments"("ledger_agent_id");
