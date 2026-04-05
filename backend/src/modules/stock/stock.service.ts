import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

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

export type LowStockRow = {
  product_id: number;
  sku: string;
  name: string;
  available_qty: string;
};

/** `sales` maqsadli omborlar bo‘yicha jami mavjud qoldiq < threshold */
export async function listLowStockForTenant(tenantId: number, threshold: number): Promise<LowStockRow[]> {
  const t = threshold > 0 ? threshold : 10;
  const whIds = await prisma.warehouse.findMany({
    where: { tenant_id: tenantId, is_active: true, stock_purpose: "sales" },
    select: { id: true }
  });
  const ids = whIds.map((w) => w.id);
  if (ids.length === 0) return [];

  const stocks = await prisma.stock.findMany({
    where: { tenant_id: tenantId, warehouse_id: { in: ids } },
    include: { product: { select: { sku: true, name: true, is_active: true } } }
  });

  const agg = new Map<number, { sku: string; name: string; av: Prisma.Decimal }>();
  for (const s of stocks) {
    if (!s.product.is_active) continue;
    const av = s.qty.sub(s.reserved_qty);
    const cur = agg.get(s.product_id);
    if (!cur) {
      agg.set(s.product_id, { sku: s.product.sku, name: s.product.name, av });
    } else {
      cur.av = cur.av.add(av);
    }
  }

  const out: LowStockRow[] = [];
  const thr = new Prisma.Decimal(t);
  for (const [productId, v] of agg) {
    if (v.av.lt(thr)) {
      out.push({
        product_id: productId,
        sku: v.sku,
        name: v.name,
        available_qty: v.av.toString()
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  return out;
}

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

export const WAREHOUSE_STOCK_PURPOSES = ["sales", "return", "reserve"] as const;
export type WarehouseStockPurpose = (typeof WAREHOUSE_STOCK_PURPOSES)[number];

export type StockBalanceSummaryRow = {
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  reserved_qty: string;
  available_qty: string;
};

export type StockBalanceValuationRow = StockBalanceSummaryRow & {
  amount_actual: string;
  amount_reserved: string;
  amount_available: string;
  currency: string;
};

export type StockBalanceByWhRow = {
  warehouse_id: number;
  warehouse_name: string;
  category_id: number | null;
  category_name: string | null;
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  reserved_qty: string;
  available_qty: string;
};

export type StockBalanceTotals = {
  qty: string;
  reserved_qty: string;
  available_qty: string;
  amount_actual?: string;
  amount_reserved?: string;
  amount_available?: string;
  currency?: string;
};

export type StockBalanceQtyMode = "all" | "positive" | "zero";

type BalanceFilterOpts = {
  purpose: WarehouseStockPurpose;
  warehouse_id?: number | null;
  category_id?: number | null;
  group_id?: number | null;
  active_only: boolean;
  q: string;
  /** Кол-во: все / только с остатком / нулевые */
  qty_mode: StockBalanceQtyMode;
};

type AggRow = {
  product_id: number;
  sku: string;
  name: string;
  qty: Prisma.Decimal;
  reserved: Prisma.Decimal;
  available: Prisma.Decimal;
};

type RawBalanceLine = {
  product_id: number;
  warehouse_id: number;
  qty: Prisma.Decimal;
  reserved_qty: Prisma.Decimal;
  product: {
    sku: string;
    name: string;
    category: { id: number; name: string } | null;
  };
  warehouse: { id: number; name: string };
};

async function fetchWarehouseIdsForBalances(
  tenantId: number,
  opts: BalanceFilterOpts
): Promise<number[]> {
  const whWhere: Prisma.WarehouseWhereInput = {
    tenant_id: tenantId,
    is_active: true,
    stock_purpose: opts.purpose
  };
  if (opts.warehouse_id != null && Number.isFinite(opts.warehouse_id)) {
    whWhere.id = opts.warehouse_id;
  }
  const warehouses = await prisma.warehouse.findMany({
    where: whWhere,
    select: { id: true }
  });
  return warehouses.map((w) => w.id);
}

function buildProductWhere(tenantId: number, opts: BalanceFilterOpts): Prisma.ProductWhereInput {
  const productWhere: Prisma.ProductWhereInput = { tenant_id: tenantId };
  if (opts.active_only) {
    productWhere.is_active = true;
  }
  if (opts.category_id != null && Number.isFinite(opts.category_id)) {
    productWhere.category_id = opts.category_id;
  }
  if (opts.group_id != null && Number.isFinite(opts.group_id)) {
    productWhere.product_group_id = opts.group_id;
  }
  const q = opts.q.trim();
  if (q) {
    productWhere.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } }
    ];
  }
  return productWhere;
}

async function fetchRawBalanceLines(
  tenantId: number,
  opts: BalanceFilterOpts
): Promise<RawBalanceLine[]> {
  const whIds = await fetchWarehouseIdsForBalances(tenantId, opts);
  if (whIds.length === 0) return [];
  const productWhere = buildProductWhere(tenantId, opts);
  const rows = await prisma.stock.findMany({
    where: {
      tenant_id: tenantId,
      warehouse_id: { in: whIds },
      product: productWhere
    },
    select: {
      product_id: true,
      warehouse_id: true,
      qty: true,
      reserved_qty: true,
      product: {
        select: {
          sku: true,
          name: true,
          category: { select: { id: true, name: true } }
        }
      },
      warehouse: { select: { id: true, name: true } }
    }
  });
  return rows as RawBalanceLine[];
}

function aggregateByProduct(lines: RawBalanceLine[]): AggRow[] {
  const agg = new Map<
    number,
    { sku: string; name: string; qty: Prisma.Decimal; reserved: Prisma.Decimal }
  >();
  for (const s of lines) {
    const cur = agg.get(s.product_id);
    if (!cur) {
      agg.set(s.product_id, {
        sku: s.product.sku,
        name: s.product.name,
        qty: s.qty,
        reserved: s.reserved_qty
      });
    } else {
      cur.qty = cur.qty.plus(s.qty);
      cur.reserved = cur.reserved.plus(s.reserved_qty);
    }
  }
  return [...agg.entries()].map(([product_id, v]) => {
    let available = v.qty.minus(v.reserved);
    if (available.lt(0)) {
      available = new Prisma.Decimal(0);
    }
    return {
      product_id,
      sku: v.sku,
      name: v.name,
      qty: v.qty,
      reserved: v.reserved,
      available
    };
  });
}

function filterAggByQtyMode(rows: AggRow[], mode: StockBalanceQtyMode): AggRow[] {
  if (mode === "positive") return rows.filter((r) => r.qty.gt(0));
  if (mode === "zero") return rows.filter((r) => !r.qty.gt(0));
  return rows;
}

function filterWhByQtyMode(rows: ByWhAgg[], mode: StockBalanceQtyMode): ByWhAgg[] {
  if (mode === "positive") return rows.filter((r) => r.qty.gt(0));
  if (mode === "zero") return rows.filter((r) => !r.qty.gt(0));
  return rows;
}

function sortAggRows(rows: AggRow[], sort: "name_asc" | "name_desc" | "available_desc"): void {
  if (sort === "name_asc") {
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else if (sort === "name_desc") {
    rows.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
  } else {
    rows.sort((a, b) => b.available.comparedTo(a.available) || a.name.localeCompare(b.name));
  }
}

function totalsFromAgg(rows: AggRow[]): StockBalanceTotals {
  let tq = new Prisma.Decimal(0);
  let tr = new Prisma.Decimal(0);
  let ta = new Prisma.Decimal(0);
  for (const r of rows) {
    tq = tq.plus(r.qty);
    tr = tr.plus(r.reserved);
    ta = ta.plus(r.available);
  }
  return {
    qty: tq.toString(),
    reserved_qty: tr.toString(),
    available_qty: ta.toString()
  };
}

type ByWhAgg = {
  warehouse_id: number;
  warehouse_name: string;
  category_id: number | null;
  category_name: string | null;
  product_id: number;
  sku: string;
  name: string;
  qty: Prisma.Decimal;
  reserved: Prisma.Decimal;
  available: Prisma.Decimal;
};

function linesToByWarehouseRows(lines: RawBalanceLine[]): ByWhAgg[] {
  return lines.map((s) => {
    let available = s.qty.minus(s.reserved_qty);
    if (available.lt(0)) {
      available = new Prisma.Decimal(0);
    }
    return {
      warehouse_id: s.warehouse_id,
      warehouse_name: s.warehouse.name,
      category_id: s.product.category?.id ?? null,
      category_name: s.product.category?.name ?? null,
      product_id: s.product_id,
      sku: s.product.sku,
      name: s.product.name,
      qty: s.qty,
      reserved: s.reserved_qty,
      available
    };
  });
}

function sortByWhRows(
  rows: ByWhAgg[],
  sort: "name_asc" | "name_desc" | "available_desc"
): void {
  const cmpWh = (a: ByWhAgg, b: ByWhAgg) =>
    a.warehouse_name.localeCompare(b.warehouse_name, undefined, { sensitivity: "base" });
  const cmpCat = (a: ByWhAgg, b: ByWhAgg) =>
    (a.category_name ?? "").localeCompare(b.category_name ?? "", undefined, { sensitivity: "base" });
  const cmpName = (a: ByWhAgg, b: ByWhAgg) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (sort === "available_desc") {
    rows.sort(
      (a, b) =>
        b.available.comparedTo(a.available) || cmpWh(a, b) || cmpCat(a, b) || cmpName(a, b)
    );
  } else if (sort === "name_desc") {
    rows.sort((a, b) => cmpName(b, a) || cmpWh(a, b) || cmpCat(a, b));
  } else {
    rows.sort((a, b) => cmpWh(a, b) || cmpCat(a, b) || cmpName(a, b));
  }
}

function totalsFromByWh(rows: ByWhAgg[]): StockBalanceTotals {
  let tq = new Prisma.Decimal(0);
  let tr = new Prisma.Decimal(0);
  let ta = new Prisma.Decimal(0);
  for (const r of rows) {
    tq = tq.plus(r.qty);
    tr = tr.plus(r.reserved);
    ta = ta.plus(r.available);
  }
  return {
    qty: tq.toString(),
    reserved_qty: tr.toString(),
    available_qty: ta.toString()
  };
}

export type StockBalancesListResponse =
  | {
      view: "summary";
      data: StockBalanceSummaryRow[];
      totals: StockBalanceTotals;
      total: number;
      page: number;
      limit: number;
    }
  | {
      view: "valuation";
      data: StockBalanceValuationRow[];
      totals: StockBalanceTotals;
      total: number;
      page: number;
      limit: number;
    }
  | {
      view: "by_warehouse";
      data: StockBalanceByWhRow[];
      totals: StockBalanceTotals;
      total: number;
      page: number;
      limit: number;
    };

/**
 * Остатки: summary (по товару), valuation (+ суммы по типу цены), by_warehouse (строка на склад+товар).
 */
export async function listStockBalances(
  tenantId: number,
  opts: BalanceFilterOpts & {
    view: "summary" | "valuation" | "by_warehouse";
    price_type?: string | null;
    sort: "name_asc" | "name_desc" | "available_desc";
    page: number;
    limit: number;
  }
): Promise<StockBalancesListResponse> {
  const lines = await fetchRawBalanceLines(tenantId, opts);
  const { page, limit, view } = opts;

  if (view === "by_warehouse") {
    let whRows = linesToByWarehouseRows(lines);
    whRows = filterWhByQtyMode(whRows, opts.qty_mode);
    sortByWhRows(whRows, opts.sort);
    const totals = totalsFromByWh(whRows);
    const total = whRows.length;
    const skip = (page - 1) * limit;
    const slice = whRows.slice(skip, skip + limit);
    return {
      view: "by_warehouse",
      data: slice.map((r) => ({
        warehouse_id: r.warehouse_id,
        warehouse_name: r.warehouse_name,
        category_id: r.category_id,
        category_name: r.category_name,
        product_id: r.product_id,
        sku: r.sku,
        name: r.name,
        qty: r.qty.toString(),
        reserved_qty: r.reserved.toString(),
        available_qty: r.available.toString()
      })),
      totals,
      total,
      page,
      limit
    };
  }

  let aggRows = aggregateByProduct(lines);
  aggRows = filterAggByQtyMode(aggRows, opts.qty_mode);
  sortAggRows(aggRows, opts.sort);
  const totalsBase = totalsFromAgg(aggRows);
  const total = aggRows.length;
  const skip = (page - 1) * limit;
  const sliceAgg = aggRows.slice(skip, skip + limit);

  if (view === "valuation") {
    const pt = opts.price_type?.trim();
    if (!pt) {
      throw new Error("PRICE_TYPE_REQUIRED");
    }
    const ids = aggRows.map((r) => r.product_id);
    const prices =
      ids.length === 0
        ? []
        : await prisma.productPrice.findMany({
            where: {
              tenant_id: tenantId,
              price_type: pt,
              product_id: { in: ids }
            },
            select: { product_id: true, price: true, currency: true }
          });
    const pm = new Map(prices.map((p) => [p.product_id, p]));
    let currency = "UZS";
    const withAmounts = aggRows.map((r) => {
      const pr = pm.get(r.product_id);
      const price = pr?.price ?? new Prisma.Decimal(0);
      if (pr?.currency) {
        currency = pr.currency;
      }
      return {
        ...r,
        amount_actual: r.qty.mul(price),
        amount_reserved: r.reserved.mul(price),
        amount_available: r.available.mul(price)
      };
    });
    let ta = new Prisma.Decimal(0);
    let trs = new Prisma.Decimal(0);
    let tav = new Prisma.Decimal(0);
    for (const r of withAmounts) {
      ta = ta.plus(r.amount_actual);
      trs = trs.plus(r.amount_reserved);
      tav = tav.plus(r.amount_available);
    }
    const sliceVal = withAmounts.slice(skip, skip + limit);
    return {
      view: "valuation",
      data: sliceVal.map((r) => ({
        product_id: r.product_id,
        sku: r.sku,
        name: r.name,
        qty: r.qty.toString(),
        reserved_qty: r.reserved.toString(),
        available_qty: r.available.toString(),
        amount_actual: r.amount_actual.toFixed(2),
        amount_reserved: r.amount_reserved.toFixed(2),
        amount_available: r.amount_available.toFixed(2),
        currency
      })),
      totals: {
        ...totalsBase,
        amount_actual: ta.toFixed(2),
        amount_reserved: trs.toFixed(2),
        amount_available: tav.toFixed(2),
        currency
      },
      total,
      page,
      limit
    };
  }

  return {
    view: "summary",
    data: sliceAgg.map((r) => ({
      product_id: r.product_id,
      sku: r.sku,
      name: r.name,
      qty: r.qty.toString(),
      reserved_qty: r.reserved.toString(),
      available_qty: r.available.toString()
    })),
    totals: totalsBase,
    total,
    page,
    limit
  };
}

/** @deprecated используйте listStockBalances с view: "summary" */
export async function listStockBalancesSummary(
  tenantId: number,
  opts: {
    purpose: WarehouseStockPurpose;
    warehouse_id?: number | null;
    category_id?: number | null;
    group_id?: number | null;
    active_only: boolean;
    q: string;
    page: number;
    limit: number;
    sort: "name_asc" | "name_desc" | "available_desc";
  }
): Promise<{ data: StockBalanceSummaryRow[]; total: number; page: number; limit: number }> {
  const r = await listStockBalances(tenantId, { ...opts, view: "summary", qty_mode: "all" });
  return { data: r.data, total: r.total, page: r.page, limit: r.limit };
}

const EXPORT_ROW_CAP = 25_000;

export async function buildStockBalancesExportBuffer(
  tenantId: number,
  opts: BalanceFilterOpts & {
    view: "summary" | "valuation" | "by_warehouse";
    price_type?: string | null;
    sort: "name_asc" | "name_desc" | "available_desc";
  }
): Promise<Buffer> {
  const res = await listStockBalances(tenantId, {
    ...opts,
    page: 1,
    limit: EXPORT_ROW_CAP
  });
  if (res.total > EXPORT_ROW_CAP) {
    throw new Error("EXPORT_TOO_LARGE");
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Остатки", { views: [{ state: "frozen", ySplit: 1 }] });

  if (res.view === "by_warehouse") {
    sheet.columns = [
      { header: "Склад", key: "wh", width: 24 },
      { header: "Категория", key: "cat", width: 22 },
      { header: "Товар", key: "name", width: 36 },
      { header: "Код", key: "sku", width: 16 },
      { header: "Факт", key: "qty", width: 14 },
      { header: "Новые заявки", key: "res", width: 16 },
      { header: "Доступно", key: "av", width: 14 }
    ];
    for (const row of res.data) {
      sheet.addRow({
        wh: row.warehouse_name,
        cat: row.category_name ?? "",
        name: row.name,
        sku: row.sku,
        qty: row.qty,
        res: row.reserved_qty,
        av: row.available_qty
      });
    }
  } else if (res.view === "valuation") {
    sheet.columns = [
      { header: "Товар", key: "name", width: 36 },
      { header: "Код", key: "sku", width: 16 },
      { header: "Факт шт", key: "qty", width: 12 },
      { header: "Факт сумма", key: "aq", width: 16 },
      { header: "Новые заявки, шт", key: "rs", width: 14 },
      { header: "Новые заявки, сумма", key: "ars", width: 18 },
      { header: "Доступно шт", key: "av", width: 12 },
      { header: "Доступно сумма", key: "aav", width: 16 },
      { header: "Валюта", key: "cur", width: 10 }
    ];
    for (const row of res.data) {
      const r = row as StockBalanceValuationRow;
      sheet.addRow({
        name: r.name,
        sku: r.sku,
        qty: r.qty,
        aq: r.amount_actual,
        rs: r.reserved_qty,
        ars: r.amount_reserved,
        av: r.available_qty,
        aav: r.amount_available,
        cur: r.currency
      });
    }
  } else {
    sheet.columns = [
      { header: "Товар", key: "name", width: 36 },
      { header: "Код", key: "sku", width: 16 },
      { header: "Фактический остаток", key: "qty", width: 18 },
      { header: "Новые заявки", key: "res", width: 16 },
      { header: "Доступно", key: "av", width: 14 }
    ];
    for (const row of res.data) {
      sheet.addRow({
        name: row.name,
        sku: row.sku,
        qty: row.qty,
        res: row.reserved_qty,
        av: row.available_qty
      });
    }
  }

  const h = sheet.getRow(1);
  h.font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export type StockReceiptInput = {
  warehouse_id: number;
  items: { product_id: number; qty: number }[];
  note?: string | null;
};

/**
 * Prihod: omborga kirim (atomik upsert + increment).
 */
export async function applyStockReceipt(
  tenantId: number,
  input: StockReceiptInput,
  actorUserId: number | null = null,
  options?: { skipAudit?: boolean }
): Promise<void> {
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

  if (!options?.skipAudit) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.stock,
      entityId: input.warehouse_id,
      action: "receipt",
      payload: {
        line_count: input.items.length,
        note: input.note ?? null,
        product_ids: input.items.map((i) => i.product_id)
      }
    });
  }
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

/** Shablon: «Поступление» — №, Код товара, Категория, Продукт, Цена, Количество прихода, Количество в блоке */
export async function buildPostupleniya2StockTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Поступление", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  const headers = [
    "№",
    "Код товара",
    "Категория",
    "Продукт",
    "Цена",
    "Количество прихода",
    "Количество в блоке"
  ];
  const sample = ["1", "SKU-001", "Ichimliklar", "Namuna mahsulot", "12000", "10", "1"];

  const hRow = sheet.getRow(1);
  headers.forEach((text, i) => {
    hRow.getCell(i + 1).value = text;
    hRow.getCell(i + 1).font = { bold: true };
  });
  sample.forEach((text, i) => {
    sheet.getRow(2).getCell(i + 1).value = text;
  });
  sheet.columns = [
    { width: 6 },
    { width: 18 },
    { width: 22 },
    { width: 36 },
    { width: 12 },
    { width: 22 },
    { width: 22 }
  ];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function stockImportHeaderToKey(header: string): string | null {
  const raw = header.trim();
  const t = raw.toLowerCase().replace(/\u00a0/g, " ");
  const n = t.replace(/\s+/g, "_");

  /** «Поступление» / postupleniya-2 (rus) + № ustuni e’tiborsiz */
  if (/^№\.?$/u.test(raw.replace(/\u00a0/g, "").trim())) return null;

  if (t.includes("склад")) return "warehouse";
  if (t.includes("код") && t.includes("товар")) return "sku";
  if (t.includes("категория")) return "category";
  if (t === "продукт" || (t.includes("продукт") && !t.includes("категория"))) return "name";
  if (t === "цена" || (t.startsWith("цена") && !t.includes("приход"))) return "price";
  if (t.includes("количество") && t.includes("приход")) return "receipt_qty";
  if (t.includes("количество") && (t.includes("блок") || t.includes("block"))) return "block_qty";

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
): Promise<{
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
} | null> {
  const sku = skuRaw.trim();
  const bc = barcodeRaw.trim();
  if (sku) {
    let p = await prisma.product.findUnique({
      where: { tenant_id_sku: { tenant_id: tenantId, sku } },
      include: { category: { select: { name: true } } }
    });
    if (!p) {
      p = await prisma.product.findFirst({
        where: { tenant_id: tenantId, sku: { equals: sku, mode: "insensitive" } },
        include: { category: { select: { name: true } } }
      });
    }
    if (p) {
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode,
        categoryName: p.category?.name ?? null
      };
    }
  }
  if (bc) {
    const found = await prisma.product.findFirst({
      where: { tenant_id: tenantId, barcode: bc },
      include: { category: { select: { name: true } } }
    });
    if (found) {
      return {
        id: found.id,
        sku: found.sku,
        name: found.name,
        barcode: found.barcode,
        categoryName: found.category?.name ?? null
      };
    }
  }
  return null;
}

