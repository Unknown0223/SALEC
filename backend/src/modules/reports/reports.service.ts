import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../config/database";
import { ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE } from "../orders/order-status";

/** ─── Helpers ─────────────────────────────────────────────── */

function parseDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } {
  const result: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) result.gte = d;
  }
  if (to) {
    const d = new Date(to);
    d.setUTCHours(23, 59, 59, 999);
    if (!Number.isNaN(d.getTime())) result.lte = d;
  }
  return result;
}

/** ─── 1. Sales Summary ───────────────────────────────────── */

export type SalesSummaryRow = {
  period: string;
  order_count: number;
  total_sum: string;
  payment_count: number;
  payment_sum: string;
  return_count: number;
  return_amount: string;
  net_revenue: string;
};

export type AgentSale = {
  agent_id: number;
  agent_name: string;
  order_count: number;
  total_sum: string;
};

export async function getSalesSummary(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{ data: SalesSummaryRow[]; agents: AgentSale[] }> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  const [orderCount, orderAgg, payCount, payAgg, retCount, retAgg] = await Promise.all([
    prisma.order.count({ where: { tenant_id: tenantId, created_at: { gte: start, lte: end } } }),
    prisma.order.aggregate({ where: { tenant_id: tenantId, created_at: { gte: start, lte: end } }, _sum: { total_sum: true } }),
    prisma.payment.count({ where: { tenant_id: tenantId, created_at: { gte: start, lte: end } } }),
    prisma.payment.aggregate({ where: { tenant_id: tenantId, created_at: { gte: start, lte: end } }, _sum: { amount: true } }),
    prisma.salesReturn.count({ where: { tenant_id: tenantId, status: "posted", created_at: { gte: start, lte: end } } }),
    prisma.salesReturn.aggregate({ where: { tenant_id: tenantId, status: "posted", created_at: { gte: start, lte: end } }, _sum: { refund_amount: true } })
  ]);

  // Per-agent
  const agentOrders = await prisma.order.groupBy({
    by: ["agent_id"],
    where: {
      tenant_id: tenantId,
      created_at: { gte: start, lte: end },
      agent_id: { not: null }
    },
    _count: { id: true },
    _sum: { total_sum: true },
    orderBy: [{ _sum: { total_sum: "desc" } }]
  });

  const agentIds = agentOrders.map((a) => a.agent_id).filter((x): x is number => x != null);
  const agents = agentIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true }
      })
    : [];
  const agentMap = new Map<number, string>(agents.map((a) => [a.id, a.name]));

  const orderSum = orderAgg._sum.total_sum ?? new Prisma.Decimal(0);
  const paySum = payAgg._sum.amount ?? new Prisma.Decimal(0);
  const retSum = retAgg._sum.refund_amount ?? new Prisma.Decimal(0);

  return {
    data: [{
      period: "total",
      order_count: orderCount,
      total_sum: orderSum.toString(),
      payment_count: payCount,
      payment_sum: paySum.toString(),
      return_count: retCount,
      return_amount: retSum.toString(),
      net_revenue: new Prisma.Decimal(orderSum).minus(retSum).toString()
    }],
    agents: agentOrders.map((a) => ({
      agent_id: a.agent_id!,
      agent_name: agentMap.get(a.agent_id!) ?? "Unknown",
      order_count: a._count.id,
      total_sum: (a._sum.total_sum ?? new Prisma.Decimal(0)).toString()
    }))
  };
}

/** ─── 2. Order Trends ──────────────────────────────────── */

export async function getOrderTrends(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{ date: string; orders: number; revenue: string }[]> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  const rows = await prisma.$queryRaw<Array<{ day: string; cnt: bigint; rev: Prisma.Decimal }>>`
    SELECT
      DATE_TRUNC('day', created_at)::date AS day,
      COUNT(*)::bigint AS cnt,
      COALESCE(SUM(total_sum), 0)::numeric(15,2) AS rev
    FROM orders
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${start}
      AND created_at <= ${end}
    GROUP BY 1
    ORDER BY 1
  `;

  return rows.map((r) => ({
    date: String(r.day),
    orders: Number(r.cnt),
    revenue: String(r.rev)
  }));
}

/** ─── 3. Product Sales ─────────────────────────────────── */

