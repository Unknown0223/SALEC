import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { getRedisForApp } from "../../lib/redis-cache";
import { ORDER_STATUSES_OUTSTANDING_RECEIVABLE } from "../orders/order-status";

const DASHBOARD_CACHE_TTL = 30; // sekund

function cacheKey(tenantId: number): string {
  return `tenant:${tenantId}:dashboard`;
}

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUtc(): Date {
  const s = startOfTodayUtc();
  return new Date(s.getTime() + 86400000);
}

export type DashboardStatsRow = {
  day_utc: string;
  orders_today: number;
  orders_active: number;
  payments_today: number;
  payments_sum_today: string;
  returns_today: number;
  clients_total: number;
  products_active: number;
  /** Yetkazilgan savdo zakazlari bo‘yicha to‘lanmagan qoldiq (taqsimlar bilan) */
  open_orders_total: string;
};

export async function getDashboardStats(tenantId: number): Promise<DashboardStatsRow> {
  // ✅ Redis cache tekshirish
  try {
    const redis = await getRedisForApp();
    const cached = await redis.get(cacheKey(tenantId));
    if (cached) {
      return JSON.parse(cached) as DashboardStatsRow;
    }
  } catch {
    /* Redis yo'q — to'g'ridan hisoblash */
  }

  const start = startOfTodayUtc();
  const end = endOfTodayUtc();
  const activeStatuses = ["new", "confirmed", "picking", "delivering"];

  const [
    orders_today,
    orders_active,
    payments_today,
    paySum,
    returns_today,
    clients_total,
    products_active
  ] = await Promise.all([
    prisma.order.count({
      where: { tenant_id: tenantId, created_at: { gte: start, lt: end } }
    }),
    prisma.order.count({
      where: { tenant_id: tenantId, status: { in: activeStatuses } }
    }),
    prisma.payment.count({
      where: { tenant_id: tenantId, deleted_at: null, created_at: { gte: start, lt: end } }
    }),
    prisma.payment.aggregate({
      where: { tenant_id: tenantId, deleted_at: null, created_at: { gte: start, lt: end } },
      _sum: { amount: true }
    }),
    prisma.salesReturn.count({
      where: { tenant_id: tenantId, status: "posted", created_at: { gte: start, lt: end } }
    }),
    prisma.client.count({
      where: { tenant_id: tenantId, merged_into_client_id: null, is_active: true }
    }),
    prisma.product.count({ where: { tenant_id: tenantId, is_active: true } })
  ]);

  const [deliveredUnpaidRow] = await prisma.$queryRaw<Array<{ s: Prisma.Decimal }>>`
    WITH alloc AS (
      SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS sum_amt
      FROM payment_allocations pa
      WHERE pa.tenant_id = ${tenantId}
      GROUP BY pa.order_id
    )
    SELECT COALESCE(
      SUM(GREATEST(o.total_sum - COALESCE(a.sum_amt, 0), 0)),
      0
    )::decimal(15,2) AS s
    FROM orders o
    LEFT JOIN alloc a ON a.order_id = o.id
    WHERE o.tenant_id = ${tenantId}
      AND o.order_type = 'order'
      AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
  `;

  const result: DashboardStatsRow = {
    day_utc: start.toISOString().slice(0, 10),
    orders_today,
    orders_active,
    payments_today,
    payments_sum_today: (paySum._sum.amount ?? new Prisma.Decimal(0)).toString(),
    returns_today,
    clients_total,
    products_active,
    open_orders_total: (deliveredUnpaidRow?.s ?? new Prisma.Decimal(0)).toString()
  };

  // ✅ Redis cache saqlash
  try {
    const redis = await getRedisForApp();
    await redis.set(cacheKey(tenantId), JSON.stringify(result), "EX", DASHBOARD_CACHE_TTL);
  } catch {
    /* ignore */
  }

  return result;
}

