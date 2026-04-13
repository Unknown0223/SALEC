/**
 * «Активные агенты» eksporti (Excel) — alohida ishga tushirish.
 *
 * Mantiq: scripts/lib/active-agents-xlsx-import.ts (`runActiveAgentsXlsxImport`).
 * `npm run import:once` ham xuddi shu modulni (fayl topilsa) chaqiradi.
 *
 * Ishlatish:
 *   CONFIRM_AGENTS_XLSX_IMPORT=yes
 *   IMPORT_TENANT_SLUG, AGENTS_XLSX_PATH (yoki scripts/data/active-agents.xlsx)
 *   AGENTS_IMPORT_PASSWORD — yangi foydalanuvchilar
 *
 * Sinov: IMPORT_AGENTS_XLSX_DRY_RUN=1
 * Production: ALLOW_PROD_AGENTS_XLSX=true
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveAgentsXlsxPath, runActiveAgentsXlsxImport } from "./lib/active-agents-xlsx-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (process.env.CONFIRM_AGENTS_XLSX_IMPORT !== "yes") {
    console.error("CONFIRM_AGENTS_XLSX_IMPORT=yes qo‘ying.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_AGENTS_XLSX)) {
    console.error("Production: ALLOW_PROD_AGENTS_XLSX=true");
    process.exit(1);
  }

  const slug = (process.env.IMPORT_TENANT_SLUG || "").trim();
  if (!slug) {
    console.error("IMPORT_TENANT_SLUG majburiy.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const resolved = resolveAgentsXlsxPath(cwd, process.env.AGENTS_XLSX_PATH);
  if (resolved.ok === false) {
    if (resolved.reason === "missing_env_file") {
      console.error(`AGENTS_XLSX_PATH berildi, fayl yo‘q: ${resolved.detail}`);
      process.exit(1);
    }
    console.error(
      "Excel topilmadi. AGENTS_XLSX_PATH qo‘ying yoki scripts/data/active-agents.xlsx | Активные агенты.xlsx qo‘ying."
    );
    process.exit(1);
  }

  const dry = truthy(process.env.IMPORT_AGENTS_XLSX_DRY_RUN);
  const resetPassword = truthy(process.env.AGENTS_RESET_PASSWORD);
  const defaultPassword = (
    process.env.AGENTS_IMPORT_PASSWORD ||
    process.env.IMPORT_DEFAULT_PASSWORD ||
    "AgentImport123!"
  ).trim();

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant topilmadi: ${slug}`);
    process.exit(1);
  }

  await runActiveAgentsXlsxImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    xlsxPath: resolved.path,
    dry,
    defaultPassword,
    resetPassword
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
