import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

export const productListInclude = {
  category: { select: { id: true, name: true } },
  product_group: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  manufacturer: { select: { id: true, name: true } },
  segment: { select: { id: true, name: true } }
} as const;

function decOpt(v: number | string | null | undefined): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(String(n));
}

async function assertProductCatalogFks(
  tenantId: number,
  input: {
    category_id?: number | null;
    product_group_id?: number | null;
    brand_id?: number | null;
    manufacturer_id?: number | null;
    segment_id?: number | null;
  }
) {
  if (input.category_id != null) {
    const cat = await prisma.productCategory.findFirst({
      where: { id: input.category_id, tenant_id: tenantId }
    });
    if (!cat) throw new Error("BAD_CATEGORY");
  }
  if (input.product_group_id != null) {
    const x = await prisma.productCatalogGroup.findFirst({
      where: { id: input.product_group_id, tenant_id: tenantId }
    });
    if (!x) throw new Error("BAD_REF");
  }
  if (input.brand_id != null) {
    const x = await prisma.productBrand.findFirst({ where: { id: input.brand_id, tenant_id: tenantId } });
    if (!x) throw new Error("BAD_REF");
  }
  if (input.manufacturer_id != null) {
    const x = await prisma.productManufacturer.findFirst({
      where: { id: input.manufacturer_id, tenant_id: tenantId }
    });
    if (!x) throw new Error("BAD_REF");
  }
  if (input.segment_id != null) {
    const x = await prisma.productSegment.findFirst({ where: { id: input.segment_id, tenant_id: tenantId } });
    if (!x) throw new Error("BAD_REF");
  }
}

export type CreateProductInput = {
  sku: string;
  name: string;
  unit?: string;
  barcode?: string | null;
  category_id?: number | null;
  is_active?: boolean;
  product_group_id?: number | null;
  brand_id?: number | null;
  manufacturer_id?: number | null;
  segment_id?: number | null;
  weight_kg?: number | string | null;
  volume_m3?: number | string | null;
  qty_per_block?: number | null;
  dimension_unit?: string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
  length_cm?: number | string | null;
  ikpu_code?: string | null;
  hs_code?: string | null;
  sell_code?: string | null;
  comment?: string | null;
  sort_order?: number | null;
  is_blocked?: boolean;
};

export async function createProduct(
  tenantId: number,
  input: CreateProductInput,
  actorUserId: number | null = null
) {
  const sku = input.sku.trim();
  const name = input.name.trim();
  if (!sku || !name) {
    throw new Error("VALIDATION");
  }
  if (input.category_id == null || input.category_id < 1) {
    throw new Error("BAD_CATEGORY");
  }
  const exists = await prisma.product.findUnique({
    where: { tenant_id_sku: { tenant_id: tenantId, sku } }
  });
  if (exists) {
    const err = new Error("SKU_EXISTS");
    throw err;
  }
  await assertProductCatalogFks(tenantId, {
    category_id: input.category_id ?? null,
    product_group_id: input.product_group_id ?? null,
    brand_id: input.brand_id ?? null,
    manufacturer_id: input.manufacturer_id ?? null,
    segment_id: input.segment_id ?? null
  });

  const data: Prisma.ProductUncheckedCreateInput = {
    tenant_id: tenantId,
    sku,
    name,
    unit: (input.unit ?? "dona").trim() || "dona",
    barcode: input.barcode?.trim() || null,
    category_id: input.category_id ?? null,
    is_active: input.is_active ?? true,
    product_group_id: input.product_group_id ?? null,
    brand_id: input.brand_id ?? null,
    manufacturer_id: input.manufacturer_id ?? null,
    segment_id: input.segment_id ?? null,
    weight_kg: decOpt(input.weight_kg) ?? null,
    volume_m3: decOpt(input.volume_m3) ?? null,
    qty_per_block: input.qty_per_block ?? null,
    dimension_unit: input.dimension_unit?.trim().slice(0, 8) || null,
    width_cm: decOpt(input.width_cm) ?? null,
    height_cm: decOpt(input.height_cm) ?? null,
    length_cm: decOpt(input.length_cm) ?? null,
    ikpu_code: input.ikpu_code?.trim().slice(0, 64) || null,
    hs_code: input.hs_code?.trim().slice(0, 32) || null,
    sell_code: input.sell_code?.trim().slice(0, 64) || null,
    comment: input.comment?.trim() || null,
    sort_order: input.sort_order ?? null,
    is_blocked: input.is_blocked ?? false
  };

  await prisma.product.create({ data });
  const row = await prisma.product.findFirstOrThrow({
    where: { tenant_id: tenantId, sku },
    include: productListInclude
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product,
    entityId: row.id,
    action: "create",
    payload: row
  });
  return row;
}

