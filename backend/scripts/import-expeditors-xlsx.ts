/**
 * «Активные экспедиторы» Excel — alohida ishga tushirish.
 * CONFIRM_EXPEDITORS_XLSX_IMPORT=yes, IMPORT_TENANT_SLUG, EXPEDITORS_XLSX_PATH yoki scripts/data/Активные*экспедиторы*.xlsx
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveExpeditorsXlsxPath, runExpeditorsXlsxImport } from "./lib/active-agents-xlsx-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (process.env.CONFIRM_EXPEDITORS_XLSX_IMPORT !== "yes") {
    console.error("CONFIRM_EXPEDITORS_XLSX_IMPORT=yes qo‘ying.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_EXPEDITORS_XLSX)) {
    console.error("Production: ALLOW_PROD_EXPEDITORS_XLSX=true");
    process.exit(1);
  }

  const slug = (process.env.IMPORT_TENANT_SLUG || "").trim();
  if (!slug) {
    console.error("IMPORT_TENANT_SLUG majburiy.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const resolved = resolveExpeditorsXlsxPath(cwd, process.env.EXPEDITORS_XLSX_PATH);
  if (resolved.ok === false) {
    if (resolved.reason === "missing_env_file") {
      console.error(`EXPEDITORS_XLSX_PATH: fayl yo‘q: ${resolved.detail}`);
      process.exit(1);
    }
    console.error("Excel topilmadi. EXPEDITORS_XLSX_PATH yoki scripts/data/Активные*экспедиторы*.xlsx.");
    process.exit(1);
  }

  const dry = truthy(process.env.IMPORT_EXPEDITORS_XLSX_DRY_RUN);
  const resetPassword = truthy(process.env.AGENTS_RESET_PASSWORD);
  const defaultPassword = (
    process.env.EXPEDITORS_IMPORT_PASSWORD ||
    process.env.IMPORT_DEFAULT_PASSWORD ||
    "Parol123!"
  ).trim();

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant topilmadi: ${slug}`);
    process.exit(1);
  }

  await runExpeditorsXlsxImport({
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