export async function getProductSales(
  tenantId: number,
  from?: string,
  to?: string,
  limit = 20
): Promise<{
  data: Array<{
    product_id: number;
    product_name: string;
    sku: string;
    unit: string;
    total_qty: string;
    total_revenue: string;
    order_count: number;
  }>;
}> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  const rows = await prisma.$queryRaw<
    Array<{
      product_id: number;
      name: string;
      sku: string;
      unit: string;
      total_qty: Prisma.Decimal;
      total_revenue: Prisma.Decimal;
      order_count: bigint;
    }>
  >`
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.unit,
      SUM(oi.qty)::numeric(15,3) AS total_qty,
      SUM(oi.total)::numeric(15,2) AS total_revenue,
      COUNT(DISTINCT o.id)::bigint AS order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.tenant_id = ${tenantId}
      AND o.created_at >= ${start}
      AND o.created_at <= ${end}
      AND p.tenant_id = ${tenantId}
    GROUP BY p.id, p.name, p.sku, p.unit
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `;

  return {
    data: rows.map((r) => ({
      product_id: r.product_id,
      product_name: r.name,
      sku: r.sku,
      unit: r.unit,
      total_qty: String(r.total_qty),
      total_revenue: String(r.total_revenue),
      order_count: Number(r.order_count)
    }))
  };
}

/** ─── 4. Client Analytics ───────────────────────────────── */

export async function getClientAnalytics(
  tenantId: number,
  from?: string,
  to?: string,
  limit = 20
): Promise<{
  data: Array<{
    client_id: number;
    client_name: string;
    order_count: number;
    total_spent: string;
    last_order_date: string | null;
    balance: string;
  }>;
}> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  const rows = await prisma.$queryRaw<
    Array<{
      client_id: number;
      client_name: string;
      order_count: bigint;
      total_spent: Prisma.Decimal;
      last_order_date: Date | null;
    }>
  >`
    SELECT
      c.id AS client_id,
      c.name AS client_name,
      COUNT(DISTINCT o.id)::bigint AS order_count,
      COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS total_spent,
      MAX(o.created_at) AS last_order_date
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id
      AND o.created_at >= ${start}
      AND o.created_at <= ${end}
      AND o.tenant_id = ${tenantId}
    WHERE c.tenant_id = ${tenantId}
      AND c.merged_into_client_id IS NULL
    GROUP BY c.id, c.name
    HAVING COUNT(DISTINCT o.id) > 0
    ORDER BY total_spent DESC
    LIMIT ${limit}
  `;

  const clientIds = rows.map((r) => r.client_id);
  const balances = clientIds.length > 0
    ? await prisma.clientBalance.findMany({
        where: { tenant_id: tenantId, client_id: { in: clientIds } },
        select: { client_id: true, balance: true }
      })
    : [];
  const balMap = new Map<number, string>(balances.map((b) => [b.client_id, b.balance.toString()]));

  return {
    data: rows.map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      order_count: Number(r.order_count),
      total_spent: String(r.total_spent),
      last_order_date: r.last_order_date?.toISOString() ?? null,
      balance: balMap.get(r.client_id) ?? "0"
    }))
  };
}

/** ─── 5. Agent KPI ──────────────────────────────────────── */

