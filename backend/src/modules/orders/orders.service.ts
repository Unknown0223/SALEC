import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { emitOrderUpdated } from "../../lib/order-event-bus";
import { getProductPrice } from "../products/product-prices.service";
import { parseBonusStackPolicy } from "./bonus-stack-policy";
import {
  fetchClientUsedAutoBonusRuleIds,
  fetchClientUsedAutoBonusRuleIdsExcludingOrder,
  resolveOrderBonusesForCreate
} from "./order-bonus-apply";
import {
  ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE,
  canTransitionOrderStatus,
  getAllowedNextStatuses,
  isBackwardTransition,
  isOperatorLateStageCancelForbidden,
  isValidOrderStatus
} from "./order-status";

export type OrderLineInput = { product_id: number; qty: number };

export type CreateOrderInput = {
  client_id: number;
  warehouse_id?: number | null;
  agent_id?: number | null;
  apply_bonus?: boolean;
  items: OrderLineInput[];
};

export type UpdateOrderLinesInput = {
  items: OrderLineInput[];
  warehouse_id?: number | null;
  agent_id?: number | null;
  apply_bonus?: boolean;
};

export type OrderItemRow = {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  price: string;
  total: string;
  is_bonus: boolean;
};

export type OrderListRow = {
  id: number;
  number: string;
  order_type: string | null;
  client_id: number;
  client_name: string;
  client_legal_name: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  agent_name: string | null;
  agent_code: string | null;
  expeditors: string | null;
  region: string | null;
  city: string | null;
  zone: string | null;
  consignment: boolean | null;
  day: string | null;
  created_by: string | null;
  created_by_role: string | null;
  expected_ship_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  status: string;
  qty: string;
  total_sum: string;
  bonus_sum: string;
  balance: string | null;
  debt: string | null;
  price_type: string | null;
  comment: string | null;
  created_at: string;
};

export type OrderStatusLogRow = {
  id: number;
  from_status: string;
  to_status: string;
  user_login: string | null;
  created_at: string;
};

export type OrderChangeLogRow = {
  id: number;
  action: string;
  payload: unknown;
  user_login: string | null;
  created_at: string;
};

export type OrderDetailRow = OrderListRow & {
  agent_id: number | null;
  warehouse_name: string | null;
  agent_display: string | null;
  apply_bonus: boolean;
  items: OrderItemRow[];
  allowed_next_statuses: string[];
  status_logs: OrderStatusLogRow[];
  change_logs: OrderChangeLogRow[];
};

export type UpdateOrderMetaInput = {
  warehouse_id?: number | null;
  agent_id?: number | null;
};

const orderDetailInclude: Prisma.OrderInclude = {
  client: { select: { name: true } },
  warehouse: { select: { id: true, name: true } },
  agent: { select: { id: true, login: true, name: true, code: true, consignment: true } },
  items: {
    orderBy: { id: "asc" },
    include: { product: { select: { sku: true, name: true } } }
  },
  /** So‘nggi yozuvlar (UI da eski → yangi tartibda). */
  status_logs: {
    orderBy: { created_at: "desc" },
    take: 100,
    include: { user: { select: { login: true } } }
  },
  change_logs: {
    orderBy: { created_at: "desc" },
    take: 100,
    include: { user: { select: { login: true } } }
  }
};

/** `orderDetailInclude` bilan yuklangan zakaz. */
export type OrderDetailLoaded = {
  id: number;
  number: string;
  client_id: number;
  warehouse_id: number | null;
  agent_id: number | null;
  status: string;
  total_sum: Prisma.Decimal;
  bonus_sum: Prisma.Decimal;
  applied_auto_bonus_rule_ids: number[];
  created_at: Date;
  client: { name: string };
  warehouse: { id: number; name: string } | null;
  agent: { id: number; login: string; name: string; code: string | null; consignment: boolean } | null;
  items: Array<{
    id: number;
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    is_bonus: boolean;
    product: { sku: string; name: string };
  }>;
  status_logs: Array<{
    id: number;
    from_status: string;
    to_status: string;
    created_at: Date;
    user: { login: string } | null;
  }>;
  change_logs: Array<{
    id: number;
    action: string;
    payload: Prisma.JsonValue;
    created_at: Date;
    user: { login: string } | null;
  }>;
};

