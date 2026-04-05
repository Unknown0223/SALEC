import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import {
  computeQtyBonusForRuleRow,
  mapBonusRuleFull,
  bonusRuleInclude,
  type BonusRuleRow
} from "../bonus-rules/bonus-rules.service";
import { getProductPrice } from "../products/product-prices.service";
import { canTransitionOrderStatus } from "../orders/order-status";

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

export const MAX_RETURN_ITEMS = 12;

export type CreatePeriodReturnInput = {
  warehouse_id?: number;
  client_id: number;
  order_id?: number;
  date_from?: string;
  date_to?: string;
  lines: { product_id: number; qty: number }[];
  note?: string | null;
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

// ─── Get client returns data ────────────────────────────────────────────────

export async function getClientReturnsData(
  tenantId: number,
  clientId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<ClientReturnsData> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  // Orders in period
  const orderWhere: Prisma.OrderWhereInput = {
    tenant_id: tenantId,
    client_id: clientId,
    status: { notIn: ["cancelled"] }
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

// ─── Bonus recalculation for returns ────────────────────────────────────────

function matchRule(rule: BonusRuleRow, pid: number, catId: number | null): boolean {
  if (rule.product_ids.length > 0 && !rule.product_ids.includes(pid)) return false;
  if (rule.product_category_ids.length > 0) {
    if (catId == null || !rule.product_category_ids.includes(catId)) return false;
  }
  return true;
}

function calcQtyBonus(
  rules: BonusRuleRow[],
  qtyMap: Record<number, number>,
  catById: Map<number, number | null>
): number {
  let total = 0;
  for (const [pidStr, qty] of Object.entries(qtyMap)) {
    const pid = Number(pidStr);
    for (const rule of rules) {
      if (matchRule(rule, pid, catById.get(pid) ?? null)) {
        total += computeQtyBonusForRuleRow(rule, qty);
        break;
      }
    }
  }
  return total;
}

/**
 * Core logic: compute how many of returned items are bonus (0 sum) vs paid.
 *
 * 1. Total qty of all items in period
 * 2. Remaining qty = total - returned
 * 3. original_bonus = bonus(total) using active qty rules
 * 4. remaining_bonus = bonus(remaining)
 * 5. excess_bonus = original_bonus - remaining_bonus
 * 6. From returned items: excess_bonus count are "bonus" (0 so'm), rest are paid
 */
async function computeReturnBonusRecalc(
  tenantId: number,
  clientId: number,
  allItems: { product_id: number; qty: number; price: number; is_bonus: boolean }[],
  returnedLines: { product_id: number; qty: number }[]
): Promise<{
  lines: { product_id: number; qty: number; paid_qty: number; bonus_qty: number; price: number }[];
  recalc: {
    original_bonus_qty: number;
    remaining_bonus_qty: number;
    excess_bonus: number;
    total_return_qty: number;
    paid_return_qty: number;
    bonus_return_qty: number;
    refund_amount: Prisma.Decimal;
  };
}> {
  // Aggregated total qty by product
  const totalQtyMap: Record<number, number> = {};
  for (const it of allItems) {
    totalQtyMap[it.product_id] = (totalQtyMap[it.product_id] ?? 0) + it.qty;
  }

  // Returned qty by product
  const retMap = new Map<number, number>();
  for (const rl of returnedLines) retMap.set(rl.product_id, rl.qty);

  // Remaining qty by product
  const remainMap: Record<number, number> = {};
  for (const [pidStr, tQty] of Object.entries(totalQtyMap)) {
    const pid = Number(pidStr);
    const r = retMap.get(pid) ?? 0;
    if (tQty - r > 0) remainMap[pid] = tQty - r;
  }

  // Product categories
  const pids = [...new Set([...Object.keys(totalQtyMap).map(Number)])];
  const prods = await prisma.product.findMany({
    where: { tenant_id: tenantId, id: { in: pids } },
    select: { id: true, category_id: true }
  });
  const catById = new Map(prods.map(p => [p.id, p.category_id]));

  // Price by product
  const priceMap = new Map<number, number>();
  for (const it of allItems) priceMap.set(it.product_id, it.price);

  // Active bonus rules
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId },
    select: { id: true, category: true }
  });
  const now = new Date();
  const rawRules = await prisma.bonusRule.findMany({
    where: {
      tenant_id: tenantId, type: "qty", is_active: true,
      AND: [
        { OR: [{ valid_from: null }, { valid_from: { lte: now } }] },
        { OR: [{ valid_to: null }, { valid_to: { gte: now } }] }
      ]
    },
    include: bonusRuleInclude,
    orderBy: { priority: "desc" }
  });

  const rules = rawRules
    .map(mapBonusRuleFull)
    .filter(r => {
      if (!r.target_all_clients && !r.selected_client_ids.includes(clientId)) return false;
      if (r.client_category && String(r.client_category).trim() !== String(client?.category ?? "").trim()) return false;
      return true;
    });

  const origBonus = calcQtyBonus(rules, totalQtyMap, catById);
  const remainBonus = calcQtyBonus(rules, remainMap, catById);
  const excessBonus = Math.max(0, origBonus - remainBonus);
  const totalRetQty = returnedLines.reduce((a, l) => a + l.qty, 0);
  const bonusRetQty = Math.min(excessBonus, totalRetQty);
  const paidRetQty = totalRetQty - bonusRetQty;

  // Distribute bonus return qty across lines
  let bonusLeft = bonusRetQty;
  let refund = new Prisma.Decimal(0);

  const resultLines = returnedLines.map(rl => {
    const price = priceMap.get(rl.product_id) ?? 0;
    const bQty = Math.min(bonusLeft, rl.qty);
    const pQty = rl.qty - bQty;
    bonusLeft -= bQty;
    refund = refund.add(R(price).mul(pQty));
    return { product_id: rl.product_id, qty: rl.qty, paid_qty: pQty, bonus_qty: bQty, price };
  });

  return { lines: resultLines, recalc: {
    original_bonus_qty: origBonus,
    remaining_bonus_qty: remainBonus,
    excess_bonus: excessBonus,
    total_return_qty: totalRetQty,
    paid_return_qty: paidRetQty,
    bonus_return_qty: bonusRetQty,
    refund_amount: refund
  }};
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

// ─── Create period return ────────────────────────────────────────────────────

export async function createPeriodReturn(
  tenantId: number,
  input: CreatePeriodReturnInput,
  actorUserId: number | null
): Promise<PeriodReturnResult> {
  if (!input.lines.length) throw new Error("EMPTY_LINES");

  const totalQty = input.lines.reduce((a, l) => a + l.qty, 0);
  if (totalQty > MAX_RETURN_ITEMS) throw new Error("TOO_MANY_ITEMS");

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

  // Get all items in period for bonus recalc
  const cdata = await getClientReturnsData(tenantId, input.client_id, input.date_from, input.date_to);

  const allItems = cdata.items.map(i => ({
    product_id: i.product_id, qty: Number(i.qty), price: Number(i.price), is_bonus: i.is_bonus
  }));

  // Already returned qty by product
  const alreadyRetMap = new Map<number, number>();
  for (const it of cdata.items) {
    // We need this from the returns fetched inside getClientReturnsData...
    // Recalculate here
  }

  // Recalculate already returned by product
  const returnWhere: Prisma.SalesReturnWhereInput = {
    tenant_id: tenantId, client_id: input.client_id, status: "posted"
  };
  if (input.date_from) returnWhere.created_at = { gte: localDayStart(input.date_from) };
  if (input.date_to) returnWhere.created_at = { ...(returnWhere.created_at as object) ?? {}, lte: localDayEnd(input.date_to) };

  const prevReturns = await prisma.salesReturn.findMany({
    where: returnWhere,
    select: { lines: { select: { product_id: true, qty: true } } }
  });
  for (const ret of prevReturns) {
    for (const ln of ret.lines) {
      alreadyRetMap.set(ln.product_id, (alreadyRetMap.get(ln.product_id) ?? 0) + Number(ln.qty));
    }
  }

  validateReturnQty(allItems, alreadyRetMap, input.lines);

  // Check max returnable value
  const maxRet = new Prisma.Decimal(cdata.max_returnable_value);
  if (maxRet.lte(0)) throw new Error("NOTHING_TO_RETURN");

  // Bonus recalc
  const { lines: retLines, recalc } = await computeReturnBonusRecalc(
    tenantId, input.client_id, allItems, input.lines
  );

  if (recalc.refund_amount.gt(maxRet)) {
    // Use the actual recalc refund amount but cap it
    recalc.refund_amount = maxRet;
  }

  const number = `VR-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const uid = actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const result = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenant_id: tenantId, number,
        client_id: input.client_id,
        order_id: input.order_id ?? null,
        warehouse_id: warehouseId,
        status: "posted",
        refund_amount: recalc.refund_amount,
        return_type: "partial",
        date_from: input.date_from ? new Date(input.date_from) : null,
        date_to: input.date_to ? new Date(input.date_to) : null,
        note: input.note?.trim() || null,
        created_by_user_id: uid,
        lines: {
          create: retLines.map(rl => ({
            product_id: rl.product_id,
            qty: new Prisma.Decimal(rl.qty),
            paid_qty: new Prisma.Decimal(rl.paid_qty),
            bonus_qty: new Prisma.Decimal(rl.bonus_qty)
          }))
        }
      },
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } },
        warehouse: { select: { name: true } }
      }
    });

    // Stock: add to return warehouse
    for (const rl of retLines) {
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

    return ret;
  });

  // Auto-mark orders as returned
  await autoMarkReturnedOrders(tenantId, input.client_id, input.date_from, input.date_to, uid);

  await appendTenantAuditEvent({
    tenantId, actorUserId, entityType: AuditEntityType.stock,
    entityId: String(input.client_id), action: "period_return",
    payload: { return_id: result.id, number: result.number, bonus_recalc: recalc }
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
    select: { id: true, status: true, order_type: true, items: { select: { product_id: true, qty: true } } }
  });

  for (const ord of orders) {
    const returnedQty = new Map<number, number>();
    const rets = await prisma.salesReturn.findMany({
      where: { tenant_id: tenantId, client_id: clientId, order_id: ord.id, status: "posted" },
      select: { lines: { select: { product_id: true, qty: true } } }
    });
    for (const ret of rets) {
      for (const ln of ret.lines) {
        returnedQty.set(ln.product_id, (returnedQty.get(ln.product_id) ?? 0) + Number(ln.qty));
      }
    }

    const allReturned = ord.items.every(item => {
      const ret = returnedQty.get(item.product_id) ?? 0;
      return ret >= Number(item.qty);
    });

    if (allReturned && canTransitionOrderStatus(ord.status, "returned", ord.order_type as any)) {
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

  const warehouseId = input.warehouse_id ?? await findReturnWarehouse(tenantId);
  const number = `VR-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const uid = actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const refund = input.refund_amount != null ? new Prisma.Decimal(input.refund_amount) : order.total_sum;

  const bonusItemsCount = order.items.filter(i => i.is_bonus).length;
  const totalQty = order.items.reduce((a, i) => a + Number(i.qty), 0);

  await prisma.$transaction(async (tx) => {
    await tx.salesReturn.create({
      data: {
        tenant_id: tenantId, number,
        client_id: order.client_id, order_id: order.id,
        warehouse_id: warehouseId, status: "posted",
        refund_amount: refund, return_type: "order_full",
        note: input.note?.trim() || null, created_by_user_id: uid,
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

    if (canTransitionOrderStatus(order.status, "returned")) {
      await tx.order.update({ where: { id: order.id }, data: { status: "returned" } });
      await tx.orderStatusLog.create({
        data: { order_id: order.id, from_status: order.status, to_status: "returned", user_id: uid }
      });
    }

    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: order.client_id } },
      create: { tenant_id: tenantId, client_id: order.client_id, balance: refund },
      update: { balance: { increment: refund } }
    });
    await tx.clientBalanceMovement.create({
      data: { client_balance_id: bal.id, delta: refund, note: `Vazvrat: ${number}`, user_id: uid }
    });
  });

  await appendTenantAuditEvent({
    tenantId, actorUserId, entityType: AuditEntityType.stock,
    entityId: String(order.client_id), action: "full_return",
    payload: { return_id: order.id, number, order_id: order.id }
  });

  return {
    id: 0, number,
    refund_amount: refund.toString(),
    lines: order.items.map(it => ({
      product_id: it.product_id,
      sku: it.product.sku, name: it.product.name,
      qty: it.qty.toString(),
      paid_qty: it.is_bonus ? "0" : it.qty.toString(),
      bonus_qty: it.is_bonus ? it.qty.toString() : "0",
      paid_amount: it.is_bonus ? "0" : it.total.toString()
    })),
    bonus_recalc: {
      original_bonus_qty: bonusItemsCount,
      remaining_bonus_qty: 0,
      excess_bonus: bonusItemsCount,
      total_return_qty: totalQty,
      paid_return_qty: totalQty - bonusItemsCount,
      bonus_return_qty: bonusItemsCount,
      refund_amount: refund.toString()
    }
  };
}
