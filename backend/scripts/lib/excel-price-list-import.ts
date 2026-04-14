/**
 * «Прайс лист» Excel: SKU, nom, (ixtiyoriy) kategoriya, narx ustunlari (розница / опт / NAQD PUL / …).
 */

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { cellNum, cellStr, colIndex, loadFirstSheet, normHeader, sheetHeaderRow } from "./excel-import-helpers";
import { findInDir } from "./excel-bundle-paths";
import { normalizeWarehouseLabel } from "./warehouse-resolve-import";

export type PriceListExcelOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  filePath: string;
  dry: boolean;
};

function normalizePriceTypeLookupKey(v: string): string {
  return normHeader(v).replace(/[_\s-]+/g, "");
}

function slugPriceType(h: string): string {
  const s = normHeader(h)
    .replace(/[^\wа-яё]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s || "price";
}

/** SKU, nom, qoldiq va boshqa meta ustunlar — narx emas */
function isNonPriceMetaColumn(hn: string): boolean {
  if (!hn) return true;
  const exact = new Set([
    "код",
    "артикул",
    "остаток",
    "остатки",
    "количество",
    "товар ид"
  ]);
  if (exact.has(hn)) return true;
  if (hn.startsWith("название") || hn.startsWith("наименование") || hn.startsWith("номенклатур")) return true;
  if (hn.startsWith("категория") || hn === "группа" || hn.startsWith("группа ")) return true;
  if (hn.startsWith("едини") || hn.startsWith("ед ") || hn === "unit" || hn === "изм") return true;
  if ((hn.includes("штрих") && hn.includes("код")) || hn === "ean" || hn === "gtin") return true;
  if (hn.includes("икпу") && !hn.includes("цена")) return true;
  if (hn.includes("сап код") || hn === "сап") return true;
  if (hn.includes("дата создания") || hn.startsWith("дата ")) return true;
  if (hn.includes("комментарий") || hn.includes("примечание")) return true;
  return false;
}

function detectPriceColumns(headers: string[]): { col0: number; priceType: string }[] {
  const out: { col0: number; priceType: string }[] = [];
  const usedTypes = new Set<string>();
  const usedCols = new Set<number>();

  const tryAdd = (i: number, t: string | null) => {
    if (t == null || t === "" || usedTypes.has(t)) return;
    usedTypes.add(t);
    usedCols.add(i);
    out.push({ col0: i, priceType: t });
  };

  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i] ?? "";
    const hn = normHeader(raw);
    if (!hn) continue;

    let t: string | null = null;
    if (hn.includes("мелк") && hn.includes("опт")) t = "wholesale_small";
    else if ((hn.includes("крупн") || hn.includes("крупный")) && hn.includes("опт")) t = "wholesale_large";
    else if (hn.includes("ррц") || hn === "rrc" || hn.includes("рекомендованная")) t = "rrc";
    else if (hn.includes("дилер") || hn.includes("dealer")) t = "dealer";
    else if (hn.includes("закуп") || hn.includes("закупочн") || hn.includes("purchase")) t = "purchase";
    else if (hn.includes("розниц") || hn.includes("розн") || hn === "retail" || hn.includes("розничная"))
      t = "retail";
    else if (hn.includes("опт") || hn.includes("wholesale") || hn.includes("оптов")) t = "wholesale";
    else if (hn.startsWith("цена") || hn.includes("price") || hn.includes("стоим") || hn.includes("сумма")) {
      t = slugPriceType(raw);
    }

    tryAdd(i, t);
  }

  for (let i = 0; i < headers.length; i++) {
    if (usedCols.has(i)) continue;
    const raw = headers[i] ?? "";
    const hn = normHeader(raw);
    if (!hn) continue;
    if (isNonPriceMetaColumn(hn)) continue;
    tryAdd(i, slugPriceType(raw));
  }

  return out;
}

function truthyEnv(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export type ResolvePriceListXlsxResult =
  | { ok: true; path: string }
  | { ok: false; reason: "missing_env_file" | "not_found"; detail?: string };

export function resolvePriceListXlsxPath(cwdBackend: string): ResolvePriceListXlsxResult {
  const env = (process.env.PRICE_LIST_XLSX_PATH || process.env.IMPORT_EXCEL_PRICE_LIST || "").trim();
  if (env) {
    const abs = path.isAbsolute(env) ? env : path.join(cwdBackend, env);
    if (fs.existsSync(abs)) return { ok: true, path: abs };
    return { ok: false, reason: "missing_env_file", detail: abs };
  }

  const dataDir = path.join(cwdBackend, "scripts", "data");
  const candidates = [
    path.join(dataDir, "Прайст лист.xlsx"),
    path.join(dataDir, "Прайст лист (1).xlsx"),
    path.join(dataDir, "Прайст лист (2).xlsx"),
    path.join(dataDir, "price-list.xlsx")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return { ok: true, path: p };
  }

  const downloads =
    process.platform === "win32" && process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "Downloads")
      : null;
  if (downloads) {
    const found = findInDir(downloads, ["прайст лист", "прайст", "прайс", "price list", "pricelist"]);
    if (found) return { ok: true, path: found };
  }

  return { ok: false, reason: "not_found" };
}