function allowedNextForRole(status: string, viewerRole: string | undefined): string[] {
  if (status === "cancelled" && viewerRole !== "admin") {
    return [];
  }
  if (viewerRole === "operator") {
    return getAllowedNextStatuses(status, { omitBackward: true }).filter(
      (s) => !isOperatorLateStageCancelForbidden(status, s)
    );
  }
  return getAllowedNextStatuses(status);
}

function toDetailRow(o: OrderDetailLoaded, viewerRole?: string): OrderDetailRow {
  const agentDisplay = o.agent ? `${o.agent.login} (${o.agent.name})` : null;
  return {
    id: o.id,
    number: o.number,
    order_type: null,
    client_id: o.client_id,
    client_name: o.client.name,
    client_legal_name: null,
    warehouse_id: o.warehouse_id,
    warehouse_name: o.warehouse?.name ?? null,
    agent_name: o.agent?.name ?? null,
    agent_code: o.agent?.code ?? null,
    expeditors: null,
    region: null,
    city: null,
    zone: null,
    consignment: o.agent?.consignment ?? null,
    day: null,
    created_by: null,
    created_by_role: null,
    expected_ship_date: null,
    shipped_at: null,
    delivered_at: null,
    qty: o.items
      .filter((i) => !i.is_bonus)
      .reduce((acc, i) => acc.add(i.qty), new Prisma.Decimal(0))
      .toString(),
    agent_id: o.agent_id,
    agent_display: agentDisplay,
    apply_bonus: o.applied_auto_bonus_rule_ids.length > 0,
    status: o.status,
    total_sum: o.total_sum.toString(),
    bonus_sum: o.bonus_sum.toString(),
    balance: null,
    debt: null,
    price_type: null,
    comment: null,
    created_at: o.created_at.toISOString(),
    items: mapItems(o.items),
    allowed_next_statuses: allowedNextForRole(o.status, viewerRole),
    status_logs: [...o.status_logs].reverse().map((l) => ({
      id: l.id,
      from_status: l.from_status,
      to_status: l.to_status,
      user_login: l.user?.login ?? null,
      created_at: l.created_at.toISOString()
    })),
    change_logs: [...o.change_logs].reverse().map((l) => ({
      id: l.id,
      action: l.action,
      payload: l.payload,
      user_login: l.user?.login ?? null,
      created_at: l.created_at.toISOString()
    }))
  };
}

function mapItems(
  items: Array<{
    id: number;
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    is_bonus: boolean;
    product: { sku: string; name: string };
  }>
): OrderItemRow[] {
  return items.map((i) => ({
    id: i.id,
    product_id: i.product_id,
    sku: i.product.sku,
    name: i.product.name,
    qty: i.qty.toString(),
    price: i.price.toString(),
    total: i.total.toString(),
    is_bonus: i.is_bonus
  }));
}

