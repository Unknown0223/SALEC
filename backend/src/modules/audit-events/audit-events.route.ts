import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { listTenantAuditEvents } from "./audit-events.service";

const adminRoles = ["admin"] as const;

export async function registerAuditEventRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/audit-events",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(200, Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50));
      const actorRaw = q.actor_user_id?.trim();
      const actor_user_id =
        actorRaw != null && actorRaw !== "" ? Number.parseInt(actorRaw, 10) : undefined;

      const result = await listTenantAuditEvents(request.tenant!.id, {
        entity_type: q.entity_type,
        entity_id: q.entity_id,
        actor_user_id: Number.isFinite(actor_user_id) ? actor_user_id : undefined,
        from: q.from,
        to: q.to,
        page: pageNum,
        limit: limitNum
      });
      return reply.send(result);
    }
  );
}