export type StockImportResult = {
  applied: number;
  errors: string[];
  warnings: string[];
};

export type StockImportOptions = {
  /** «Поступление» shablonida «Склад» ustuni bo‘lmasa — barcha qatorlar shu omborga */
  defaultWarehouseId?: number;
};

async function importPostupleniya2StockReceiptFromSheet(
  tenantId: number,
  sheet: ExcelJS.Worksheet,
  colIndexByKey: Record<string, number>,
  defaultWarehouseId: number | undefined,
  actorUserId: number | null
): Promise<StockImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let applied = 0;

  const rq = colIndexByKey.receipt_qty;
  if (rq == null) {
    return { applied: 0, errors: ["«Количество прихода» ustuni topilmadi"], warnings: [] };
  }
  if (!colIndexByKey.sku && !colIndexByKey.barcode) {
    return {
      applied: 0,
      errors: ["«Код товара» yoki SKU / shtrix kod ustuni kerak"],
      warnings: []
    };
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const skuCell = colIndexByKey.sku ? String(row.getCell(colIndexByKey.sku).text ?? "").trim() : "";
    const bcCell = colIndexByKey.barcode
      ? String(row.getCell(colIndexByKey.barcode).text ?? "").trim()
      : "";
    const whCell = colIndexByKey.warehouse
      ? String(row.getCell(colIndexByKey.warehouse).text ?? "").trim()
      : "";
    const nameCell = colIndexByKey.name
      ? String(row.getCell(colIndexByKey.name).text ?? "").trim()
      : "";
    const categoryCell = colIndexByKey.category
      ? String(row.getCell(colIndexByKey.category).text ?? "").trim()
      : "";

    if (!skuCell && !bcCell && !whCell && !nameCell && !categoryCell) continue;

    const receiptQty = parseQtyCell(row.getCell(rq));
    if (receiptQty == null || receiptQty <= 0) {
      errors.push(`Qator ${r}: «Количество прихода» noto‘g‘ri yoki bo‘sh`);
      continue;
    }

    let blockMul = 1;
    if (colIndexByKey.block_qty) {
      const b = parseQtyCell(row.getCell(colIndexByKey.block_qty));
      if (b != null && b > 0) blockMul = b;
    }
    const qty = receiptQty * blockMul;
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`Qator ${r}: umumiy miqdor noto‘g‘ri`);
      continue;
    }

    let whId: number | null = null;
    if (whCell) {
      whId = await resolveWarehouseId(tenantId, whCell);
      if (whId == null) {
        errors.push(`Qator ${r}: ombor topilmadi («${whCell}»)`);
        continue;
      }
    } else if (defaultWarehouseId != null && defaultWarehouseId > 0) {
      const wh = await prisma.warehouse.findFirst({
        where: { id: defaultWarehouseId, tenant_id: tenantId }
      });
      whId = wh?.id ?? null;
      if (whId == null) {
        errors.push(`Qator ${r}: tanlangan ombor (import) topilmadi`);
        continue;
      }
    } else {
      errors.push(
        `Qator ${r}: «Склад» ustunini to‘ldiring yoki importdan oldin omborni tanlang (postupleniya shabloni)`
      );
      continue;
    }

    if (!skuCell && !bcCell) {
      errors.push(`Qator ${r}: «Код товара» / SKU yoki shtrix kod kerak`);
      continue;
    }

    const product = await resolveProductForImport(tenantId, skuCell, bcCell);
    if (!product) {
      errors.push(`Qator ${r}: mahsulot topilmadi (SKU: «${skuCell}», shtrix: «${bcCell}»)`);
      continue;
    }

    if (categoryCell && product.categoryName) {
      if (product.categoryName.trim().toLowerCase() !== categoryCell.trim().toLowerCase()) {
        warnings.push(
          `Qator ${r}: «Категория» bazadagi kategoriya bilan mos emas (${product.sku})`
        );
      }
    }
    if (nameCell && product.name.trim().toLowerCase() !== nameCell.trim().toLowerCase()) {
      warnings.push(
        `Qator ${r}: «Продукт» nomi bazadagi nom bilan mos kelmaydi (${product.sku})`
      );
    }
    if (bcCell && product.barcode && product.barcode.trim() !== bcCell.trim()) {
      warnings.push(`Qator ${r}: shtrix kod bazadagi kod bilan mos emas (${product.sku})`);
    }

    try {
      await applyStockReceipt(
        tenantId,
        {
          warehouse_id: whId,
          items: [{ product_id: product.id, qty }]
        },
        actorUserId,
        { skipAudit: true }
      );
      applied += 1;
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  if (applied > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.stock,
      entityId: "bulk",
      action: "import.xlsx.postupleniya2",
      payload: { applied_rows: applied, error_count: errors.length, warning_count: warnings.length }
    });
  }

  return { applied, errors, warnings };
}

