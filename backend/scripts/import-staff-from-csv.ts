/**
 * CLI: xodimlar CSV. Asosiy mantiq: `lib/staff-csv-import.ts`
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runStaffImportFromCsv } from "./lib/staff-csv-import";

async function main() {
  const dry =
    process.env.IMPORT_STAFF_DRY_RUN === "1" || process.env.IMPORT_STAFF_DRY_RUN === "true";
  const csvPath = (process.env.IMPORT_STAFF_CSV || "").trim();
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const delim = (process.env.IMPORT_CSV_DELIM || ";").trim() || ";";
  const defaultPassword = (process.env.IMPORT_DEFAULT_PASSWORD || "O‘zgartiring123!").trim();

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_REF_IMPORT !== "true") {
    throw new Error("Production: ALLOW_PROD_REF_IMPORT=true kerak.");
  }
  if (!csvPath) {
    throw new Error("IMPORT_STAFF_CSV=/path/to/file.csv belgilang.");
  }

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new Error(`Tenant: ${slug}`);
    await runStaffImportFromCsv({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      csvPath,
      cwdForRelativePath: process.cwd(),
      delim,
      defaultPassword,
      dry
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
