import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { DIRECTORY_READ_ROLES, getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  checkoutAgentVisit,
  createAgentVisit,
  createTenantTask,
  getAgentRouteDay,
  getTenantTask,
  listAgentRouteDays,
  listAgentVisits,
  listTenantTasks,
  patchTenantTask,
  upsertAgentRouteDay
} from "./field.service";

const writeRoles = ["admin", "operator", "supervisor"] as const;

function parseUserId(request: FastifyRequest) {
  const viewer = getAccessUser(request);
  const uid = Number.parseInt(viewer.sub, 10);
  return Number.isFinite(uid) && uid > 0 ? uid : null;
}

export async function registerFieldRoutes(app: FastifyInstance) {
  app.get("/api/:slug/agent-visits", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        agent_id: z.coerce.number().int().positive().optional(),
        client_id: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .parse(request.query);
    const viewer = getAccessUser(request);
    let agentId = q.agent_id;
    if (viewer.role === "agent") {
      const self = parseUserId(request);
      if (!self) return reply.status(400).send({ error: "BadUser" });
      agentId = self;
    }
    const result = await listAgentVisits(tenantId, {
      agent_id: agentId,
      client_id: q.client_id,
      page: q.page ?? 1,
      limit: q.limit ?? 20
    });
    return reply.send(result);
  });

  app.post("/api/:slug/agent-visits", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = z
      .object({
        agent_id: z.number().int().positive(),
        client_id: z.number().int().positive().nullable().optional(),
        latitude: z.number().finite().nullable().optional(),
        longitude: z.number().finite().nullable().optional(),
        notes: z.string().max(2000).nullable().optional()
      })
      .parse(request.body);
    const viewer = getAccessUser(request);
    if (viewer.role === "agent") {
      const self = parseUserId(request);
      if (!self || body.agent_id !== self) {
        return reply.status(403).send({ error: "AgentIdMismatch" });
      }
    }
    try {
      const row = await createAgentVisit(tenantId, body);
      return reply.status(201).send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AgentNotFound") return reply.status(400).send({ error: "AgentNotFound" });
      if (msg === "ClientNotFound") return reply.status(400).send({ error: "ClientNotFound" });
      throw e;
    }
  });

  app.post("/api/:slug/agent-visits/:id/checkout", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    try {
      const row = await checkoutAgentVisit(tenantId, id);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AlreadyCheckedOut") return reply.status(409).send({ error: "AlreadyCheckedOut" });
      throw e;
    }
  });

  app.get("/api/:slug/tenant-tasks", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        status: z.string().max(32).optional(),
        assignee_user_id: z.coerce.number().int().positive().optional(),
        mine: z.enum(["true", "false"]).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .parse(request.query);
    let assignee = q.assignee_user_id;
    if (q.mine === "true") {
      const self = parseUserId(request);
      if (!self) return reply.status(400).send({ error: "BadUser" });
      assignee = self;
    }
    const result = await listTenantTasks(tenantId, {
      status: q.status,
      assignee_user_id: assignee,
      page: q.page ?? 1,
      limit: q.limit ?? 30
    });
    return reply.send(result);
  });

  app.post("/api/:slug/tenant-tasks", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = z
      .object({
        title: z.string().min(1).max(500),
        description: z.string().max(8000).nullable().optional(),
        priority: z.string().max(16).optional(),
        due_at: z.string().max(40).nullable().optional(),
        assignee_user_id: z.number().int().positive().nullable().optional()
      })
      .parse(request.body);
    const actor = parseUserId(request);
    try {
      const row = await createTenantTask(tenantId, actor ?? undefined, body);
      return reply.status(201).send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AssigneeNotFound") return reply.status(400).send({ error: "AssigneeNotFound" });
      throw e;
    }
  });

  app.patch("/api/:slug/tenant-tasks/:id", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = z
      .object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(8000).nullable().optional(),
        status: z.string().max(32).optional(),
        priority: z.string().max(16).optional(),
        due_at: z.string().max(40).nullable().optional(),
        assignee_user_id: z.number().int().positive().nullable().optional()
      })
      .parse(request.body);
    const viewer = getAccessUser(request);
    const self = parseUserId(request);
    if (viewer.role === "agent" || viewer.role === "expeditor") {
      const existing = await getTenantTask(tenantId, id);
      if (!existing || existing.assignee?.id !== self) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      if (body.status === undefined) {
        return reply.status(400).send({ error: "StatusRequired" });
      }
      const row = await patchTenantTask(tenantId, id, { status: body.status });
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    }
    if (!writeRoles.includes(viewer.role as (typeof writeRoles)[number])) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    try {
      const row = await patchTenantTask(tenantId, id, body);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AssigneeNotFound") return reply.status(400).send({ error: "AssigneeNotFound" });
      throw e;
    }
  });

  app.get("/api/:slug/agent-route-days", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        agent_id: z.coerce.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .parse(request.query);
    const viewer = getAccessUser(request);
    let agentId = q.agent_id;
    if (viewer.role === "agent") {
      const self = parseUserId(request);
      if (!self) return reply.status(400).send({ error: "BadUser" });
      agentId = self;
    }
    const result = await listAgentRouteDays(tenantId, {
      agent_id: agentId,
      from: q.from,
      to: q.to,
      page: q.page ?? 1,
      limit: q.limit ?? 31
    });
    return reply.send(result);
  });

  app.get("/api/:slug/agent-route-days/one", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        agent_id: z.coerce.number().int().positive(),
        route_date: z.string().min(8)
      })
      .parse(request.query);
    const viewer = getAccessUser(request);
    let agentId = q.agent_id;
    if (viewer.role === "agent") {
      const self = parseUserId(request);
      if (!self || q.agent_id !== self) return reply.status(403).send({ error: "Forbidden" });
      agentId = self;
    }
    const row = await getAgentRouteDay(tenantId, agentId, q.route_date);
    return reply.send({ data: row });
  });

  app.put("/api/:slug/agent-route-days", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = z
      .object({
        agent_id: z.number().int().positive(),
        route_date: z.string().min(8),
        stops: z.array(z.record(z.string(), z.any())).default([]),
        notes: z.string().max(2000).nullable().optional()
      })
      .parse(request.body);
    try {
      const row = await upsertAgentRouteDay(tenantId, body);
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AgentNotFound") return reply.status(400).send({ error: "AgentNotFound" });
      if (msg === "InvalidDate") return reply.status(400).send({ error: "InvalidDate" });
      throw e;
    }
  });
}
