import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { createSupplierRow, listSuppliersForTenant } from "./suppliers.service";

const catalogRoles = ["admin", "operator", "supervisor", "agent", "expeditor"] as const;
const writeRoles = ["admin", "operator"] as const;

const createBody = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(64).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  comment: z.string().max(2000).optional().nullable()
});

export async function registerSupplierRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/suppliers",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as { all?: string };
      const activeOnly = q.all !== "true" && q.all !== "1";
      const data = await listSuppliersForTenant(request.tenant!.id, activeOnly);
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/suppliers",
    { preHandler: [jwtAccessVerify, requireRoles(...writeRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createSupplierRow(request.tenant!.id, parsed.data);
        await appendTenantAuditEvent({
          tenantId: request.tenant!.id,
          actorUserId: actorUserIdOrNull(request),
          entityType: AuditEntityType.supplier,
          entityId: String(row.id),
          action: "supplier.create",
          payload: { name: row.name }
        });
        return reply.status(201).send({ data: row });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_NAME") return reply.status(400).send({ error: "BadName" });
        throw e;
      }
    }
  );
}
