import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { DIRECTORY_READ_ROLES, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { createCashDesk, getCashDesk, listCashDesks, listCashDeskPickers, patchCashDesk } from "./cash-desks.service";

const writeRoles = ["admin", "operator"] as const;

const linkSchema = z.object({
  user_id: z.number().int().positive(),
  link_role: z.enum(["cashier", "manager", "operator", "supervisor", "expeditor"])
});

const createBodySchema = z.object({
  name: z.string().min(1).max(500),
  timezone: z.string().max(64).optional(),
  sort_order: z.number().int().nullable().optional(),
  code: z.string().max(20).nullable().optional(),
  comment: z.string().max(5000).nullable().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  is_active: z.boolean().optional(),
  is_closed: z.boolean().optional(),
  links: z.array(linkSchema).optional()
});

const patchBodySchema = createBodySchema.partial();

export async function registerCashDeskRoutes(app: FastifyInstance) {
  app.get("/api/:slug/cash-desks/pickers", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const data = await listCashDeskPickers(tenantId);
    return reply.send({ data });
  });

  app.get("/api/:slug/cash-desks", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        is_active: z.enum(["true", "false"]).optional(),
        q: z.string().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional()
      })
      .parse(request.query);
    const is_active = q.is_active === undefined ? undefined : q.is_active === "true";
    const result = await listCashDesks(tenantId, {
      is_active,
      q: q.q,
      page: q.page ?? 1,
      limit: q.limit ?? 10
    });
    return reply.send(result);
  });

  app.get("/api/:slug/cash-desks/:id", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const row = await getCashDesk(tenantId, id);
    if (!row) return reply.status(404).send({ error: "NotFound" });
    return reply.send({ data: row });
  });

  app.post("/api/:slug/cash-desks", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = createBodySchema.parse(request.body);
    try {
      const row = await createCashDesk(tenantId, body);
      return reply.status(201).send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "CodeTaken") return reply.status(409).send({ error: "CodeTaken" });
      if (msg === "UserNotFound") return reply.status(400).send({ error: "UserNotFound" });
      if (msg === "UserRoleMismatch" || msg === "InvalidLinkRole") {
        return reply.status(400).send({ error: msg });
      }
      throw e;
    }
  });

  app.patch("/api/:slug/cash-desks/:id", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = patchBodySchema.parse(request.body);
    try {
      const row = await patchCashDesk(tenantId, id, body);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "CodeTaken") return reply.status(409).send({ error: "CodeTaken" });
      if (msg === "UserNotFound") return reply.status(400).send({ error: "UserNotFound" });
      if (msg === "UserRoleMismatch" || msg === "InvalidLinkRole") {
        return reply.status(400).send({ error: msg });
      }
      throw e;
    }
  });
}
