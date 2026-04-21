import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { listConsignmentBalancesReport } from "./consignment-balances.service";
import {
  listClientBalancesReport,
  listClientBalanceTerritoryOptions,
  type ClientBalanceListQuery
} from "./client-balances.service";

const catalogRoles = ["admin", "operator"] as const;

function parseOptPositiveInt(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseListQuery(q: Record<string, string | undefined>): ClientBalanceListQuery {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const allowLarge = q.large_export === "1" || q.large_export === "true";
  const maxL = allowLarge ? 5000 : 200;
  const limit = Math.min(maxL, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
  const deliveryOrderId = parseOptPositiveInt(q.order_id);
  const viewRaw = q.view?.trim();
  const view: ClientBalanceListQuery["view"] =
    viewRaw === "agents"
      ? "agents"
      : viewRaw === "clients_delivery"
        ? "clients_delivery"
        : "clients";

  return {
    view,
    page,
    limit,
    allow_large_export: allowLarge,
    ...(q.search?.trim() ? { search: q.search.trim() } : {}),
    ...(parseOptPositiveInt(q.agent_id) !== undefined ? { agent_id: parseOptPositiveInt(q.agent_id) } : {}),
    ...(parseOptPositiveInt(q.expeditor_user_id) !== undefined
      ? { expeditor_user_id: parseOptPositiveInt(q.expeditor_user_id) }
      : {}),
    ...(parseOptPositiveInt(q.supervisor_user_id) !== undefined
      ? { supervisor_user_id: parseOptPositiveInt(q.supervisor_user_id) }
      : {}),
    ...(q.trade_direction?.trim() ? { trade_direction: q.trade_direction.trim() } : {}),
    ...(q.category?.trim() ? { category: q.category.trim() } : {}),
    ...(q.status?.trim() ? { status: q.status.trim() } : {}),
    ...(q.balance_filter?.trim() ? { balance_filter: q.balance_filter.trim() } : {}),
    ...(q.agent_consignment?.trim() ? { agent_consignment: q.agent_consignment.trim() } : {}),
    ...(q.territory_region?.trim() ? { territory_region: q.territory_region.trim() } : {}),
    ...(q.territory_city?.trim() ? { territory_city: q.territory_city.trim() } : {}),
    ...(q.territory_district?.trim() ? { territory_district: q.territory_district.trim() } : {}),
    ...(q.territory_zone?.trim() ? { territory_zone: q.territory_zone.trim() } : {}),
    ...(q.territory_neighborhood?.trim()
      ? { territory_neighborhood: q.territory_neighborhood.trim() }
      : {}),
    ...(q.balance_as_of?.trim() ? { balance_as_of: q.balance_as_of.trim() } : {}),
    ...(q.consignment_due_from?.trim() ? { consignment_due_from: q.consignment_due_from.trim() } : {}),
    ...(q.consignment_due_to?.trim() ? { consignment_due_to: q.consignment_due_to.trim() } : {}),
    ...(q.agent_branch?.trim() ? { agent_branch: q.agent_branch.trim() } : {}),
    ...(q.agent_payment_type?.trim() ? { agent_payment_type: q.agent_payment_type.trim() } : {}),
    ...(q.branch_ids?.trim()
      ? {
          agent_branches: q.branch_ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        }
      : {}),
    ...(q.order_date_from?.trim() ? { order_date_from: q.order_date_from.trim() } : {}),
    ...(q.order_date_to?.trim() ? { order_date_to: q.order_date_to.trim() } : {}),
    ...(q.sort_by?.trim() ? { sort_by: q.sort_by.trim() } : {}),
    ...(q.sort_dir === "desc" ? { sort_dir: "desc" as const } : q.sort_dir === "asc" ? { sort_dir: "asc" as const } : {}),
    ...(deliveryOrderId !== undefined ? { delivery_order_id: deliveryOrderId } : {})
  };
}

function toNum(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function collectPagePaymentStats(
  rows: Array<{ balance?: string; payment_amounts?: Array<{ label: string; amount: string }> }>
) {
  const paymentSums: Record<string, number> = {};
  let pageBalanceSum = 0;
  let nonZeroRows = 0;
  for (const row of rows) {
    const bal = toNum(row.balance);
    pageBalanceSum += bal;
    let rowHasNonZero = bal !== 0;
    for (const p of row.payment_amounts ?? []) {
      paymentSums[p.label] = (paymentSums[p.label] ?? 0) + toNum(p.amount);
      if (toNum(p.amount) !== 0) rowHasNonZero = true;
    }
    if (rowHasNonZero) nonZeroRows += 1;
  }
  return { pageBalanceSum, nonZeroRows, paymentSums };
}

export async function registerClientBalanceRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/client-balances/territory-options",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const hasScope =
        Boolean(q.agent_branch?.trim()) ||
        Boolean(q.agent_id?.trim()) ||
        Boolean(q.supervisor_user_id?.trim()) ||
        Boolean(q.expeditor_user_id?.trim()) ||
        Boolean(q.trade_direction?.trim()) ||
        Boolean(q.category?.trim()) ||
        Boolean(q.status?.trim()) ||
        Boolean(q.agent_payment_type?.trim()) ||
        Boolean(q.branch_ids?.trim());
      const scope = hasScope ? parseListQuery(q) : undefined;
      const data = await listClientBalanceTerritoryOptions(request.tenant!.id, scope);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/client-balances",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const parsed = parseListQuery(q);
      const t0 = Date.now();
      const result = await listClientBalancesReport(request.tenant!.id, parsed);
      request.log.info(
        {
          tenantId: request.tenant!.id,
          view: parsed.view,
          page: parsed.page,
          limit: parsed.limit,
          sortBy: parsed.sort_by ?? null,
          sortDir: parsed.sort_dir ?? null,
          total: result.total,
          elapsedMs: Date.now() - t0
        },
        "client-balances report timing"
      );
      const pageStats = collectPagePaymentStats(
        (result.data as Array<{ balance?: string; payment_amounts?: Array<{ label: string; amount: string }> }>) ??
          []
      );
      request.log.info(
        {
          tenantId: request.tenant!.id,
          view: parsed.view,
          page: parsed.page,
          limit: parsed.limit,
          summaryBalance: result.summary.balance,
          summaryPaymentByType: result.summary.payment_by_type,
          pageBalanceSum: pageStats.pageBalanceSum,
          pagePaymentSums: pageStats.paymentSums,
          pageNonZeroRows: pageStats.nonZeroRows
        },
        "client-balances payment debug"
      );
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/client-balances/consignment",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const parsed = parseListQuery(q);
      const t0 = Date.now();
      const result = await listConsignmentBalancesReport(request.tenant!.id, parsed);
      request.log.info(
        {
          tenantId: request.tenant!.id,
          page: parsed.page,
          limit: parsed.limit,
          sortBy: parsed.sort_by ?? null,
          sortDir: parsed.sort_dir ?? null,
          total: result.total,
          elapsedMs: Date.now() - t0
        },
        "consignment-balances report timing"
      );
      const pageStats = collectPagePaymentStats(
        (result.data as Array<{ balance?: string; payment_amounts?: Array<{ label: string; amount: string }> }>) ??
          []
      );
      request.log.info(
        {
          tenantId: request.tenant!.id,
          page: parsed.page,
          limit: parsed.limit,
          summaryBalance: result.summary.total_debt,
          summaryPaymentByType: result.summary.payment_by_type,
          pageBalanceSum: pageStats.pageBalanceSum,
          pagePaymentSums: pageStats.paymentSums,
          pageNonZeroRows: pageStats.nonZeroRows
        },
        "consignment-balances payment debug"
      );
      return reply.send(result);
    }
  );
}
