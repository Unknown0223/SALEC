import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";
import { emitOrderUpdated } from "../../lib/order-event-bus";
import { invalidateDashboard } from "../../lib/redis-cache";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { getProductPrice } from "../products/product-prices.service";
import { canTransitionOrderStatus, normalizeOrderType } from "../orders/order-status";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderItemSummary = {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  qty: string;
  price: string;
  total: string;
  is_bonus: boolean;
  order_id: number;
  order_number: string;
};

export type ClientReturnsData = {
  /** `period` — mijoz+davr (zakazsiz yig‘indi); `order` — bitta zakaz doirasi */
  polki_scope: "period" | "order";
  orders: {
    id: number;
    number: string;
    status: string;
    total_sum: string;
    bonus_sum: string;
    created_at: string;
  }[];
  items: OrderItemSummary[];
  total_orders: number;
  total_returned_qty: string;
  total_paid_value: string;
  already_returned_value: string;
  max_returnable_value: string;
  client_balance: string;
  client_debt: string;
};

/** Jami fizik dona (paid_qty + bonus_qty na sklad) bitta dokumentda; frontend: `return-limits.ts`. */
export const MAX_RETURN_ITEMS = 24;

export type CreatePeriodReturnLine = {
  product_id: number;
  /** Legacy: bitta miqdor, server bonus/paid bo‘lishini hisoblaydi */
  qty?: number;
  /** Aniq: pullik qaytarish dona (ombor) */
  paid_qty?: number;
  /** Aniq: bonus mahsulot dona (ombor) */
  bonus_qty?: number;
  /** Bonus o‘rniga naqd kompensatsiya (balans/kassa, omborga bonus dona qo‘shilmaydi) */
  bonus_cash?: number;
};

export type CreatePeriodReturnInput = {
  warehouse_id?: number;
  client_id: number;
  order_id?: number;
  date_from?: string;
  date_to?: string;
  lines: CreatePeriodReturnLine[];
  note?: string | null;
  refusal_reason_ref?: string | null;
};

/** Bir nechta zakazdan bir vaqtda polki qaytarish (har zakaz uchun alohida sales_return). */
export type CreatePeriodReturnBatchLine = {
  order_id: number;
  product_id: number;
  qty?: number;
  paid_qty?: number;
  bonus_qty?: number;
  bonus_cash?: number;
};

export type CreatePeriodReturnBatchInput = {
  warehouse_id?: number;
  client_id: number;
  lines: CreatePeriodReturnBatchLine[];
  note?: string | null;
  refusal_reason_ref?: string | null;
};

export type PeriodReturnBatchResult = {
  returns: PeriodReturnResult[];
};

