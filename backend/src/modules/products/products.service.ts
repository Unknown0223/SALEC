import ExcelJS from "exceljs";
import { prisma } from "../../config/database";

export type CreateProductInput = {
  sku: string;
  name: string;
  unit?: string;
  barcode?: string | null;
  category_id?: number | null;
  is_active?: boolean;
};

export async function createProduct(tenantId: number, input: CreateProductInput) {
  const sku = input.sku.trim();
  const name = input.name.trim();
  if (!sku || !name) {
    throw new Error("VALIDATION");
  }
  const exists = await prisma.product.findUnique({
    where: { tenant_id_sku: { tenant_id: tenantId, sku } }
  });
  if (exists) {
    const err = new Error("SKU_EXISTS");
    throw err;
  }
  if (input.category_id != null) {
    const cat = await prisma.productCategory.findFirst({
      where: { id: input.category_id, tenant_id: tenantId }
    });
    if (!cat) {
      throw new Error("BAD_CATEGORY");
    }
  }
  return prisma.product.create({
    data: {
      tenant_id: tenantId,
      sku,
      name,
      unit: (input.unit ?? "dona").trim() || "dona",
      barcode: input.barcode?.trim() || null,
      category_id: input.category_id ?? null,
      is_active: input.is_active ?? true
    },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      barcode: true,
      is_active: true,
      category_id: true
    }
  });
}

export type UpdateProductInput = {
  sku?: string;
  name?: string;
  unit?: string;
  barcode?: string | null;
  category_id?: number | null;
  is_active?: boolean;
};

export async function updateProduct(tenantId: number, productId: number, input: UpdateProductInput) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  if (input.sku !== undefined && input.sku.trim() !== existing.sku) {
    const clash = await prisma.product.findFirst({
      where: { tenant_id: tenantId, sku: input.sku.trim(), NOT: { id: productId } }
    });
    if (clash) {
      throw new Error("SKU_EXISTS");
    }
  }
  if (input.category_id !== undefined && input.category_id != null) {
    const cat = await prisma.productCategory.findFirst({
      where: { id: input.category_id, tenant_id: tenantId }
    });
    if (!cat) {
      throw new Error("BAD_CATEGORY");
    }
  }

  const data: Record<string, unknown> = {};
  if (input.sku !== undefined) data.sku = input.sku.trim();
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.unit !== undefined) data.unit = input.unit.trim() || "dona";
  if (input.barcode !== undefined) data.barcode = input.barcode?.trim() || null;
  if (input.category_id !== undefined) data.category_id = input.category_id;
  if (input.is_active !== undefined) data.is_active = input.is_active;

  return prisma.product.update({
    where: { id: productId },
    data,
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      barcode: true,
      is_active: true,
      category_id: true
    }
  });
}

export async function softDeleteProduct(tenantId: number, productId: number) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  return prisma.product.update({
    where: { id: productId },
    data: { is_active: false },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      barcode: true,
      is_active: true,
      category_id: true
    }
  });
}

/** Ustun nomlarini ichki kalitga map qilish */
function headerToKey(h: string): string | null {
  const n = h.trim().toLowerCase().replace(/\s+/g, "_");
  if (n === "sku" || n === "kod" || n.includes("артикул") || n === "artikul") return "sku";
  if (n === "name" || n === "nom" || n === "nomi" || n === "title" || n.includes("mahsulot")) return "name";
  if (n === "unit" || n === "birlik") return "unit";
  if (n.includes("barcode") || n.includes("shtrix") || n.includes("штрих")) return "barcode";
  return null;
}

export async function importProductsFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array
): Promise<{ created: number; updated: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuf = Buffer.from(buffer);
  await workbook.xlsx.load(nodeBuf as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { created: 0, updated: 0, errors: ["Varaq topilmadi"] };
  }

  const headerRow = sheet.getRow(1);
  const colIndexByKey: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const v = cell.text?.trim();
    if (!v) return;
    const key = headerToKey(v);
    if (key) colIndexByKey[key] = colNumber;
  });

  if (!colIndexByKey.sku || !colIndexByKey.name) {
    return {
      created: 0,
      updated: 0,
      errors: ["Birinchi qatorda majburiy ustunlar: SKU (yoki kod) va name (yoki nomi)"]
    };
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const sku = String(row.getCell(colIndexByKey.sku).text ?? "").trim();
    const name = String(row.getCell(colIndexByKey.name).text ?? "").trim();
    if (!sku && !name) continue;
    if (!sku || !name) {
      errors.push(`Qator ${r}: SKU va nom bo‘sh bo‘lmasligi kerak`);
      continue;
    }
    const unitCell = colIndexByKey.unit ? row.getCell(colIndexByKey.unit).text : "";
    const unit = String(unitCell ?? "").trim() || "dona";
    const barcodeCell = colIndexByKey.barcode ? row.getCell(colIndexByKey.barcode).text : "";
    const barcode = String(barcodeCell ?? "").trim() || null;

    try {
      const existing = await prisma.product.findUnique({
        where: { tenant_id_sku: { tenant_id: tenantId, sku } }
      });
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { name, unit, barcode }
        });
        updated += 1;
      } else {
        await prisma.product.create({
          data: {
            tenant_id: tenantId,
            sku,
            name,
            unit,
            barcode,
            is_active: true
          }
        });
        created += 1;
      }
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  return { created, updated, errors };
}
