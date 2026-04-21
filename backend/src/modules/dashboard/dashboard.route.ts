import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { getDashboardStats, getSupervisorDashboardSnapshot, parseSupervisorDashboardFilters } from "./dashboard.service";

const catalogRoles = ["admin", "operator", "supervisor"] as const;

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/dashboard/stats",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const stats = await getDashboardStats(request.tenant!.id);
      return reply.send(stats);
    }
  );

  app.get(
    "/api/:slug/dashboard/supervisor",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = parseSupervisorDashboardFilters(request.query as Record<string, string | undefined>);
      const data = await getSupervisorDashboardSnapshot(request.tenant!.id, parsed);
      return reply.send(data);
    }
  );
}
