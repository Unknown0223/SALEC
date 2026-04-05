/**
 * Excel «Данные Город» (.xlsx): shaharlar → territory_nodes
 *
 *   npm run import:cities-xlsx
 *
 *   IMPORT_TENANT_SLUG   (standart: test1)
 *   CITY_XLSX_PATH       (ixtiyoriy; bo‘lmasa scripts/data yoki Downloads qidiriladi)
 *   IMPORT_CITIES_DRY_RUN=1  — faqat hisobot
 *
 * Production: ALLOW_PROD_CITIES_IMPORT=true
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveCityXlsxPath, runCitiesXlsxImport } from "./lib/cities-xlsx-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  const dry = truthy(process.env.IMPORT_CITIES_DRY_RUN);
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const cwdBackend = process.cwd();

  const resolved = resolveCityXlsxPath(cwdBackend);
  if (!resolved.ok) {
    if (resolved.reason === "missing_env_file") {
      throw new Error(`CITY_XLSX_PATH berildi, fayl yo‘q: ${resolved.detail}`);
    }
    throw new Error(
      "Excel topilmadi. CITY_XLSX_PATH bering yoki faylni backend/scripts/data/ ga qo‘ying (Данные Город.xlsx yoki gorod.xlsx)."
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant topilmadi: slug=${slug}`);

  const allowProd =
    truthy(process.env.ALLOW_PROD_CITIES_IMPORT) || truthy(process.env.ALLOW_PROD_REF_IMPORT);

  await runCitiesXlsxImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    xlsxPath: resolved.path,
    dry,
    allowProdWrite: allowProd
  });

  if (dry) {
    console.log("\n→ DRY-RUN. Haqiqiy yozish: IMPORT_CITIES_DRY_RUN o‘chirilgan holda qayta ishga tushiring.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