export type PeriodReturnResult = {
  id: number;
  number: string;
  refund_amount: string | null;
  lines: {
    product_id: number;
    sku: string;
    name: string;
    qty: string;
    paid_qty: string;
    bonus_qty: string;
    paid_amount: string;
  }[];
  bonus_recalc: {
    original_bonus_qty: number;
    remaining_bonus_qty: number;
    excess_bonus: number;
    total_return_qty: number;
    paid_return_qty: number;
    bonus_return_qty: number;
    refund_amount: string;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDayStart(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function localDayEnd(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
}

function R(v: string | number | Prisma.Decimal): Prisma.Decimal {
  const d = new Prisma.Decimal(v);
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** 3 o‘rinli qty uchun qisqa satr (0 → "0"). */
function formatAdjustedQtyString(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const rounded = Math.round(n * 1000) / 1000;
  if (rounded <= 0) return "0";
  const s = rounded.toFixed(3).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

type ReturnLineQty = {
  product_id: number;
  qty: Prisma.Decimal | string | number;
  paid_qty?: Prisma.Decimal | string | number | null;
  bonus_qty?: Prisma.Decimal | string | number | null;
};

/** Qaytarish qatoridan pullik / bonus miqdorini ajratish (legacy: faqat `qty`). */
function splitReturnLinePaidBonus(ln: ReturnLineQty): { paid: number; bonus: number } {
  const t = Number(ln.qty);
  if (!Number.isFinite(t) || t <= 0) return { paid: 0, bonus: 0 };
  const pRaw = ln.paid_qty != null ? Number(ln.paid_qty) : NaN;
  const bRaw = ln.bonus_qty != null ? Number(ln.bonus_qty) : NaN;
  if (Number.isFinite(pRaw) && Number.isFinite(bRaw)) {
    return { paid: Math.max(0, pRaw), bonus: Math.max(0, bRaw) };
  }
  if (Number.isFinite(pRaw)) {
    const paid = Math.max(0, pRaw);
    return { paid, bonus: Math.max(0, t - paid) };
  }
  if (Number.isFinite(bRaw)) {
    const bonus = Math.max(0, bRaw);
    return { paid: Math.max(0, t - bonus), bonus };
  }
  return { paid: t, bonus: 0 };
}

/**
 * Oldingi posted qaytarishlar: pullik va bonus qatorlari alohida «pool»da.
 * Aks holda bitta mahsulot bo‘yicha bonus qaytarilganda pullik qatorlari ham
 * noto‘g‘ri qisqaradi yoki qoldiq Math.round bilan 0 bo‘lib, jadval bo‘shab qoladi.
 */
function adjustOrderItemsQtyAfterPriorReturns(
  items: OrderItemSummary[],
  returns: Array<{
    order_id: number | null;
    lines: ReturnLineQty[];
  }>
): OrderItemSummary[] {
  const alreadyPaid = new Map<string, number>();
  const alreadyBonus = new Map<string, number>();
  for (const ret of returns) {
    const oid = ret.order_id;
    if (oid == null || oid < 1) continue;
    for (const ln of ret.lines) {
      const k = `${oid}:${ln.product_id}`;
      const { paid, bonus } = splitReturnLinePaidBonus(ln);
      alreadyPaid.set(k, (alreadyPaid.get(k) ?? 0) + paid);
      alreadyBonus.set(k, (alreadyBonus.get(k) ?? 0) + bonus);
    }
  }

  /** Guruh: zakaz + mahsulot + bonus|pullik (order line turi) */
  const byPool = new Map<string, number[]>();
  items.forEach((it, idx) => {
    const pool = it.is_bonus ? "b" : "p";
    const k = `${it.order_id}:${it.product_id}:${pool}`;
    const arr = byPool.get(k) ?? [];
    arr.push(idx);
    byPool.set(k, arr);
  });

  const next = items.map((it) => ({ ...it }));
  for (const indices of byPool.values()) {
    if (indices.length === 0) continue;
    const i0 = indices[0]!;
    const oid = next[i0]!.order_id;
    const pid = next[i0]!.product_id;
    const isBonus = next[i0]!.is_bonus;
    const poolKey = `${oid}:${pid}`;
    const already = isBonus
      ? (alreadyBonus.get(poolKey) ?? 0)
      : (alreadyPaid.get(poolKey) ?? 0);

    let sumOrdered = 0;
    for (const i of indices) sumOrdered += Number(next[i]!.qty);

    const alreadyCapped = Math.min(already, sumOrdered);
    const remaining = Math.max(0, sumOrdered - alreadyCapped);

    if (remaining <= 0 || sumOrdered <= 0) {
      for (const i of indices) next[i] = { ...next[i]!, qty: "0" };
      continue;
    }

    let allocated = 0;
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j]!;
      const q = Number(next[i]!.qty);
      if (j === indices.length - 1) {
        const last = Math.max(0, remaining - allocated);
        next[i] = { ...next[i]!, qty: formatAdjustedQtyString(last) };
      } else {
        const part = (remaining * q) / sumOrdered;
        const rounded = Math.floor(part * 1000) / 1000;
        allocated += rounded;
        next[i] = { ...next[i]!, qty: formatAdjustedQtyString(rounded) };
      }
    }
  }

  return next.filter((it) => Number(it.qty) > 0);
}

// ─── Find return warehouse ───────────────────────────────────────────────────

export async function findReturnWarehouse(tenantId: number): Promise<number> {
  // Prefer stock_purpose='return' warehouse
  const retWh = await prisma.warehouse.findFirst({
    where: { tenant_id: tenantId, stock_purpose: "return", is_active: true },
    select: { id: true }
  });
  if (retWh) return retWh.id;

  // Fallback: first active warehouse
  const any = await prisma.warehouse.findFirst({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  if (!any) throw new Error("NO_WAREHOUSE");
  return any.id;
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * «Заявки» ro‘yxati `orders` dan — polki faqat `sales_return` bo‘lgani uchun
 * shu yerga ko‘zgu yozuv: bir xil raqam (VR-…), `order_type` + filtrlash.
 * `status: returned` — kredit yig‘indisiga kirmaydi (ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE).
 */
async function createPolkiMirrorZayavka(
  tx: Tx,
  params: {
    tenantId: number;
    number: string;
    clientId: number;
    warehouseId: number;
    orderType: "return" | "return_by_order";
    retLines: Array<{
      product_id: number;
      qty: number;
      paid_qty: number;
      bonus_qty: number;
      price: number;
    }>;
    refundAmount: Prisma.Decimal;
    note: string | null;
    refusalReasonRef: string | null;
    /** Po zakaz — manba zakaz raqami (izoh) */
    sourceOrderNumber?: string | null;
  }
): Promise<number> {
  const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

  for (const rl of params.retLines) {
    const priceDec = R(rl.price);
    if (rl.paid_qty > 0) {
      const q = new Prisma.Decimal(rl.paid_qty);
      creates.push({
        product: { connect: { id: rl.product_id } },
        qty: q,
        price: priceDec,
        total: R(priceDec.mul(rl.paid_qty)),
        is_bonus: false
      });
    }
    if (rl.bonus_qty > 0) {
      const q = new Prisma.Decimal(rl.bonus_qty);
      creates.push({
        product: { connect: { id: rl.product_id } },
        qty: q,
        price: priceDec,
        total: R(priceDec.mul(rl.bonus_qty)),
        is_bonus: true
      });
    }
    if (rl.paid_qty <= 0 && rl.bonus_qty <= 0 && rl.qty > 0) {
      const q = new Prisma.Decimal(rl.qty);
      creates.push({
        product: { connect: { id: rl.product_id } },
        qty: q,
        price: priceDec,
        total: R(priceDec.mul(rl.qty)),
        is_bonus: false
      });
    }
  }

  const bonusSum = params.retLines.reduce(
    (a, l) => a.add(R(l.price).mul(l.bonus_qty)),
    new Prisma.Decimal(0)
  );

  let comment = params.note?.trim() || null;
  if (params.refusalReasonRef?.trim()) {
    const r = params.refusalReasonRef.trim().slice(0, 200);
    comment = comment ? `${comment}\n[Отказ: ${r}]` : `[Отказ: ${r}]`;
  }
  if (params.sourceOrderNumber?.trim()) {
    const tag = `По заказу ${params.sourceOrderNumber.trim()}`;
    comment = comment ? `${comment}\n${tag}` : tag;
  }

  const created = await tx.order.create({
    data: {
      tenant_id: params.tenantId,
      number: params.number,
      client_id: params.clientId,
      warehouse_id: params.warehouseId,
      order_type: params.orderType,
      status: "returned",
      total_sum: params.refundAmount,
      bonus_sum: bonusSum,
      discount_sum: new Prisma.Decimal(0),
      comment,
      ...(creates.length > 0 ? { items: { create: creates } } : {})
    }
  });
  return created.id;
}

/** Polki: faqat yetkazib berilgan sotuv zakazi — tovar klientda, qaytarish klient → ombor. */
const POLKI_SOURCE_ORDER_STATUS = "delivered" as const;

/** Bir nechta zakaz uchun qaytarish konteksti (har qator `order_id` bilan). */
async function getClientReturnsDataMultipleOrders(
  tenantId: number,
  clientId: number,
  orderIds: number[]
): Promise<ClientReturnsData> {
  const uniqueSorted = [...new Set(orderIds)].sort((a, b) => a - b);
  const orders = await prisma.order.findMany({
    where: {
      id: { in: uniqueSorted },
      tenant_id: tenantId,
      client_id: clientId,
      status: POLKI_SOURCE_ORDER_STATUS
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      total_sum: true,
      bonus_sum: true,
      created_at: true,
      items: {
        select: {
          product_id: true,
          qty: true,
          price: true,
          total: true,
          is_bonus: true,
          product: { select: { sku: true, name: true, unit: true } }
        }
      }
    }
  });
  if (orders.length === 0) throw new Error("BAD_ORDER");
  if (orders.length !== uniqueSorted.length) throw new Error("ORDER_NOT_DELIVERED");

  const loadedOrderIds = orders.map((o) => o.id);

  const returns = await prisma.salesReturn.findMany({
    where: {
      tenant_id: tenantId,
      client_id: clientId,
      order_id: { in: loadedOrderIds },
      status: "posted"
    },
    select: {
      order_id: true,
      refund_amount: true,
      lines: { select: { product_id: true, qty: true, paid_qty: true, bonus_qty: true } }
    }
  });

  const totalReturnedQty = returns.reduce(
    (a, ret) => a + ret.lines.reduce((b, l) => b + Number(l.qty), 0),
    0
  );
  const alreadyReturned = returns.reduce(
    (a, r) => a.add(r.refund_amount ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0)
  );

  let totalPaidValue = new Prisma.Decimal(0);
  const items: OrderItemSummary[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      items.push({
        product_id: item.product_id,
        sku: item.product.sku,
        name: item.product.name,
        unit: item.product.unit,
        qty: item.qty.toString(),
        price: item.price.toString(),
        total: item.total.toString(),
        is_bonus: item.is_bonus,
        order_id: order.id,
        order_number: order.number
      });
      if (!item.is_bonus) totalPaidValue = totalPaidValue.add(item.total);
    }
  }

  const itemsAdjusted = adjustOrderItemsQtyAfterPriorReturns(items, returns);

  const bal = await prisma.clientBalance.findUnique({
    where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
    select: { balance: true }
  });
  const balance = bal?.balance ?? new Prisma.Decimal(0);
  const maxReturnable = totalPaidValue.sub(alreadyReturned);

  return {
    polki_scope: "order",
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total_sum: o.total_sum.toString(),
      bonus_sum: o.bonus_sum.toString(),
      created_at: o.created_at.toISOString()
    })),
    items: itemsAdjusted,
    total_orders: orders.length,
    total_returned_qty: String(totalReturnedQty),
    total_paid_value: totalPaidValue.toString(),
    already_returned_value: alreadyReturned.toString(),
    max_returnable_value: maxReturnable.gt(0) ? maxReturnable.toString() : "0",
    client_balance: balance.toString(),
    client_debt: balance.lt(0) ? balance.abs().toString() : "0"
  };
}

// ─── Get client returns data ────────────────────────────────────────────────
//
// Qayta «vozvrat s polki» shu zakazga: oldingi posted `sales_return` qatorlari
// `adjustOrderItemsQtyAfterPriorReturns` orqali qoldiqni kamaytiradi — qoldiq
// bo‘lsa, yana xuddi shu zakazdan qaytarish mumkin (backend tekshiruvi).

export async function getClientReturnsData(
  tenantId: number,
  clientId: number,
  dateFrom?: string,
  dateTo?: string,
  orderId?: number | null,
  orderIds?: number[] | null,
  opts?: { shrinkLineQtyAfterReturns?: boolean }
): Promise<ClientReturnsData> {
  const shrinkLineQtyAfterReturns = opts?.shrinkLineQtyAfterReturns !== false;

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  const resolvedOrderIds =
    orderIds != null && orderIds.length > 0
      ? [...new Set(orderIds.map(Number).filter((x) => Number.isFinite(x) && x > 0))]
      : orderId != null && orderId > 0
        ? [orderId]
        : [];

  if (resolvedOrderIds.length > 1) {
    return getClientReturnsDataMultipleOrders(tenantId, clientId, resolvedOrderIds);
  }

  // ─── Bitta zakaz (polki po zakaz) ─────────────────────────────────────
  const singleOrderId = resolvedOrderIds.length === 1 ? resolvedOrderIds[0]! : null;
  if (singleOrderId != null) {
    const order = await prisma.order.findFirst({
      where: {
        id: singleOrderId,
        tenant_id: tenantId,
        client_id: clientId,
        status: POLKI_SOURCE_ORDER_STATUS
      },
      select: {
        id: true,
        number: true,
        status: true,
        total_sum: true,
        bonus_sum: true,
        created_at: true,
        items: {
          select: {
            product_id: true,
            qty: true,
            price: true,
            total: true,
            is_bonus: true,
            product: { select: { sku: true, name: true, unit: true } }
          }
        }
      }
    });
    if (!order) throw new Error("BAD_ORDER");

    const returns = await prisma.salesReturn.findMany({
      where: {
        tenant_id: tenantId,
        client_id: clientId,
        order_id: singleOrderId,
        status: "posted"
      },
      select: {
        order_id: true,
        refund_amount: true,
        lines: { select: { product_id: true, qty: true, paid_qty: true, bonus_qty: true } }
      }
    });

    const totalReturnedQty = returns.reduce(
      (a, ret) => a + ret.lines.reduce((b, l) => b + Number(l.qty), 0),
      0
    );
    const alreadyReturned = returns.reduce(
      (a, r) => a.add(r.refund_amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0)
    );

    let totalPaidValue = new Prisma.Decimal(0);
    const items: OrderItemSummary[] = [];
    for (const item of order.items) {
      items.push({
        product_id: item.product_id,
        sku: item.product.sku,
        name: item.product.name,
        unit: item.product.unit,
        qty: item.qty.toString(),
        price: item.price.toString(),
        total: item.total.toString(),
        is_bonus: item.is_bonus,
        order_id: order.id,
        order_number: order.number
      });
      if (!item.is_bonus) totalPaidValue = totalPaidValue.add(item.total);
    }

    const itemsOut = shrinkLineQtyAfterReturns
      ? adjustOrderItemsQtyAfterPriorReturns(items, returns)
      : items;

    const bal = await prisma.clientBalance.findUnique({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
      select: { balance: true }
    });
    const balance = bal?.balance ?? new Prisma.Decimal(0);
    const maxReturnable = totalPaidValue.sub(alreadyReturned);

    return {
      polki_scope: "order",
      orders: [
        {
          id: order.id,
          number: order.number,
          status: order.status,
          total_sum: order.total_sum.toString(),
          bonus_sum: order.bonus_sum.toString(),
          created_at: order.created_at.toISOString()
        }
      ],
      items: itemsOut,
      total_orders: 1,
      total_returned_qty: String(totalReturnedQty),
      total_paid_value: totalPaidValue.toString(),
      already_returned_value: alreadyReturned.toString(),
      max_returnable_value: maxReturnable.gt(0) ? maxReturnable.toString() : "0",
      client_balance: balance.toString(),
      client_debt: balance.lt(0) ? balance.abs().toString() : "0"
    };
  }

  // Orders in period — faqat yetkazilgan sotuvlar (polki «с полки»)
  const orderWhere: Prisma.OrderWhereInput = {
    tenant_id: tenantId,
    client_id: clientId,
    status: POLKI_SOURCE_ORDER_STATUS
  };
  if (dateFrom) orderWhere.created_at = { gte: localDayStart(dateFrom) };
  if (dateTo) orderWhere.created_at = { ...(orderWhere.created_at as object) ?? {}, lte: localDayEnd(dateTo) };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    orderBy: { created_at: "desc" },
    select: {
      id: true, number: true, status: true,
      total_sum: true, bonus_sum: true, created_at: true,
      items: {
        select: {
          product_id: true, qty: true, price: true, total: true, is_bonus: true,
          product: { select: { sku: true, name: true, unit: true } }
        }
      }
    }
  });

  // Aggregate returned qty per product from existing returns in period
  const returnWhere: Prisma.SalesReturnWhereInput = {
    tenant_id: tenantId, client_id: clientId, status: "posted"
  };
  if (dateFrom) returnWhere.created_at = { gte: localDayStart(dateFrom) };
  if (dateTo) returnWhere.created_at = { ...(returnWhere.created_at as object) ?? {}, lte: localDayEnd(dateTo) };

  const returns = await prisma.salesReturn.findMany({
    where: returnWhere, select: { refund_amount: true, lines: { select: { product_id: true, qty: true } } }
  });

  const returnedQtyByProduct = new Map<number, number>();
  for (const ret of returns) {
    for (const ln of ret.lines) {
      returnedQtyByProduct.set(ln.product_id, (returnedQtyByProduct.get(ln.product_id) ?? 0) + Number(ln.qty));
    }
  }
  const totalReturnedQty = returns.reduce((a, ret) => a + ret.lines.reduce((b, l) => b + Number(l.qty), 0), 0);

  const alreadyReturned = returns.reduce((a, r) => a.add(r.refund_amount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));

  let totalPaidValue = new Prisma.Decimal(0);
  const items: OrderItemSummary[] = [];

  for (const o of orders) {
    for (const item of o.items) {
      items.push({
        product_id: item.product_id, sku: item.product.sku, name: item.product.name,
        unit: item.product.unit, qty: item.qty.toString(), price: item.price.toString(),
        total: item.total.toString(), is_bonus: item.is_bonus,
        order_id: o.id, order_number: o.number
      });
      if (!item.is_bonus) totalPaidValue = totalPaidValue.add(item.total);
    }
  }

  const bal = await prisma.clientBalance.findUnique({
    where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
    select: { balance: true }
  });
  const balance = bal?.balance ?? new Prisma.Decimal(0);
  const maxReturnable = totalPaidValue.sub(alreadyReturned);

  return {
    polki_scope: "period",
    orders: orders.map(o => ({
      id: o.id, number: o.number, status: o.status,
      total_sum: o.total_sum.toString(), bonus_sum: o.bonus_sum.toString(),
      created_at: o.created_at.toISOString()
    })),
    items,
    total_orders: orders.length,
    total_returned_qty: String(totalReturnedQty),
    total_paid_value: totalPaidValue.toString(),
    already_returned_value: alreadyReturned.toString(),
    max_returnable_value: maxReturnable.gt(0) ? maxReturnable.toString() : "0",
    client_balance: balance.toString(),
    client_debt: balance.lt(0) ? balance.abs().toString() : "0"
  };
}