export async function createOrder(
  tenantId: number,
  input: CreateOrderInput,
  viewerRole?: string
): Promise<OrderDetailRow> {
  if (!input.items.length) {
    throw new Error("EMPTY_ITEMS");
  }

  const client = await prisma.client.findFirst({
    where: {
      id: input.client_id,
      tenant_id: tenantId,
      merged_into_client_id: null,
      is_active: true
    }
  });
  if (!client) {
    throw new Error("BAD_CLIENT");
  }

  if (input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.warehouse_id, tenant_id: tenantId }
    });
    if (!wh) {
      throw new Error("BAD_WAREHOUSE");
    }
  }

  if (input.agent_id != null) {
    const u = await prisma.user.findFirst({
      where: { id: input.agent_id, tenant_id: tenantId, is_active: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
  }

  const lineData: Array<{
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
  }> = [];
  let totalSum = new Prisma.Decimal(0);
  const qtyByProduct = new Map<number, number>();
  const productById = new Map<number, { id: number; category_id: number | null }>();
  const orderedProductIds = new Set<number>();

  for (const it of input.items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      throw new Error("BAD_QTY");
    }
    const product = await prisma.product.findFirst({
      where: { id: it.product_id, tenant_id: tenantId, is_active: true }
    });
    if (!product) {
      throw new Error("BAD_PRODUCT");
    }
    const priceStr = await getProductPrice(tenantId, it.product_id, "retail");
    if (priceStr == null) {
      const e = new Error("NO_PRICE") as Error & { product_id: number };
      e.product_id = it.product_id;
      throw e;
    }
    const price = new Prisma.Decimal(priceStr);
    const qty = new Prisma.Decimal(it.qty);
    const lineTotal = qty.mul(price);
    totalSum = totalSum.add(lineTotal);
    lineData.push({ product_id: it.product_id, qty, price, total: lineTotal });
    productById.set(product.id, { id: product.id, category_id: product.category_id });
    qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + it.qty);
    orderedProductIds.add(it.product_id);
  }
  if (orderedProductIds.size !== input.items.length) {
    throw new Error("DUPLICATE_PRODUCT");
  }

  const number = `O-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const stackPolicy = parseBonusStackPolicy(tenantRow?.settings);

  const order = await prisma.$transaction(async (tx) => {
    const applyBonus = input.apply_bonus ?? true;
    let paidAfterDisc = lineData;
    let paidTotal = totalSum;
    let bonusDrafts: Array<{
      product_id: number;
      qty: Prisma.Decimal;
      price: Prisma.Decimal;
      total: Prisma.Decimal;
    }> = [];
    let appliedAutoBonusRuleIds: number[] = [];
    if (applyBonus) {
      const usedRuleIds = await fetchClientUsedAutoBonusRuleIds(tx, tenantId, client.id);
      const resolved = await resolveOrderBonusesForCreate(
        tx,
        tenantId,
        { id: client.id, category: client.category },
        lineData,
        totalSum,
        totalSum,
        qtyByProduct,
        productById,
        orderedProductIds,
        stackPolicy,
        usedRuleIds
      );
      paidAfterDisc = resolved.lines;
      paidTotal = resolved.total;
      bonusDrafts = resolved.bonusDrafts;
      appliedAutoBonusRuleIds = resolved.appliedAutoBonusRuleIds;
    }

    let bonusSum = new Prisma.Decimal(0);
    const bonusCreates = bonusDrafts.map((b) => {
      bonusSum = bonusSum.add(b.total);
      return {
        product_id: b.product_id,
        qty: b.qty,
        price: b.price,
        total: b.total,
        is_bonus: true as const
      };
    });

    const creditLimit = client.credit_limit;
    if (creditLimit.gt(0)) {
      const balRow = await tx.clientBalance.findUnique({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: client.id } },
        select: { balance: true }
      });
      const accountBalance = balRow?.balance ?? new Prisma.Decimal(0);
      const headroom = creditLimit.add(accountBalance);
      const agg = await tx.order.aggregate({
        where: {
          tenant_id: tenantId,
          client_id: client.id,
          status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
        },
        _sum: { total_sum: true }
      });
      const outstanding = agg._sum.total_sum ?? new Prisma.Decimal(0);
      const projected = outstanding.add(paidTotal);
      if (projected.gt(headroom)) {
        const err = new Error("CREDIT_LIMIT_EXCEEDED") as Error & {
          credit_limit: string;
          outstanding: string;
          order_total: string;
        };
        err.credit_limit = headroom.toString();
        err.outstanding = outstanding.toString();
        err.order_total = paidTotal.toString();
        throw err;
      }
    }

    return tx.order.create({
      data: {
        tenant_id: tenantId,
        number,
        client_id: input.client_id,
        warehouse_id: input.warehouse_id ?? null,
        agent_id: input.agent_id ?? null,
        status: "new",
        total_sum: paidTotal,
        bonus_sum: bonusSum,
        applied_auto_bonus_rule_ids: appliedAutoBonusRuleIds,
        items: {
          create: [
            ...paidAfterDisc.map((l) => ({
              product_id: l.product_id,
              qty: l.qty,
              price: l.price,
              total: l.total,
              is_bonus: false
            })),
            ...bonusCreates
          ]
        }
      },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, order.id);
  return toDetailRow(order as unknown as OrderDetailLoaded, viewerRole);
}

const ORDER_LINES_EDITABLE_STATUSES = new Set(["new", "confirmed"]);

/**
 * To‘lov qatorlarini almashtiradi, bonuslarni qayta hisoblaydi (`new` / `confirmed` holatda).
 */
export async function updateOrderLines(
  tenantId: number,
  orderId: number,
  input: UpdateOrderLinesInput,
  viewerRole?: string,
  actorUserId?: number | null
): Promise<OrderDetailRow> {
  if (!input.items.length) {
    throw new Error("EMPTY_ITEMS");
  }

  const existing = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  if (!ORDER_LINES_EDITABLE_STATUSES.has(existing.status)) {
    throw new Error("ORDER_NOT_EDITABLE");
  }

  if (viewerRole === "operator") {
    throw new Error("FORBIDDEN_OPERATOR_ORDER_LINES_EDIT");
  }

  const prevPaidItems = await prisma.orderItem.findMany({
    where: { order_id: orderId, is_bonus: false },
    orderBy: { id: "asc" },
    select: { product_id: true, qty: true }
  });

  const logUserId =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const client = await prisma.client.findFirst({
    where: {
      id: existing.client_id,
      tenant_id: tenantId,
      merged_into_client_id: null,
      is_active: true
    }
  });
  if (!client) {
    throw new Error("BAD_CLIENT");
  }

  const warehouseId =
    input.warehouse_id !== undefined ? input.warehouse_id : existing.warehouse_id;
  const agentId = input.agent_id !== undefined ? input.agent_id : existing.agent_id;

  if (warehouseId != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenant_id: tenantId }
    });
    if (!wh) {
      throw new Error("BAD_WAREHOUSE");
    }
  }

  if (agentId != null) {
    const u = await prisma.user.findFirst({
      where: { id: agentId, tenant_id: tenantId, is_active: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
  }

  const lineData: Array<{
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
  }> = [];
  let totalSum = new Prisma.Decimal(0);
  const qtyByProduct = new Map<number, number>();
  const productById = new Map<number, { id: number; category_id: number | null }>();
  const orderedProductIds = new Set<number>();

  for (const it of input.items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      throw new Error("BAD_QTY");
    }
    const product = await prisma.product.findFirst({
      where: { id: it.product_id, tenant_id: tenantId, is_active: true }
    });
    if (!product) {
      throw new Error("BAD_PRODUCT");
    }
    const priceStr = await getProductPrice(tenantId, it.product_id, "retail");
    if (priceStr == null) {
      const e = new Error("NO_PRICE") as Error & { product_id: number };
      e.product_id = it.product_id;
      throw e;
    }
    const price = new Prisma.Decimal(priceStr);
    const qty = new Prisma.Decimal(it.qty);
    const lineTotal = qty.mul(price);
    totalSum = totalSum.add(lineTotal);
    lineData.push({ product_id: it.product_id, qty, price, total: lineTotal });
    productById.set(product.id, { id: product.id, category_id: product.category_id });
    qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + it.qty);
    orderedProductIds.add(it.product_id);
  }
  if (orderedProductIds.size !== input.items.length) {
    throw new Error("DUPLICATE_PRODUCT");
  }

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const stackPolicy = parseBonusStackPolicy(tenantRow?.settings);

  const updated = await prisma.$transaction(async (tx) => {
    const applyBonus = input.apply_bonus ?? true;
    let paidAfterDisc = lineData;
    let paidTotal = totalSum;
    let bonusDrafts: Array<{
      product_id: number;
      qty: Prisma.Decimal;
      price: Prisma.Decimal;
      total: Prisma.Decimal;
    }> = [];
    let appliedAutoBonusRuleIds: number[] = [];
    if (applyBonus) {
      const usedRuleIds = await fetchClientUsedAutoBonusRuleIdsExcludingOrder(
        tx,
        tenantId,
        client.id,
        orderId
      );
      const resolved = await resolveOrderBonusesForCreate(
        tx,
        tenantId,
        { id: client.id, category: client.category },
        lineData,
        totalSum,
        totalSum,
        qtyByProduct,
        productById,
        orderedProductIds,
        stackPolicy,
        usedRuleIds
      );
      paidAfterDisc = resolved.lines;
      paidTotal = resolved.total;
      bonusDrafts = resolved.bonusDrafts;
      appliedAutoBonusRuleIds = resolved.appliedAutoBonusRuleIds;
    }

    let bonusSum = new Prisma.Decimal(0);
    const bonusCreates = bonusDrafts.map((b) => {
      bonusSum = bonusSum.add(b.total);
      return {
        product_id: b.product_id,
        qty: b.qty,
        price: b.price,
        total: b.total,
        is_bonus: true as const
      };
    });

    const creditLimit = client.credit_limit;
    if (creditLimit.gt(0)) {
      const balRow = await tx.clientBalance.findUnique({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: client.id } },
        select: { balance: true }
      });
      const accountBalance = balRow?.balance ?? new Prisma.Decimal(0);
      const headroom = creditLimit.add(accountBalance);
      const agg = await tx.order.aggregate({
        where: {
          tenant_id: tenantId,
          client_id: client.id,
          id: { not: orderId },
          status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
        },
        _sum: { total_sum: true }
      });
      const outstanding = agg._sum.total_sum ?? new Prisma.Decimal(0);
      const projected = outstanding.add(paidTotal);
      if (projected.gt(headroom)) {
        const err = new Error("CREDIT_LIMIT_EXCEEDED") as Error & {
          credit_limit: string;
          outstanding: string;
          order_total: string;
        };
        err.credit_limit = headroom.toString();
        err.outstanding = outstanding.toString();
        err.order_total = paidTotal.toString();
        throw err;
      }
    }

    await tx.orderItem.deleteMany({ where: { order_id: orderId } });

    await tx.order.update({
      where: { id: orderId },
      data: {
        warehouse_id: warehouseId,
        agent_id: agentId,
        total_sum: paidTotal,
        bonus_sum: bonusSum,
        applied_auto_bonus_rule_ids: appliedAutoBonusRuleIds,
        items: {
          create: [
            ...paidAfterDisc.map((l) => ({
              product_id: l.product_id,
              qty: l.qty,
              price: l.price,
              total: l.total,
              is_bonus: false
            })),
            ...bonusCreates
          ]
        }
      }
    });

    const linesPayload: Prisma.InputJsonObject = {
      total_sum: { from: existing.total_sum.toString(), to: paidTotal.toString() },
      bonus_sum: { from: existing.bonus_sum.toString(), to: bonusSum.toString() },
      warehouse_id: { from: existing.warehouse_id, to: warehouseId },
      agent_id: { from: existing.agent_id, to: agentId },
      paid_lines: {
        from: prevPaidItems.map((r) => ({
          product_id: r.product_id,
          qty: r.qty.toString()
        })),
        to: paidAfterDisc.map((l) => ({
          product_id: l.product_id,
          qty: l.qty.toString()
        }))
      }
    };

    await tx.orderChangeLog.create({
      data: {
        order_id: orderId,
        user_id: logUserId,
        action: "lines",
        payload: linesPayload
      }
    });

    return tx.order.findFirstOrThrow({
      where: { id: orderId, tenant_id: tenantId },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, orderId);
  return toDetailRow(updated as unknown as OrderDetailLoaded, viewerRole);
}

/**
 * Ombor / agent maydonlarini yangilash — faqat `new` / `confirmed` (qator tahriri bilan bir xil).
 */
export async function updateOrderMeta(
  tenantId: number,
  orderId: number,
  input: UpdateOrderMetaInput,
  viewerRole?: string,
  actorUserId?: number | null
): Promise<OrderDetailRow> {
  if (input.warehouse_id === undefined && input.agent_id === undefined) {
    throw new Error("EMPTY_META_PATCH");
  }

  const existing = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  if (!ORDER_LINES_EDITABLE_STATUSES.has(existing.status)) {
    throw new Error("ORDER_NOT_EDITABLE");
  }

  const nextWarehouseId =
    input.warehouse_id !== undefined ? input.warehouse_id : existing.warehouse_id;
  const nextAgentId = input.agent_id !== undefined ? input.agent_id : existing.agent_id;

  const whChanged =
    input.warehouse_id !== undefined && input.warehouse_id !== existing.warehouse_id;
  const agChanged = input.agent_id !== undefined && input.agent_id !== existing.agent_id;
  if (!whChanged && !agChanged) {
    return getOrderDetail(tenantId, orderId, viewerRole);
  }

  const logUserId =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  if (nextWarehouseId != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: nextWarehouseId, tenant_id: tenantId }
    });
    if (!wh) {
      throw new Error("BAD_WAREHOUSE");
    }
  }

  if (nextAgentId != null) {
    const u = await prisma.user.findFirst({
      where: { id: nextAgentId, tenant_id: tenantId, is_active: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
  }

  const metaPayload: Prisma.InputJsonObject = {
    warehouse_id: { from: existing.warehouse_id, to: nextWarehouseId },
    agent_id: { from: existing.agent_id, to: nextAgentId }
  };

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        warehouse_id: nextWarehouseId,
        agent_id: nextAgentId
      }
    }),
    prisma.orderChangeLog.create({
      data: {
        order_id: orderId,
        user_id: logUserId,
        action: "meta",
        payload: metaPayload
      }
    })
  ]);

  emitOrderUpdated(tenantId, orderId);
  return getOrderDetail(tenantId, orderId, viewerRole);
}

export async function updateOrderStatus(
  tenantId: number,
  orderId: number,
  nextStatus: string,
  actorUserId: number | null,
  actorRole: string
): Promise<OrderDetailRow> {
  const trimmed = nextStatus.trim();
  if (!isValidOrderStatus(trimmed)) {
    throw new Error("INVALID_STATUS");
  }

  const o = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId },
    include: orderDetailInclude
  });
  if (!o) {
    throw new Error("NOT_FOUND");
  }

  if (o.status === trimmed) {
    return toDetailRow(o as unknown as OrderDetailLoaded, actorRole);
  }

  if (!canTransitionOrderStatus(o.status, trimmed)) {
    const err = new Error("INVALID_TRANSITION") as Error & { from: string; to: string };
    err.from = o.status;
    err.to = trimmed;
    throw err;
  }

  if (isBackwardTransition(o.status, trimmed) && actorRole !== "admin") {
    throw new Error("FORBIDDEN_REVERT");
  }

  if (o.status === "cancelled" && trimmed === "new" && actorRole !== "admin") {
    throw new Error("FORBIDDEN_REOPEN_CANCELLED");
  }

  if (actorRole === "operator" && isOperatorLateStageCancelForbidden(o.status, trimmed)) {
    throw new Error("FORBIDDEN_OPERATOR_CANCEL_LATE");
  }

  const fromStatus = o.status;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: o.id },
      data: { status: trimmed }
    });
    await tx.orderStatusLog.create({
      data: {
        order_id: o.id,
        from_status: fromStatus,
        to_status: trimmed,
        user_id:
          actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null
      }
    });
    return tx.order.findFirstOrThrow({
      where: { id: o.id, tenant_id: tenantId },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, orderId);
  return toDetailRow(updated as unknown as OrderDetailLoaded, actorRole);
}

export type ListOrdersQuery = {
  page: number;
  limit: number;
  status?: string;
  client_id?: number;
};

export async function listOrdersPaged(
  tenantId: number,
  q: ListOrdersQuery
): Promise<{ data: OrderListRow[]; total: number; page: number; limit: number }> {
  const where: Prisma.OrderWhereInput = { tenant_id: tenantId };
  if (q.status?.trim()) {
    where.status = q.status.trim();
  }
  if (q.client_id != null && Number.isFinite(q.client_id) && q.client_id > 0) {
    where.client_id = q.client_id;
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { created_at: "desc" },
      include: {
        client: {
          select: {
            name: true,
            region: true,
            district: true,
            neighborhood: true
          }
        },
        warehouse: { select: { name: true } },
        agent: { select: { name: true, code: true, consignment: true } },
        items: { select: { qty: true, is_bonus: true } }
      }
    })
  ]);

  return {
    data: rows.map((o) => ({
      id: o.id,
      number: o.number,
      order_type: null,
      client_id: o.client_id,
      client_name: o.client.name,
      client_legal_name: null,
      warehouse_id: o.warehouse_id,
      warehouse_name: o.warehouse?.name ?? null,
      agent_name: o.agent?.name ?? null,
      agent_code: o.agent?.code ?? null,
      expeditors: null,
      region: o.client.region ?? null,
      city: o.client.district ?? null,
      zone: o.client.neighborhood ?? null,
      consignment: o.agent?.consignment ?? null,
      day: null,
      created_by: null,
      created_by_role: null,
      expected_ship_date: null,
      shipped_at: null,
      delivered_at: null,
      status: o.status,
      qty: o.items
        .filter((i) => !i.is_bonus)
        .reduce((acc, i) => acc.add(i.qty), new Prisma.Decimal(0))
        .toString(),
      total_sum: o.total_sum.toString(),
      bonus_sum: o.bonus_sum.toString(),
      balance: null,
      debt: null,
      price_type: null,
      comment: null,
      created_at: o.created_at.toISOString()
    })),
    total,
    page: q.page,
    limit: q.limit
  };
}

export async function getOrderDetail(
  tenantId: number,
  id: number,
  viewerRole?: string
): Promise<OrderDetailRow> {
  const o = await prisma.order.findFirst({
    where: { id, tenant_id: tenantId },
    include: orderDetailInclude
  });
  if (!o) {
    throw new Error("NOT_FOUND");
  }
  return toDetailRow(o as unknown as OrderDetailLoaded, viewerRole);
}

