import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
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
    ...(q.balance_as_of?.trim() ? { balance_as_of: q.balance_as_of.trim() } : {}),
    ...(q.consignment_due_from?.trim() ? { consignment_due_from: q.consignment_due_from.trim() } : {}),
    ...(q.consignment_due_to?.trim() ? { consignment_due_to: q.consignment_due_to.trim() } : {}),
    ...(q.agent_branch?.trim() ? { agent_branch: q.agent_branch.trim() } : {}),
    ...(q.agent_payment_type?.trim() ? { agent_payment_type: q.agent_payment_type.trim() } : {})
  };
}

export async function registerClientBalanceRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/client-balances/territory-options",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listClientBalanceTerritoryOptions(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/client-balances",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const result = await listClientBalancesReport(request.tenant!.id, parseListQuery(q));
      return reply.send(result);
    }
  );
}