// ─── Legacy return: bonus vs paid from order line snapshot (`is_bonus`) ───────

/**
 * Pullik/bonus ajratish faqat zakaz qatorlaridagi qoldiq (`itemsAdjusted`) bo‘yicha:
 * avval bonus «pool»dan, keyin pullikdan. Aktiv bonusRule kerak emas.
 */
export function computeReturnSplitFromOrderSnapshot(
  itemsAdjusted: OrderItemSummary[],
  returnedLines: { product_id: number; qty: number }[]
): {
  lines: Array<{ product_id: number; qty: number; paid_qty: number; bonus_qty: number; price: number }>;
  recalc: {
    original_bonus_qty: number;
    remaining_bonus_qty: number;
    excess_bonus: number;
    total_return_qty: number;
    paid_return_qty: number;
    bonus_return_qty: number;
    refund_amount: Prisma.Decimal;
  };
} {
  type Pool = { bonus: number; paid: number; paidValue: number };
  const pools = new Map<number, Pool>();

  for (const it of itemsAdjusted) {
    const q = Number(it.qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    const pid = it.product_id;
    const row = pools.get(pid) ?? { bonus: 0, paid: 0, paidValue: 0 };
    if (it.is_bonus) {
      row.bonus += q;
    } else {
      const unit = Number(it.price);
      const p = Number.isFinite(unit) ? unit : 0;
      row.paid += q;
      row.paidValue += q * p;
    }
    pools.set(pid, row);
  }

  const originalBonusQty = [...pools.values()].reduce((a, x) => a + x.bonus, 0);

  const remBonus = new Map<number, number>();
  const remPaid = new Map<number, number>();
  const paidUnitPrice = new Map<number, number>();
  for (const [pid, pl] of pools) {
    remBonus.set(pid, pl.bonus);
    remPaid.set(pid, pl.paid);
    const avg = pl.paid > 0 ? pl.paidValue / pl.paid : 0;
    paidUnitPrice.set(pid, avg);
  }

  for (const it of itemsAdjusted) {
    const pid = it.product_id;
    if ((paidUnitPrice.get(pid) ?? 0) > 0) continue;
    const q = Number(it.qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!it.is_bonus) {
      const unit = Number(it.price);
      if (Number.isFinite(unit) && unit > 0) paidUnitPrice.set(pid, unit);
    }
  }

  let refund = new Prisma.Decimal(0);
  let bonusReturnQty = 0;
  let paidReturnQty = 0;

  const resultLines = returnedLines.map((rl) => {
    const pid = rl.product_id;
    const bAvail = remBonus.get(pid) ?? 0;
    const pAvail = remPaid.get(pid) ?? 0;
    const bQty = Math.min(rl.qty, bAvail);
    const pQty = rl.qty - bQty;
    remBonus.set(pid, bAvail - bQty);
    remPaid.set(pid, pAvail - pQty);
    const price = paidUnitPrice.get(pid) ?? 0;
    refund = refund.add(R(price).mul(pQty));
    bonusReturnQty += bQty;
    paidReturnQty += pQty;
    return { product_id: pid, qty: rl.qty, paid_qty: pQty, bonus_qty: bQty, price };
  });

  const totalRetQty = returnedLines.reduce((a, l) => a + l.qty, 0);

  return {
    lines: resultLines,
    recalc: {
      original_bonus_qty: originalBonusQty,
      remaining_bonus_qty: Math.max(0, originalBonusQty - bonusReturnQty),
      excess_bonus: bonusReturnQty,
      total_return_qty: totalRetQty,
      paid_return_qty: paidReturnQty,
      bonus_return_qty: bonusReturnQty,
      refund_amount: refund
    }
  };
}

// ─── Validate return qty doesn't exceed available ────────────────────────────

export function validateReturnQty(
  allItems: { product_id: number; qty: number }[],
  alreadyReturnedByProduct: Map<number, number>,
  lines: { product_id: number; qty: number }[]
): void {
  const orderedMap = new Map<number, number>();
  for (const it of allItems) {
    orderedMap.set(it.product_id, (orderedMap.get(it.product_id) ?? 0) + it.qty);
  }

  for (const ln of lines) {
    const ordered = orderedMap.get(ln.product_id) ?? 0;
    const alreadyRet = alreadyReturnedByProduct.get(ln.product_id) ?? 0;
    const available = ordered - alreadyRet;
    if (ln.qty > available) {
      throw new Error("RETURN_QTY_EXCEEDS_ORDERED");
    }
  }

  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  if (totalQty > MAX_RETURN_ITEMS) {
    throw new Error("TOO_MANY_ITEMS");
  }
}

/** Pul qaytarishni `maxRefund` bilan cheklaganda qatorlardagi paid/bonus taqsimotini saqlab qolish. */
function scaleReturnLinesToMaxRefund(
  lines: Array<{ product_id: number; qty: number; paid_qty: number; bonus_qty: number; price: number }>,
  maxRefund: Prisma.Decimal
): {
  lines: Array<{ product_id: number; qty: number; paid_qty: number; bonus_qty: number; price: number }>;
  refund: Prisma.Decimal;
} {
  let refund = lines.reduce(
    (a, l) => a.add(R(l.price).mul(l.paid_qty)),
    new Prisma.Decimal(0)
  );
  if (!refund.gt(maxRefund)) {
    return { lines, refund };
  }
  /** `maxRefund.div(0)` → ∞ / NaN → Prisma xato yoki 500 */
  if (!refund.gt(0)) {
    return { lines, refund: new Prisma.Decimal(0) };
  }
  const ratio = maxRefund.div(refund);
  const adjusted = lines.map((l) => {
    const oldPaid = new Prisma.Decimal(l.paid_qty);
    const newPaid = R(oldPaid.mul(ratio));
    const shift = oldPaid.sub(newPaid);
    const newBonus = R(new Prisma.Decimal(l.bonus_qty).add(shift));
    return {
      product_id: l.product_id,
      qty: l.qty,
      paid_qty: Number(newPaid.toString()),
      bonus_qty: Number(newBonus.toString()),
      price: l.price
    };
  });
  refund = adjusted.reduce(
    (a, l) => a.add(R(l.price).mul(l.paid_qty)),
    new Prisma.Decimal(0)
  );
  if (refund.gt(maxRefund)) {
    refund = maxRefund;
  }
  return { lines: adjusted, refund };
}

function physicalQtyFromPeriodLine(l: CreatePeriodReturnLine | CreatePeriodReturnBatchLine): number {
  if (l.qty != null && l.qty > 0) return l.qty;
  return (l.paid_qty ?? 0) + (l.bonus_qty ?? 0);
}

function assertPeriodLineModes(lines: CreatePeriodReturnLine[]): void {
  let legacy = 0;
  let explicit = 0;
  for (const l of lines) {
    const isLeg = l.qty != null && l.qty > 0;
    const isExp =
      (l.paid_qty ?? 0) > 0 ||
      (l.bonus_qty ?? 0) > 0 ||
      (l.bonus_cash ?? 0) > 0;
    if (isLeg && isExp) throw new Error("MIXED_LINE_FIELDS");
    if (!isLeg && !isExp) throw new Error("EMPTY_LINE");
    if (isLeg) legacy++;
    else explicit++;
  }
  if (legacy > 0 && explicit > 0) throw new Error("MIXED_LINE_MODES");
}

function assertBatchLineModes(lines: CreatePeriodReturnBatchLine[]): void {
  let legacy = 0;
  let explicit = 0;
  for (const l of lines) {
    const isLeg = l.qty != null && l.qty > 0;
    const isExp =
      (l.paid_qty ?? 0) > 0 ||
      (l.bonus_qty ?? 0) > 0 ||
      (l.bonus_cash ?? 0) > 0;
    if (isLeg && isExp) throw new Error("MIXED_LINE_FIELDS");
    if (!isLeg && !isExp) throw new Error("EMPTY_LINE");
    if (isLeg) legacy++;
    else explicit++;
  }
  if (legacy > 0 && explicit > 0) throw new Error("MIXED_LINE_MODES");
}

function priceByProductFromItems(allItems: { product_id: number; price: string }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of allItems) {
    const p = Number(it.price);
    if (Number.isFinite(p) && p >= 0) m.set(it.product_id, p);
  }
  return m;
}

