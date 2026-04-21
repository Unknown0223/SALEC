/**
 * Ketma-ket: agentlar → eksportlar → SVR (supervayzerlar + «агент» ustunidan bog‘lash).
 *
 * 1) Tekshiruv: `npm run validate:staff-xlsx` (Downloads: Активные агенты (3), Активные Активные экспедиторы (3), Супервайзеры (2))
 * 2) scripts/data ga nusxa (ixtiyoriy): `npm run sync:staff-xlsx` (Downloads dan)
 * 3) Ishga tushirish:
 *    CONFIRM_STAFF_TRIPLE_IMPORT=yes
 *    IMPORT_TENANT_SLUG=test1
 *    (ixtiyoriy) AGENTS_XLSX_PATH, EXPEDITORS_XLSX_PATH, SUPERVISORS_XLSX_PATH — mutlaq yo‘l yoki backend nisbiy
 *    (ixtiyoriy) IMPORT_STAFF_TRIPLE_DRY_RUN=1
 *    (ixtiyoriy) AGENTS_RESET_PASSWORD=1 — mavjudlarga parolni yangilash
 *
 * Parollar: AGENTS_IMPORT_PASSWORD | EXPEDITORS_IMPORT_PASSWORD | SUPERVISORS_IMPORT_PASSWORD | IMPORT_DEFAULT_PASSWORD
 *
 * Production: ALLOW_PROD_STAFF_TRIPLE=true
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  resolveAgentsXlsxPath,
  resolveExpeditorsXlsxPath,
  resolveSupervisorsXlsxPath,
  runActiveAgentsXlsxImport,
  runExpeditorsXlsxImport,
  runSupervisorsXlsxImport
} from "./lib/active-agents-xlsx-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (process.env.CONFIRM_STAFF_TRIPLE_IMPORT !== "yes") {
    console.error("CONFIRM_STAFF_TRIPLE_IMPORT=yes qo‘ying.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_STAFF_TRIPLE)) {
    console.error("Production: ALLOW_PROD_STAFF_TRIPLE=true");
    process.exit(1);
  }

  const slug = (process.env.IMPORT_TENANT_SLUG || "").trim();
  if (!slug) {
    console.error("IMPORT_TENANT_SLUG majburiy.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const dry = truthy(process.env.IMPORT_STAFF_TRIPLE_DRY_RUN);
  const resetPassword = truthy(process.env.AGENTS_RESET_PASSWORD);
  const defaultPassword = (process.env.IMPORT_DEFAULT_PASSWORD || "Parol123!").trim();

  const agentsPw = (process.env.AGENTS_IMPORT_PASSWORD || defaultPassword).trim();
  const expPw = (process.env.EXPEDITORS_IMPORT_PASSWORD || defaultPassword).trim();
  const supPw = (process.env.SUPERVISORS_IMPORT_PASSWORD || defaultPassword).trim();

  const ra = resolveAgentsXlsxPath(cwd, process.env.AGENTS_XLSX_PATH);
  const re = resolveExpeditorsXlsxPath(cwd, process.env.EXPEDITORS_XLSX_PATH);
  const rs = resolveSupervisorsXlsxPath(cwd, process.env.SUPERVISORS_XLSX_PATH);

  if (!ra.ok) {
    console.error(
      "Agentlar Excel topilmadi. AGENTS_XLSX_PATH yoki scripts/data/Активные агенты*.xlsx (npm run sync:staff-xlsx)."
    );
    process.exit(1);
  }
  if (!re.ok) {
    console.error(
      "Eksportlar Excel topilmadi. EXPEDITORS_XLSX_PATH yoki scripts/data/Активные*экспедиторы*.xlsx."
    );
    process.exit(1);
  }
  if (!rs.ok) {
    console.error("SVR Excel topilmadi. SUPERVISORS_XLSX_PATH yoki scripts/data/Супервайзеры*.xlsx.");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant topilmadi: ${slug}`);
    process.exit(1);
  }

  console.log(
    `\n╔════════════════════════════════════════════════════════════╗\n║  STAFF TRIPLE: agents → expeditors → supervisors         ║\n╚════════════════════════════════════════════════════════════╝\n` +
      `Tenant: ${slug} (id=${tenant.id})\nDRY_RUN=${dry}\n` +
      `Agents file: ${ra.path}\nExpeditors: ${re.path}\nSupervisors: ${rs.path}\n`
  );

  await runActiveAgentsXlsxImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    xlsxPath: ra.path,
    dry,
    defaultPassword: agentsPw,
    resetPassword
  });

  await runExpeditorsXlsxImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    xlsxPath: re.path,
    dry,
    defaultPassword: expPw,
    resetPassword
  });

  await runSupervisorsXlsxImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    xlsxPath: rs.path,
    dry,
    defaultPassword: supPw,
    resetPassword
  });

  console.log("Staff triple import tugadi.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
