/**
 * BIR MARTA — barcha bo‘limlar ketma-ket, dublikatsiz (idempotent).
 *
 * Nima qiladi:
 *   [1/4]…[4/4] — zona/viloyat, savdo kanali, yo‘nalish, ombor, tenant.settings
 *   (ixtiyoriy) Xodimlar CSV
 *   (ixtiyoriy) Faol agentlar Excel «Активные агенты» (birinchida — SVR bog‘lanishi uchun)
 *   (ixtiyoriy) Faol eksportlar Excel «Активные экспедиторы»
 *   (ixtiyoriy) Supervayzerlar Excel «Супервайзеры» — «агент» ustunida agentlar **vergul** bilan; `;` `|` yangi qator avtomatik vergulga almashtiriladi
 *   (ixtiyoriy) Mahsulotlar JSON
 *   (ixtiyoriy) «Продукты» Excel — PRODUCTS_XLSX_PATH yoki Downloads / scripts/data
 *   (ixtiyoriy) «Прайст лист» Excel — narxlarni SKU bo‘yicha yozadi (PRICE_LIST_XLSX_PATH yoki Downloads)
 *   (ixtiyoriy) demo_* foydalanuvchilar parolini bir xil qilish
 *
 * Ishlatish — **papka: `backend`** (loyiha ildizidan emas):
 *   cd backend
 *   $env:IMPORT_TENANT_SLUG='test1'   (panel «SAVDO PANEL …» dagi slug bilan bir xil bo‘lsin!)
 *
 * Staff Excel (boshqa kompyuterda ham): fayllarni repoga `backend/scripts/data/` ga qo‘ying — birinchi navbatda
 * quyidagi nomlar qidiriladi (ketma-ket, birinchisi topilsa ishlatiladi):
 *   • agentlar:     staff-agents.xlsx  →  active-agents.xlsx  →  Активные агенты*.xlsx
 *   • eksportlar:   staff-expeditors.xlsx  →  active-expeditors.xlsx  →  Активные*экспедиторы*.xlsx
 *   • supervayzer:  staff-supervisors.xlsx  →  active-supervisors.xlsx  →  Супервайзеры*.xlsx
 * (xuddi shu nomlar Downloads da ham qidiriladi.) Batafsil: scripts/data/README-STAFF-XLSX.md
 *
 *   $env:IMPORT_STAFF_CSV='scripts/mening-xodimlarim.csv'  # ixtiyoriy
 *   (CSV bermasangiz, `scripts/sample-staff.csv` bor bo‘lsa, avtomatik olinadi)
 *   Xodimlarni umuman o‘tkazmaslik: IMPORT_ONCE_NO_STAFF=1
 *   Yoki aniq yo‘l: AGENTS_XLSX_PATH, EXPEDITORS_XLSX_PATH, SUPERVISORS_XLSX_PATH
 *   O‘tkazmaslik: IMPORT_ONCE_NO_SUPERVISORS_XLSX=1 | IMPORT_ONCE_NO_AGENTS_XLSX=1 | IMPORT_ONCE_NO_EXPEDITORS_XLSX=1
 *   Yangi foydalanuvchi paroli: IMPORT_DEFAULT_PASSWORD yoki AGENTS_IMPORT_PASSWORD / …
 *   $env:IMPORT_PRODUCTS_JSON='scripts/data/mahsulotlar.json'  # ixtiyoriy (bo‘sh bo‘lmasa, avtomatik ham olinadi)
 *   npm run import:once
 *
 * Sinash (bazaga yozmaydi):
 *   $env:IMPORT_ONCE_DRY_RUN='1'; npm run import:once
 *
 * Production: ALLOW_PROD_REF_IMPORT=true
 * Namuna parolni o‘tkazmaslik: IMPORT_ONCE_SKIP_ENSURE_LOGINS=1
 *
 * Keyin Excel (agent/prays/…): `npm run import:excel-bundle` yoki zanjir: `npm run import:tenant-data`.
 *
 * Shaharlar (Excel): CITY_XLSX_PATH yoki scripts/data/Данные Город*.xlsx | gorod.xlsx
 * O‘tkazib yuborish: IMPORT_ONCE_NO_CITIES=1
 * Продукты Excel o‘tkazmaslik: IMPORT_ONCE_NO_PRODUCTS_XLSX=1
 * Prays Excel o‘tkazmaslik: IMPORT_ONCE_NO_PRICE_LIST_XLSX=1
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveCityXlsxPath, runCitiesXlsxImport } from "./lib/cities-xlsx-import";
import { runLalakuReferenceImport } from "./lib/lalaku-reference-import";
import { runStaffImportFromCsv } from "./lib/staff-csv-import";
import { runProductsImportFromJson } from "./lib/import-products-json";
import { runPriceListExcelImport, resolvePriceListXlsxPath } from "./lib/excel-price-list-import";
import { runProductsExcelImport, resolveProductsXlsxPath } from "./lib/excel-products-import";
import { runEnsureDemoStaffLogin } from "./lib/ensure-demo-login";
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

  const staffXlsxPass = (
    process.env.SUPERVISORS_IMPORT_PASSWORD ||
    process.env.EXPEDITORS_IMPORT_PASSWORD ||
    process.env.AGENTS_IMPORT_PASSWORD ||
    process.env.IMPORT_DEFAULT_PASSWORD ||
    "Parol123!"
  ).trim();
  const staffXlsxReset = truthy(process.env.AGENTS_RESET_PASSWORD);

  /** Avval agentlar, keyin eksportlar, oxirida SVR — SVR qatoridagi «агент» ustuni bazadagi agentlarga bog‘lanadi. */
  if (!truthy(process.env.IMPORT_ONCE_NO_AGENTS_XLSX)) {
    const agentsResolved = resolveAgentsXlsxPath(cwdBackend, process.env.AGENTS_XLSX_PATH);
    if (agentsResolved.ok) {
      const agentPass = (process.env.AGENTS_IMPORT_PASSWORD || staffXlsxPass).trim();
      await runActiveAgentsXlsxImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        xlsxPath: agentsResolved.path,
        dry,
        defaultPassword: agentPass,
        resetPassword: staffXlsxReset
      });
    } else if (agentsResolved.reason === "missing_env_file") {
      throw new Error(`AGENTS_XLSX_PATH berildi, fayl yo‘q: ${agentsResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Faol agentlar Excel — fayl topilmadi. AGENTS_XLSX_PATH yoki scripts/data/Активные агенты*.xlsx."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_AGENTS_XLSX=1 — agentlar Excel.");
  }

  if (!truthy(process.env.IMPORT_ONCE_NO_EXPEDITORS_XLSX)) {
    const expResolved = resolveExpeditorsXlsxPath(cwdBackend, process.env.EXPEDITORS_XLSX_PATH);
    if (expResolved.ok) {
      const pw = (process.env.EXPEDITORS_IMPORT_PASSWORD || staffXlsxPass).trim();
      await runExpeditorsXlsxImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        xlsxPath: expResolved.path,
        dry,
        defaultPassword: pw,
        resetPassword: staffXlsxReset
      });
    } else if (expResolved.reason === "missing_env_file") {
      throw new Error(`EXPEDITORS_XLSX_PATH berildi, fayl yo‘q: ${expResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Eksportlar Excel — topilmadi. EXPEDITORS_XLSX_PATH yoki scripts/data/Активные*экспедиторы*.xlsx."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_EXPEDITORS_XLSX=1.");
  }

  if (!truthy(process.env.IMPORT_ONCE_NO_SUPERVISORS_XLSX)) {
    const supResolved = resolveSupervisorsXlsxPath(cwdBackend, process.env.SUPERVISORS_XLSX_PATH);
    if (supResolved.ok) {
      const pw = (process.env.SUPERVISORS_IMPORT_PASSWORD || staffXlsxPass).trim();
      await runSupervisorsXlsxImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        xlsxPath: supResolved.path,
        dry,
        defaultPassword: pw,
        resetPassword: staffXlsxReset
      });
    } else if (supResolved.reason === "missing_env_file") {
      throw new Error(`SUPERVISORS_XLSX_PATH berildi, fayl yo‘q: ${supResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Supervayzerlar Excel — topilmadi. SUPERVISORS_XLSX_PATH yoki scripts/data/Супервайзеры*.xlsx."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_SUPERVISORS_XLSX=1.");
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
  if (!truthy(process.env.IMPORT_ONCE_NO_PRODUCTS_XLSX)) {
    const prodResolved = resolveProductsXlsxPath(cwdBackend);
    if (prodResolved.ok) {
      console.log("\n════════════  QO‘SHIMCHA: mahsulotlar («Продукты» Excel)  ════════════");
      await runProductsExcelImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        filePath: prodResolved.path,
        dry
      });
    } else if (prodResolved.reason === "missing_env_file") {
      throw new Error(`PRODUCTS_XLSX_PATH berildi, fayl yo‘q: ${prodResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Продукты.xlsx — topilmadi. PRODUCTS_XLSX_PATH yoki Downloads ga qo‘ying."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_PRODUCTS_XLSX=1 — Продукты Excel.");
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

  if (!truthy(process.env.IMPORT_ONCE_NO_PRICE_LIST_XLSX)) {
    const priceResolved = resolvePriceListXlsxPath(cwdBackend);
    if (priceResolved.ok) {
      console.log("\n════════════  QO‘SHIMCHA: prays («Прайст лист» Excel)  ════════════");
      await runPriceListExcelImport({
        prisma,
        tenantId: tenant.id,
        tenantSlug: slug,
        filePath: priceResolved.path,
        dry
      });
    } else if (priceResolved.reason === "missing_env_file") {
      throw new Error(`PRICE_LIST_XLSX_PATH berildi, fayl yo‘q: ${priceResolved.detail}`);
    } else {
      console.log(
        "\n(o‘tkazib yuborildi) Прайст лист.xlsx — topilmadi. PRICE_LIST_XLSX_PATH yoki Downloads ga qo‘ying."
      );
    }
  } else {
    console.log("\n(o‘tkazib yuborildi) IMPORT_ONCE_NO_PRICE_LIST_XLSX=1 — prays Excel.");
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