function buildPaidBonusAvailability(
  allItems: { product_id: number; qty: string; is_bonus: boolean }[]
): { paid: Map<number, number>; bonus: Map<number, number> } {
  const paid = new Map<number, number>();
  const bonus = new Map<number, number>();
  for (const it of allItems) {
    const q = Number(it.qty);
    if (!(q > 0)) continue;
    const t = it.is_bonus ? bonus : paid;
    t.set(it.product_id, (t.get(it.product_id) ?? 0) + q);
  }
  return { paid, bonus };
}

function validateExplicitReturnAgainstItems(
  allItems: { product_id: number; qty: string; is_bonus: boolean }[],
  lines: { product_id: number; paid_qty: number; bonus_qty: number; bonus_cash: number }[],
  priceByProduct: Map<number, number>
): void {
  const { paid: paidAvail, bonus: bonusAvail } = buildPaidBonusAvailability(allItems);
  const sumPaid = new Map<number, number>();
  const sumBonus = new Map<number, number>();
  const sumCash = new Map<number, number>();
  for (const ln of lines) {
    sumPaid.set(ln.product_id, (sumPaid.get(ln.product_id) ?? 0) + ln.paid_qty);
    sumBonus.set(ln.product_id, (sumBonus.get(ln.product_id) ?? 0) + ln.bonus_qty);
    if (ln.bonus_cash > 0) {
      sumCash.set(ln.product_id, (sumCash.get(ln.product_id) ?? 0) + ln.bonus_cash);
    }
  }
  for (const [pid, sp] of sumPaid) {
    if (sp > (paidAvail.get(pid) ?? 0)) throw new Error("RETURN_QTY_EXCEEDS_ORDERED");
  }
  for (const [pid, sb] of sumBonus) {
    if (sb > (bonusAvail.get(pid) ?? 0)) throw new Error("RETURN_QTY_EXCEEDS_ORDERED");
  }
  for (const [pid, cash] of sumCash) {
    if (!(cash > 0)) continue;
    const bonusLeft = (bonusAvail.get(pid) ?? 0) - (sumBonus.get(pid) ?? 0);
    const price = priceByProduct.get(pid) ?? 0;
    const maxCash = R(bonusLeft * price);
    if (R(cash).gt(maxCash)) throw new Error("BONUS_CASH_EXCEEDS");
  }
}

// ─── Create period return ────────────────────────────────────────────────────

