/**
 * Bir martalik: Excel + mavjud daraxt → territory_nodes (3 qavat: Zona / Oblast / Gorod),
 * barcha qatlamlarga kodlar, `territory_levels` ni 3 ta bo‘limga qadar to‘ldirish, tekshiruv chiqishi.
 *
 *   npm run territory:sync-codes
 *
 *   IMPORT_TENANT_SLUG=test1   (haqiqiy slug; "o'z_slug" kabi placeholder EMAS)
 *   REGION_XLSX_PATH, CITY_XLSX_PATH  (ixtiyoriy, import-territory-excel bilan bir xil qidiruv)
 *   IMPORT_TERRITORY_DRY_RUN=1
 *   Production: ALLOW_PROD_TERRITORY_EXCEL=true (yoki ALLOW_PROD_CITIES_IMPORT / ALLOW_PROD_REF_IMPORT)
 *
 * UI da daraxt yangilanmasa: brauzer «Territoriya» sahifasida «Yangilash» yoki to‘liq sahifa yangilash (F5);
 * `DATABASE_URL` shu backend bilan bir xil bo‘lishi kerak (skript boshqa bazaga yozmasin).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  parseCityRowsFromXlsx,
  parseRegionRowsFromXlsx,
  resolveCityXlsxPath,
  resolveRegionXlsxPath
} from "./lib/cities-xlsx-import";
import { runTerritoryFullSync } from "./lib/territory-codes-enrich";

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
    throw new Error("Данные Регион.xlsx topilmadi.");
  }

  const cityResolved = resolveCityXlsxPath(cwdBackend);
  if (!cityResolved.ok) {
    if (cityResolved.reason === "missing_env_file") {
      throw new Error(`CITY_XLSX_PATH berildi, fayl yo‘q: ${cityResolved.detail}`);
    }
    throw new Error("Данные Город.xlsx topilmadi.");
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    const list = await prisma.tenant.findMany({
      select: { slug: true },
      take: 30,
      orderBy: { id: "asc" }
    });
    const slugs = list.map((t) => t.slug).join(", ");
    throw new Error(
      `Tenant topilmadi: slug="${slug}". ` +
        `IMPORT_TENANT_SLUG ga bazadagi tenant slug'ini yozing (seed odatda test1). ` +
        (slugs ? `Hozirgi bazada: ${slugs}` : "Bazada tenant yo‘q.")
    );
  }

  const allowProd =
    truthy(process.env.ALLOW_PROD_TERRITORY_EXCEL) ||
    truthy(process.env.ALLOW_PROD_CITIES_IMPORT) ||
    truthy(process.env.ALLOW_PROD_REF_IMPORT);

  const regionRows = parseRegionRowsFromXlsx(regionResolved.path);
  const cityRows = parseCityRowsFromXlsx(cityResolved.path);

  await runTerritoryFullSync({
    prisma,
    tenantId: tenant.id,
    tenantSlug: slug,
    regionXlsxPath: regionResolved.path,
    cityXlsxPath: cityResolved.path,
    regionRows,
    cityRows,
    dry,
    allowProdWrite: allowProd
  });

  if (dry) {
    console.log("→ DRY-RUN. Yozish uchun IMPORT_TERRITORY_DRY_RUN ni o‘chirib qayta ishga tushiring.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