export type SupervisorDashboardFilters = {
  date: string;
  payment_type?: string;
  agent_ids: number[];
  supervisor_ids: number[];
  trade_direction?: string;
  client_category?: string;
  territory_1?: string;
  territory_2?: string;
  territory_3?: string;
};

export type SupervisorKpi = {
  total_sales_sum: string;
  cash_sales_sum: string;
  planned_visits: number;
  visited_planned: number;
  visited_total: number;
  successful_visits: number;
  gps_visits: number;
  photo_reports: number;
  visit_pct: number;
  success_pct: number;
  gps_pct: number;
  photo_pct: number;
};

export type SupervisorProductRow = {
  dimension: string;
  share_pct: number;
  revenue: string;
  quantity: string;
  akb: number;
};

export type SupervisorProductMatrixValue = {
  revenue: string;
  quantity: string;
  akb: number;
  orders: number;
};

export type SupervisorProductMatrixRow = {
  id: number;
  name: string;
  values: Record<string, SupervisorProductMatrixValue>;
};

export type SupervisorProductMatrixBlock = {
  dimensions: string[];
  by_agents: SupervisorProductMatrixRow[];
  by_supervisors: SupervisorProductMatrixRow[];
};

export type SupervisorVisitRow = {
  agent_id: number;
  agent_name: string;
  supervisor_id: number | null;
  supervisor_name: string | null;
  planned_visits: number;
  visited_planned: number;
  visited_unplanned: number;
  visited_total: number;
  not_visited: number;
  visits_with_orders: number;
  visits_without_orders: number;
  gps_visits: number;
  photo_reports: number;
  sales_sum: string;
  sales_qty: string;
};

export type SupervisorEfficiencyRow = {
  id: number;
  name: string;
  order_count: number;
  cancelled_count: number;
  planned_visits: number;
  visited_total: number;
  rejected_visits: number;
  unvisited: number;
  visit_pct: number;
  photo_reports: number;
  total_sales_sum: string;
};

export type SupervisorDashboardSnapshot = {
  filters: SupervisorDashboardFilters;
  kpi: SupervisorKpi;
  product_analytics: {
    by_category: SupervisorProductRow[];
    by_group: SupervisorProductRow[];
    by_brand: SupervisorProductRow[];
  };
  product_matrix: {
    by_category: SupervisorProductMatrixBlock;
    by_group: SupervisorProductMatrixBlock;
    by_brand: SupervisorProductMatrixBlock;
  };
  visit_report: {
    rows: SupervisorVisitRow[];
    totals: Omit<SupervisorVisitRow, "agent_id" | "agent_name" | "supervisor_id" | "supervisor_name">;
  };
  efficiency_report: {
    by_agents: SupervisorEfficiencyRow[];
    by_supervisors: SupervisorEfficiencyRow[];
  };
};

function normalizeYmd(input?: string): string {
  const t = (input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return startOfTodayUtc().toISOString().slice(0, 10);
}

function csvToIntArray(input?: string): number[] {
  if (!input) return [];
  const uniq = new Set<number>();
  for (const part of input.split(",")) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(n) && n > 0) uniq.add(n);
  }
  return Array.from(uniq).sort((a, b) => a - b);
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v * 10) / 10;
}

function decToString(v: Prisma.Decimal | string | number | null | undefined): string {
  if (v == null) return "0";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return v.toString();
}

function bigToNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  return Number(v);
}

function nonEmpty(s?: string): string | undefined {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : undefined;
}

export function parseSupervisorDashboardFilters(
  q: Record<string, string | undefined>
): SupervisorDashboardFilters {
  return {
    date: normalizeYmd(q.date),
    payment_type: nonEmpty(q.payment_type),
    agent_ids: csvToIntArray(q.agent_ids),
    supervisor_ids: csvToIntArray(q.supervisor_ids),
    trade_direction: nonEmpty(q.trade_direction),
    client_category: nonEmpty(q.client_category),
    territory_1: nonEmpty(q.territory_1 ?? q.territory1),
    territory_2: nonEmpty(q.territory_2 ?? q.territory2),
    territory_3: nonEmpty(q.territory_3 ?? q.territory3)
  };
}