export async function createPeriodReturn(
  tenantId: number,
  input: CreatePeriodReturnInput,
  actorUserId: number | null
): Promise<PeriodReturnResult> {
  if (!input.lines.length) throw new Error("EMPTY_LINES");

  assertPeriodLineModes(input.lines);
  const totalPhys = input.lines.reduce((a, l) => a + physicalQtyFromPeriodLine(l), 0);
  if (totalPhys > MAX_RETURN_ITEMS) throw new Error("TOO_MANY_ITEMS");

  const client = await prisma.client.findFirst({
    where: { id: input.client_id, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  const productIds = [...new Set(input.lines.map(l => l.product_id))];
  const products = await prisma.product.findMany({
    where: { tenant_id: tenantId, id: { in: productIds }, is_active: true },
    select: { id: true, sku: true, name: true }
  });
  if (products.length !== productIds.length) throw new Error("BAD_PRODUCT");
  const pMap = new Map(products.map(p => [p.id, p]));

  const warehouseId = input.warehouse_id ?? await findReturnWarehouse(tenantId);

  const orderScoped = input.order_id != null && input.order_id > 0;
  if (orderScoped) {
    const ordOk = await prisma.order.findFirst({
      where: {
        id: input.order_id,
        tenant_id: tenantId,
        client_id: input.client_id,
        status: POLKI_SOURCE_ORDER_STATUS
      },
      select: { id: true }
    });
    if (!ordOk) throw new Error("BAD_ORDER");
  }

  const cdata = orderScoped
    ? await getClientReturnsData(tenantId, input.client_id, undefined, undefined, input.order_id, undefined, {
        shrinkLineQtyAfterReturns: false
      })
    : await getClientReturnsData(tenantId, input.client_id, input.date_from, input.date_to, undefined, undefined, {
        shrinkLineQtyAfterReturns: false
      });

  const allItems = cdata.items.map(i => ({
    product_id: i.product_id, qty: Number(i.qty), price: Number(i.price), is_bonus: i.is_bonus
  }));

  const returnWhere: Prisma.SalesReturnWhereInput = {
    tenant_id: tenantId, client_id: input.client_id, status: "posted"
  };
  if (orderScoped) {
    returnWhere.order_id = input.order_id;
  } else {
    if (input.date_from) returnWhere.created_at = { gte: localDayStart(input.date_from) };
    if (input.date_to) {
      returnWhere.created_at = {
        ...(returnWhere.created_at as object) ?? {},
        lte: localDayEnd(input.date_to)
      };
    }
  }

  const alreadyRetMap = new Map<number, number>();
  const prevReturns = await prisma.salesReturn.findMany({
    where: returnWhere,
    select: {
      order_id: true,
      lines: { select: { product_id: true, qty: true, paid_qty: true, bonus_qty: true } }
    }
  });
  for (const ret of prevReturns) {
    for (const ln of ret.lines) {
      alreadyRetMap.set(ln.product_id, (alreadyRetMap.get(ln.product_id) ?? 0) + Number(ln.qty));
    }
  }

  const itemsAdjusted = adjustOrderItemsQtyAfterPriorReturns(
    cdata.items,
    prevReturns.map((r) => ({ order_id: r.order_id, lines: r.lines }))
  );

  const useExplicit = input.lines.every((l) => !(l.qty != null && l.qty > 0));

  if (!useExplicit) {
    validateReturnQty(allItems, alreadyRetMap, input.lines as { product_id: number; qty: number }[]);
  }

  const maxRet = new Prisma.Decimal(cdata.max_returnable_value);

  let retLines: Array<{ product_id: number; qty: number; paid_qty: number; bonus_qty: number; price: number }>;
  let recalc: {
    original_bonus_qty: number;
    remaining_bonus_qty: number;
    excess_bonus: number;
    total_return_qty: number;
    paid_return_qty: number;
    bonus_return_qty: number;
    refund_amount: Prisma.Decimal;
    bonus_cash_applied?: string;
  };

  if (useExplicit) {
    const explicitRows = input.lines.map((l) => ({
      product_id: l.product_id,
      paid_qty: l.paid_qty ?? 0,
      bonus_qty: l.bonus_qty ?? 0,
      bonus_cash: l.bonus_cash ?? 0
    }));
    const priceMap = priceByProductFromItems(cdata.items);
    validateExplicitReturnAgainstItems(itemsAdjusted, explicitRows, priceMap);

    const physical: Array<{
      product_id: number;
      qty: number;
      paid_qty: number;
      bonus_qty: number;
      price: number;
    }> = [];
    let cashReqTotal = new Prisma.Decimal(0);
    for (const er of explicitRows) {
      const price = priceMap.get(er.product_id) ?? 0;
      if (er.paid_qty + er.bonus_qty > 0) {
        physical.push({
          product_id: er.product_id,
          qty: er.paid_qty + er.bonus_qty,
          paid_qty: er.paid_qty,
          bonus_qty: er.bonus_qty,
          price
        });
      }
      if (er.bonus_cash > 0) cashReqTotal = cashReqTotal.add(R(er.bonus_cash));
    }

    if (physical.length === 0 && !cashReqTotal.gt(0)) throw new Error("EMPTY_LINES");
    if (physical.length === 0 && cashReqTotal.gt(0) && maxRet.lte(0)) {
      throw new Error("NOTHING_TO_RETURN");
    }

    const scaled =
      physical.length > 0
        ? scaleReturnLinesToMaxRefund(physical, maxRet)
        : { lines: [] as typeof physical, refund: new Prisma.Decimal(0) };

    const room = maxRet.sub(scaled.refund);
    const cashApplied = cashReqTotal.lte(0)
      ? new Prisma.Decimal(0)
      : room.gte(cashReqTotal)
        ? cashReqTotal
        : room.gt(0)
          ? room
          : new Prisma.Decimal(0);
    const totalRefund = scaled.refund.add(cashApplied);

    retLines = scaled.lines;
    recalc = {
      original_bonus_qty: 0,
      remaining_bonus_qty: 0,
      excess_bonus: 0,
      total_return_qty: retLines.reduce((a, l) => a + l.qty, 0),
      paid_return_qty: retLines.reduce((a, l) => a + l.paid_qty, 0),
      bonus_return_qty: retLines.reduce((a, l) => a + l.bonus_qty, 0),
      refund_amount: totalRefund,
      bonus_cash_applied: cashApplied.toString()
    };
  } else {
    if (maxRet.lte(0)) throw new Error("NOTHING_TO_RETURN");

    const { lines: rawRetLines, recalc: rawRecalc } = computeReturnSplitFromOrderSnapshot(
      itemsAdjusted,
      input.lines as { product_id: number; qty: number }[]
    );
    const { lines: r2, refund: cappedRefund } = scaleReturnLinesToMaxRefund(rawRetLines, maxRet);
    retLines = r2;
    recalc = {
      ...rawRecalc,
      refund_amount: cappedRefund,
      paid_return_qty: retLines.reduce((a, l) => a + l.paid_qty, 0),
      bonus_return_qty: retLines.reduce((a, l) => a + l.bonus_qty, 0)
    };
  }

  const number = `VR-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const uid = actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const mirrorOrderType: "return" | "return_by_order" = orderScoped ? "return_by_order" : "return";
  const sourceOrderNumber =
    orderScoped && cdata.orders[0]?.number ? String(cdata.orders[0].number) : null;

  const { ret: result, mirrorOrderId } = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenant_id: tenantId, number,
        client_id: input.client_id,
        order_id: input.order_id ?? null,
        warehouse_id: warehouseId,
        status: "posted",
        refund_amount: recalc.refund_amount,
        return_type: "partial",
        date_from:
          orderScoped ? null : input.date_from ? new Date(input.date_from) : null,
        date_to: orderScoped ? null : input.date_to ? new Date(input.date_to) : null,
        note: input.note?.trim() || null,
        refusal_reason_ref:
          input.refusal_reason_ref != null && String(input.refusal_reason_ref).trim()
            ? String(input.refusal_reason_ref).trim().slice(0, 128)
            : null,
        created_by_user_id: uid,
        ...(retLines.length > 0
          ? {
              lines: {
                create: retLines.map((rl) => ({
                  product_id: rl.product_id,
                  qty: new Prisma.Decimal(rl.qty),
                  paid_qty: new Prisma.Decimal(rl.paid_qty),
                  bonus_qty: new Prisma.Decimal(rl.bonus_qty)
                }))
              }
            }
          : {})
      },
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } },
        warehouse: { select: { name: true } }
      }
    });

    const mirrorOrderId = await createPolkiMirrorZayavka(tx, {
      tenantId,
      number,
      clientId: input.client_id,
      warehouseId,
      orderType: mirrorOrderType,
      retLines,
      refundAmount: recalc.refund_amount,
      note: input.note?.trim() || null,
      refusalReasonRef: input.refusal_reason_ref ?? null,
      sourceOrderNumber
    });

    // Stock: add to return warehouse
    for (const rl of retLines) {
      if (!(rl.qty > 0)) continue;
      const delta = new Prisma.Decimal(rl.qty);
      await tx.stock.upsert({
        where: {
          tenant_id_warehouse_id_product_id: {
            tenant_id: tenantId, warehouse_id: warehouseId, product_id: rl.product_id
          }
        },
        create: { tenant_id: tenantId, warehouse_id: warehouseId, product_id: rl.product_id, qty: delta },
        update: { qty: { increment: delta } }
      });
    }

    // Client balance
    if (recalc.refund_amount.gt(0)) {
      const bal = await tx.clientBalance.upsert({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: input.client_id } },
        create: { tenant_id: tenantId, client_id: input.client_id, balance: recalc.refund_amount },
        update: { balance: { increment: recalc.refund_amount } }
      });
      await tx.clientBalanceMovement.create({
        data: { client_balance_id: bal.id, delta: recalc.refund_amount, note: `Vazvrat: ${number}`, user_id: uid }
      });
    }

    return { ret, mirrorOrderId };
  });

  emitOrderUpdated(tenantId, mirrorOrderId);
  void invalidateDashboard(tenantId);

  await autoMarkReturnedOrders(
    tenantId,
    input.client_id,
    orderScoped ? undefined : input.date_from,
    orderScoped ? undefined : input.date_to,
    uid
  );

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: String(input.client_id),
    action: "period_return",
    payload: {
      return_id: result.id,
      number: result.number,
      bonus_recalc: {
        original_bonus_qty: recalc.original_bonus_qty,
        remaining_bonus_qty: recalc.remaining_bonus_qty,
        excess_bonus: recalc.excess_bonus,
        total_return_qty: recalc.total_return_qty,
        paid_return_qty: recalc.paid_return_qty,
        bonus_return_qty: recalc.bonus_return_qty,
        refund_amount: recalc.refund_amount.toString(),
        ...(recalc.bonus_cash_applied != null ? { bonus_cash_applied: recalc.bonus_cash_applied } : {})
      },
      mirror_order_id: mirrorOrderId
    }
  });

  return {
    id: result.id, number: result.number,
    refund_amount: result.refund_amount?.toString() ?? null,
    lines: retLines.map(rl => ({
      product_id: rl.product_id,
      sku: pMap.get(rl.product_id)?.sku ?? "",
      name: pMap.get(rl.product_id)?.name ?? "",
      qty: String(rl.qty),
      paid_qty: String(rl.paid_qty),
      bonus_qty: String(rl.bonus_qty),
      paid_amount: R(rl.price).mul(rl.paid_qty).toString()
    })),
    bonus_recalc: { ...recalc, refund_amount: recalc.refund_amount.toString() }
  };
}

/** Bir nechta zakazdan bitta operatsiya: har zakaz uchun alohida `sales_return`, bitta DB tranzaksiyasi. */
export async function createPeriodReturnBatch(
  tenantId: number,
  input: CreatePeriodReturnBatchInput,
  actorUserId: number | null
): Promise<PeriodReturnBatchResult> {
  if (!input.lines.length) throw new Error("EMPTY_LINES");

  assertBatchLineModes(input.lines);
  const totalPhys = input.lines.reduce((a, l) => a + physicalQtyFromPeriodLine(l), 0);
  if (totalPhys > MAX_RETURN_ITEMS) throw new Error("TOO_MANY_ITEMS");

  const client = await prisma.client.findFirst({
    where: { id: input.client_id, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  const productIds = [...new Set(input.lines.map((l) => l.product_id))];
  const products = await prisma.product.findMany({
    where: { tenant_id: tenantId, id: { in: productIds }, is_active: true },
    select: { id: true, sku: true, name: true }
  });
  if (products.length !== productIds.length) throw new Error("BAD_PRODUCT");
  const pMap = new Map(products.map((p) => [p.id, p]));

  const warehouseId = input.warehouse_id ?? await findReturnWarehouse(tenantId);

  const batchExplicit = input.lines.every((l) => !(l.qty != null && l.qty > 0));

  const byOrder = new Map<
    number,
    | { mode: "legacy"; lines: { product_id: number; qty: number }[] }
    | { mode: "explicit"; lines: CreatePeriodReturnLine[] }
  >();

  if (batchExplicit) {
    const acc = new Map<number, Map<number, { paid: number; bonus: number; cash: number }>>();
    for (const ln of input.lines) {
      const oid = ln.order_id;
      if (!Number.isFinite(oid) || oid < 1) throw new Error("BAD_ORDER");
      const pmap = acc.get(oid) ?? new Map<number, { paid: number; bonus: number; cash: number }>();
      const cur = pmap.get(ln.product_id) ?? { paid: 0, bonus: 0, cash: 0 };
      cur.paid += ln.paid_qty ?? 0;
      cur.bonus += ln.bonus_qty ?? 0;
      cur.cash += ln.bonus_cash ?? 0;
      pmap.set(ln.product_id, cur);
      acc.set(oid, pmap);
    }
    for (const [oid, pmap] of acc) {
      byOrder.set(oid, {
        mode: "explicit",
        lines: Array.from(pmap.entries()).map(([product_id, v]) => ({
          product_id,
          paid_qty: v.paid,
          bonus_qty: v.bonus,
          bonus_cash: v.cash
        }))
      });
    }
  } else {
    const byOrderQty = new Map<number, Map<number, number>>();
    for (const ln of input.lines) {
      const oid = ln.order_id;
      if (!Number.isFinite(oid) || oid < 1) throw new Error("BAD_ORDER");
      const q = ln.qty ?? 0;
      if (!(q > 0)) throw new Error("EMPTY_LINE");
      const pmap = byOrderQty.get(oid) ?? new Map<number, number>();
      pmap.set(ln.product_id, (pmap.get(ln.product_id) ?? 0) + q);
      byOrderQty.set(oid, pmap);
    }
    for (const [oid, pmap] of byOrderQty) {
      byOrder.set(oid, {
        mode: "legacy",
        lines: Array.from(pmap.entries()).map(([product_id, qty]) => ({ product_id, qty }))
      });
    }
  }

  for (const oid of byOrder.keys()) {
    const ordOk = await prisma.order.findFirst({
      where: {
        id: oid,
        tenant_id: tenantId,
        client_id: input.client_id,
        status: POLKI_SOURCE_ORDER_STATUS
      },
      select: { id: true }
    });
    if (!ordOk) throw new Error("BAD_ORDER");
  }

  type PreparedSlice = {
    orderId: number;
    sourceOrderNumber: string;
    retLines: Array<{
      product_id: number;
      qty: number;
      paid_qty: number;
      bonus_qty: number;
      price: number;
    }>;
    recalc: {
      original_bonus_qty: number;
      remaining_bonus_qty: number;
      excess_bonus: number;
      total_return_qty: number;
      paid_return_qty: number;
      bonus_return_qty: number;
      refund_amount: Prisma.Decimal;
    };
    number: string;
  };

  const prepared: PreparedSlice[] = [];
  const orderEntries = Array.from(byOrder.entries()).sort((a, b) => a[0] - b[0]);

  for (const [orderId, slice] of orderEntries) {
    const cdata = await getClientReturnsData(
      tenantId,
      input.client_id,
      undefined,
      undefined,
      orderId,
      undefined,
      { shrinkLineQtyAfterReturns: false }
    );
    const allItems = cdata.items.map((i) => ({
      product_id: i.product_id,
      qty: Number(i.qty),
      price: Number(i.price),
      is_bonus: i.is_bonus
    }));

    const returnWhere: Prisma.SalesReturnWhereInput = {
      tenant_id: tenantId,
      client_id: input.client_id,
      status: "posted",
      order_id: orderId
    };

    const alreadyRetMap = new Map<number, number>();
    const prevReturns = await prisma.salesReturn.findMany({
      where: returnWhere,
      select: {
        order_id: true,
        lines: { select: { product_id: true, qty: true, paid_qty: true, bonus_qty: true } }
      }
    });
    for (const ret of prevReturns) {
      for (const ln of ret.lines) {
        alreadyRetMap.set(ln.product_id, (alreadyRetMap.get(ln.product_id) ?? 0) + Number(ln.qty));
      }
    }

    const itemsAdjusted = adjustOrderItemsQtyAfterPriorReturns(
      cdata.items,
      prevReturns.map((r) => ({ order_id: r.order_id, lines: r.lines }))
    );

    const maxRet = new Prisma.Decimal(cdata.max_returnable_value);

    let retLines: PreparedSlice["retLines"];
    let recalc: PreparedSlice["recalc"];

    if (slice.mode === "legacy") {
      validateReturnQty(allItems, alreadyRetMap, slice.lines);
      if (maxRet.lte(0)) throw new Error("NOTHING_TO_RETURN");

      const { lines: rawRetLines, recalc: rawRecalc } = computeReturnSplitFromOrderSnapshot(
        itemsAdjusted,
        slice.lines
      );
      const { lines: r2, refund: cappedRefund } = scaleReturnLinesToMaxRefund(rawRetLines, maxRet);
      retLines = r2;
      recalc = {
        ...rawRecalc,
        refund_amount: cappedRefund,
        paid_return_qty: retLines.reduce((a, l) => a + l.paid_qty, 0),
        bonus_return_qty: retLines.reduce((a, l) => a + l.bonus_qty, 0)
      };
    } else {
      const explicitRows = slice.lines.map((l) => ({
        product_id: l.product_id,
        paid_qty: l.paid_qty ?? 0,
        bonus_qty: l.bonus_qty ?? 0,
        bonus_cash: l.bonus_cash ?? 0
      }));
      const priceMap = priceByProductFromItems(cdata.items);
      validateExplicitReturnAgainstItems(itemsAdjusted, explicitRows, priceMap);

      const physical: PreparedSlice["retLines"] = [];
      let cashReqTotal = new Prisma.Decimal(0);
      for (const er of explicitRows) {
        const price = priceMap.get(er.product_id) ?? 0;
        if (er.paid_qty + er.bonus_qty > 0) {
          physical.push({
            product_id: er.product_id,
            qty: er.paid_qty + er.bonus_qty,
            paid_qty: er.paid_qty,
            bonus_qty: er.bonus_qty,
            price
          });
        }
        if (er.bonus_cash > 0) cashReqTotal = cashReqTotal.add(R(er.bonus_cash));
      }

      if (physical.length === 0 && !cashReqTotal.gt(0)) throw new Error("EMPTY_LINES");
      if (physical.length === 0 && cashReqTotal.gt(0) && maxRet.lte(0)) {
        throw new Error("NOTHING_TO_RETURN");
      }

      const scaled =
        physical.length > 0
          ? scaleReturnLinesToMaxRefund(physical, maxRet)
          : { lines: [] as PreparedSlice["retLines"], refund: new Prisma.Decimal(0) };

      const room = maxRet.sub(scaled.refund);
      const cashApplied = cashReqTotal.lte(0)
        ? new Prisma.Decimal(0)
        : room.gte(cashReqTotal)
          ? cashReqTotal
          : room.gt(0)
            ? room
            : new Prisma.Decimal(0);
      const totalRefund = scaled.refund.add(cashApplied);

      retLines = scaled.lines;
      recalc = {
        original_bonus_qty: 0,
        remaining_bonus_qty: 0,
        excess_bonus: 0,
        total_return_qty: retLines.reduce((a, l) => a + l.qty, 0),
        paid_return_qty: retLines.reduce((a, l) => a + l.paid_qty, 0),
        bonus_return_qty: retLines.reduce((a, l) => a + l.bonus_qty, 0),
        refund_amount: totalRefund
      };
    }

    const number = `VR-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const sourceOrderNumber = cdata.orders[0]?.number?.trim() || String(orderId);
    prepared.push({ orderId, sourceOrderNumber, retLines, recalc, number });
  }

  const uid = actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const { rows: created, mirrorOrderIds } = await prisma.$transaction(async (tx) => {
    const rows: Awaited<ReturnType<typeof tx.salesReturn.create>>[] = [];
    const mirrorOrderIds: number[] = [];
    for (const p of prepared) {
      const ret = await tx.salesReturn.create({
        data: {
          tenant_id: tenantId,
          number: p.number,
          client_id: input.client_id,
          order_id: p.orderId,
          warehouse_id: warehouseId,
          status: "posted",
          refund_amount: p.recalc.refund_amount,
          return_type: "partial",
          date_from: null,
          date_to: null,
          note: input.note?.trim() || null,
          refusal_reason_ref:
            input.refusal_reason_ref != null && String(input.refusal_reason_ref).trim()
              ? String(input.refusal_reason_ref).trim().slice(0, 128)
              : null,
          created_by_user_id: uid,
          ...(p.retLines.length > 0
            ? {
                lines: {
                  create: p.retLines.map((rl) => ({
                    product_id: rl.product_id,
                    qty: new Prisma.Decimal(rl.qty),
                    paid_qty: new Prisma.Decimal(rl.paid_qty),
                    bonus_qty: new Prisma.Decimal(rl.bonus_qty)
                  }))
                }
              }
            : {})
        },
        include: {
          client: { select: { name: true } },
          order: { select: { number: true } },
          warehouse: { select: { name: true } }
        }
      });

      const mid = await createPolkiMirrorZayavka(tx, {
        tenantId,
        number: p.number,
        clientId: input.client_id,
        warehouseId,
        orderType: "return_by_order",
        retLines: p.retLines,
        refundAmount: p.recalc.refund_amount,
        note: input.note?.trim() || null,
        refusalReasonRef: input.refusal_reason_ref ?? null,
        sourceOrderNumber: p.sourceOrderNumber
      });
      mirrorOrderIds.push(mid);

      for (const rl of p.retLines) {
        if (!(rl.qty > 0)) continue;
        const delta = new Prisma.Decimal(rl.qty);
        await tx.stock.upsert({
          where: {
            tenant_id_warehouse_id_product_id: {
              tenant_id: tenantId,
              warehouse_id: warehouseId,
              product_id: rl.product_id
            }
          },
          create: {
            tenant_id: tenantId,
            warehouse_id: warehouseId,
            product_id: rl.product_id,
            qty: delta
          },
          update: { qty: { increment: delta } }
        });
      }

      if (p.recalc.refund_amount.gt(0)) {
        const bal = await tx.clientBalance.upsert({
          where: { tenant_id_client_id: { tenant_id: tenantId, client_id: input.client_id } },
          create: {
            tenant_id: tenantId,
            client_id: input.client_id,
            balance: p.recalc.refund_amount
          },
          update: { balance: { increment: p.recalc.refund_amount } }
        });
        await tx.clientBalanceMovement.create({
          data: {
            client_balance_id: bal.id,
            delta: p.recalc.refund_amount,
            note: `Vazvrat: ${p.number}`,
            user_id: uid
          }
        });
      }

      rows.push(ret);
    }
    return { rows, mirrorOrderIds };
  });

  for (const mid of mirrorOrderIds) {
    emitOrderUpdated(tenantId, mid);
  }
  void invalidateDashboard(tenantId);

  await autoMarkReturnedOrders(tenantId, input.client_id, undefined, undefined, uid);

  const returns: PeriodReturnResult[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i]!;
    const result = created[i]!;
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.stock,
      entityId: String(input.client_id),
      action: "period_return",
      payload: {
        return_id: result.id,
        number: result.number,
        order_id: p.orderId,
        bonus_recalc: {
          original_bonus_qty: p.recalc.original_bonus_qty,
          remaining_bonus_qty: p.recalc.remaining_bonus_qty,
          excess_bonus: p.recalc.excess_bonus,
          total_return_qty: p.recalc.total_return_qty,
          paid_return_qty: p.recalc.paid_return_qty,
          bonus_return_qty: p.recalc.bonus_return_qty,
          refund_amount: p.recalc.refund_amount.toString()
        },
        batch: true
      }
    });

    returns.push({
      id: result.id,
      number: result.number,
      refund_amount: result.refund_amount?.toString() ?? null,
      lines: p.retLines.map((rl) => ({
        product_id: rl.product_id,
        sku: pMap.get(rl.product_id)?.sku ?? "",
        name: pMap.get(rl.product_id)?.name ?? "",
        qty: String(rl.qty),
        paid_qty: String(rl.paid_qty),
        bonus_qty: String(rl.bonus_qty),
        paid_amount: R(rl.price).mul(rl.paid_qty).toString()
      })),
      bonus_recalc: { ...p.recalc, refund_amount: p.recalc.refund_amount.toString() }
    });
  }

  return { returns };
}