export type UpdateProductInput = {
  sku?: string;
  name?: string;
  unit?: string;
  barcode?: string | null;
  category_id?: number | null;
  is_active?: boolean;
  product_group_id?: number | null;
  brand_id?: number | null;
  manufacturer_id?: number | null;
  segment_id?: number | null;
  weight_kg?: number | string | null;
  volume_m3?: number | string | null;
  qty_per_block?: number | null;
  dimension_unit?: string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
  length_cm?: number | string | null;
  ikpu_code?: string | null;
  hs_code?: string | null;
  sell_code?: string | null;
  comment?: string | null;
  sort_order?: number | null;
  is_blocked?: boolean;
};

export async function updateProduct(
  tenantId: number,
  productId: number,
  input: UpdateProductInput,
  actorUserId: number | null = null
) {
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
  await assertProductCatalogFks(tenantId, {
    category_id:
      input.category_id !== undefined ? input.category_id : existing.category_id,
    product_group_id:
      input.product_group_id !== undefined ? input.product_group_id : existing.product_group_id,
    brand_id: input.brand_id !== undefined ? input.brand_id : existing.brand_id,
    manufacturer_id:
      input.manufacturer_id !== undefined ? input.manufacturer_id : existing.manufacturer_id,
    segment_id: input.segment_id !== undefined ? input.segment_id : existing.segment_id
  });

  const data: Prisma.ProductUncheckedUpdateInput = {};
  if (input.sku !== undefined) data.sku = input.sku.trim();
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.unit !== undefined) data.unit = input.unit.trim() || "dona";
  if (input.barcode !== undefined) data.barcode = input.barcode?.trim() || null;
  if (input.category_id !== undefined) data.category_id = input.category_id;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.product_group_id !== undefined) data.product_group_id = input.product_group_id;
  if (input.brand_id !== undefined) data.brand_id = input.brand_id;
  if (input.manufacturer_id !== undefined) data.manufacturer_id = input.manufacturer_id;
  if (input.segment_id !== undefined) data.segment_id = input.segment_id;
  if (input.weight_kg !== undefined) data.weight_kg = decOpt(input.weight_kg) ?? null;
  if (input.volume_m3 !== undefined) data.volume_m3 = decOpt(input.volume_m3) ?? null;
  if (input.qty_per_block !== undefined) data.qty_per_block = input.qty_per_block;
  if (input.dimension_unit !== undefined) {
    data.dimension_unit = input.dimension_unit?.trim().slice(0, 8) || null;
  }
  if (input.width_cm !== undefined) data.width_cm = decOpt(input.width_cm) ?? null;
  if (input.height_cm !== undefined) data.height_cm = decOpt(input.height_cm) ?? null;
  if (input.length_cm !== undefined) data.length_cm = decOpt(input.length_cm) ?? null;
  if (input.ikpu_code !== undefined) data.ikpu_code = input.ikpu_code?.trim().slice(0, 64) || null;
  if (input.hs_code !== undefined) data.hs_code = input.hs_code?.trim().slice(0, 32) || null;
  if (input.sell_code !== undefined) data.sell_code = input.sell_code?.trim().slice(0, 64) || null;
  if (input.comment !== undefined) data.comment = input.comment?.trim() || null;
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.is_blocked !== undefined) data.is_blocked = input.is_blocked;

  await prisma.product.update({
    where: { id: productId },
    data
  });
  const row = await prisma.product.findFirstOrThrow({
    where: { id: productId, tenant_id: tenantId },
    include: productListInclude
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product,
    entityId: productId,
    action: "update",
    payload: data
  });
  return row;
}