/**
 * Excel orqali omborga kirim:
 * - **Klassik** shablon: ombor, SKU/shtrix, miqdor, …
 * - **Поступление / postupleniya-2**: «Количество прихода», «Количество в блоке», «Код товара», …; ombor qatorda yoki `defaultWarehouseId`
 */
export async function importStockReceiptFromXlsx(
  tenantId: number,
  buffer: Buffer | Uint8Array,
  actorUserId: number | null = null,
  options?: StockImportOptions
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

  const isPostupleniya2 = colIndexByKey.receipt_qty != null;
  if (isPostupleniya2) {
    return importPostupleniya2StockReceiptFromSheet(
      tenantId,
      sheet,
      colIndexByKey,
      options?.defaultWarehouseId,
      actorUserId
    );
  }

  if (!colIndexByKey.warehouse || !colIndexByKey.qty) {
    return {
      applied: 0,
      errors: [
        "Birinchi qatorda majburiy ustunlar: Ombor (ID yoki nomi), Miqdor; SKU yoki Shtrix kod ustuni kerak. Yoki «Поступление» shabloni: «Количество прихода», «Код товара»."
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
      await applyStockReceipt(
        tenantId,
        {
          warehouse_id: whId,
          items: [{ product_id: product.id, qty }]
        },
        actorUserId,
        { skipAudit: true }
      );
      applied += 1;
    } catch (e) {
      errors.push(`Qator ${r}: ${e instanceof Error ? e.message : "xato"}`);
    }
  }

  if (applied > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.stock,
      entityId: "bulk",
      action: "import.xlsx",
      payload: { applied_rows: applied, error_count: errors.length, warning_count: warnings.length }
    });
  }

  return { applied, errors, warnings };
}