// ─── Auto-mark orders as "returned" ─────────────────────────────────────────

async function autoMarkReturnedOrders(
  tenantId: number, clientId: number,
  dateFrom?: string, dateTo?: string,
  actorUserId: number | null = null
): Promise<void> {
  const orderWhere: Prisma.OrderWhereInput = {
    tenant_id: tenantId, client_id: clientId,
    status: { notIn: ["cancelled", "returned"] }
  };
  if (dateFrom) orderWhere.created_at = { gte: localDayStart(dateFrom) };
  if (dateTo) orderWhere.created_at = { ...(orderWhere.created_at as object) ?? {}, lte: localDayEnd(dateTo) };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    orderBy: { created_at: "asc" },
    select: { id: true, status: true, order_type: true, items: { select: { product_id: true, qty: true } } }
  });
  if (orders.length === 0) return;

  const orderIds = orders.map((o) => o.id);
  const linkedReturns = await prisma.salesReturn.findMany({
    where: { tenant_id: tenantId, client_id: clientId, order_id: { in: orderIds }, status: "posted" },
    select: { order_id: true, lines: { select: { product_id: true, qty: true } } }
  });
  const linkedByOrderId = new Map<number, typeof linkedReturns>();
  for (const r of linkedReturns) {
    if (r.order_id == null) continue;
    const arr = linkedByOrderId.get(r.order_id) ?? [];
    arr.push(r);
    linkedByOrderId.set(r.order_id, arr);
  }

  /** Sana filtri bo‘lsa — `order_id`siz polki qaytarishlarni FIFO bilan zakazlarga taqsimlash. */
  const useFifoPool = dateFrom != null || dateTo != null;
  const pool = new Map<number, number>();
  if (useFifoPool) {
    const unlinkedWhere: Prisma.SalesReturnWhereInput = {
      tenant_id: tenantId,
      client_id: clientId,
      status: "posted",
      order_id: null
    };
    if (dateFrom) unlinkedWhere.created_at = { gte: localDayStart(dateFrom) };
    if (dateTo) {
      unlinkedWhere.created_at = {
        ...(unlinkedWhere.created_at as object) ?? {},
        lte: localDayEnd(dateTo)
      };
    }
    const unlinked = await prisma.salesReturn.findMany({
      where: unlinkedWhere,
      orderBy: { created_at: "asc" },
      select: { lines: { select: { product_id: true, qty: true } } }
    });
    for (const ret of unlinked) {
      for (const ln of ret.lines) {
        pool.set(ln.product_id, (pool.get(ln.product_id) ?? 0) + Number(ln.qty));
      }
    }
  }

  for (const ord of orders) {
    const orderedQty = new Map<number, number>();
    for (const item of ord.items) {
      orderedQty.set(item.product_id, (orderedQty.get(item.product_id) ?? 0) + Number(item.qty));
    }

    const returnedQty = new Map<number, number>();
    for (const ret of linkedByOrderId.get(ord.id) ?? []) {
      for (const ln of ret.lines) {
        returnedQty.set(ln.product_id, (returnedQty.get(ln.product_id) ?? 0) + Number(ln.qty));
      }
    }

    if (useFifoPool) {
      for (const [pid, ordQty] of orderedQty) {
        const have = returnedQty.get(pid) ?? 0;
        const need = Math.max(0, ordQty - have);
        if (need <= 0) continue;
        const avail = pool.get(pid) ?? 0;
        const take = Math.min(need, avail);
        if (take > 0) {
          returnedQty.set(pid, have + take);
          pool.set(pid, avail - take);
        }
      }
    }

    const allReturned = [...orderedQty.keys()].every((pid) => {
      const need = orderedQty.get(pid) ?? 0;
      const ret = returnedQty.get(pid) ?? 0;
      return ret >= need;
    });

    const otype = normalizeOrderType(ord.order_type);
    if (allReturned && canTransitionOrderStatus(ord.status, "returned", otype)) {
      await prisma.order.update({ where: { id: ord.id }, data: { status: "returned" } });
      await prisma.orderStatusLog.create({
        data: { order_id: ord.id, from_status: ord.status, to_status: "returned", user_id: actorUserId }
      });
    }
  }
}

