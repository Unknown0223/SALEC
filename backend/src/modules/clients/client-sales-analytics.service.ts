import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

function parseListOrderLocalDayStart(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseListOrderLocalDayEnd(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function localYmdFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ClientSalesAnalyticsQuery = {
  date_from?: string | null;
  date_to?: string | null;
  /** Filtr ro‘yxat zakazlari (Продукт / график) */
  status?: string | null;
  order_type?: string | null;
  /** all | yes | no */
  consignment?: string | null;
  /** Mahsulot katalog kategoriyasi (product.category_id) */
  product_category_id?: number | null;
  /** Zakazda shu turdagi to‘lov bo‘lganlar (payment.payment_type) */
  payment_type?: string | null;
  /** Bir nechta agent bo‘yicha (klient profili filtri) */
  agent_ids?: number[] | null;
  /** Zakazlar agentisiz (agent_id IS NULL) */
  include_no_agent?: boolean;
};

export type ClientSalesAnalyticsRow = {
  kpi: {
    delivered_count: number;
    delivered_sales_sum: string;
  };
  products: Array<{
    product_id: number;
    name: string;
    sku: string | null;
    qty: string;
    share_percent: number;
  }>;
  total_qty: string;
  daily: Array<{ day: string; total_sum: string; order_count: number }>;
  daily_truncated: boolean;
};

const DAILY_ORDER_CAP = 35_000;

function buildOrderWhere(
  tenantId: number,
  clientId: number,
  q: ClientSalesAnalyticsQuery,
  forcedStatus?: string
): Prisma.OrderWhereInput {
  const fromD = q.date_from?.trim() ? parseListOrderLocalDayStart(q.date_from.trim()) : null;
  const toD = q.date_to?.trim() ? parseListOrderLocalDayEnd(q.date_to.trim()) : null;

  const where: Prisma.OrderWhereInput = {
    tenant_id: tenantId,
    client_id: clientId
  };

  const st = forcedStatus ?? q.status?.trim();
  if (st) {
    where.status = st;
  }
  if (q.order_type?.trim()) {
    where.order_type = q.order_type.trim();
  }
  const c = q.consignment?.trim().toLowerCase();
  if (c === "yes" || c === "true" || c === "1") {
    where.is_consignment = true;
  } else if (c === "no" || c === "false" || c === "0") {
    where.is_consignment = false;
  }

  if (fromD) {
    where.created_at = { ...(where.created_at as object), gte: fromD };
  }
  if (toD) {
    where.created_at = { ...(where.created_at as Prisma.DateTimeFilter), lte: toD };
  }

  const catId = q.product_category_id;
  if (catId != null && Number.isFinite(catId) && catId > 0) {
    where.items = {
      some: {
        is_bonus: false,
        product: { tenant_id: tenantId, category_id: catId }
      }
    };
  }

  const pt = q.payment_type?.trim();
  if (pt) {
    where.payments = { some: { payment_type: pt } };
  }

  const agentIds = (q.agent_ids ?? []).filter((id) => Number.isFinite(id) && id > 0);
  const hasAgentOr = agentIds.length > 0 || q.include_no_agent === true;
  if (hasAgentOr) {
    const ors: Prisma.OrderWhereInput[] = [];
    if (agentIds.length > 0) {
      ors.push({ agent_id: { in: agentIds } });
    }
    if (q.include_no_agent === true) {
      ors.push({ agent_id: null });
    }
    const agentClause: Prisma.OrderWhereInput = ors.length === 1 ? ors[0]! : { OR: ors };
    const prevAnd = where.AND;
    const andArr = Array.isArray(prevAnd) ? [...prevAnd] : prevAnd != null ? [prevAnd] : [];
    andArr.push(agentClause);
    where.AND = andArr;
  }

  return where;
}

export async function getClientSalesAnalytics(
  tenantId: number,
  clientId: number,
  q: ClientSalesAnalyticsQuery
): Promise<ClientSalesAnalyticsRow> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!exists) {
    throw new Error("NOT_FOUND");
  }

  const fromD = q.date_from?.trim() ? parseListOrderLocalDayStart(q.date_from.trim()) : null;
  const toD = q.date_to?.trim() ? parseListOrderLocalDayEnd(q.date_to.trim()) : null;
  if (fromD && toD && fromD.getTime() > toD.getTime()) {
    return {
      kpi: { delivered_count: 0, delivered_sales_sum: "0" },
      products: [],
      total_qty: "0",
      daily: [],
      daily_truncated: false
    };
  }

  const orderWhereList = buildOrderWhere(tenantId, clientId, q);
  const kpiWhere = buildOrderWhere(tenantId, clientId, q, "delivered");

  const [kpiAgg, groups, dailyRows] = await Promise.all([
    prisma.order.aggregate({
      where: kpiWhere,
      _count: { id: true },
      _sum: { total_sum: true }
    }),
    prisma.orderItem.groupBy({
      by: ["product_id"],
      where: {
        is_bonus: false,
        order: orderWhereList
      },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } }
    }),
    prisma.order.findMany({
      where: orderWhereList,
      select: { created_at: true, total_sum: true },
      orderBy: { created_at: "asc" },
      take: DAILY_ORDER_CAP + 1
    })
  ]);

  const dailyTruncated = dailyRows.length > DAILY_ORDER_CAP;
  const dailySlice = dailyTruncated ? dailyRows.slice(0, DAILY_ORDER_CAP) : dailyRows;

  const dayMap = new Map<string, { sum: Prisma.Decimal; count: number }>();
  for (const o of dailySlice) {
    const key = localYmdFromDate(o.created_at);
    const cur = dayMap.get(key) ?? { sum: new Prisma.Decimal(0), count: 0 };
    cur.sum = cur.sum.add(o.total_sum);
    cur.count += 1;
    dayMap.set(key, cur);
  }
  const daily = [...dayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({
      day,
      total_sum: v.sum.toString(),
      order_count: v.count
    }));

  let totalQty = new Prisma.Decimal(0);
  for (const g of groups) {
    totalQty = totalQty.add(g._sum.qty ?? new Prisma.Decimal(0));
  }

  const productIds = groups.map((g) => g.product_id);
  const products =
    productIds.length === 0
      ? []
      : await prisma.product.findMany({
          where: { tenant_id: tenantId, id: { in: productIds } },
          select: { id: true, name: true, sku: true }
        });
  const pmap = new Map(products.map((p) => [p.id, p]));

  const totalQtyNum = totalQty.toNumber();
  const productRows = groups.map((g) => {
    const qtyDec = g._sum.qty ?? new Prisma.Decimal(0);
    const qtyNum = qtyDec.toNumber();
    const share =
      totalQtyNum > 0 && Number.isFinite(totalQtyNum) ? (qtyNum / totalQtyNum) * 100 : 0;
    const p = pmap.get(g.product_id);
    return {
      product_id: g.product_id,
      name: p?.name ?? `Product #${g.product_id}`,
      sku: p?.sku ?? null,
      qty: qtyDec.toString(),
      share_percent: Math.round(share * 100) / 100
    };
  });

  return {
    kpi: {
      delivered_count: kpiAgg._count.id,
      delivered_sales_sum: (kpiAgg._sum.total_sum ?? new Prisma.Decimal(0)).toString()
    },
    products: productRows,
    total_qty: totalQty.toString(),
    daily,
    daily_truncated: dailyTruncated
  };
}