function orderScopeSql(tenantId: number, start: Date, end: Date, f: SupervisorDashboardFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`o.tenant_id = ${tenantId}`,
    Prisma.sql`o.created_at >= ${start}`,
    Prisma.sql`o.created_at < ${end}`,
    Prisma.sql`o.order_type = 'order'`,
    Prisma.sql`o.status NOT IN ('cancelled', 'returned')`
  ];
  if (f.payment_type) parts.push(Prisma.sql`o.payment_method_ref = ${f.payment_type}`);
  if (f.agent_ids.length > 0) parts.push(Prisma.sql`o.agent_id IN (${Prisma.join(f.agent_ids)})`);
  if (f.supervisor_ids.length > 0) parts.push(Prisma.sql`u.supervisor_user_id IN (${Prisma.join(f.supervisor_ids)})`);
  if (f.trade_direction) parts.push(Prisma.sql`u.trade_direction = ${f.trade_direction}`);
  if (f.client_category) parts.push(Prisma.sql`COALESCE(c.category, '') = ${f.client_category}`);
  if (f.territory_1) parts.push(Prisma.sql`COALESCE(c.zone, '') = ${f.territory_1}`);
  if (f.territory_2) parts.push(Prisma.sql`COALESCE(c.region, '') = ${f.territory_2}`);
  if (f.territory_3) parts.push(Prisma.sql`COALESCE(c.city, '') = ${f.territory_3}`);
  return Prisma.join(parts, " AND ");
}

function visitScopeSql(tenantId: number, start: Date, end: Date, f: SupervisorDashboardFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`av.tenant_id = ${tenantId}`,
    Prisma.sql`av.checked_in_at >= ${start}`,
    Prisma.sql`av.checked_in_at < ${end}`
  ];
  if (f.agent_ids.length > 0) parts.push(Prisma.sql`av.agent_id IN (${Prisma.join(f.agent_ids)})`);
  if (f.supervisor_ids.length > 0) parts.push(Prisma.sql`u.supervisor_user_id IN (${Prisma.join(f.supervisor_ids)})`);
  if (f.trade_direction) parts.push(Prisma.sql`u.trade_direction = ${f.trade_direction}`);
  if (f.client_category) parts.push(Prisma.sql`COALESCE(c.category, '') = ${f.client_category}`);
  if (f.territory_1) parts.push(Prisma.sql`COALESCE(c.zone, '') = ${f.territory_1}`);
  if (f.territory_2) parts.push(Prisma.sql`COALESCE(c.region, '') = ${f.territory_2}`);
  if (f.territory_3) parts.push(Prisma.sql`COALESCE(c.city, '') = ${f.territory_3}`);
  return Prisma.join(parts, " AND ");
}

function planScopeSql(
  tenantId: number,
  start: Date,
  end: Date,
  weekday: number,
  f: SupervisorDashboardFilters
): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`caa.tenant_id = ${tenantId}`,
    Prisma.sql`(
      (caa.visit_date IS NOT NULL AND caa.visit_date >= ${start} AND caa.visit_date < ${end})
      OR (caa.visit_weekdays::jsonb @> ${JSON.stringify([weekday])}::jsonb)
    )`
  ];
  if (f.agent_ids.length > 0) parts.push(Prisma.sql`caa.agent_id IN (${Prisma.join(f.agent_ids)})`);
  if (f.supervisor_ids.length > 0) parts.push(Prisma.sql`u.supervisor_user_id IN (${Prisma.join(f.supervisor_ids)})`);
  if (f.trade_direction) parts.push(Prisma.sql`u.trade_direction = ${f.trade_direction}`);
  if (f.client_category) parts.push(Prisma.sql`COALESCE(c.category, '') = ${f.client_category}`);
  if (f.territory_1) parts.push(Prisma.sql`COALESCE(c.zone, '') = ${f.territory_1}`);
  if (f.territory_2) parts.push(Prisma.sql`COALESCE(c.region, '') = ${f.territory_2}`);
  if (f.territory_3) parts.push(Prisma.sql`COALESCE(c.city, '') = ${f.territory_3}`);
  return Prisma.join(parts, " AND ");
}