/** Ma’lumotlar bazasidan qator o‘chirilmaydi — faqat `is_active: false` (neaktiv). */
export async function softDeleteProduct(
  tenantId: number,
  productId: number,
  actorUserId: number | null = null
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  const row = await prisma.product.update({
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
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product,
    entityId: productId,
    action: "soft_delete",
    payload: { sku: row.sku, is_active: false }
  });
  return row;
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

/** Shablon ustunlari (rasmdagi import) — yulduzcha sarlavhada, majburiy ustunlar tekshiriladi */
const CATALOG_IMPORT_TEMPLATE_HEADERS = [
  "Название *",
  "Код",
  "Категория(код) *",
  "Единица измерения(код) *",
  "Группа(код)",
  "Сегмент(код)",
  "Штрих код",
  "ТНВЭД код",
  "Бренд(код)",
  "Сортировка",
  "Вес(кг)",
  "Количество в блоке",
  "Длина(м)",
  "Ширина(м)",
  "Толщина(м)"
] as const;

export async function buildProductCatalogImportTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.addRow([...CATALOG_IMPORT_TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F4F2" }
  };
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

type TemplateCol =
  | "name"
  | "code"
  | "categoryCode"
  | "unitCode"
  | "groupCode"
  | "segmentCode"
  | "barcode"
  | "hsCode"
  | "brandCode"
  | "sortOrder"
  | "weightKg"
  | "qtyBlock"
  | "lengthM"
  | "widthM"
  | "thicknessM";

function normalizeTemplateHeader(raw: string): string {
  return raw
    .replace(/\*/g, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function headerToTemplateCol(raw: string): TemplateCol | null {
  const h = normalizeTemplateHeader(raw);
  if (!h) return null;
  if (h.includes("название")) return "name";
  if (h.includes("категория")) return "categoryCode";
  if (h.includes("единица") && h.includes("измер")) return "unitCode";
  if (h.includes("группа") && h.includes("код")) return "groupCode";
  if (h.includes("сегмент")) return "segmentCode";
  if (h.includes("штрих") || h.replace(/\s/g, "").includes("штрихкод")) return "barcode";
  if (h.includes("тнвэд") || h.includes("тн вэд")) return "hsCode";
  if (h.includes("бренд")) return "brandCode";
  if (h.includes("сортировка")) return "sortOrder";
  if (h.includes("вес")) return "weightKg";
  if (h.includes("количество") && h.includes("блок")) return "qtyBlock";
  if (h.includes("длина")) return "lengthM";
  if (h.includes("ширина")) return "widthM";
  if (h.includes("толщина")) return "thicknessM";
  if (h === "код") return "code";
  return null;
}

function cellText(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return "";
  const c = row.getCell(col);
  const t = c.text?.trim();
  if (t) return t;
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "object" && v !== null && "text" in (v as object)) {
    return String((v as { text: string }).text ?? "").trim();
  }
  return String(v).trim();
}

function parseNumLoose(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".").trim();
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

async function resolveCategoryIdByCode(tenantId: number, code: string): Promise<number | null> {
  const t = code.trim();
  if (!t) return null;
  const row = await prisma.productCategory.findFirst({
    where: {
      tenant_id: tenantId,
      code: { equals: t, mode: "insensitive" }
    }
  });
  return row?.id ?? null;
}

async function resolveCatalogGroupIdByCode(tenantId: number, code: string): Promise<number | null> {
  const t = code.trim();
  if (!t) return null;
  const row = await prisma.productCatalogGroup.findFirst({
    where: { tenant_id: tenantId, code: { equals: t, mode: "insensitive" } }
  });
  return row?.id ?? null;
}

async function resolveSegmentIdByCode(tenantId: number, code: string): Promise<number | null> {
  const t = code.trim();
  if (!t) return null;
  const row = await prisma.productSegment.findFirst({
    where: { tenant_id: tenantId, code: { equals: t, mode: "insensitive" } }
  });
  return row?.id ?? null;
}

async function resolveBrandIdByCode(tenantId: number, code: string): Promise<number | null> {
  const t = code.trim();
  if (!t) return null;
  const row = await prisma.productBrand.findFirst({
    where: { tenant_id: tenantId, code: { equals: t, mode: "insensitive" } }
  });
  return row?.id ?? null;
}

async function allocateUniqueSku(tenantId: number, base: string): Promise<string> {
  let s = base.slice(0, 80);
  let n = 0;
  while (
    await prisma.product.findUnique({
      where: { tenant_id_sku: { tenant_id: tenantId, sku: s } }
    })
  ) {
    n += 1;
    s = `${base.slice(0, 60)}_${n}`.slice(0, 80);
  }
  return s;
}

export async function importProductsFromCatalogTemplateXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array,
  actorUserId: number | null = null
): Promise<{ created: number; updated: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { created: 0, updated: 0, errors: ["Varaq topilmadi"] };
  }

  const headerRow = sheet.getRow(1);
  const colByField: Partial<Record<TemplateCol, number>> = {};
  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.text ?? "").trim();
    if (!raw) return;
    const key = headerToTemplateCol(raw);
    if (key) colByField[key] = colNumber;
  });

  if (!colByField.name || !colByField.categoryCode || !colByField.unitCode) {
    return {
      created: 0,
      updated: 0,
      errors: [
        "Шаблон: нужны колонки «Название», «Категория(код)», «Единица измерения(код)». Скачайте шаблон с сервера."
      ]
    };
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = cellText(row, colByField.name);
    if (!name) continue;

    const categoryCode = cellText(row, colByField.categoryCode);
    const unitCode = cellText(row, colByField.unitCode);
    if (!categoryCode) {
      errors.push(`Qator ${r}: «Категория(код)» majburiy`);
      continue;
    }
    if (!unitCode) {
      errors.push(`Qator ${r}: «Единица измерения(код)» majburiy`);
      continue;
    }

    const categoryId = await resolveCategoryIdByCode(tenantId, categoryCode);
    if (categoryId == null) {
      errors.push(`Qator ${r}: kategoriya kodi topilmadi: «${categoryCode}»`);
      continue;
    }

    let codeVal = colByField.code ? cellText(row, colByField.code) : "";
    let sku = codeVal.trim();
    if (!sku) {
      sku = await allocateUniqueSku(tenantId, `IMP-${tenantId}-${r}-${Date.now().toString(36)}`);
    }

    const barcode = colByField.barcode ? cellText(row, colByField.barcode) || null : null;
    const hsRaw = colByField.hsCode ? cellText(row, colByField.hsCode) : "";
    const hs_code = hsRaw.trim().slice(0, 32) || null;

    let product_group_id: number | null = null;
    if (colByField.groupCode) {
      const g = cellText(row, colByField.groupCode);
      if (g) {
        product_group_id = await resolveCatalogGroupIdByCode(tenantId, g);
        if (product_group_id == null) {
          errors.push(`Qator ${r}: «Группа(код)» topilmadi: «${g}»`);
          continue;
        }
      }
    }

    let segment_id: number | null = null;
    if (colByField.segmentCode) {
      const s = cellText(row, colByField.segmentCode);
      if (s) {
        segment_id = await resolveSegmentIdByCode(tenantId, s);
        if (segment_id == null) {
          errors.push(`Qator ${r}: «Сегмент(код)» topilmadi: «${s}»`);
          continue;
        }
      }
    }

    let brand_id: number | null = null;
    if (colByField.brandCode) {
      const b = cellText(row, colByField.brandCode);
      if (b) {
        brand_id = await resolveBrandIdByCode(tenantId, b);
        if (brand_id == null) {
          errors.push(`Qator ${r}: «Бренд(код)» topilmadi: «${b}»`);
          continue;
        }
      }
    }

    let sort_order: number | null = null;
    if (colByField.sortOrder) {
      const so = parseNumLoose(cellText(row, colByField.sortOrder));
      if (so != null) sort_order = Math.round(so);
    }

    const weight_kg =
      colByField.weightKg && cellText(row, colByField.weightKg)
        ? cellText(row, colByField.weightKg)
        : null;
    let qty_per_block: number | null = null;
    if (colByField.qtyBlock) {
      const q = parseNumLoose(cellText(row, colByField.qtyBlock));
      if (q != null) qty_per_block = Math.round(q);
    }

    const L =
      colByField.lengthM != null ? parseNumLoose(cellText(row, colByField.lengthM)) : null;
    const W =
      colByField.widthM != null ? parseNumLoose(cellText(row, colByField.widthM)) : null;
    const T =
      colByField.thicknessM != null ? parseNumLoose(cellText(row, colByField.thicknessM)) : null;

    let length_cm: string | null = null;
    let width_cm: string | null = null;
    let height_cm: string | null = null;
    let dimension_unit: string | null = null;
    if (L != null && L > 0) length_cm = String(L * 100);
    if (W != null && W > 0) width_cm = String(W * 100);
    if (T != null && T > 0) height_cm = String(T * 100);
    if (L != null || W != null || T != null) dimension_unit = "m";

    let volume_m3: string | null = null;
    if (L != null && W != null && T != null && L > 0 && W > 0 && T > 0) {
      volume_m3 = String(L * W * T);
    }

    const input: CreateProductInput = {
      sku,
      name,
      unit: unitCode.trim(),
      barcode,
      category_id: categoryId,
      is_active: true,
      product_group_id,
      brand_id,
      segment_id,
      hs_code,
      sort_order,
      weight_kg,
      qty_per_block,
      length_cm,
      width_cm,
      height_cm,
      dimension_unit,
      volume_m3
    };

    try {
      const existing = await prisma.product.findUnique({
        where: { tenant_id_sku: { tenant_id: tenantId, sku } }
      });
      if (existing) {
        await updateProduct(
          tenantId,
          existing.id,
          {
            name: input.name,
            unit: input.unit,
            barcode: input.barcode,
            category_id: input.category_id,
            product_group_id: input.product_group_id,
            brand_id: input.brand_id,
            segment_id: input.segment_id,
            hs_code: input.hs_code,
            sort_order: input.sort_order,
            weight_kg: input.weight_kg,
            qty_per_block: input.qty_per_block,
            length_cm: input.length_cm,
            width_cm: input.width_cm,
            height_cm: input.height_cm,
            dimension_unit: input.dimension_unit,
            volume_m3: input.volume_m3
          },
          actorUserId
        );
        updated += 1;
      } else {
        await createProduct(tenantId, input, actorUserId);
        created += 1;
      }
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  if (created > 0 || updated > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.product,
      entityId: "bulk",
      action: "import.catalog_xlsx",
      payload: { created, updated, error_count: errors.length }
    });
  }

  return { created, updated, errors };
}