export async function getAgentKpi(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{
  data: Array<{
    user_id: number;
    user_name: string;
    role: string;
    clients_count: number;
    order_count: number;
    total_orders: string;
    avg_order_sum: string;
    returns_count: number;
  }>;
}> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  const agents = await prisma.user.findMany({
    where: { tenant_id: tenantId, role: "agent", is_active: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" }
  });

  if (agents.length === 0) {
    return { data: [] };
  }

  const agentIds = agents.map((a) => a.id);

  // Order stats per agent
  const orderStats = await prisma.$queryRaw<
    Array<{ agent_id: number; order_count: bigint; total_sum: Prisma.Decimal }>
  >`
    SELECT agent_id, COUNT(*)::bigint AS order_count, COALESCE(SUM(total_sum), 0)::numeric(15,2) AS total_sum
    FROM orders
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${start}
      AND created_at <= ${end}
      AND agent_id IS NOT NULL
      AND agent_id IN (${Prisma.join(agentIds)})
    GROUP BY agent_id
  `;

  // Client count per agent
  const clientStats = await prisma.$queryRaw<
    Array<{ agent_id: number; cnt: bigint }>
  >`
    SELECT agent_id, COUNT(*)::bigint AS cnt
    FROM clients
    WHERE tenant_id = ${tenantId}
      AND agent_id IS NOT NULL
      AND agent_id IN (${Prisma.join(agentIds)})
      AND is_active = true
    GROUP BY agent_id
  `;

  // Returns per agent (via order → agent)
  const returnStats = await prisma.$queryRaw<
    Array<{ agent_id: number; returns_count: bigint }>
  >`
    SELECT o.agent_id, COUNT(DISTINCT sr.id)::bigint AS returns_count
    FROM sales_returns sr
    JOIN orders o ON o.id = sr.order_id
    WHERE o.tenant_id = ${tenantId}
      AND sr.created_at >= ${start}
      AND sr.created_at <= ${end}
      AND o.agent_id IS NOT NULL
      AND o.agent_id IN (${Prisma.join(agentIds)})
    GROUP BY o.agent_id
  `;

  const oMap = new Map<number, { cnt: bigint; sum: Prisma.Decimal }>(
    orderStats.map((o) => [o.agent_id, { cnt: o.order_count, sum: o.total_sum }])
  );
  const cMap = new Map<number, bigint>(
    clientStats.map((c) => [c.agent_id, c.cnt])
  );
  const rMap = new Map<number, bigint>(
    returnStats.map((r) => [r.agent_id, r.returns_count])
  );

  return {
    data: agents.map((agent) => {
      const o = oMap.get(agent.id) ?? { cnt: 0n, sum: new Prisma.Decimal(0) };
      const cnt = Number(o.cnt);
      const avg = cnt > 0
        ? new Prisma.Decimal(o.sum).div(cnt).toFixed(2)
        : "0";

      return {
        user_id: agent.id,
        user_name: agent.name,
        role: "agent",
        clients_count: Number(cMap.get(agent.id) ?? 0n),
        order_count: cnt,
        total_orders: o.sum.toString(),
        avg_order_sum: avg,
        returns_count: Number(rMap.get(agent.id) ?? 0n)
      };
    })
  };
}

/** ─── 6. Status Distribution ────────────────────────────── */

export async function getStatusDistribution(tenantId: number): Promise<{ status: string; count: number }[]> {
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: { tenant_id: tenantId },
    _count: { id: true }
  });
  return rows.map((r) => ({ status: r.status, count: r._count.id }));
}

/** ─── 7. Channel Stats ──────────────────────────────────── */

export async function getChannelStats(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{
  channels: Array<{ channel: string | null; order_count: number; total_sum: string }>;
  tradeDirections: Array<{ direction: string | null; order_count: number; total_sum: string }>;
}> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 30 * 86400000);
  const end = range.lte ?? new Date();

  // Raw SQL: join clients va users bilan bir query — N+1 oldini olish
  const [channelRows, dirRows] = await Promise.all([
    prisma.$queryRaw<Array<{ channel: string | null; order_count: bigint; total_sum: Prisma.Decimal }>>`
      SELECT c.sales_channel AS channel, COUNT(o.id)::bigint AS order_count, COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS total_sum
      FROM orders o JOIN clients c ON c.id = o.client_id
      WHERE o.tenant_id = ${tenantId} AND o.created_at >= ${start} AND o.created_at <= ${end}
      GROUP BY c.sales_channel ORDER BY total_sum DESC
    `,
    prisma.$queryRaw<Array<{ trade_direction: string | null; order_count: bigint; total_sum: Prisma.Decimal }>>`
      SELECT u.trade_direction, COUNT(o.id)::bigint AS order_count, COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS total_sum
      FROM orders o LEFT JOIN users u ON u.id = o.agent_id
      WHERE o.tenant_id = ${tenantId} AND o.created_at >= ${start} AND o.created_at <= ${end}
      GROUP BY u.trade_direction ORDER BY total_sum DESC
    `
  ]);

  return {
    channels: channelRows.map((r) => ({
      channel: String(r.channel),
      order_count: Number(r.order_count),
      total_sum: String(r.total_sum)
    })),
    tradeDirections: dirRows.map((r) => ({
      direction: String(r.trade_direction),
      order_count: Number(r.order_count),
      total_sum: String(r.total_sum)
    }))
  };
}
/** ─── 8. ABC Client Analysis ────────────────────────────── */

