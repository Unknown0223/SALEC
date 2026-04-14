/**
 * «Продукты» Excel: kategoriya, nom, birlik, kod (SKU), shtrix-kod va boshqa katalog maydonlari.
 */

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { cellNum, cellStr, colIndex, loadFirstSheet, sheetHeaderRow } from "./excel-import-helpers";
import { findInDir } from "./excel-bundle-paths";
import { normalizeWarehouseLabel } from "./warehouse-resolve-import";

export type ProductsExcelOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  filePath: string;
  dry: boolean;
};

export type ResolveProductsXlsxResult =
  | { ok: true; path: string }
  | { ok: false; reason: "missing_env_file" | "not_found"; detail?: string };

export function resolveProductsXlsxPath(cwdBackend: string): ResolveProductsXlsxResult {
  const env = (process.env.PRODUCTS_XLSX_PATH || "").trim();
  if (env) {
    const abs = path.isAbsolute(env) ? env : path.join(cwdBackend, env);
    if (fs.existsSync(abs)) return { ok: true, path: abs };
    return { ok: false, reason: "missing_env_file", detail: abs };
  }

  const dataDir = path.join(cwdBackend, "scripts", "data");
  const candidates = [
    path.join(dataDir, "Продукты.xlsx"),
    path.join(dataDir, "Продукты (1).xlsx"),
    path.join(dataDir, "products.xlsx")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return { ok: true, path: p };
  }

  const downloads =
    process.platform === "win32" && process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "Downloads")
      : null;
  if (downloads) {
    const found = findInDir(downloads, ["продукты", "продукт", "products"]);
    if (found) return { ok: true, path: found };
  }

  return { ok: false, reason: "not_found" };
}

async function ensureCategoryByName(
  prisma: PrismaClient,
  tenantId: number,
  name: string,
  dry: boolean
): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = normalizeWarehouseLabel(trimmed);
  const rows = await prisma.productCategory.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, name: true }
  });
  for (const c of rows) {
    if (normalizeWarehouseLabel(c.name) === key) return c.id;
  }
  const found = await prisma.productCategory.findFirst({
    where: { tenant_id: tenantId, name: { equals: trimmed, mode: "insensitive" } }
  });
  if (found) return found.id;
  if (dry) return -1;
  const created = await prisma.productCategory.create({
    data: { tenant_id: tenantId, name: trimmed, is_active: true }
  });
  return created.id;
}

async function ensureNamedEntity(
  prisma: PrismaClient,
  tenantId: number,
  name: string | null,
  dry: boolean,
  kind: "brand" | "segment" | "group"
): Promise<number | null> {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  if (dry) return -1;

  if (kind === "brand") {
    let r = await prisma.productBrand.findFirst({
      where: { tenant_id: tenantId, name: { equals: trimmed, mode: "insensitive" } }
    });
    if (!r) r = await prisma.productBrand.create({ data: { tenant_id: tenantId, name: trimmed, is_active: true } });
    return r.id;
  }
  if (kind === "segment") {
    let r = await prisma.productSegment.findFirst({
      where: { tenant_id: tenantId, name: { equals: trimmed, mode: "insensitive" } }
    });
    if (!r) r = await prisma.productSegment.create({ data: { tenant_id: tenantId, name: trimmed, is_active: true } });
    return r.id;
  }
  let r = await prisma.productCatalogGroup.findFirst({
    where: { tenant_id: tenantId, name: { equals: trimmed, mode: "insensitive" } }
  });
  if (!r) r = await prisma.productCatalogGroup.create({ data: { tenant_id: tenantId, name: trimmed, is_active: true } });
  return r.id;
}

