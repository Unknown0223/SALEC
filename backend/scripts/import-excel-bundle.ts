/**
 * Bir nechta Excel fayldan: supervayzerlar → ekseditorlar → agentlar → kategoriyalar → prays.
 *
 * Fayl yo‘llari (to‘liq yo‘l yoki backend papkasidan nisbiy):
 *   IMPORT_EXCEL_SUPERVISORS
 *   IMPORT_EXCEL_EXPEDITORS
 *   IMPORT_EXCEL_AGENTS
 *   IMPORT_EXCEL_CATEGORIES
 *   IMPORT_EXCEL_PRODUCTS  («Продукты» — katalog maydonlari)
 *   IMPORT_EXCEL_PRICE_LIST
 *
 * Yoki bitta papka (ixtiyoriy, fayl nomi bo‘yicha qidiradi):
 *   IMPORT_EXCEL_DIR=C:\Users\...\Downloads
 *
 * Boshqa:
 *   IMPORT_TENANT_SLUG=test1
 *   IMPORT_DEFAULT_PASSWORD=Parol123!
 *   IMPORT_EXCEL_DRY_RUN=1
 *   Dry prays: har qatorni chiqarmaslik — IMPORT_EXCEL_QUIET_DRY=1
 *   Production yozuv: ALLOW_PROD_REF_IMPORT=true
 *
 * Ombor nomlari Excel va bazada boshqacha bo‘lsa:
 *   IMPORT_WAREHOUSE_ALIASES_JSON=scripts/data/excel/warehouse-aliases.json
 *   (namuna: scripts/data/excel/warehouse-aliases.example.json ni nusxalang)
 *
 * Tavsiya etilgan tartib: avval `npm run import:once` (omborlar spravochnikda),
 * keyin `npm run import:excel-bundle`.
 *
 * Namuna (loyiha ildizidan):
 *   cd backend
 *   $env:IMPORT_EXCEL_DIR='C:\Users\botir\Downloads'
 *   $env:ALLOW_PROD_REF_IMPORT='true'
 *   npm run import:excel-bundle
 *
 * Papkada bir nechta mos .xlsx bo‘lsa, eng yangi o‘zgartirilgan (keyin hajm) tanlanadi.
 *
 * Qisman o‘tkazish (1=true):
 *   IMPORT_EXCEL_SKIP_SUPERVISORS, IMPORT_EXCEL_SKIP_EXPEDITORS, IMPORT_EXCEL_SKIP_AGENTS,
 *   IMPORT_EXCEL_SKIP_CATEGORIES, IMPORT_EXCEL_SKIP_PRODUCTS, IMPORT_EXCEL_SKIP_PRICE_LIST
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { findInDir, resolveBackendPath } from "./lib/excel-bundle-paths";
import { runCategoriesExcelImport } from "./lib/excel-categories-import";
import { runPriceListExcelImport } from "./lib/excel-price-list-import";
import { runProductsExcelImport } from "./lib/excel-products-import";
import { runStaffExcelImport } from "./lib/excel-staff-import";

const prisma = new PrismaClient();

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  const cwdBackend = process.cwd();
  const dry = truthy(process.env.IMPORT_EXCEL_DRY_RUN);
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const defaultPassword = (process.env.IMPORT_DEFAULT_PASSWORD || "Parol123!").trim();

  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_REF_IMPORT) && !dry) {
    throw new Error("Production: ALLOW_PROD_REF_IMPORT=true yoki IMPORT_EXCEL_DRY_RUN=1");
  }

  const excelDir = process.env.IMPORT_EXCEL_DIR?.trim();

  const sup =
    resolveBackendPath(process.env.IMPORT_EXCEL_SUPERVISORS, cwdBackend) ||
    (excelDir ? findInDir(excelDir, ["супервайз", "supervisor"]) : null) ||
    resolveBackendPath("scripts/data/excel/supervisors.xlsx", cwdBackend);

  const exp =
    resolveBackendPath(process.env.IMPORT_EXCEL_EXPEDITORS, cwdBackend) ||
    (excelDir
      ? findInDir(excelDir, [
          "активные активные экспед",
          "активные экспедитор",
          "экспедитор",
          "expeditor"
        ])
      : null) ||
    resolveBackendPath("scripts/data/excel/expeditors.xlsx", cwdBackend);

  const ag =
    resolveBackendPath(process.env.IMPORT_EXCEL_AGENTS, cwdBackend) ||
    (excelDir
      ? findInDir(excelDir, ["активные агент", "активные агенты", "агент", "agent"])
      : null) ||
    resolveBackendPath("scripts/data/excel/agents.xlsx", cwdBackend);

  const cat =
    resolveBackendPath(process.env.IMPORT_EXCEL_CATEGORIES, cwdBackend) ||
    (excelDir ? findInDir(excelDir, ["категория продукта", "категория продук", "категор"]) : null) ||
    resolveBackendPath("scripts/data/excel/categories.xlsx", cwdBackend);

  const prod =
    resolveBackendPath(process.env.IMPORT_EXCEL_PRODUCTS, cwdBackend) ||
    (excelDir ? findInDir(excelDir, ["продукты", "продукт", "products"]) : null) ||
    resolveBackendPath("scripts/data/excel/products.xlsx", cwdBackend);

  const price =
    resolveBackendPath(process.env.IMPORT_EXCEL_PRICE_LIST, cwdBackend) ||
    (excelDir ? findInDir(excelDir, ["прайст лист", "прайст", "прайс", "price"]) : null) ||
    resolveBackendPath("scripts/data/excel/price-list.xlsx", cwdBackend);

  console.log(
    "\n╔════════════════════════════════════════════════════════════════╗\n║  IMPORT EXCEL BUNDLE — xodimlar + kategoriya + prays            ║\n╚════════════════════════════════════════════════════════════════╝"
  );
  console.log(`Tenant: ${slug}  dry-run: ${dry}`);
  console.log("Fayllar:");
  console.log(`  supervisors: ${sup && fs.existsSync(sup) ? sup : "(yo‘q)"}`);
  console.log(`  expeditors:  ${exp && fs.existsSync(exp) ? exp : "(yo‘q)"}`);
  console.log(`  agents:      ${ag && fs.existsSync(ag) ? ag : "(yo‘q)"}`);
  console.log(`  categories:  ${cat && fs.existsSync(cat) ? cat : "(yo‘q)"}`);
  console.log(`  products:    ${prod && fs.existsSync(prod) ? prod : "(yo‘q)"}`);
  console.log(`  price list:  ${price && fs.existsSync(price) ? price : "(yo‘q)"}`);

  const anyFile = [sup, exp, ag, cat, prod, price].some((p) => p && fs.existsSync(p));
  if (!anyFile) {
    const downloads =
      process.platform === "win32" && process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "Downloads")
        : null;
    console.log(
      "\nHech qanday .xlsx topilmadi. Quyidagilardan birini qiling:\n" +
        "  • PowerShell:  $env:IMPORT_EXCEL_DIR='C:\\Users\\...\\Downloads'\n" +
        "  • yoki backend/.env:  IMPORT_EXCEL_DIR=C:\\Users\\...\\Downloads\n" +
        "  • yoki fayllarni backend/scripts/data/excel/ ga qo‘ying (agents.xlsx, …)\n" +
        (downloads
          ? `  • tez sinov (Downloads):  $env:IMPORT_EXCEL_DIR='${downloads}'\n`
          : "")
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant yo‘q: ${slug} — avval provision:admin yoki seed.`);

  const skipSup = truthy(process.env.IMPORT_EXCEL_SKIP_SUPERVISORS);
  const skipExp = truthy(process.env.IMPORT_EXCEL_SKIP_EXPEDITORS);
  const skipAg = truthy(process.env.IMPORT_EXCEL_SKIP_AGENTS);
  const skipCat = truthy(process.env.IMPORT_EXCEL_SKIP_CATEGORIES);
  const skipProd = truthy(process.env.IMPORT_EXCEL_SKIP_PRODUCTS);
  const skipPrice = truthy(process.env.IMPORT_EXCEL_SKIP_PRICE_LIST);

  if (skipSup || skipExp || skipAg || skipCat || skipProd || skipPrice) {
    console.log(
      `Qisman: skip supervisors=${skipSup} expeditors=${skipExp} agents=${skipAg} categories=${skipCat} products=${skipProd} price=${skipPrice}`
    );
  }

  if (!skipSup && sup && fs.existsSync(sup)) {
    await runStaffExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: sup,
      role: "supervisor",
      defaultPassword,
      dry
    });
  } else {
    console.log(
      skipSup
        ? "\n(o‘tkazildi) Supervayzerlar — IMPORT_EXCEL_SKIP_SUPERVISORS=1."
        : "\n(o‘tkazildi) Supervayzerlar fayli yo‘q."
    );
  }

  if (!skipExp && exp && fs.existsSync(exp)) {
    await runStaffExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: exp,
      role: "expeditor",
      defaultPassword,
      dry
    });
  } else {
    console.log(
      skipExp
        ? "\n(o‘tkazildi) Ekseditorlar — IMPORT_EXCEL_SKIP_EXPEDITORS=1."
        : "\n(o‘tkazildi) Ekseditorlar fayli yo‘q."
    );
  }

  if (!skipAg && ag && fs.existsSync(ag)) {
    await runStaffExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: ag,
      role: "agent",
      defaultPassword,
      dry
    });
  } else {
    console.log(
      skipAg ? "\n(o‘tkazildi) Agentlar — IMPORT_EXCEL_SKIP_AGENTS=1." : "\n(o‘tkazildi) Agentlar fayli yo‘q."
    );
  }

  if (!skipCat && cat && fs.existsSync(cat)) {
    await runCategoriesExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: cat,
      dry
    });
  } else {
    console.log(
      skipCat
        ? "\n(o‘tkazildi) Kategoriyalar — IMPORT_EXCEL_SKIP_CATEGORIES=1."
        : "\n(o‘tkazildi) Kategoriyalar fayli yo‘q."
    );
  }

  if (!skipProd && prod && fs.existsSync(prod)) {
    await runProductsExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: prod,
      dry
    });
  } else {
    console.log(
      skipProd
        ? "\n(o‘tkazildi) Mahsulotlar (Продукты) — IMPORT_EXCEL_SKIP_PRODUCTS=1."
        : "\n(o‘tkazildi) Продукты.xlsx topilmadi."
    );
  }

  if (!skipPrice && price && fs.existsSync(price)) {
    await runPriceListExcelImport({
      prisma,
      tenantId: tenant.id,
      tenantSlug: slug,
      filePath: price,
      dry
    });
  } else {
    console.log(
      skipPrice
        ? "\n(o‘tkazildi) Prays — IMPORT_EXCEL_SKIP_PRICE_LIST=1."
        : "\n(o‘tkazildi) Prays fayli yo‘q."
    );
  }

  console.log("\nTayyor.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
