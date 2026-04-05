/**
 * BIR MARTA — barcha bo‘limlar ketma-ket, dublikatsiz (idempotent).
 *
 * Nima qiladi:
 *   [1/4]…[4/4] — zona/viloyat, savdo kanali, yo‘nalish, ombor, tenant.settings
 *   (ixtiyoriy) Xodimlar CSV
 *   (ixtiyoriy) Mahsulotlar JSON
 *   (ixtiyoriy) demo_* foydalanuvchilar parolini bir xil qilish
 *
 * Ishlatish (loyiha ildizidan):
 *   $env:IMPORT_TENANT_SLUG='test1'   (panel «SAVDO PANEL …» dagi slug bilan bir xil bo‘lsin!)
 *   $env:IMPORT_STAFF_CSV='scripts/mening-xodimlarim.csv'  # ixtiyoriy
 *   (CSV bermasangiz, `scripts/sample-staff.csv` bor bo‘lsa, avtomatik olinadi)
 *   Xodimlarni umuman o‘tkazmaslik: IMPORT_ONCE_NO_STAFF=1
 *   $env:IMPORT_PRODUCTS_JSON='scripts/data/mahsulotlar.json'  # ixtiyoriy (bo‘sh bo‘lmasa, avtomatik ham olinadi)
 *   npm run import:once
 *
 * Sinash (bazaga yozmaydi):
 *   $env:IMPORT_ONCE_DRY_RUN='1'; npm run import:once
 *
 * Production: ALLOW_PROD_REF_IMPORT=true
 * Namuna parolni o‘tkazmaslik: IMPORT_ONCE_SKIP_ENSURE_LOGINS=1
 *
 * Shaharlar (Excel): CITY_XLSX_PATH yoki scripts/data/Данные Город*.xlsx | gorod.xlsx
 * O‘tkazib yuborish: IMPORT_ONCE_NO_CITIES=1
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveCityXlsxPath, runCitiesXlsxImport } from "./lib/cities-xlsx-import";
import { runLalakuReferenceImport } from "./lib/lalaku-reference-import";
import { runStaffImportFromCsv } from "./lib/staff-csv-import";
import { runProductsImportFromJson } from "./lib/import-products-json";
import { runEnsureDemoStaffLogin } from "./lib/ensure-demo-login";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  const dry = truthy(process.env.IMPORT_ONCE_DRY_RUN) || truthy(process.env.IMPORT_REFS_DRY_RUN);
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const cwdBackend = process.cwd();

  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_REF_IMPORT)) {
    throw new Error("Production: ALLOW_PROD_REF_IMPORT=true yoki IMPORT_ONCE_DRY_RUN=1");
  }

  console.log(
    "\n╔════════════════════════════════════════════════════════════════╗\n║  IMPORT ONCE — spravochniklar + (ixtiyoriy) xodim/mahsulot      ║\n╚════════════════════════════════════════════════════════════════╝"
  );
  console.log(`Tenant slug: ${slug}  |  dry-run: ${dry}`);
  console.log(
    "\n⚠️  MUHIM: Barcha yozuvlar FAQAT shu «slug» dagi dilerga tushadi. Kirish sahifasidagi «Diler (slug)» ham `"
      .concat(slug)
      .concat("` bo‘lishi kerak — aks holda panelda hech narsa ko‘rinmaydi.\n")
  );

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant topilmadi: ${slug}`);

  await runLalakuReferenceImport(prisma, {
    tenantId: tenant.id,
    tenantSlug: slug,
    dry
  });

  const allowProdCities = truthy(process.env.ALLOW_PROD_REF_IMPORT) || truthy(process.env.ALLOW_PROD_CITIES_IMPORT);
  if (!truthy(process.env.IMPORT_ONCE_NO_CITIES)) {
    const cityResolved = resolveCityXlsxPath(cwdBackend);
    if (cityResolved.ok) {
      console.log("\n════════════  QO‘SHIMCHA: shaharlar (Excel → territoriya)  ════════════");
      await runCitiesXlsxImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        xlsxPath: cityResolved.path,
        dry,
        allowProdWrite: allowProdCities
      });
    } else if (cityResolved.reason === "missing_env_file") {
      throw new Error(`CITY_XLSX_PATH berildi, fayl yo‘q: ${cityResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Shaharlar Excel — fayl topilmadi. CITY_XLSX_PATH yoki scripts/data/Данные Город.xlsx | gorod.xlsx qo‘ying."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_CITIES=1 — shaharlar Excel.");
  }

  let staffCsv = (process.env.IMPORT_STAFF_CSV ?? "").trim();
  if (!staffCsv && !truthy(process.env.IMPORT_ONCE_NO_STAFF)) {
    const sample = path.join(cwdBackend, "scripts/sample-staff.csv");
    if (fs.existsSync(sample)) {
      staffCsv = "scripts/sample-staff.csv";
      console.log("(avtomatik) IMPORT_STAFF_CSV=scripts/sample-staff.csv");
    }
  }
  if (staffCsv) {
    console.log("\n════════════  QO‘SHIMCHA: xodimlar (CSV)  ════════════");
    await runStaffImportFromCsv({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      csvPath: staffCsv,
      cwdForRelativePath: cwdBackend,
      delim: (process.env.IMPORT_CSV_DELIM || ";").trim() || ";",
      defaultPassword: (process.env.IMPORT_DEFAULT_PASSWORD || "Parol123!").trim(),
      dry
    });
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_STAFF_CSV — xodimlar CSV yo‘q.");
  }

  let productsJson = (process.env.IMPORT_PRODUCTS_JSON || "").trim();
  if (!productsJson) {
    const mah = path.join(cwdBackend, "scripts/data/mahsulotlar.json");
    if (fs.existsSync(mah)) {
      try {
        const raw = fs.readFileSync(mah, "utf8");
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr) && arr.length > 0) {
          productsJson = "scripts/data/mahsulotlar.json";
          console.log("(avtomatik) IMPORT_PRODUCTS_JSON=scripts/data/mahsulotlar.json");
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (productsJson) {
    console.log("\n════════════  QO‘SHIMCHA: mahsulotlar (JSON)  ════════════");
    const abs = path.isAbsolute(productsJson) ? productsJson : path.join(cwdBackend, productsJson);
    if (!fs.existsSync(abs)) {
      console.warn(`Fayl yo‘q: ${abs} — mahsulotlar o‘tkazildi.`);
    } else {
      await runProductsImportFromJson(prisma, { tenantId: tenant.id, filePath: abs, dry });
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) Mahsulotlar JSON — scripts/data/mahsulotlar.json bo‘sh yoki yo‘q.");
    console.log("Namuna: mahsulotlar.json ga [{ \"sku\", \"name\", \"unit\"? }] qo‘shing.");
  }

  if (!dry && !truthy(process.env.IMPORT_ONCE_SKIP_ENSURE_LOGINS)) {
    await runEnsureDemoStaffLogin(prisma, { tenantSlug: slug });
  }

  console.log(
    "\n✅ TAYYOR. Takrorlasangiz ham dublikat qo‘shilmaydi (sku, kod, login bo‘yicha tekshiriladi).\n"
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