// ─── Full order return ──────────────────────────────────────────────────────

export type FullReturnInput = {
  order_id: number;
  warehouse_id?: number;
  note?: string | null;
  refund_amount?: number;
  refusal_reason_ref?: string | null;
};

export async function createFullReturnFromOrder(
  tenantId: number, input: FullReturnInput,
  actorUserId: number | null
): Promise<PeriodReturnResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.order_id, tenant_id: tenantId },
    include: {
      items: { include: { product: { select: { sku: true, name: true } } } },
      client: { select: { id: true } }
    }
  });
  if (!order) throw new Error("BAD_ORDER");
  if (order.status === "cancelled" || order.status === "returned") {
    throw new Error("ORDER_NOT_RETURNABLE");
  }

  const existingFull = await prisma.salesReturn.findFirst({
    where: {
      tenant_id: tenantId,
      order_id: order.id,
      status: "posted",
      return_type: "order_full"
    },
    select: { id: true }
  });
  if (existingFull) throw new Error("ORDER_ALREADY_FULLY_RETURNED");

  const priorPosted = await prisma.salesReturn.findMany({
    where: { tenant_id: tenantId, order_id: order.id, status: "posted" },
    select: { lines: { select: { product_id: true, qty: true } } }
  });
  const returnedByProduct = new Map<number, number>();
  for (const r of priorPosted) {
    for (const ln of r.lines) {
      returnedByProduct.set(
        ln.product_id,
        (returnedByProduct.get(ln.product_id) ?? 0) + Number(ln.qty)
      );
    }
  }
  const orderedByProduct = new Map<number, number>();
  for (const it of order.items) {
    orderedByProduct.set(
      it.product_id,
      (orderedByProduct.get(it.product_id) ?? 0) + Number(it.qty)
    );
  }
  const alreadyFullyReturned = [...orderedByProduct.keys()].every((pid) => {
    const need = orderedByProduct.get(pid) ?? 0;
    const have = returnedByProduct.get(pid) ?? 0;
    return have >= need;
  });
  if (alreadyFullyReturned) throw new Error("ORDER_ALREADY_FULLY_RETURNED");

  const warehouseId = input.warehouse_id ?? await findReturnWarehouse(tenantId);
  const number = `VR-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const uid = actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const refund =
    input.refund_amount != null ? R(input.refund_amount) : R(order.total_sum);

  const bonusQtySum = order.items
    .filter((i) => i.is_bonus)
    .reduce((a, i) => a + Number(i.qty), 0);
  const paidQtySum = order.items
    .filter((i) => !i.is_bonus)
    .reduce((a, i) => a + Number(i.qty), 0);
  const totalQty = order.items.reduce((a, i) => a + Number(i.qty), 0);
  const orderType = normalizeOrderType(order.order_type);

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenant_id: tenantId, number,
        client_id: order.client_id, order_id: order.id,
        warehouse_id: warehouseId, status: "posted",
        refund_amount: refund,
        return_type: "order_full",
        note: input.note?.trim() || null,
        refusal_reason_ref:
          input.refusal_reason_ref != null && String(input.refusal_reason_ref).trim()
            ? String(input.refusal_reason_ref).trim().slice(0, 128)
            : null,
        created_by_user_id: uid,
        lines: {
          create: order.items.map(it => ({
            product_id: it.product_id, qty: it.qty,
            paid_qty: it.is_bonus ? new Prisma.Decimal(0) : it.qty,
            bonus_qty: it.is_bonus ? it.qty : new Prisma.Decimal(0)
          }))
        }
      }
    });

    for (const it of order.items) {
      await tx.stock.upsert({
        where: {
          tenant_id_warehouse_id_product_id: {
            tenant_id: tenantId, warehouse_id: warehouseId, product_id: it.product_id
          }
        },
        create: { tenant_id: tenantId, warehouse_id: warehouseId, product_id: it.product_id, qty: it.qty },
        update: { qty: { increment: it.qty } }
      });
    }

    if (canTransitionOrderStatus(order.status, "returned", orderType)) {
      await tx.order.update({ where: { id: order.id }, data: { status: "returned" } });
      await tx.orderStatusLog.create({
        data: { order_id: order.id, from_status: order.status, to_status: "returned", user_id: uid }
      });
    }

    if (refund.gt(0)) {
      const bal = await tx.clientBalance.upsert({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: order.client_id } },
        create: { tenant_id: tenantId, client_id: order.client_id, balance: refund },
        update: { balance: { increment: refund } }
      });
      await tx.clientBalanceMovement.create({
        data: { client_balance_id: bal.id, delta: refund, note: `Vazvrat: ${number}`, user_id: uid }
      });
    }

    return ret;
  });

  await appendTenantAuditEvent({
    tenantId, actorUserId, entityType: AuditEntityType.stock,
    entityId: String(created.id),
    action: "full_return",
    payload: { return_id: created.id, number: created.number, order_id: order.id }
  });

  return {
    id: created.id,
    number: created.number,
    refund_amount: created.refund_amount?.toString() ?? refund.toString(),
    lines: order.items.map(it => ({
      product_id: it.product_id,
      sku: it.product.sku, name: it.product.name,
      qty: it.qty.toString(),
      paid_qty: it.is_bonus ? "0" : it.qty.toString(),
      bonus_qty: it.is_bonus ? it.qty.toString() : "0",
      paid_amount: it.is_bonus ? "0" : it.total.toString()
    })),
    bonus_recalc: {
      original_bonus_qty: bonusQtySum,
      remaining_bonus_qty: 0,
      excess_bonus: bonusQtySum,
      total_return_qty: totalQty,
      paid_return_qty: paidQtySum,
      bonus_return_qty: bonusQtySum,
      refund_amount: refund.toString()
    }
  };
}