export async function getAbcAnalysis(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{
  categoryA: Array<{ client_id: number; client_name: string; total: string; pct: number }>;
  categoryB: Array<{ client_id: number; client_name: string; total: string; pct: number }>;
  categoryC: Array<{ client_id: number; client_name: string; total: string; pct: number }>;
}> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 90 * 86400000);
  const end = range.lte ?? new Date();

  const rows = await prisma.$queryRaw<
    Array<{ client_id: number; client_name: string; total: Prisma.Decimal }>
  >`
    SELECT c.id AS client_id, c.name AS client_name, COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS total
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id AND o.status NOT IN ('cancelled', 'returned')
      AND o.created_at >= ${start} AND o.created_at <= ${end}
    WHERE c.tenant_id = ${tenantId} AND c.merged_into_client_id IS NULL
    GROUP BY c.id, c.name
    HAVING SUM(o.total_sum) > 0
    ORDER BY total DESC
  `;

  const grandTotal = rows.reduce((s, r) => s.plus(r.total), new Prisma.Decimal(0));
  if (grandTotal.equals(0)) return { categoryA: [], categoryB: [], categoryC: [] };

  const clients = rows.map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    total: r.total,
    pct: Number(r.total) / Number(grandTotal) * 100
  }));

  let cumulative = 0;
  const categoryA: typeof clients = [];
  const categoryB: typeof clients = [];
  const categoryC: typeof clients = [];

  for (const c of clients) {
    cumulative += c.pct;
    if (cumulative <= 80) categoryA.push(c);
    else if (cumulative <= 95) categoryB.push(c);
    else categoryC.push(c);
  }

  return {
    categoryA: categoryA.map((x) => ({ ...x, total: x.total.toString() })),
    categoryB: categoryB.map((x) => ({ ...x, total: x.total.toString() })),
    categoryC: categoryC.map((x) => ({ ...x, total: x.total.toString() }))
  };
}

/** ─── 9. XYZ Client Stability ──────────────────────────── */

export async function getXyzAnalysis(
  tenantId: number,
  from?: string,
  to?: string
): Promise<Record<string, Array<{ client_id: number; client_name: string; avg: string; cv: number }>>> {
  const range = parseDateRange(from, to);
  const start = range.gte ?? new Date(Date.now() - 180 * 86400000);
  const end = range.lte ?? new Date();

  // Group orders by month per client
  const rows = await prisma.$queryRaw<
    Array<{ client_id: number; client_name: string; month: string; monthly_total: Prisma.Decimal }>
  >`
    SELECT
      c.id AS client_id,
      c.name AS client_name,
      DATE_TRUNC('month', o.created_at)::date AS month,
      COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS monthly_total
    FROM clients c
    JOIN orders o ON o.client_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND o.status NOT IN ('cancelled', 'returned')
      AND o.created_at >= ${start}
      AND o.created_at <= ${end}
    GROUP BY c.id, c.name, DATE_TRUNC('month', o.created_at)
    ORDER BY c.id, month
  `;

  const grouped = new Map<number, { name: string; months: number[] }>();
  for (const r of rows) {
    const key = r.client_id;
    if (!grouped.has(key)) grouped.set(key, { name: String(r.client_name), months: [] });
    grouped.get(key)!.months.push(Number(r.monthly_total));
  }

  const xClients: Array<{ client_id: number; client_name: string; avg: string; cv: number }> = [];
  const yClients: Array<{ client_id: number; client_name: string; avg: string; cv: number }> = [];
  const zClients: Array<{ client_id: number; client_name: string; avg: string; cv: number }> = [];

  for (const [id, data] of grouped) {
    const n = data.months.length;
    if (n < 2) { zClients.push({ client_id: Number(id), client_name: data.name, avg: "0", cv: 0 }); continue; }
    const avg = data.months.reduce((s, v) => s + v, 0) / n;
    const variance = data.months.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;
    const entry = { client_id: Number(id), client_name: data.name, avg: Number(avg).toFixed(2), cv: Math.round(cv * 1000) / 1000 };

    if (cv < 0.1) xClients.push(entry);
    else if (cv < 0.25) yClients.push(entry);
    else zClients.push(entry);
  }

  return { xClients, yClients, zClients };
}

/** ─── 10. Client Churn ─────────────────────────────────── */

