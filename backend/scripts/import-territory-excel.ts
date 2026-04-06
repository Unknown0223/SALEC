/**
 * Bir martalik: «Данные Регион.xlsx» + «Данные Город.xlsx» → tenant.settings.references.territory_nodes
 *
 *   npm run import:territory-excel
 *
 *   IMPORT_TENANT_SLUG        (standart: test1)
 *   REGION_XLSX_PATH          (ixtiyoriy; bo‘lmasa scripts/data yoki %USERPROFILE%\Downloads)
 *   CITY_XLSX_PATH            (ixtiyoriy; bo‘lmasa scripts/data yoki Downloads)
 *   IMPORT_TERRITORY_DRY_RUN=1   — faqat hisobot
 *
 * Productionda yozish: ALLOW_PROD_TERRITORY_EXCEL=true (yoki ALLOW_PROD_CITIES_IMPORT / ALLOW_PROD_REF_IMPORT)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  resolveCityXlsxPath,
  resolveRegionXlsxPath,
  runTerritoryRegionCityImport
} from "./lib/cities-xlsx-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  const dry = truthy(process.env.IMPORT_TERRITORY_DRY_RUN);
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const cwdBackend = process.cwd();

  const regionResolved = resolveRegionXlsxPath(cwdBackend);
  if (!regionResolved.ok) {
    if (regionResolved.reason === "missing_env_file") {
      throw new Error(`REGION_XLSX_PATH berildi, fayl yo‘q: ${regionResolved.detail}`);
    }
    throw new Error(
      "Данные Регион.xlsx topilmadi. REGION_XLSX_PATH bering yoki faylni backend/scripts/data/ ga qo‘ying."
    );
  }

  const cityResolved = resolveCityXlsxPath(cwdBackend);
  if (!cityResolved.ok) {
    if (cityResolved.reason === "missing_env_file") {
      throw new Error(`CITY_XLSX_PATH berildi, fayl yo‘q: ${cityResolved.detail}`);
    }
    throw new Error(
      "Данные Город.xlsx topilmadi. CITY_XLSX_PATH bering yoki faylni backend/scripts/data/ ga qo‘ying."
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant topilmadi: slug=${slug}`);

  const allowProd =
    truthy(process.env.ALLOW_PROD_TERRITORY_EXCEL) ||
    truthy(process.env.ALLOW_PROD_CITIES_IMPORT) ||
    truthy(process.env.ALLOW_PROD_REF_IMPORT);

  console.log("Hudud importi (Регион + Город)…");
  await runTerritoryRegionCityImport({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    regionXlsxPath: regionResolved.path,
    cityXlsxPath: cityResolved.path,
    dry,
    allowProdWrite: allowProd
  });

  if (dry) {
    console.log("\n→ DRY-RUN. Haqiqiy yozish: IMPORT_TERRITORY_DRY_RUN o‘chirilgan holda qayta ishga tushiring.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
