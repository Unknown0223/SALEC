import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { DIRECTORY_READ_ROLES, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { createStaff, listStaff, patchAgentSupervisor } from "./staff.service";

const catalogRoles = ["admin", "operator"] as const;

const createBodySchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  login: z.string().min(1),
  password: z.string().min(6),
  phone: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  agent_type: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  pinfl: z.string().nullable().optional(),
  consignment: z.boolean().optional(),
  apk_version: z.string().nullable().optional(),
  device_name: z.string().nullable().optional(),
  can_authorize: z.boolean().optional(),
  price_type: z.string().nullable().optional(),
  warehouse_id: z.number().int().positive().nullable().optional(),
  return_warehouse_id: z.number().int().positive().nullable().optional(),
  trade_direction: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  app_access: z.boolean().optional(),
  territory: z.string().nullable().optional(),
  is_active: z.boolean().optional()
});

const patchAgentSupervisorBody = z.object({
  supervisor_user_id: z.number().int().positive().nullable()
});

export async function registerStaffRoutes(app: FastifyInstance) {
  app.get("/api/:slug/agents", { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await listStaff(request.tenant!.id, "agent");
    return reply.send({ data });
  });

  app.post("/api/:slug/agents", { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }
    try {
      const row = await createStaff(request.tenant!.id, "agent", parsed.data);
      return reply.status(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
      if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
      if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
      if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
      if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
      if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
      throw e;
    }
  });

  app.patch(
    "/api/:slug/agents/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchAgentSupervisorBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchAgentSupervisor(
          request.tenant!.id,
          id,
          parsed.data.supervisor_user_id
        );
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "SELF_SUPERVISOR") return reply.status(400).send({ error: "SelfSupervisor" });
        if (msg === "BAD_SUPERVISOR") return reply.status(400).send({ error: "BadSupervisor" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/supervisors",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listStaff(request.tenant!.id, "supervisor");
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/supervisors",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createStaff(request.tenant!.id, "supervisor", parsed.data);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
        if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/expeditors",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listStaff(request.tenant!.id, "expeditor");
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/expeditors",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createStaff(request.tenant!.id, "expeditor", parsed.data);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
        if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        throw e;
      }
    }
  );
}
