/**
 * Faqat spravochniklar (ichki: `lib/lalaku-reference-import.ts`).
 * Bitta buyruqda hammasi: `npm run import:once` (ildizdan).
 *
 * @see scripts/import-once.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runLalakuReferenceImport } from "./lib/lalaku-reference-import";

const prisma = new PrismaClient();

async function main() {
  const dry = process.env.IMPORT_REFS_DRY_RUN === "1" || process.env.IMPORT_REFS_DRY_RUN === "true";
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_REF_IMPORT !== "true") {
    throw new Error("Productionda yozish: ALLOW_PROD_REF_IMPORT=true yoki dry-run.");
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant topilmadi: slug=${slug}`);

  console.log(`Tenant: ${slug} (id=${tenant.id}) dry=${dry}`);
  if (dry) {
    console.log(
      "→ DRY-RUN. Haqiqiy yozish: Remove-Item Env:IMPORT_REFS_DRY_RUN -ErrorAction SilentlyContinue"
    );
  }

  await runLalakuReferenceImport(prisma, { tenantId: tenant.id, tenantSlug: slug, dry });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
