import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export type StockRow = {
  id: number;
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  sku: string;
  product_name: string;
  qty: string;
  reserved_qty: string;
};

export async function listStockForTenant(
  tenantId: number,
  warehouseId?: number | null
): Promise<StockRow[]> {
  const rows = await prisma.stock.findMany({
    where: {
      tenant_id: tenantId,
      ...(warehouseId != null ? { warehouse_id: warehouseId } : {})
    },
    include: {
      product: { select: { sku: true, name: true } },
      warehouse: { select: { name: true } }
    },
    orderBy: [{ warehouse_id: "asc" }, { product_id: "asc" }]
  });

  return rows.map((r) => ({
    id: r.id,
    warehouse_id: r.warehouse_id,
    warehouse_name: r.warehouse.name,
    product_id: r.product_id,
    sku: r.product.sku,
    product_name: r.product.name,
    qty: r.qty.toString(),
    reserved_qty: r.reserved_qty.toString()
  }));
}

export type StockReceiptInput = {
  warehouse_id: number;
  items: { product_id: number; qty: number }[];
  note?: string | null;
};

/**
 * Prihod: omborga kirim (atomik upsert + increment).
 */
export async function applyStockReceipt(tenantId: number, input: StockReceiptInput): Promise<void> {
  const wh = await prisma.warehouse.findFirst({
    where: { id: input.warehouse_id, tenant_id: tenantId }
  });
  if (!wh) {
    throw new Error("BAD_WAREHOUSE");
  }
  if (!input.items.length) {
    throw new Error("EMPTY_ITEMS");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of input.items) {
      if (!Number.isFinite(line.qty) || line.qty <= 0) {
        throw new Error("BAD_QTY");
      }
      const p = await tx.product.findFirst({
        where: { id: line.product_id, tenant_id: tenantId }
      });
      if (!p) {
        throw new Error("BAD_PRODUCT");
      }
      const delta = new Prisma.Decimal(line.qty);
      await tx.stock.upsert({
        where: {
          tenant_id_warehouse_id_product_id: {
            tenant_id: tenantId,
            warehouse_id: input.warehouse_id,
            product_id: line.product_id
          }
        },
        create: {
          tenant_id: tenantId,
          warehouse_id: input.warehouse_id,
          product_id: line.product_id,
          qty: delta
        },
        update: {
          qty: { increment: delta }
        }
      });
    }
  });
}

/** Shablon: birinchi qator — sarlavhalar, ikkinchi — namuna */
export async function buildStockImportTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Kirim", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  const headers = [
    "Ombor (ID yoki nomi)",
    "Tovar smart kodi (SKU)",
    "Shtrix kod (barcode, ixtiyoriy)",
    "Tovar nomi (ixtiyoriy, tekshiruv)",
    "Miqdor",
    "Qo'shilish sanasi (ixtiyoriy)"
  ];
  const sample = [
    "1 yoki Asosiy ombor",
    "SKU-001",
    "",
    "Namuna mahsulot",
    "10",
    "2026-03-30"
  ];

  const hRow = sheet.getRow(1);
  headers.forEach((text, i) => {
    hRow.getCell(i + 1).value = text;
    hRow.getCell(i + 1).font = { bold: true };
  });
  sample.forEach((text, i) => {
    sheet.getRow(2).getCell(i + 1).value = text;
  });
  sheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 24 },
    { width: 28 },
    { width: 12 },
    { width: 26 }
  ];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function stockImportHeaderToKey(header: string): string | null {
  const t = header.trim().toLowerCase();
  const n = t.replace(/\s+/g, "_");
  if (n.includes("ombor") || n.includes("sklad") || n === "warehouse") return "warehouse";
  if ((n.includes("smart") && n.includes("kod")) || n.includes("tovar_smart")) return "sku";
  if (n === "sku" || n.includes("artikul")) return "sku";
  if (n.includes("shtrix") || n.includes("barcode") || n.includes("штрих")) return "barcode";
  if (n.includes("tovar") && n.includes("nom")) return "name";
  if (n === "nomi" || n === "name" || (n.includes("mahsulot") && n.includes("nom"))) return "name";
  if (n.includes("miqdor") || n === "qty" || n === "soni" || n === "kol") return "qty";
  if (n.includes("sana") || n.includes("qoshilish") || n.includes("qo_shilish") || n.includes("sanasi")) {
    return "date";
  }
  if (n === "kod" && !n.includes("shtrix") && !n.includes("smart")) return "sku";
  return null;
}

function parseQtyCell(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Excel sana raqami yoki matn */
function parseDateCellForWarn(cell: ExcelJS.Cell): { iso: string | null; raw: string } {
  const v = cell.value;
  if (v == null || v === "") return { iso: null, raw: "" };
  if (v instanceof Date) {
    return { iso: v.toISOString().slice(0, 10), raw: v.toISOString().slice(0, 10) };
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const utc = new Date((v - 25569) * 86400 * 1000);
    if (!Number.isNaN(utc.getTime())) {
      return { iso: utc.toISOString().slice(0, 10), raw: String(v) };
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return { iso: s.slice(0, 10), raw: s };
  }
  const d = Date.parse(s);
  if (!Number.isNaN(d)) {
    return { iso: new Date(d).toISOString().slice(0, 10), raw: s };
  }
  return { iso: null, raw: s };
}

async function resolveWarehouseId(tenantId: number, raw: string): Promise<number | null> {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const id = Number.parseInt(s, 10);
    const wh = await prisma.warehouse.findFirst({ where: { id, tenant_id: tenantId } });
    return wh ? id : null;
  }
  const wh = await prisma.warehouse.findFirst({
    where: {
      tenant_id: tenantId,
      name: { equals: s, mode: "insensitive" }
    }
  });
  if (wh) return wh.id;
  const list = await prisma.warehouse.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, name: true }
  });
  const lower = s.toLowerCase();
  const hit = list.find((w) => w.name.trim().toLowerCase() === lower);
  return hit?.id ?? null;
}