export async function getSupervisorDashboardSnapshot(
  tenantId: number,
  filters: SupervisorDashboardFilters
): Promise<SupervisorDashboardSnapshot> {
  const dayStart = new Date(`${filters.date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const weekday = ((dayStart.getUTCDay() + 6) % 7) + 1;
  const orderScope = orderScopeSql(tenantId, dayStart, dayEnd, filters);
  const visitScope = visitScopeSql(tenantId, dayStart, dayEnd, filters);
  const planScope = planScopeSql(tenantId, dayStart, dayEnd, weekday, filters);

  const [salesAgg, cashAgg] = await Promise.all([
    prisma.$queryRaw<Array<{ s: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS s
      FROM orders o
      JOIN users u ON u.id = o.agent_id
      JOIN clients c ON c.id = o.client_id
      WHERE ${orderScope}
    `,
    prisma.$queryRaw<Array<{ s: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS s
      FROM orders o
      JOIN users u ON u.id = o.agent_id
      JOIN clients c ON c.id = o.client_id
      WHERE ${orderScope}
        AND LOWER(COALESCE(o.payment_method_ref, '')) IN ('cash', 'naqd', 'наличные')
    `
  ]);

  const visitRows = await prisma.$queryRaw<
    Array<{
      agent_id: number;
      agent_name: string;
      supervisor_id: number | null;
      supervisor_name: string | null;
      planned_visits: bigint;
      visited_planned: bigint;
      visited_total: bigint;
      gps_visits: bigint;
      photo_reports: bigint;
      visits_with_orders: bigint;
      sales_sum: Prisma.Decimal;
      sales_qty: Prisma.Decimal;
      cancelled_count: bigint;
    }>
  >`
    WITH planned AS (
      SELECT DISTINCT caa.agent_id, caa.client_id
      FROM client_agent_assignments caa
      JOIN users u ON u.id = caa.agent_id
      JOIN clients c ON c.id = caa.client_id
      WHERE ${planScope}
    ),
    visits AS (
      SELECT av.agent_id, av.client_id,
             BOOL_OR(av.latitude IS NOT NULL AND av.longitude IS NOT NULL) AS has_gps
      FROM agent_visits av
      JOIN users u ON u.id = av.agent_id
      LEFT JOIN clients c ON c.id = av.client_id
      WHERE ${visitScope}
      GROUP BY av.agent_id, av.client_id
    ),
    orders_pairs AS (
      SELECT DISTINCT o.agent_id, o.client_id
      FROM orders o
      JOIN users u ON u.id = o.agent_id
      JOIN clients c ON c.id = o.client_id
      WHERE ${orderScope}
    ),
    photos_pairs AS (
      SELECT DISTINCT pr.created_by_user_id AS agent_id, pr.client_id
      FROM client_photo_reports pr
      JOIN users u ON u.id = pr.created_by_user_id
      JOIN clients c ON c.id = pr.client_id
      WHERE pr.tenant_id = ${tenantId}
        AND pr.created_at >= ${dayStart}
        AND pr.created_at < ${dayEnd}
        AND pr.created_by_user_id IS NOT NULL
        ${filters.agent_ids.length > 0 ? Prisma.sql`AND pr.created_by_user_id IN (${Prisma.join(filters.agent_ids)})` : Prisma.empty}
        ${filters.supervisor_ids.length > 0 ? Prisma.sql`AND u.supervisor_user_id IN (${Prisma.join(filters.supervisor_ids)})` : Prisma.empty}
        ${filters.trade_direction ? Prisma.sql`AND u.trade_direction = ${filters.trade_direction}` : Prisma.empty}
        ${filters.client_category ? Prisma.sql`AND COALESCE(c.category, '') = ${filters.client_category}` : Prisma.empty}
        ${filters.territory_1 ? Prisma.sql`AND COALESCE(c.zone, '') = ${filters.territory_1}` : Prisma.empty}
        ${filters.territory_2 ? Prisma.sql`AND COALESCE(c.region, '') = ${filters.territory_2}` : Prisma.empty}
        ${filters.territory_3 ? Prisma.sql`AND COALESCE(c.city, '') = ${filters.territory_3}` : Prisma.empty}
    ),
    sales_by_agent AS (
      SELECT o.agent_id,
             COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id ELSE NULL END)::bigint AS cancelled_count,
             COALESCE(SUM(o.total_sum), 0)::numeric(15,2) AS sales_sum,
             COALESCE(SUM(COALESCE(oi.qty, 0)), 0)::numeric(15,3) AS sales_qty
      FROM orders o
      JOIN users u ON u.id = o.agent_id
      JOIN clients c ON c.id = o.client_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE ${orderScope}
      GROUP BY o.agent_id
    ),
    keys AS (
      SELECT agent_id FROM planned
      UNION
      SELECT agent_id FROM visits
      UNION
      SELECT agent_id FROM orders_pairs
      UNION
      SELECT agent_id FROM photos_pairs
    )
    SELECT
      k.agent_id,
      ua.name AS agent_name,
      ua.supervisor_user_id AS supervisor_id,
      us.name AS supervisor_name,
      COALESCE((SELECT COUNT(*) FROM planned p WHERE p.agent_id = k.agent_id), 0)::bigint AS planned_visits,
      COALESCE((
        SELECT COUNT(*)
        FROM visits v
        JOIN planned p ON p.agent_id = v.agent_id AND p.client_id = v.client_id
        WHERE v.agent_id = k.agent_id
      ), 0)::bigint AS visited_planned,
      COALESCE((SELECT COUNT(*) FROM visits v WHERE v.agent_id = k.agent_id), 0)::bigint AS visited_total,
      COALESCE((SELECT COUNT(*) FROM visits v WHERE v.agent_id = k.agent_id AND v.has_gps), 0)::bigint AS gps_visits,
      COALESCE((
        SELECT COUNT(*)
        FROM visits v
        JOIN photos_pairs p2 ON p2.agent_id = v.agent_id AND p2.client_id = v.client_id
        WHERE v.agent_id = k.agent_id
      ), 0)::bigint AS photo_reports,
      COALESCE((
        SELECT COUNT(*)
        FROM visits v
        JOIN orders_pairs op ON op.agent_id = v.agent_id AND op.client_id = v.client_id
        WHERE v.agent_id = k.agent_id
      ), 0)::bigint AS visits_with_orders,
      COALESCE(sa.sales_sum, 0)::numeric(15,2) AS sales_sum,
      COALESCE(sa.sales_qty, 0)::numeric(15,3) AS sales_qty,
      COALESCE(sa.cancelled_count, 0)::bigint AS cancelled_count
    FROM keys k
    JOIN users ua ON ua.id = k.agent_id
    LEFT JOIN users us ON us.id = ua.supervisor_user_id
    LEFT JOIN sales_by_agent sa ON sa.agent_id = k.agent_id
    ORDER BY ua.name ASC
  `;

  const mappedVisitRows: SupervisorVisitRow[] = visitRows.map((r) => {
    const planned = bigToNum(r.planned_visits);
    const visitedPlanned = bigToNum(r.visited_planned);
    const visitedTotal = bigToNum(r.visited_total);
    const successful = bigToNum(r.visits_with_orders);
    return {
      agent_id: r.agent_id,
      agent_name: r.agent_name,
      supervisor_id: r.supervisor_id,
      supervisor_name: r.supervisor_name,
      planned_visits: planned,
      visited_planned: visitedPlanned,
      visited_unplanned: Math.max(visitedTotal - visitedPlanned, 0),
      visited_total: visitedTotal,
      not_visited: Math.max(planned - visitedPlanned, 0),
      visits_with_orders: successful,
      visits_without_orders: Math.max(visitedTotal - successful, 0),
      gps_visits: bigToNum(r.gps_visits),
      photo_reports: bigToNum(r.photo_reports),
      sales_sum: decToString(r.sales_sum),
      sales_qty: decToString(r.sales_qty)
    };
  });

  const totals = mappedVisitRows.reduce<Omit<SupervisorVisitRow, "agent_id" | "agent_name" | "supervisor_id" | "supervisor_name">>(
    (acc, row) => ({
      planned_visits: acc.planned_visits + row.planned_visits,
      visited_planned: acc.visited_planned + row.visited_planned,
      visited_unplanned: acc.visited_unplanned + row.visited_unplanned,
      visited_total: acc.visited_total + row.visited_total,
      not_visited: acc.not_visited + row.not_visited,
      visits_with_orders: acc.visits_with_orders + row.visits_with_orders,
      visits_without_orders: acc.visits_without_orders + row.visits_without_orders,
      gps_visits: acc.gps_visits + row.gps_visits,
      photo_reports: acc.photo_reports + row.photo_reports,
      sales_sum: new Prisma.Decimal(acc.sales_sum).plus(row.sales_sum).toFixed(2),
      sales_qty: new Prisma.Decimal(acc.sales_qty).plus(row.sales_qty).toFixed(3)
    }),
    {
      planned_visits: 0,
      visited_planned: 0,
      visited_unplanned: 0,
      visited_total: 0,
      not_visited: 0,
      visits_with_orders: 0,
      visits_without_orders: 0,
      gps_visits: 0,
      photo_reports: 0,
      sales_sum: "0",
      sales_qty: "0"
    }
  );

  const productRowsCategory = await prisma.$queryRaw<
    Array<{ dimension: string; revenue: Prisma.Decimal; quantity: Prisma.Decimal; akb: bigint }>
  >`
    SELECT
      COALESCE(pc.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE ${orderScope}
    GROUP BY 1
    ORDER BY revenue DESC
    LIMIT 100
  `;

  const productRowsGroup = await prisma.$queryRaw<
    Array<{ dimension: string; revenue: Prisma.Decimal; quantity: Prisma.Decimal; akb: bigint }>
  >`
    SELECT
      COALESCE(pg.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_catalog_groups pg ON pg.id = p.product_group_id
    WHERE ${orderScope}
    GROUP BY 1
    ORDER BY revenue DESC
    LIMIT 100
  `;

  const productRowsBrand = await prisma.$queryRaw<
    Array<{ dimension: string; revenue: Prisma.Decimal; quantity: Prisma.Decimal; akb: bigint }>
  >`
    SELECT
      COALESCE(pb.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_brands pb ON pb.id = p.brand_id
    WHERE ${orderScope}
    GROUP BY 1
    ORDER BY revenue DESC
    LIMIT 100
  `;

  const mapProductRows = (
    rows: Array<{ dimension: string; revenue: Prisma.Decimal; quantity: Prisma.Decimal; akb: bigint }>
  ): SupervisorProductRow[] => {
    const grand = rows.reduce((s, r) => s.plus(r.revenue ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    return rows.map((r) => {
      const rev = r.revenue ?? new Prisma.Decimal(0);
      const share = grand.gt(0) ? rev.div(grand).mul(100).toNumber() : 0;
      return {
        dimension: r.dimension || "—",
        share_pct: clampPct(share),
        revenue: decToString(rev),
        quantity: decToString(r.quantity),
        akb: bigToNum(r.akb)
      };
    });
  };

  type MatrixAggRow = {
    actor_id: number;
    actor_name: string;
    dimension: string;
    revenue: Prisma.Decimal;
    quantity: Prisma.Decimal;
    akb: bigint;
    orders: bigint;
  };

  const buildMatrix = (rows: MatrixAggRow[]): SupervisorProductMatrixBlock => {
    const dimTotals = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      const key = r.dimension || "—";
      dimTotals.set(key, (dimTotals.get(key) ?? new Prisma.Decimal(0)).plus(r.revenue ?? new Prisma.Decimal(0)));
    }
    const dimensions = Array.from(dimTotals.entries())
      .sort((a, b) => b[1].minus(a[1]).toNumber())
      .map(([k]) => k);

    const rowMap = new Map<number, SupervisorProductMatrixRow>();
    for (const r of rows) {
      const key = r.dimension || "—";
      const row = rowMap.get(r.actor_id) ?? { id: r.actor_id, name: r.actor_name, values: {} };
      row.values[key] = {
        revenue: decToString(r.revenue),
        quantity: decToString(r.quantity),
        akb: bigToNum(r.akb),
        orders: bigToNum(r.orders)
      };
      rowMap.set(r.actor_id, row);
    }
    const list = Array.from(rowMap.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return { dimensions, by_agents: list, by_supervisors: [] };
  };

  const withBySupervisors = (
    byAgentsRows: MatrixAggRow[],
    bySupervisorRows: MatrixAggRow[]
  ): SupervisorProductMatrixBlock => {
    const base = buildMatrix(byAgentsRows);
    const sup = buildMatrix(bySupervisorRows);
    return {
      dimensions: base.dimensions.length >= sup.dimensions.length ? base.dimensions : sup.dimensions,
      by_agents: base.by_agents,
      by_supervisors: sup.by_agents
    };
  };

  const categoryMatrixByAgents = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      ua.id AS actor_id,
      ua.name AS actor_name,
      COALESCE(pc.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users ua ON ua.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE ${orderScope}
    GROUP BY ua.id, ua.name, dimension
  `;

  const categoryMatrixBySupervisors = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      us.id AS actor_id,
      us.name AS actor_name,
      COALESCE(pc.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users us ON us.id = u.supervisor_user_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE ${orderScope}
      AND u.supervisor_user_id IS NOT NULL
    GROUP BY us.id, us.name, dimension
  `;

  const groupMatrixByAgents = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      ua.id AS actor_id,
      ua.name AS actor_name,
      COALESCE(pg.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users ua ON ua.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_catalog_groups pg ON pg.id = p.product_group_id
    WHERE ${orderScope}
    GROUP BY ua.id, ua.name, dimension
  `;

  const groupMatrixBySupervisors = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      us.id AS actor_id,
      us.name AS actor_name,
      COALESCE(pg.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users us ON us.id = u.supervisor_user_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_catalog_groups pg ON pg.id = p.product_group_id
    WHERE ${orderScope}
      AND u.supervisor_user_id IS NOT NULL
    GROUP BY us.id, us.name, dimension
  `;

  const brandMatrixByAgents = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      ua.id AS actor_id,
      ua.name AS actor_name,
      COALESCE(pb.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users ua ON ua.id = o.agent_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_brands pb ON pb.id = p.brand_id
    WHERE ${orderScope}
    GROUP BY ua.id, ua.name, dimension
  `;

  const brandMatrixBySupervisors = await prisma.$queryRaw<MatrixAggRow[]>`
    SELECT
      us.id AS actor_id,
      us.name AS actor_name,
      COALESCE(pb.name, '—') AS dimension,
      COALESCE(SUM(oi.total), 0)::numeric(15,2) AS revenue,
      COALESCE(SUM(oi.qty), 0)::numeric(15,3) AS quantity,
      COUNT(DISTINCT o.client_id)::bigint AS akb,
      COUNT(DISTINCT o.id)::bigint AS orders
    FROM orders o
    JOIN users u ON u.id = o.agent_id
    JOIN users us ON us.id = u.supervisor_user_id
    JOIN clients c ON c.id = o.client_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_brands pb ON pb.id = p.brand_id
    WHERE ${orderScope}
      AND u.supervisor_user_id IS NOT NULL
    GROUP BY us.id, us.name, dimension
  `;

  const byAgents: SupervisorEfficiencyRow[] = mappedVisitRows.map((r) => ({
    id: r.agent_id,
    name: r.agent_name,
    order_count: r.visits_with_orders,
    cancelled_count: 0,
    planned_visits: r.planned_visits,
    visited_total: r.visited_total,
    rejected_visits: r.visits_without_orders,
    unvisited: r.not_visited,
    visit_pct: clampPct(r.planned_visits > 0 ? (r.visited_planned / r.planned_visits) * 100 : 0),
    photo_reports: r.photo_reports,
    total_sales_sum: r.sales_sum
  }));

  const supMap = new Map<number, SupervisorEfficiencyRow>();
  for (const row of mappedVisitRows) {
    if (row.supervisor_id == null) continue;
    const prev = supMap.get(row.supervisor_id) ?? {
      id: row.supervisor_id,
      name: row.supervisor_name ?? `Supervisor ${row.supervisor_id}`,
      order_count: 0,
      cancelled_count: 0,
      planned_visits: 0,
      visited_total: 0,
      rejected_visits: 0,
      unvisited: 0,
      visit_pct: 0,
      photo_reports: 0,
      total_sales_sum: "0"
    };
    prev.order_count += row.visits_with_orders;
    prev.planned_visits += row.planned_visits;
    prev.visited_total += row.visited_total;
    prev.rejected_visits += row.visits_without_orders;
    prev.unvisited += row.not_visited;
    prev.photo_reports += row.photo_reports;
    prev.total_sales_sum = new Prisma.Decimal(prev.total_sales_sum).plus(row.sales_sum).toFixed(2);
    supMap.set(row.supervisor_id, prev);
  }
  const bySupervisors = Array.from(supMap.values())
    .map((s) => ({
      ...s,
      visit_pct: clampPct(s.planned_visits > 0 ? ((s.planned_visits - s.unvisited) / s.planned_visits) * 100 : 0)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const kpi: SupervisorKpi = {
    total_sales_sum: decToString(salesAgg[0]?.s),
    cash_sales_sum: decToString(cashAgg[0]?.s),
    planned_visits: totals.planned_visits,
    visited_planned: totals.visited_planned,
    visited_total: totals.visited_total,
    successful_visits: totals.visits_with_orders,
    gps_visits: totals.gps_visits,
    photo_reports: totals.photo_reports,
    visit_pct: clampPct(totals.planned_visits > 0 ? (totals.visited_planned / totals.planned_visits) * 100 : 0),
    success_pct: clampPct(totals.visited_total > 0 ? (totals.visits_with_orders / totals.visited_total) * 100 : 0),
    gps_pct: clampPct(totals.planned_visits > 0 ? (totals.gps_visits / totals.planned_visits) * 100 : 0),
    photo_pct: clampPct(totals.planned_visits > 0 ? (totals.photo_reports / totals.planned_visits) * 100 : 0)
  };

  return {
    filters,
    kpi,
    product_analytics: {
      by_category: mapProductRows(productRowsCategory),
      by_group: mapProductRows(productRowsGroup),
      by_brand: mapProductRows(productRowsBrand)
    },
    product_matrix: {
      by_category: withBySupervisors(categoryMatrixByAgents, categoryMatrixBySupervisors),
      by_group: withBySupervisors(groupMatrixByAgents, groupMatrixBySupervisors),
      by_brand: withBySupervisors(brandMatrixByAgents, brandMatrixBySupervisors)
    },
    visit_report: {
      rows: mappedVisitRows,
      totals
    },
    efficiency_report: {
      by_agents: byAgents,
      by_supervisors: bySupervisors
    }
  };
}