export async function runPriceListExcelImport(opts: PriceListExcelOptions): Promise<void> {
  const { prisma, tenantId, tenantSlug, filePath, dry } = opts;
  const quietDry = dry && truthyEnv(process.env.IMPORT_EXCEL_QUIET_DRY);
  const ws = await loadFirstSheet(filePath);
  const headers = sheetHeaderRow(ws);

  const h = {
    sku: colIndex(headers, [
      "sku",
      "артикул",
      "код товара",
      "код номенклатуры",
      "код"
    ]),
    name: colIndex(headers, [
      "наименование",
      "название товар",
      "название",
      "названия",
      "товар",
      "name",
      "продукт",
      "номенклатура"
    ]),
    category: colIndex(headers, ["категория", "category", "группа", "тип", "вид"]),
    unit: colIndex(headers, ["ед", "unit", "единица", "единицы измерения", "изм", "бирлик"]),
    barcode: colIndex(headers, ["штрих-код", "штрихкод", "barcode", "ean", "gtin"])
  };

  if (h.sku < 0) {
    throw new Error(
      `Excel price (${filePath}): SKU/артикул ustuni yo‘q. Sarlavhalar: ${headers.join(" | ")}`
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const references =
    tenant?.settings && typeof tenant.settings === "object"
      ? (tenant.settings as Record<string, unknown>).references
      : null;
  const priceTypeEntries = Array.isArray(
    references && typeof references === "object"
      ? (references as Record<string, unknown>).price_type_entries
      : null
  )
    ? ((references as Record<string, unknown>).price_type_entries as unknown[])
    : [];
  const canonicalPriceTypeByNorm = new Map<string, string>();
  for (const item of priceTypeEntries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (row.active === false) continue;
    const code = typeof row.code === "string" ? row.code.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const canonical = code || name;
    if (!canonical) continue;
    if (name) canonicalPriceTypeByNorm.set(normalizePriceTypeLookupKey(name), canonical);
    if (code) canonicalPriceTypeByNorm.set(normalizePriceTypeLookupKey(code), canonical);
  }

  const priceColsDetected = detectPriceColumns(headers);
  const priceCols: { col0: number; priceType: string }[] = [];
  const seenTypes = new Set<string>();
  for (const p of priceColsDetected) {
    const rawHeader = headers[p.col0] ?? "";
    const canonical =
      canonicalPriceTypeByNorm.get(normalizePriceTypeLookupKey(rawHeader)) ??
      canonicalPriceTypeByNorm.get(normalizePriceTypeLookupKey(p.priceType)) ??
      p.priceType;
    if (seenTypes.has(canonical)) continue;
    seenTypes.add(canonical);
    priceCols.push({ col0: p.col0, priceType: canonical });
  }
  if (priceCols.length === 0) {
    throw new Error(
      `Excel price (${filePath}): narx ustunlari topilmadi (розница/опт/цена/price). Sarlavhalar: ${headers.join(" | ")}`
    );
  }

  console.log(
    `\n── Excel prays — ${tenantSlug}, narx ustunlari: ${priceCols.map((p) => p.priceType).join(", ")}, dry=${dry}${quietDry ? " (quiet)" : ""} ──`
  );

  const catRows = await prisma.productCategory.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, name: true }
  });
  const catByNorm = new Map<string, number>();
  for (const c of catRows) {
    const k = normalizeWarehouseLabel(c.name);
    if (!catByNorm.has(k)) catByNorm.set(k, c.id);
  }

  let n = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const sku = cellStr(ws, r, h.sku);
    if (!sku) continue;
    const name =
      h.name >= 0 ? cellStr(ws, r, h.name) || sku : sku;
    const unit = h.unit >= 0 ? cellStr(ws, r, h.unit) || "dona" : "dona";
    const catName = h.category >= 0 ? cellStr(ws, r, h.category) || null : null;
    const barcodeRaw = h.barcode >= 0 ? cellStr(ws, r, h.barcode).trim() : "";
    const barcode = barcodeRaw || null;

    let category_id: number | null = null;
    if (catName) {
      const trimmed = catName.trim();
      category_id = catByNorm.get(normalizeWarehouseLabel(trimmed)) ?? null;
      if (category_id == null) {
        const cat = await prisma.productCategory.findFirst({
          where: { tenant_id: tenantId, name: { equals: trimmed, mode: "insensitive" } }
        });
        category_id = cat?.id ?? null;
      }
      if (category_id == null) console.warn(`! kategoriya topilmadi «${catName}» — SKU ${sku}`);
    }

    if (dry) {
      n++;
      if (!quietDry) console.log(`[dry] ${sku}`);
      continue;
    }

    const product = await prisma.product.upsert({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } },
      create: {
        tenant_id: tenantId,
        sku,
        name: name.trim(),
        unit: unit.trim().slice(0, 32) || "dona",
        category_id,
        barcode,
        is_active: true
      },
      update: {
        name: name.trim(),
        unit: unit.trim().slice(0, 32) || "dona",
        ...(category_id != null ? { category_id } : {}),
        ...(barcode ? { barcode } : {})
      }
    });

    for (const pc of priceCols) {
      const val = cellNum(ws, r, pc.col0);
      if (val == null || val < 0) continue;
      await prisma.productPrice.upsert({
        where: {
          tenant_id_product_id_price_type: {
            tenant_id: tenantId,
            product_id: product.id,
            price_type: pc.priceType
          }
        },
        create: {
          tenant_id: tenantId,
          product_id: product.id,
          price_type: pc.priceType,
          price: new Prisma.Decimal(val)
        },
        update: { price: new Prisma.Decimal(val) }
      });
    }
    console.log(`• ${sku}`);
    n++;
  }

  console.log(`Jami: ${n} mahsulot qatori.`);
}