export async function runProductsExcelImport(opts: ProductsExcelOptions): Promise<void> {
  const { prisma, tenantId, tenantSlug, filePath, dry } = opts;
  const ws = await loadFirstSheet(filePath);
  const headers = sheetHeaderRow(ws);

  const h = {
    category: colIndex(headers, ["категория", "category", "группа", "тип"]),
    name: colIndex(headers, ["названия", "наименование", "название", "name", "товар", "номенклатура"]),
    unit: colIndex(headers, ["единицы измерения", "единица", "ед", "unit", "бирлик"]),
    sku: colIndex(headers, ["sku", "артикул", "код товара", "код номенклатуры", "код"]),
    barcode: colIndex(headers, ["штрих", "barcode", "ean", "gtin", "шк"]),
    sort: colIndex(headers, ["сортировка", "порядок", "sort", "№"]),
    comment: colIndex(headers, ["комментарий", "comment", "примечание", "изоҳ"]),
    ikpu: colIndex(headers, ["икпу код", "икпу", "ikpu"]),
    hs: colIndex(headers, ["тн вэд", "тнвэд", "hs code", "hs_code"]),
    sellCode: colIndex(headers, ["сап код", "сап", "sell code"]),
    weight: colIndex(headers, ["вес", "weight", "огирлик"]),
    volume: colIndex(headers, ["объем", "volume", "hajm"]),
    brand: colIndex(headers, ["бранд", "бренд", "brand"]),
    segment: colIndex(headers, ["сегменты", "сегмент", "segment"]),
    productGroup: colIndex(headers, ["группа товаров", "группа продук", "product group"])
  };

  if (h.sku < 0) {
    throw new Error(
      `Excel products (${filePath}): SKU/kod ustuni yo‘q. Sarlavhalar: ${headers.join(" | ")}`
    );
  }
  if (h.name < 0) {
    throw new Error(
      `Excel products (${filePath}): nom ustuni yo‘q. Sarlavhalar: ${headers.join(" | ")}`
    );
  }

  console.log(`\n── Excel mahsulotlar (Продукты) — ${tenantSlug}, dry=${dry} ──`);

  let n = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const sku = cellStr(ws, r, h.sku);
    if (!sku) continue;
    const name = cellStr(ws, r, h.name) || sku;
    const unitRaw = h.unit >= 0 ? cellStr(ws, r, h.unit) : "";
    const unit = (unitRaw.trim().slice(0, 32) || "dona").trim();
    const catName = h.category >= 0 ? cellStr(ws, r, h.category).trim() : "";
    const barcodeRaw = h.barcode >= 0 ? cellStr(ws, r, h.barcode).trim() : "";
    const barcode = barcodeRaw || null;
    const sort = h.sort >= 0 ? cellNum(ws, r, h.sort) : null;
    const comment = h.comment >= 0 ? cellStr(ws, r, h.comment).trim() : "";
    const ikpu = h.ikpu >= 0 ? cellStr(ws, r, h.ikpu).trim().slice(0, 64) : "";
    const hs = h.hs >= 0 ? cellStr(ws, r, h.hs).trim().slice(0, 32) : "";
    const sellCode = h.sellCode >= 0 ? cellStr(ws, r, h.sellCode).trim().slice(0, 64) : "";
    const w = h.weight >= 0 ? cellNum(ws, r, h.weight) : null;
    const vol = h.volume >= 0 ? cellNum(ws, r, h.volume) : null;
    const brandName = h.brand >= 0 ? cellStr(ws, r, h.brand).trim() : "";
    const segmentName = h.segment >= 0 ? cellStr(ws, r, h.segment).trim() : "";
    const groupName = h.productGroup >= 0 ? cellStr(ws, r, h.productGroup).trim() : "";

    let category_id: number | null = null;
    if (catName) {
      const cid = await ensureCategoryByName(prisma, tenantId, catName, dry);
      category_id = cid != null && cid < 0 ? null : cid;
    }

    const brand_id = await ensureNamedEntity(prisma, tenantId, brandName || null, dry, "brand");
    const segment_id = await ensureNamedEntity(prisma, tenantId, segmentName || null, dry, "segment");
    const product_group_id = await ensureNamedEntity(prisma, tenantId, groupName || null, dry, "group");

    if (dry) {
      console.log(`[dry] ${sku} ${name.slice(0, 48)}`);
      n++;
      continue;
    }

    await prisma.product.upsert({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } },
      create: {
        tenant_id: tenantId,
        sku,
        name: name.trim(),
        unit,
        category_id,
        barcode,
        sort_order: sort != null ? Math.round(sort) : null,
        comment: comment || null,
        ikpu_code: ikpu || null,
        hs_code: hs || null,
        sell_code: sellCode || null,
        weight_kg: w != null ? new Prisma.Decimal(w) : null,
        volume_m3: vol != null ? new Prisma.Decimal(vol) : null,
        brand_id: brand_id != null && brand_id > 0 ? brand_id : null,
        segment_id: segment_id != null && segment_id > 0 ? segment_id : null,
        product_group_id: product_group_id != null && product_group_id > 0 ? product_group_id : null,
        is_active: true
      },
      update: {
        name: name.trim(),
        unit,
        ...(category_id != null ? { category_id } : {}),
        ...(barcode ? { barcode } : {}),
        ...(sort != null ? { sort_order: Math.round(sort) } : {}),
        ...(comment !== undefined ? { comment: comment || null } : {}),
        ...(ikpu !== undefined ? { ikpu_code: ikpu || null } : {}),
        ...(hs !== undefined ? { hs_code: hs || null } : {}),
        ...(sellCode !== undefined ? { sell_code: sellCode || null } : {}),
        ...(w != null ? { weight_kg: new Prisma.Decimal(w) } : {}),
        ...(vol != null ? { volume_m3: new Prisma.Decimal(vol) } : {}),
        ...(brand_id != null && brand_id > 0 ? { brand_id } : {}),
        ...(segment_id != null && segment_id > 0 ? { segment_id } : {}),
        ...(product_group_id != null && product_group_id > 0 ? { product_group_id } : {})
      }
    });
    console.log(`• ${sku}`);
    n++;
  }

  console.log(`Jami: ${n} mahsulot qatori (${filePath}).`);
}