export async function getClientChurn(
  tenantId: number,
  monthsAgo = 3
): Promise<{
  churnedClients: Array<{ client_id: number; client_name: string; last_order: string; total_historical: string }>;
  totalClients: number;
  activeClients: number;
  churnRate: number;
}> {
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - monthsAgo * 30 * 86400000);
  const lookbackDate = new Date(now.getTime() - 365 * 86400000);

  // Active clients (ordered in last N months)
  const activeClients = await prisma.$queryRaw<
    Array<{ client_id: number }>
  >`
    SELECT DISTINCT o.client_id
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    WHERE o.tenant_id = ${tenantId}
      AND o.status NOT IN ('cancelled', 'returned')
      AND o.created_at >= ${thresholdDate}
      AND c.merged_into_client_id IS NULL
  `;

  const activeIds = new Set(activeClients.map((c) => c.client_id));

  // All clients who ever ordered
  const allClients = await prisma.$queryRaw<
    Array<{ id: number; name: string }>
  >`
    SELECT c.id, c.name
    FROM clients c
    WHERE c.tenant_id = ${tenantId}
      AND c.merged_into_client_id IS NULL
      AND EXISTS (
        SELECT 1 FROM orders o WHERE o.client_id = c.id AND o.tenant_id = ${tenantId}
          AND o.created_at >= ${lookbackDate} AND o.status NOT IN ('cancelled', 'returned')
      )
  `;

  const allCount = allClients.length;
  const activeCount = activeIds.size;
  const totalChurned = allCount - activeCount;
  const churnRate = allCount > 0 ? Number((totalChurned / allCount * 100).toFixed(1)) : 0;

  const churnedCandidateIds = allClients.filter((c) => !activeIds.has(c.id)).map((c) => c.id);

  const churnedRows =
    churnedCandidateIds.length === 0
      ? []
      : await prisma.$queryRaw<
          Array<{
            client_id: number;
            client_name: string;
            last_order: Date;
            total_historical: Prisma.Decimal;
          }>
        >`
    SELECT c.id AS client_id, c.name AS client_name,
      MAX(o.created_at) AS last_order,
      COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS total_historical
    FROM clients c
    JOIN orders o ON o.client_id = c.id AND o.status NOT IN ('cancelled', 'returned')
    WHERE c.tenant_id = ${tenantId}
      AND c.merged_into_client_id IS NULL
      AND c.id IN (${Prisma.join(churnedCandidateIds.map((id) => Prisma.sql`${id}`))})
    GROUP BY c.id, c.name
    ORDER BY last_order DESC
    LIMIT 50
  `;

  return {
    churnedClients: churnedRows.map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      last_order: r.last_order.toISOString(),
      total_historical: String(r.total_historical)
    })),
    totalClients: allCount,
    activeClients: activeCount,
    churnRate
  };
}

/** ─── Client receivables (ochiq zakazlar / kredit yuki) ─── */

export type ClientReceivableRow = {
  client_id: number;
  name: string;
  phone: string | null;
  is_active: boolean;
  credit_limit: string;
  account_balance: string;
  outstanding: string;
  headroom: string;
  headroom_remaining: string;
  over_limit: boolean;
};

export type ClientReceivablesResult = {
  data: ClientReceivableRow[];
  total: number;
  page: number;
  limit: number;
};

function receivableExcludedStatusSql() {
  return Prisma.join(
    ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE.map((s) => Prisma.sql`${s}`)
  );
}

