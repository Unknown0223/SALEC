import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { DIRECTORY_READ_ROLES, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { parseSelectedMastersFromQuery, resolveConstraintScope } from "./linkage.service";

export async function registerLinkageRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/linkage/options",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const selected = parseSelectedMastersFromQuery(q);
      const data = await resolveConstraintScope(request.tenant!.id, selected);
      return reply.send({ data });
    }
  );
}
