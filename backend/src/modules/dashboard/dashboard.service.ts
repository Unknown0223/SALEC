import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE } from "../orders/order-status";
import { getRedisForApp } from "../../lib/redis-cache";

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
  /** Kredit eksponiyasidagi zakazlar yig‘indisi */
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

  const creditAgg = await prisma.order.aggregate({
    where: {
      tenant_id: tenantId,
      status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
    },
    _sum: { total_sum: true }
  });

  const result: DashboardStatsRow = {
    day_utc: start.toISOString().slice(0, 10),
    orders_today,
    orders_active,
    payments_today,
    payments_sum_today: (paySum._sum.amount ?? new Prisma.Decimal(0)).toString(),
    returns_today,
    clients_total,
    products_active,
    open_orders_total: (creditAgg._sum.total_sum ?? new Prisma.Decimal(0)).toString()
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