export async function getClientReceivables(
  tenantId: number,
  opts: {
    page: number;
    limit: number;
    search?: string;
    only_over_limit?: boolean;
    active_only?: boolean;
  }
): Promise<ClientReceivablesResult> {
  const page = Math.max(1, Math.floor(opts.page));
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit)));
  const offset = (page - 1) * limit;

  const q = (opts.search ?? "").trim();
  const searchClause =
    q.length > 0
      ? Prisma.sql`AND (c.name ILIKE ${`%${q}%`} OR COALESCE(c.phone, '') ILIKE ${`%${q}%`})`
      : Prisma.empty;

  const activeClause = opts.active_only === true ? Prisma.sql`AND c.is_active = true` : Prisma.empty;

  /** Limitdan oshgan — `filtered` ichida ustunlar `fr` nomisiz (bir darajali CTE) */
  const overClause =
    opts.only_over_limit === true
      ? Prisma.sql`AND credit_limit > 0 AND outstanding > (credit_limit + account_balance)`
      : Prisma.empty;

  const st = receivableExcludedStatusSql();

  const countRows = await prisma.$queryRaw<[{ total: bigint }]>`
    WITH oagg AS (
      SELECT o.client_id,
        SUM(o.total_sum)::numeric(15,2) AS outstanding
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.status NOT IN (${st})
      GROUP BY o.client_id
      HAVING SUM(o.total_sum) > 0
    ),
    fr AS (
      SELECT
        c.id AS client_id,
        c.credit_limit::numeric(15,2) AS credit_limit,
        COALESCE(cb.balance, 0)::numeric(15,2) AS account_balance,
        oagg.outstanding
      FROM oagg
      INNER JOIN clients c ON c.id = oagg.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN client_balances cb ON cb.tenant_id = c.tenant_id AND cb.client_id = c.id
      WHERE c.merged_into_client_id IS NULL
        ${searchClause}
        ${activeClause}
    ),
    filtered AS (
      SELECT * FROM fr WHERE true
        ${overClause}
    )
    SELECT COUNT(*)::bigint AS total FROM filtered
  `;

  const total = Number(countRows[0]?.total ?? 0n);

  const dataRows = await prisma.$queryRaw<
    Array<{
      client_id: number;
      name: string;
      phone: string | null;
      is_active: boolean;
      credit_limit: Prisma.Decimal;
      account_balance: Prisma.Decimal;
      outstanding: Prisma.Decimal;
      headroom: Prisma.Decimal;
      headroom_remaining: Prisma.Decimal;
      over_limit: boolean;
    }>
  >`
    WITH oagg AS (
      SELECT o.client_id,
        SUM(o.total_sum)::numeric(15,2) AS outstanding
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.status NOT IN (${st})
      GROUP BY o.client_id
      HAVING SUM(o.total_sum) > 0
    ),
    fr AS (
      SELECT
        c.id AS client_id,
        c.name,
        c.phone,
        c.is_active,
        c.credit_limit::numeric(15,2) AS credit_limit,
        COALESCE(cb.balance, 0)::numeric(15,2) AS account_balance,
        oagg.outstanding
      FROM oagg
      INNER JOIN clients c ON c.id = oagg.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN client_balances cb ON cb.tenant_id = c.tenant_id AND cb.client_id = c.id
      WHERE c.merged_into_client_id IS NULL
        ${searchClause}
        ${activeClause}
    ),
    filtered AS (
      SELECT * FROM fr WHERE true
        ${overClause}
    )
    SELECT
      client_id,
      name,
      phone,
      is_active,
      credit_limit,
      account_balance,
      outstanding,
      (credit_limit + account_balance) AS headroom,
      (credit_limit + account_balance - outstanding) AS headroom_remaining,
      (credit_limit > 0 AND outstanding > (credit_limit + account_balance)) AS over_limit
    FROM filtered
    ORDER BY outstanding DESC, client_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    total,
    page,
    limit,
    data: dataRows.map((r) => ({
      client_id: r.client_id,
      name: r.name,
      phone: r.phone,
      is_active: r.is_active,
      credit_limit: r.credit_limit.toString(),
      account_balance: r.account_balance.toString(),
      outstanding: r.outstanding.toString(),
      headroom: r.headroom.toString(),
      headroom_remaining: r.headroom_remaining.toString(),
      over_limit: r.over_limit
    }))
  };
}

export async function exportClientReceivablesXlsx(
  tenantId: number,
  opts: {
    search?: string;
    only_over_limit?: boolean;
    active_only?: boolean;
    maxRows?: number;
  }
): Promise<{ buffer: Buffer; truncated: boolean; total: number }> {
  const cap = Math.min(10000, Math.max(1, opts.maxRows ?? 5000));
  const batch = await getClientReceivables(tenantId, {
    page: 1,
    limit: cap,
    search: opts.search,
    only_over_limit: opts.only_over_limit,
    active_only: opts.active_only
  });
  const truncated = batch.total > cap;
  const headers = [
    "ID",
    "Mijoz",
    "Telefon",
    "Faol",
    "Kredit limiti",
    "Hisob saldosi",
    "Ochiq zakazlar",
    "Headroom",
    "Qoldiq",
    "Limit oshgan"
  ];
  const rows: (string | number)[][] = batch.data.map((r) => [
    r.client_id,
    r.name,
    r.phone ?? "",
    r.is_active ? "Ha" : "Yo‘q",
    Number.parseFloat(r.credit_limit) || 0,
    Number.parseFloat(r.account_balance) || 0,
    Number.parseFloat(r.outstanding) || 0,
    Number.parseFloat(r.headroom) || 0,
    Number.parseFloat(r.headroom_remaining) || 0,
    r.over_limit ? "Ha" : "Yo‘q"
  ]);
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 16 },
    { wch: 6 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Qarzdorlik");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, truncated, total: batch.total };
}
