/**
 * «Прайс лист» Excel: SKU, nom, (ixtiyoriy) kategoriya, narx ustunlari (розница / опт / boshqalar).
 */

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { cellNum, cellStr, colIndex, loadFirstSheet, normHeader, sheetHeaderRow } from "./excel-import-helpers";
import { normalizeWarehouseLabel } from "./warehouse-resolve-import";

export type PriceListExcelOptions = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  filePath: string;
  dry: boolean;
};

function slugPriceType(h: string): string {
  const s = normHeader(h)
    .replace(/[^\wа-яё]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s || "price";
}

function detectPriceColumns(headers: string[]): { col0: number; priceType: string }[] {
  const out: { col0: number; priceType: string }[] = [];
  const used = new Set<string>();

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

    if (t && !used.has(t)) {
      used.add(t);
      out.push({ col0: i, priceType: t });
    }
  }

  return out;
}

function truthyEnv(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
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

  const priceCols = detectPriceColumns(headers);
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
