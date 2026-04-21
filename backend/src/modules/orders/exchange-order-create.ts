import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { getProductPrice } from "../products/product-prices.service";
import { assertExchangeInterchangeableProducts } from "../products/product-catalog.service";
import { resolveConstraintScope } from "../linkage/linkage.service";
import {
  validateExchangeMinusAgainstSourceOrders,
  type ExchangeMetaPayload,
  type ExchangeMinusLineInput
} from "./exchange-source-limits.service";

export type ExchangeCreateBody = {
  source_order_ids: number[];
  minus_lines: ExchangeMinusLineInput[];
  plus_lines: { product_id: number; qty: number }[];
  reason_ref?: string | null;
};

export type ExchangeLinePrepared = {
  product_id: number;
  qty: Prisma.Decimal;
  price: Prisma.Decimal;
  total: Prisma.Decimal;
  exchange_line_kind: "minus" | "plus";
};

function roundMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function valueForMinusFromSourceOrder(
  tenantId: number,
  orderId: number,
  productId: number,
  qty: number
): Promise<{ total: Prisma.Decimal; unit: Prisma.Decimal }> {
  const lines = await prisma.orderItem.findMany({
    where: {
      order_id: orderId,
      product_id: productId,
      order: { tenant_id: tenantId }
    },
    orderBy: [{ is_bonus: "asc" }, { id: "asc" }]
  });
  if (lines.length === 0) {
    throw new Error("EXCHANGE_BAD_SOURCE_LINE");
  }
  let rem = new Prisma.Decimal(qty);
  let totalVal = new Prisma.Decimal(0);
  for (const ln of lines) {
    if (rem.lte(0)) break;
    const lineQty = ln.qty;
    const take = Prisma.Decimal.min(rem, lineQty);
    const unit = lineQty.gt(0) ? ln.total.div(lineQty) : ln.price;
    totalVal = totalVal.add(unit.mul(take));
    rem = rem.sub(take);
  }
  if (rem.gt(0)) {
    throw new Error("EXCHANGE_BAD_SOURCE_LINE");
  }
  const qtyD = new Prisma.Decimal(qty);
  const unit = qtyD.gt(0) ? totalVal.div(qtyD) : new Prisma.Decimal(0);
  return { total: roundMoney(totalVal), unit: roundMoney(unit) };
}

async function assertExchangeLinkage(
  tenantId: number,
  input: {
    client_id: number;
    warehouse_id: number;
    agent_id: number | null;
    product_ids: number[];
  }
): Promise<void> {
  if (input.agent_id == null || input.agent_id < 1) {
    throw new Error("EXCHANGE_REQUIRES_AGENT");
  }
  const scope = await resolveConstraintScope(tenantId, { selected_agent_id: input.agent_id });
  if (!scope.constrained) return;
  if (!scope.client_ids.includes(input.client_id)) {
    throw new Error("LINKAGE_CLIENT_FORBIDDEN");
  }
  if (!scope.warehouse_ids.includes(input.warehouse_id)) {
    throw new Error("LINKAGE_WAREHOUSE_FORBIDDEN");
  }
  if (scope.product_restricted) {
    if (scope.product_ids.length === 0) {
      throw new Error("LINKAGE_PRODUCT_FORBIDDEN");
    }
    for (const pid of input.product_ids) {
      if (!scope.product_ids.includes(pid)) {
        const err = new Error("LINKAGE_PRODUCT_FORBIDDEN") as Error & { product_id?: number };
        err.product_id = pid;
        throw err;
      }
    }
  }
}

/**
 * Obmen zakazi uchun qatorlar, meta va net summa (plus − minus).
 */
