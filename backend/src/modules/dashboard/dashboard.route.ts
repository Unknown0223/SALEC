import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { getDashboardStats } from "./dashboard.service";

const catalogRoles = ["admin", "operator"] as const;

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
}
