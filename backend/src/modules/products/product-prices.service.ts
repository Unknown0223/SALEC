import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

const DEFAULT_PRICE_TYPE = "retail";

export type PriceRow = {
  id: number;
  price_type: string;
  price: string;
  currency: string;
};

export async function getProductPrice(
  tenantId: number,
  productId: number,
  priceType: string = DEFAULT_PRICE_TYPE
): Promise<string | null> {
  const row = await prisma.productPrice.findUnique({
    where: {
      tenant_id_product_id_price_type: {
        tenant_id: tenantId,
        product_id: productId,
        price_type: priceType
      }
    }
  });
  return row ? row.price.toString() : null;
}

export async function listProductPrices(tenantId: number, productId: number): Promise<PriceRow[]> {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenant_id: tenantId }
  });
  if (!product) {
    throw new Error("NOT_FOUND");
  }
  const rows = await prisma.productPrice.findMany({
    where: { tenant_id: tenantId, product_id: productId },
    orderBy: [{ price_type: "asc" }]
  });
  return rows.map((r) => ({
    id: r.id,
    price_type: r.price_type,
    price: r.price.toString(),
    currency: r.currency
  }));
}

export type PriceInputItem = { price_type: string; price: number };

export async function syncProductPrices(
  tenantId: number,
  productId: number,
  items: PriceInputItem[],
  actorUserId: number | null = null
): Promise<PriceRow[]> {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenant_id: tenantId }
  });
  if (!product) {
    throw new Error("NOT_FOUND");
  }
  for (const it of items) {
    const t = it.price_type.trim();
    if (!t || it.price < 0 || !Number.isFinite(it.price)) {
      throw new Error("VALIDATION");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productPrice.deleteMany({
      where: { tenant_id: tenantId, product_id: productId }
    });
    if (items.length === 0) return;
    await tx.productPrice.createMany({
      data: items.map((it) => ({
        tenant_id: tenantId,
        product_id: productId,
        price_type: it.price_type.trim(),
        price: new Prisma.Decimal(it.price)
      }))
    });
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product_price,
    entityId: productId,
    action: "sync",
    payload: {
      item_count: items.length,
      types: items.map((i) => i.price_type.trim())
    }
  });

  return listProductPrices(tenantId, productId);
}

function priceImportHeaderToKey(h: string): string | null {
  const n = h.trim().toLowerCase().replace(/\s+/g, "_");
  if (n === "sku" || n === "kod" || n.includes("артикул") || n === "artikul") return "sku";
  if (n === "price_type" || n === "tur" || n.includes("narx_turi")) return "price_type";
  if (n === "price" || n === "narxi" || n.includes("narx") || n === "summa") return "price";
  return null;
}

export async function importProductPricesFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array,
  actorUserId: number | null = null
): Promise<{ upserted: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { upserted: 0, errors: ["Varaq topilmadi"] };
  }

  const headerRow = sheet.getRow(1);
  const colIndexByKey: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const v = cell.text?.trim();
    if (!v) return;
    const key = priceImportHeaderToKey(v);
    if (key) colIndexByKey[key] = colNumber;
  });

  if (!colIndexByKey.sku || !colIndexByKey.price) {
    return {
      upserted: 0,
      errors: ["Birinchi qatorda majburiy: SKU (kod) va narx (price / narxi). Ixtiyoriy: narx turi (price_type), default retail."]
    };
  }

  let upserted = 0;
  const errors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const sku = String(row.getCell(colIndexByKey.sku).text ?? "").trim();
    const priceRaw = colIndexByKey.price ? row.getCell(colIndexByKey.price).value : null;
    const priceNum =
      typeof priceRaw === "number"
        ? priceRaw
        : Number.parseFloat(String(priceRaw ?? "").replace(/\s/g, "").replace(",", "."));
    const typeCell = colIndexByKey.price_type ? row.getCell(colIndexByKey.price_type).text : "";
    const price_type = String(typeCell ?? "").trim() || DEFAULT_PRICE_TYPE;

    if (!sku && !priceRaw) continue;
    if (!sku) {
      errors.push(`Qator ${r}: SKU bo‘sh`);
      continue;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.push(`Qator ${r}: narx noto‘g‘ri`);
      continue;
    }

    try {
      const product = await prisma.product.findUnique({
        where: { tenant_id_sku: { tenant_id: tenantId, sku } }
      });
      if (!product) {
        errors.push(`Qator ${r}: SKU topilmadi (${sku})`);
        continue;
      }
      await prisma.productPrice.upsert({
        where: {
          tenant_id_product_id_price_type: {
            tenant_id: tenantId,
            product_id: product.id,
            price_type
          }
        },
        create: {
          tenant_id: tenantId,
          product_id: product.id,
          price_type,
          price: new Prisma.Decimal(priceNum)
        },
        update: { price: new Prisma.Decimal(priceNum) }
      });
      upserted += 1;
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  if (upserted > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.product_price,
      entityId: "bulk",
      action: "import.xlsx",
      payload: { upserted, error_count: errors.length }
    });
  }

  return { upserted, errors };
}
