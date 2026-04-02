/**
 * Eski tenant_audit_events yozuvlarini o‘chirish (cron / qo‘lda).
 * Ishlatish: `npx tsx scripts/audit-retention.ts` (backend papkasida).
 *
 * Muhit: `AUDIT_RETENTION_DAYS` (default: 730), `DATABASE_URL`
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../.env") });

const days = Math.max(1, Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "730", 10));
const cutoff = new Date(Date.now() - days * 86400000);

async function main() {
  const prisma = new PrismaClient();
  try {
    const r = await prisma.tenantAuditEvent.deleteMany({
      where: { created_at: { lt: cutoff } }
    });
    console.log(JSON.stringify({ ok: true, deleted: r.count, cutoff: cutoff.toISOString(), days }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