/** Joriy katalogni shablon ustunlari tartibida eksport (yangilash uchun) */
export async function exportTenantCatalogProductsXlsx(tenantId: number): Promise<Buffer> {
  const products = await prisma.product.findMany({
    where: { tenant_id: tenantId },
    include: {
      category: { select: { code: true } },
      product_group: { select: { code: true } },
      brand: { select: { code: true } },
      segment: { select: { code: true } }
    },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.addRow([...CATALOG_IMPORT_TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F4F2" }
  };

  for (const p of products) {
    const L =
      p.length_cm != null && p.length_cm.gt(0)
        ? Number(p.length_cm.toString()) / 100
        : "";
    const W =
      p.width_cm != null && p.width_cm.gt(0) ? Number(p.width_cm.toString()) / 100 : "";
    const T =
      p.height_cm != null && p.height_cm.gt(0) ? Number(p.height_cm.toString()) / 100 : "";
    sheet.addRow([
      p.name,
      p.sku,
      p.category?.code ?? "",
      p.unit,
      p.product_group?.code ?? "",
      p.segment?.code ?? "",
      p.barcode ?? "",
      p.hs_code ?? "",
      p.brand?.code ?? "",
      p.sort_order ?? "",
      p.weight_kg != null ? p.weight_kg.toString() : "",
      p.qty_per_block ?? "",
      L === "" ? "" : L,
      W === "" ? "" : W,
      T === "" ? "" : T
    ]);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function decEq(a: Prisma.Decimal | null | undefined, b: string | null | undefined): boolean {
  const sa = a == null ? "" : a.toString();
  const sb = b == null || b === "" ? "" : String(b);
  if (sa === sb) return true;
  const na = Number.parseFloat(sa.replace(",", "."));
  const nb = Number.parseFloat(sb.replace(",", "."));
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
}

function intEq(a: number | null | undefined, b: number | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Fayldagi qatorlar bo‘yicha faqat mavjud mahsulotlarni yangilaydi.
 * Faylda yo‘q qoldirilgan mahsulotlarga tegmaydi. SKU bazada yo‘q bo‘lsa — o‘tkazib yuboradi (yangi yaratmaydi).
 */
export async function importProductsCatalogUpdateOnlyXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array,
  actorUserId: number | null = null
): Promise<{
  updated: number;
  skipped_empty: number;
  skipped_unknown_sku: number;
  skipped_no_change: number;
  errors: string[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      updated: 0,
      skipped_empty: 0,
      skipped_unknown_sku: 0,
      skipped_no_change: 0,
      errors: ["Varaq topilmadi"]
    };
  }

  const headerRow = sheet.getRow(1);
  const colByField: Partial<Record<TemplateCol, number>> = {};
  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.text ?? "").trim();
    if (!raw) return;
    const key = headerToTemplateCol(raw);
    if (key) colByField[key] = colNumber;
  });

  if (!colByField.code) {
    return {
      updated: 0,
      skipped_empty: 0,
      skipped_unknown_sku: 0,
      skipped_no_change: 0,
      errors: ["«Код» (SKU) ustuni majburiy — eksport faylidan foydalaning."]
    };
  }
  if (!colByField.name || !colByField.categoryCode || !colByField.unitCode) {
    return {
      updated: 0,
      skipped_empty: 0,
      skipped_unknown_sku: 0,
      skipped_no_change: 0,
      errors: [
        "Нужны колонки: Название, Категория(код), Единица измерения(код), Код — как в шаблоне/экспорте."
      ]
    };
  }

  let updated = 0;
  let skipped_empty = 0;
  let skipped_unknown_sku = 0;
  let skipped_no_change = 0;
  const errors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const sku = cellText(row, colByField.code).trim();
    if (!sku) {
      const nameProbe = cellText(row, colByField.name).trim();
      if (!nameProbe) {
        skipped_empty += 1;
        continue;
      }
      skipped_empty += 1;
      continue;
    }

    const existing = await prisma.product.findUnique({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } }
    });
    if (!existing) {
      skipped_unknown_sku += 1;
      continue;
    }

    let name = cellText(row, colByField.name).trim();
    if (!name) name = existing.name;

    let unit = cellText(row, colByField.unitCode).trim();
    if (!unit) unit = existing.unit;

    let category_id = existing.category_id;
    const catCell = cellText(row, colByField.categoryCode).trim();
    if (catCell) {
      const cid = await resolveCategoryIdByCode(tenantId, catCell);
      if (cid == null) {
        errors.push(`Qator ${r}: kategoriya kodi «${catCell}» topilmadi`);
        continue;
      }
      category_id = cid;
    }

    let product_group_id: number | null = existing.product_group_id;
    if (colByField.groupCode !== undefined) {
      const g = cellText(row, colByField.groupCode).trim();
      if (!g) {
        product_group_id = null;
      } else {
        const gid = await resolveCatalogGroupIdByCode(tenantId, g);
        if (gid == null) {
          errors.push(`Qator ${r}: «Группа(код)» «${g}» topilmadi`);
          continue;
        }
        product_group_id = gid;
      }
    }

    let segment_id: number | null = existing.segment_id;
    if (colByField.segmentCode !== undefined) {
      const s = cellText(row, colByField.segmentCode).trim();
      if (!s) {
        segment_id = null;
      } else {
        const sid = await resolveSegmentIdByCode(tenantId, s);
        if (sid == null) {
          errors.push(`Qator ${r}: «Сегмент(код)» «${s}» topilmadi`);
          continue;
        }
        segment_id = sid;
      }
    }

    let brand_id: number | null = existing.brand_id;
    if (colByField.brandCode !== undefined) {
      const b = cellText(row, colByField.brandCode).trim();
      if (!b) {
        brand_id = null;
      } else {
        const bid = await resolveBrandIdByCode(tenantId, b);
        if (bid == null) {
          errors.push(`Qator ${r}: «Бренд(код)» «${b}» topilmadi`);
          continue;
        }
        brand_id = bid;
      }
    }

    let barcode: string | null = existing.barcode;
    if (colByField.barcode !== undefined) {
      const bc = cellText(row, colByField.barcode).trim();
      barcode = bc === "" ? null : bc;
    }

    let hs_code: string | null = existing.hs_code;
    if (colByField.hsCode !== undefined) {
      const hs = cellText(row, colByField.hsCode).trim();
      hs_code = hs === "" ? null : hs.slice(0, 32);
    }

    let sort_order: number | null = existing.sort_order;
    if (colByField.sortOrder !== undefined) {
      const raw = cellText(row, colByField.sortOrder).trim();
      if (raw === "") {
        sort_order = null;
      } else {
        const so = parseNumLoose(raw);
        sort_order = so != null ? Math.round(so) : null;
      }
    }

    let weight_kg: string | null =
      existing.weight_kg != null ? existing.weight_kg.toString() : null;
    if (colByField.weightKg !== undefined) {
      const w = cellText(row, colByField.weightKg).trim();
      weight_kg = w === "" ? null : w;
    }

    let qty_per_block: number | null = existing.qty_per_block;
    if (colByField.qtyBlock !== undefined) {
      const raw = cellText(row, colByField.qtyBlock).trim();
      if (raw === "") {
        qty_per_block = null;
      } else {
        const q = parseNumLoose(raw);
        qty_per_block = q != null ? Math.round(q) : null;
      }
    }

    let length_cm: string | null =
      existing.length_cm != null ? existing.length_cm.toString() : null;
    let width_cm: string | null =
      existing.width_cm != null ? existing.width_cm.toString() : null;
    let height_cm: string | null =
      existing.height_cm != null ? existing.height_cm.toString() : null;
    let dimension_unit: string | null = existing.dimension_unit;
    let volume_m3: string | null =
      existing.volume_m3 != null ? existing.volume_m3.toString() : null;

    const hasDimCols =
      colByField.lengthM !== undefined ||
      colByField.widthM !== undefined ||
      colByField.thicknessM !== undefined;
    if (hasDimCols) {
      const L = colByField.lengthM ? parseNumLoose(cellText(row, colByField.lengthM)) : null;
      const W = colByField.widthM ? parseNumLoose(cellText(row, colByField.widthM)) : null;
      const T = colByField.thicknessM ? parseNumLoose(cellText(row, colByField.thicknessM)) : null;
      const any =
        (colByField.lengthM && cellText(row, colByField.lengthM).trim() !== "") ||
        (colByField.widthM && cellText(row, colByField.widthM).trim() !== "") ||
        (colByField.thicknessM && cellText(row, colByField.thicknessM).trim() !== "");
      if (!any) {
        length_cm = null;
        width_cm = null;
        height_cm = null;
        dimension_unit = null;
        volume_m3 = null;
      } else {
        length_cm = L != null && L > 0 ? String(L * 100) : null;
        width_cm = W != null && W > 0 ? String(W * 100) : null;
        height_cm = T != null && T > 0 ? String(T * 100) : null;
        dimension_unit = "m";
        if (L != null && W != null && T != null && L > 0 && W > 0 && T > 0) {
          volume_m3 = String(L * W * T);
        } else {
          volume_m3 = null;
        }
      }
    }

    const sameName = existing.name === name;
    const sameUnit = existing.unit === unit;
    const sameCat = existing.category_id === category_id;
    const sameGroup = existing.product_group_id === product_group_id;
    const sameSeg = existing.segment_id === segment_id;
    const sameBrand = existing.brand_id === brand_id;
    const sameBarcode = (existing.barcode ?? "") === (barcode ?? "");
    const sameHs = (existing.hs_code ?? "") === (hs_code ?? "");
    const sameSort = intEq(existing.sort_order, sort_order);
    const sameW = decEq(existing.weight_kg, weight_kg);
    const sameQty = intEq(existing.qty_per_block, qty_per_block);
    const sameLen = decEq(existing.length_cm, length_cm);
    const sameWid = decEq(existing.width_cm, width_cm);
    const sameHt = decEq(existing.height_cm, height_cm);
    const sameDimU = (existing.dimension_unit ?? "") === (dimension_unit ?? "");
    const sameVol = decEq(existing.volume_m3, volume_m3);

    if (
      sameName &&
      sameUnit &&
      sameCat &&
      sameGroup &&
      sameSeg &&
      sameBrand &&
      sameBarcode &&
      sameHs &&
      sameSort &&
      sameW &&
      sameQty &&
      sameLen &&
      sameWid &&
      sameHt &&
      sameDimU &&
      sameVol
    ) {
      skipped_no_change += 1;
      continue;
    }

    try {
      await updateProduct(
        tenantId,
        existing.id,
        {
          name,
          unit,
          category_id,
          product_group_id,
          segment_id,
          brand_id,
          barcode,
          hs_code,
          sort_order,
          weight_kg,
          qty_per_block,
          length_cm,
          width_cm,
          height_cm,
          dimension_unit,
          volume_m3
        },
        actorUserId
      );
      updated += 1;
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  if (updated > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.product,
      entityId: "bulk",
      action: "import.catalog_update_only",
      payload: {
        updated,
        skipped_empty,
        skipped_unknown_sku,
        skipped_no_change,
        error_count: errors.length
      }
    });
  }

  return {
    updated,
    skipped_empty,
    skipped_unknown_sku,
    skipped_no_change,
    errors
  };
}

export async function createProductsBulk(
  tenantId: number,
  items: CreateProductInput[],
  actorUserId: number | null = null
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  for (let i = 0; i < items.length; i++) {
    try {
      await createProduct(tenantId, items[i], actorUserId);
      created += 1;
    } catch (e) {
      errors.push(
        `${i + 1}-qator: ${e instanceof Error ? e.message : "xato"}`
      );
    }
  }
  if (created > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.product,
      entityId: "bulk",
      action: "create.bulk",
      payload: { created, error_count: errors.length }
    });
  }
  return { created, errors };
}

export async function importProductsFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array,
  actorUserId: number | null = null
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

  if (created > 0 || updated > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.product,
      entityId: "bulk",
      action: "import.xlsx",
      payload: { created, updated, error_count: errors.length }
    });
  }

  return { created, updated, errors };
}
