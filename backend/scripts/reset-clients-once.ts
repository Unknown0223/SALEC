/**
 * BIR MARTA — bitta tenant uchun barcha mijozlarni va ularga bog‘liq yozuvlarni o‘chirish (0 ta mijoz).
 *
 * `DELETE ... WHERE tenant_id` — katta hajmda Prisma `deleteMany` dan tezroq ishlaydi.
 *
 * PowerShell (backend papkasida):
 *   $env:CONFIRM_RESET_CLIENTS="yes"
 *   $env:IMPORT_TENANT_SLUG="test1"
 *   npm run reset:clients-once
 *
 * Eski usul (faqat Prisma API): $env:RESET_CLIENTS_USE_PRISMA_ONLY="1"
 *
 * Production: ALLOW_PROD_RESET_CLIENTS=true
 * Sinash: RESET_CLIENTS_DRY_RUN=1
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function logLine(msg: string) {
  process.stdout.write(`[reset-clients] ${msg}\n`);
}

async function resetWithRawSql(tenantId: number, t0: number) {
  const tid = tenantId;
  const step = async (label: string, q: Prisma.Sql) => {
    logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  → ${label} ...`);
    const n = await prisma.$executeRaw(q);
    logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  ✓ ${label}  (affected≈${n})`);
  };

  logLine(
    "PostgreSQL DELETE/UPDATE (API yoki boshqa reset skripti ochiq bo‘lsa, qulflash mumkin — ularni to‘xtating)."
  );

  await step("payment_allocations", Prisma.sql`DELETE FROM payment_allocations WHERE tenant_id = ${tid}`);

  await step("client_photo_reports", Prisma.sql`DELETE FROM client_photo_reports WHERE tenant_id = ${tid}`);

  await step("client_payments", Prisma.sql`DELETE FROM client_payments WHERE tenant_id = ${tid}`);

  await step(
    "sales_return_lines",
    Prisma.sql`DELETE FROM sales_return_lines WHERE return_id IN (SELECT id FROM sales_returns WHERE tenant_id = ${tid})`
  );

  await step("sales_returns", Prisma.sql`DELETE FROM sales_returns WHERE tenant_id = ${tid}`);

  await step(
    "orders (CASCADE: order_items, order_status_logs, order_change_logs)",
    Prisma.sql`DELETE FROM orders WHERE tenant_id = ${tid}`
  );

  await step(
    "agent_visits.client_id",
    Prisma.sql`UPDATE agent_visits SET client_id = NULL WHERE tenant_id = ${tid} AND client_id IS NOT NULL`
  );

  await step(
    "clients.merged_into_client_id",
    Prisma.sql`UPDATE clients SET merged_into_client_id = NULL WHERE tenant_id = ${tid}`
  );

  await step(
    "client_balance_movements",
    Prisma.sql`DELETE FROM client_balance_movements WHERE client_balance_id IN (SELECT id FROM client_balances WHERE tenant_id = ${tid})`
  );

  await step("client_balances", Prisma.sql`DELETE FROM client_balances WHERE tenant_id = ${tid}`);

  await step(
    "clients (CASCADE: client_equipment, client_agent_assignments, client_audit_logs, client_opening_balance_entries)",
    Prisma.sql`DELETE FROM clients WHERE tenant_id = ${tid}`
  );

  await step(
    "bonus_rules.selected_client_ids",
    Prisma.sql`UPDATE bonus_rules SET selected_client_ids = ARRAY[]::integer[] WHERE tenant_id = ${tid}`
  );
}

async function resetWithPrismaOnly(tenantId: number, t0: number) {
  await prisma.bonusRule.updateMany({
    where: { tenant_id: tenantId },
    data: { selected_client_ids: [] }
  });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  bonusRule.selected_client_ids tozalandi`);

  const alloc = await prisma.paymentAllocation.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  paymentAllocation: ${alloc.count}`);

  const photos = await prisma.clientPhotoReport.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  clientPhotoReport: ${photos.count}`);

  const payments = await prisma.payment.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  payment: ${payments.count}`);

  const returns = await prisma.salesReturn.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  salesReturn: ${returns.count}`);

  const orders = await prisma.order.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  order: ${orders.count}`);

  const visits = await prisma.agentVisit.updateMany({
    where: { tenant_id: tenantId, client_id: { not: null } },
    data: { client_id: null }
  });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  agentVisit.client_id null: ${visits.count}`);

  await prisma.client.updateMany({
    where: { tenant_id: tenantId },
    data: { merged_into_client_id: null }
  });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  client.merged_into null`);

  const balances = await prisma.clientBalance.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  clientBalance: ${balances.count}`);

  const clients = await prisma.client.deleteMany({ where: { tenant_id: tenantId } });
  logLine(`+${((Date.now() - t0) / 1000).toFixed(1)}s  client: ${clients.count}`);
}

async function main() {
  if (process.env.CONFIRM_RESET_CLIENTS !== "yes") {
    console.error(
      "[reset-clients] To‘xtatildi. Tasdiqlash uchun:\n  CONFIRM_RESET_CLIENTS=yes"
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_RESET_CLIENTS)) {
    console.error("[reset-clients] Production: ALLOW_PROD_RESET_CLIENTS=true qo‘shing.");
    process.exit(1);
  }

  const slug = (process.env.IMPORT_TENANT_SLUG || "").trim();
  if (!slug) {
    console.error("[reset-clients] IMPORT_TENANT_SLUG majburiy (masalan test1).");
    process.exit(1);
  }

  const dry = truthy(process.env.RESET_CLIENTS_DRY_RUN);
  const prismaOnly = truthy(process.env.RESET_CLIENTS_USE_PRISMA_ONLY);

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`[reset-clients] Tenant topilmadi: ${slug}`);
    process.exit(1);
  }

  const tenantId = tenant.id;
  const countBefore = await prisma.client.count({ where: { tenant_id: tenantId } });

  logLine(`tenant=${slug} (id=${tenantId})  hozirgi mijozlar: ${countBefore}  dry-run=${dry}  prisma-only=${prismaOnly}`);

  if (dry) {
    logLine("DRY — hech narsa o‘chirilmadi.");
    await prisma.$disconnect();
    return;
  }

  const t0 = Date.now();
  if (prismaOnly) {
    await resetWithPrismaOnly(tenantId, t0);
  } else {
    await resetWithRawSql(tenantId, t0);
  }

  const after = await prisma.client.count({ where: { tenant_id: tenantId } });
  logLine(`Qolgan mijozlar: ${after}  (jami: ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