async function resolveProductForImport(
  tenantId: number,
  skuRaw: string,
  barcodeRaw: string
): Promise<{ id: number; sku: string; name: string; barcode: string | null } | null> {
  const sku = skuRaw.trim();
  const bc = barcodeRaw.trim();
  if (sku) {
    let p = await prisma.product.findUnique({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } }
    });
    if (!p) {
      p = await prisma.product.findFirst({
        where: { tenant_id: tenantId, sku: { equals: sku, mode: "insensitive" } }
      });
    }
    if (p) return { id: p.id, sku: p.sku, name: p.name, barcode: p.barcode };
  }
  if (bc) {
    const found = await prisma.product.findFirst({
      where: { tenant_id: tenantId, barcode: bc }
    });
    if (found) return { id: found.id, sku: found.sku, name: found.name, barcode: found.barcode };
  }
  return null;
}

export type StockImportResult = {
  applied: number;
  errors: string[];
  warnings: string[];
};

/**
 * Excel orqali omborga kirim: tovar **smart kodi (SKU)** yoki **shtrix kod** bo‘yicha moslashadi, ostatkaga qo‘shiladi.
 */
export async function importStockReceiptFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array
): Promise<StockImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { applied: 0, errors: ["Varaq topilmadi"], warnings: [] };
  }

  const headerRow = sheet.getRow(1);
  const colIndexByKey: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const v = cell.text?.trim();
    if (!v) return;
    const key = stockImportHeaderToKey(v);
    if (key) colIndexByKey[key] = colNumber;
  });

  if (!colIndexByKey.warehouse || !colIndexByKey.qty) {
    return {
      applied: 0,
      errors: [
        "Birinchi qatorda majburiy ustunlar: Ombor (ID yoki nomi), Miqdor; SKU yoki Shtrix kod ustuni kerak"
      ],
      warnings: []
    };
  }
  if (!colIndexByKey.sku && !colIndexByKey.barcode) {
    return {
      applied: 0,
      errors: ["«Tovar smart kodi (SKU)» yoki «Shtrix kod» ustunlaridan kamida bittasi bo‘lishi kerak"],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let applied = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const whCell = row.getCell(colIndexByKey.warehouse).text?.trim() ?? "";
    const skuCell = colIndexByKey.sku ? String(row.getCell(colIndexByKey.sku).text ?? "").trim() : "";
    const bcCell = colIndexByKey.barcode
      ? String(row.getCell(colIndexByKey.barcode).text ?? "").trim()
      : "";
    const nameCell = colIndexByKey.name
      ? String(row.getCell(colIndexByKey.name).text ?? "").trim()
      : "";
    const qtyCell = row.getCell(colIndexByKey.qty);
    const dateCell = colIndexByKey.date ? row.getCell(colIndexByKey.date) : null;

    if (!whCell && !skuCell && !bcCell) continue;

    const qty = parseQtyCell(qtyCell);
    if (qty == null || qty <= 0) {
      errors.push(`Qator ${r}: miqdor noto‘g‘ri yoki bo‘sh`);
      continue;
    }

    const whId = await resolveWarehouseId(tenantId, whCell);
    if (whId == null) {
      errors.push(`Qator ${r}: ombor topilmadi («${whCell}»)`);
      continue;
    }

    if (!skuCell && !bcCell) {
      errors.push(`Qator ${r}: SKU yoki shtrix kod kerak`);
      continue;
    }

    const product = await resolveProductForImport(tenantId, skuCell, bcCell);
    if (!product) {
      errors.push(`Qator ${r}: mahsulot topilmadi (SKU: «${skuCell}», shtrix: «${bcCell}»)`);
      continue;
    }

    if (nameCell) {
      if (product.name.trim().toLowerCase() !== nameCell.trim().toLowerCase()) {
        warnings.push(
          `Qator ${r}: «Tovar nomi» jadvaldagi nom bilan mos kelmaydi (SKU ${product.sku}, kutilgan tekshiruv)`
        );
      }
    }
    if (bcCell && product.barcode && product.barcode.trim() !== bcCell.trim()) {
      warnings.push(
        `Qator ${r}: shtrix kod ustuni bazadagi kod bilan mos emas (SKU ${product.sku})`
      );
    }

    if (dateCell) {
      const { iso, raw } = parseDateCellForWarn(dateCell);
      if (raw && !iso) {
        warnings.push(`Qator ${r}: sanani o‘qib bo‘lmadi («${raw}»), kirim baribir qo‘llanadi`);
      }
    }

    try {
      await applyStockReceipt(tenantId, {
        warehouse_id: whId,
        items: [{ product_id: product.id, qty }]
      });
      applied += 1;
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  return { applied, errors, warnings };
}
