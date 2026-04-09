-- Spravochnik maydonlari: zakaz / qaytarish / vazifa
ALTER TABLE "orders" ADD COLUMN "request_type_ref" VARCHAR(128);
ALTER TABLE "sales_returns" ADD COLUMN "refusal_reason_ref" VARCHAR(128);
ALTER TABLE "tenant_tasks" ADD COLUMN "task_type_ref" VARCHAR(128);