export async function prepareExchangeOrderLines(
  tenantId: number,
  clientId: number,
  warehouseId: number,
  agentId: number | null,
  priceType: string,
  body: ExchangeCreateBody
): Promise<{
  lines: ExchangeLinePrepared[];
  exchangeMeta: ExchangeMetaPayload;
  paidTotal: Prisma.Decimal;
  minusProductIds: number[];
  plusProductIds: number[];
}> {
  const minusLines = body.minus_lines ?? [];
  const plusLines = body.plus_lines ?? [];
  const sourceOrderIds = [...new Set(body.source_order_ids ?? [])].filter((x) => x > 0);

  if (sourceOrderIds.length < 1) {
    throw new Error("EXCHANGE_SOURCE_ORDERS_REQUIRED");
  }
  if (minusLines.length < 1 || plusLines.length < 1) {
    throw new Error("EXCHANGE_LINES_REQUIRED");
  }

  const minusKeys = new Set<string>();
  for (const ln of minusLines) {
    const k = `${ln.order_id}:${ln.product_id}`;
    if (minusKeys.has(k)) throw new Error("EXCHANGE_DUPLICATE_MINUS_LINE");
    minusKeys.add(k);
  }
  const plusKeys = new Set<number>();
  for (const ln of plusLines) {
    if (plusKeys.has(ln.product_id)) throw new Error("EXCHANGE_DUPLICATE_PLUS_LINE");
    plusKeys.add(ln.product_id);
  }

  for (const ln of minusLines) {
    if (!Number.isFinite(ln.qty) || ln.qty <= 0) throw new Error("BAD_QTY");
  }
  for (const ln of plusLines) {
    if (!Number.isFinite(ln.qty) || ln.qty <= 0) throw new Error("BAD_QTY");
  }

  await validateExchangeMinusAgainstSourceOrders(tenantId, clientId, sourceOrderIds, minusLines);

  const minusPids = minusLines.map((l) => l.product_id);
  const plusPids = plusLines.map((l) => l.product_id);
  await assertExchangeInterchangeableProducts(tenantId, minusPids, plusPids, priceType);

  const gateIds = [...new Set([...minusPids, ...plusPids])];
  await assertExchangeLinkage(tenantId, {
    client_id: clientId,
    warehouse_id: warehouseId,
    agent_id: agentId,
    product_ids: gateIds
  });

  const prepared: ExchangeLinePrepared[] = [];
  let minusSum = new Prisma.Decimal(0);
  for (const ln of minusLines) {
    const { total } = await valueForMinusFromSourceOrder(tenantId, ln.order_id, ln.product_id, ln.qty);
    minusSum = minusSum.add(total);
    const qty = new Prisma.Decimal(ln.qty);
    const unit = qty.gt(0) ? total.div(qty) : new Prisma.Decimal(0);
    prepared.push({
      product_id: ln.product_id,
      qty,
      price: roundMoney(unit),
      total,
      exchange_line_kind: "minus"
    });
  }

  let plusSum = new Prisma.Decimal(0);
  for (const ln of plusLines) {
    const priceStr = await getProductPrice(tenantId, ln.product_id, priceType);
    if (priceStr == null) {
      const e = new Error("NO_PRICE") as Error & { product_id: number; price_type: string };
      e.product_id = ln.product_id;
      e.price_type = priceType;
      throw e;
    }
    const price = new Prisma.Decimal(priceStr);
    const qty = new Prisma.Decimal(ln.qty);
    const total = roundMoney(qty.mul(price));
    plusSum = plusSum.add(total);
    prepared.push({
      product_id: ln.product_id,
      qty,
      price,
      total,
      exchange_line_kind: "plus"
    });
  }

  const paidTotal = roundMoney(plusSum.sub(minusSum));
  const exchangeMeta: ExchangeMetaPayload = {
    source_order_ids: sourceOrderIds,
    minus_lines: minusLines,
    plus_lines: plusLines,
    reason_ref: body.reason_ref ?? null
  };

  return {
    lines: prepared,
    exchangeMeta,
    paidTotal,
    minusProductIds: minusPids,
    plusProductIds: plusPids
  };
}
