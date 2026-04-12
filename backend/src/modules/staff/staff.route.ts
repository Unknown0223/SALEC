import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { DIRECTORY_READ_ROLES, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import type { ListStaffFilters } from "./staff.service";
import {
  bulkPatchWebPanelStaffMaxSessions,
  bulkRevokeWebPanelStaffSessions,
  createStaff,
  getStaffRow,
  listAgentFilterOptions,
  listAgentSessions,
  listExpeditorFilterOptions,
  listStaff,
  listStaffSessions,
  listSupervisorFilterOptions,
  listWebPanelStaffFilterOptions,
  listWebStaffPositionPresetsAdmin,
  listWebStaffPositionPresetHistory,
  createWebStaffPositionPreset,
  patchWebStaffPositionPreset,
  patchAgent,
  patchExpeditor,
  patchOperator,
  patchSupervisor,
  revokeAgentSessions,
  revokeStaffSessions
} from "./staff.service";

const catalogRoles = ["admin", "operator"] as const;
const adminRoles = ["admin"] as const;

const agentEntitlementsSchema = z
  .object({
    price_types: z.array(z.string()).optional(),
    product_rules: z
      .array(
        z.object({
          category_id: z.number().int().positive(),
          all: z.boolean(),
          product_ids: z.array(z.number().int().positive()).optional()
        })
      )
      .optional()
  })
  .optional();

const createBodySchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  login: z.string().min(1),
  password: z.string().min(6),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  agent_type: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  pinfl: z.string().nullable().optional(),
  consignment: z.boolean().optional(),
  consignment_limit_amount: z.union([z.string(), z.null()]).optional(),
  consignment_ignore_previous_months_debt: z.boolean().optional(),
  apk_version: z.string().nullable().optional(),
  device_name: z.string().nullable().optional(),
  can_authorize: z.boolean().optional(),
  price_type: z.string().nullable().optional(),
  agent_price_types: z.array(z.string()).optional(),
  agent_entitlements: agentEntitlementsSchema,
  warehouse_id: z.number().int().positive().nullable().optional(),
  return_warehouse_id: z.number().int().positive().nullable().optional(),
  trade_direction_id: z.number().int().positive().nullable().optional(),
  trade_direction: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  app_access: z.boolean().optional(),
  territory: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  max_sessions: z.number().int().min(1).max(99).optional(),
  kpi_color: z.string().max(16).nullable().optional()
});

const patchStaffMutableBody = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  agent_type: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  pinfl: z.string().nullable().optional(),
  consignment: z.boolean().optional(),
  consignment_limit_amount: z.union([z.string(), z.null()]).optional(),
  consignment_ignore_previous_months_debt: z.boolean().optional(),
  apk_version: z.string().nullable().optional(),
  device_name: z.string().nullable().optional(),
  can_authorize: z.boolean().optional(),
  price_type: z.string().nullable().optional(),
  agent_price_types: z.array(z.string()).optional(),
  warehouse_id: z.number().int().positive().nullable().optional(),
  return_warehouse_id: z.number().int().positive().nullable().optional(),
  trade_direction_id: z.number().int().positive().nullable().optional(),
  trade_direction: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  app_access: z.boolean().optional(),
  territory: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  max_sessions: z.number().int().min(1).max(99).optional(),
  kpi_color: z.string().max(16).nullable().optional()
});

const expeditorAssignmentRulesSchema = z.object({
  price_types: z.array(z.string()).optional(),
  agent_ids: z.array(z.number().int().positive()).optional(),
  warehouse_ids: z.array(z.number().int().positive()).optional(),
  trade_directions: z.array(z.string()).optional(),
  territories: z.array(z.string()).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional()
});

const patchExpeditorBody = patchStaffMutableBody
  .extend({
    expeditor_assignment_rules: expeditorAssignmentRulesSchema.optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const patchSupervisorBody = patchStaffMutableBody
  .extend({
    supervisee_agent_ids: z.array(z.number().int().positive()).optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const patchAgentBody = patchStaffMutableBody
  .extend({
    supervisor_user_id: z.number().int().positive().nullable().optional(),
    agent_entitlements: agentEntitlementsSchema
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const revokeSessionsBody = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ token_ids: z.array(z.number().int().positive()).min(1) })
]);

function parseAgentListFilters(q: Record<string, string | undefined>): ListStaffFilters {
  const filters: ListStaffFilters = {};
  if (q.is_active === "true") filters.is_active = true;
  else if (q.is_active === "false") filters.is_active = false;
  if (q.branch?.trim()) filters.branch = q.branch.trim();
  if (q.trade_direction?.trim()) filters.trade_direction = q.trade_direction.trim();
  if (q.position?.trim()) filters.position = q.position.trim();
  if (q.territory?.trim()) filters.territory = q.territory.trim();
  if (q.territory_oblast?.trim()) filters.territory_oblast = q.territory_oblast.trim();
  if (q.territory_city?.trim()) filters.territory_city = q.territory_city.trim();
  return filters;
}

function parseExpeditorListFilters(q: Record<string, string | undefined>): ListStaffFilters {
  const filters = parseAgentListFilters(q);
  if (q.territory?.trim()) filters.territory = q.territory.trim();
  if (q.territory_oblast?.trim()) filters.territory_oblast = q.territory_oblast.trim();
  if (q.territory_city?.trim()) filters.territory_city = q.territory_city.trim();
  return filters;
}

function parseSupervisorListFilters(q: Record<string, string | undefined>): ListStaffFilters {
  const filters: ListStaffFilters = {};
  if (q.is_active === "true") filters.is_active = true;
  else if (q.is_active === "false") filters.is_active = false;
  if (q.position?.trim()) filters.position = q.position.trim();
  return filters;
}

function parseOperatorListFilters(q: Record<string, string | undefined>): ListStaffFilters {
  const filters: ListStaffFilters = {};
  if (q.is_active === "true") filters.is_active = true;
  else if (q.is_active === "false") filters.is_active = false;
  if (q.branch?.trim()) filters.branch = q.branch.trim();
  if (q.position?.trim()) filters.position = q.position.trim();
  return filters;
}

const createOperatorBodySchema = z
  .object({
    first_name: z.string().min(1),
    last_name: z.string().nullable().optional(),
    middle_name: z.string().nullable().optional(),
    login: z.string().min(1),
    password: z.string().min(6),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    code: z.string().max(24).nullable().optional(),
    pinfl: z.string().max(24).nullable().optional(),
    branch: z.string().max(128).nullable().optional(),
    position: z.string().max(128).nullable().optional(),
    can_authorize: z.boolean().optional(),
    is_active: z.boolean().optional(),
    app_access: z.boolean().optional(),
    max_sessions: z.number().int().min(1).max(99).optional(),
    cash_desk_id: z.number().int().positive().optional(),
    cash_desk_link_role: z.enum(["cashier", "manager", "operator"]).optional()
  })
  .refine(
    (o) =>
      (o.cash_desk_id == null && o.cash_desk_link_role == null) ||
      (o.cash_desk_id != null && o.cash_desk_link_role != null),
    { message: "cash_desk_pair", path: ["cash_desk_id"] }
  );

const patchOperatorBody = z
  .object({
    first_name: z.string().min(1).optional(),
    last_name: z.string().nullable().optional(),
    middle_name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    code: z.string().max(24).nullable().optional(),
    pinfl: z.string().max(24).nullable().optional(),
    branch: z.string().max(128).nullable().optional(),
    position: z.string().max(128).nullable().optional(),
    can_authorize: z.boolean().optional(),
    is_active: z.boolean().optional(),
    app_access: z.boolean().optional(),
    max_sessions: z.number().int().min(1).max(99).optional(),
    password: z.string().min(6).optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const bulkWebPanelRevokeBody = z.object({
  user_ids: z.array(z.number().int().positive()).min(1).max(200)
});

const bulkWebPanelMaxSessionsBody = z.object({
  updates: z
    .array(
      z.object({
        user_id: z.number().int().positive(),
        max_sessions: z.number().int().min(1).max(99)
      })
    )
    .min(1)
    .max(200)
});

const createWebStaffPositionPresetBody = z.object({
  label: z.string().min(1).max(128)
});

const patchWebStaffPositionPresetBody = z
  .object({
    label: z.string().min(1).max(128).optional(),
    is_active: z.boolean().optional()
  })
  .refine((o) => o.label !== undefined || o.is_active !== undefined, { message: "empty" });

export async function registerStaffRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/agents/filter-options",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listAgentFilterOptions(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get("/api/:slug/agents", { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const filters = parseAgentListFilters(q);
    const data = await listStaff(request.tenant!.id, "agent", filters);
    return reply.send({ data });
  });

  app.get(
    "/api/:slug/agents/:id/sessions",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listAgentSessions(request.tenant!.id, id);
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/agents/:id/sessions/revoke",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = revokeSessionsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        if ("all" in parsed.data && parsed.data.all) {
          await revokeAgentSessions(request.tenant!.id, id, { all: true }, actorUserIdOrNull(request));
        } else if ("token_ids" in parsed.data) {
          await revokeAgentSessions(
            request.tenant!.id,
            id,
            { tokenIds: parsed.data.token_ids },
            actorUserIdOrNull(request)
          );
        }
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_REVOKE") return reply.status(400).send({ error: "EmptyRevoke" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/agents/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await getStaffRow(request.tenant!.id, "agent", id);
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send({ data: row });
    }
  );

  app.post("/api/:slug/agents", { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }
    try {
      const row = await createStaff(request.tenant!.id, "agent", parsed.data, actorUserIdOrNull(request));
      return reply.status(201).send(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
      if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
      if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
      if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
      if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
      if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
      if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
      if (msg === "BAD_ENTITLEMENT_CATEGORY" || msg === "BAD_ENTITLEMENT_PRODUCT") {
        return reply.status(400).send({ error: "BadEntitlements" });
      }
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
      const parsed = patchAgentBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchAgent(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "SELF_SUPERVISOR") return reply.status(400).send({ error: "SelfSupervisor" });
        if (msg === "BAD_SUPERVISOR") return reply.status(400).send({ error: "BadSupervisor" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_MAX_SESSIONS") return reply.status(400).send({ error: "BadMaxSessions" });
        if (msg === "BAD_LIMIT") return reply.status(400).send({ error: "BadLimit" });
        if (msg === "BAD_ENTITLEMENT_CATEGORY" || msg === "BAD_ENTITLEMENT_PRODUCT") {
          return reply.status(400).send({ error: "BadEntitlements" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/supervisors/filter-options",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listSupervisorFilterOptions(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/supervisors",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const filters = parseSupervisorListFilters(q);
      const data = await listStaff(request.tenant!.id, "supervisor", filters);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/supervisors/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await getStaffRow(request.tenant!.id, "supervisor", id);
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send({ data: row });
    }
  );

  app.patch(
    "/api/:slug/supervisors/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchSupervisorBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchSupervisor(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_MAX_SESSIONS") return reply.status(400).send({ error: "BadMaxSessions" });
        if (msg === "BAD_SUPERVISEE_AGENT") return reply.status(400).send({ error: "BadSuperviseeAgent" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/supervisors/:id/sessions",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listStaffSessions(request.tenant!.id, id, "supervisor");
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/supervisors/:id/sessions/revoke",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = revokeSessionsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        if ("all" in parsed.data && parsed.data.all) {
          await revokeStaffSessions(request.tenant!.id, id, "supervisor", { all: true }, actorUserIdOrNull(request));
        } else if ("token_ids" in parsed.data) {
          await revokeStaffSessions(
            request.tenant!.id,
            id,
            "supervisor",
            { tokenIds: parsed.data.token_ids },
            actorUserIdOrNull(request)
          );
        }
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_REVOKE") return reply.status(400).send({ error: "EmptyRevoke" });
        throw e;
      }
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
        const row = await createStaff(
          request.tenant!.id,
          "supervisor",
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
        if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/expeditors/filter-options",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listExpeditorFilterOptions(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/expeditors",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const filters = parseExpeditorListFilters(q);
      const data = await listStaff(request.tenant!.id, "expeditor", filters);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/expeditors/:id/sessions",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listStaffSessions(request.tenant!.id, id, "expeditor");
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/expeditors/:id/sessions/revoke",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = revokeSessionsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        if ("all" in parsed.data && parsed.data.all) {
          await revokeStaffSessions(request.tenant!.id, id, "expeditor", { all: true }, actorUserIdOrNull(request));
        } else if ("token_ids" in parsed.data) {
          await revokeStaffSessions(
            request.tenant!.id,
            id,
            "expeditor",
            { tokenIds: parsed.data.token_ids },
            actorUserIdOrNull(request)
          );
        }
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_REVOKE") return reply.status(400).send({ error: "EmptyRevoke" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/expeditors/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await getStaffRow(request.tenant!.id, "expeditor", id);
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send({ data: row });
    }
  );

  app.patch(
    "/api/:slug/expeditors/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchExpeditorBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchExpeditor(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_MAX_SESSIONS") return reply.status(400).send({ error: "BadMaxSessions" });
        if (msg === "BAD_EXPEDITOR_RULE_AGENT") return reply.status(400).send({ error: "BadExpeditorRuleAgent" });
        if (msg === "BAD_EXPEDITOR_RULE_WAREHOUSE") {
          return reply.status(400).send({ error: "BadExpeditorRuleWarehouse" });
        }
        throw e;
      }
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
        const row = await createStaff(
          request.tenant!.id,
          "expeditor",
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
        if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_RETURN_WAREHOUSE") return reply.status(400).send({ error: "BadReturnWarehouse" });
        if (msg === "BAD_TRADE_DIRECTION") return reply.status(400).send({ error: "BadTradeDirection" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/operators",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const filters = parseOperatorListFilters(q);
      const data = await listStaff(request.tenant!.id, "operator", filters);
      return reply.send({ data });
    }
  );

  /** `meta` — `:id` bilan adashmasligi uchun (masalan filter-options). */
  app.get(
    "/api/:slug/operators/meta/filter-options",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listWebPanelStaffFilterOptions(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/operators/meta/position-presets",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      try {
        const data = await listWebStaffPositionPresetsAdmin(request.tenant!.id);
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  /** Statik `history` UUID dan oldin — ba’zi muhitlarda `:presetId/history` 404 berardi */
  app.get(
    "/api/:slug/operators/meta/position-presets/history/:presetId",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const presetId = (request.params as { presetId?: string }).presetId ?? "";
      try {
        const result = await listWebStaffPositionPresetHistory(request.tenant!.id, presetId);
        return reply.send(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_PRESET_ID") return reply.status(400).send({ error: "BadPresetId" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/operators/meta/position-presets",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createWebStaffPositionPresetBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createWebStaffPositionPreset(
          request.tenant!.id,
          parsed.data.label,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send({ data: row });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_LABEL") return reply.status(400).send({ error: "BadLabel" });
        if (msg === "PRESET_LIMIT") return reply.status(400).send({ error: "PresetLimit" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/operators/meta/position-presets/:presetId",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const presetId = (request.params as { presetId?: string }).presetId ?? "";
      const parsed = patchWebStaffPositionPresetBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchWebStaffPositionPreset(
          request.tenant!.id,
          presetId,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send({ data: row });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_PRESET_ID") return reply.status(400).send({ error: "BadPresetId" });
        if (msg === "BAD_LABEL") return reply.status(400).send({ error: "BadLabel" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/operators/bulk/sessions/revoke",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkWebPanelRevokeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        await bulkRevokeWebPanelStaffSessions(
          request.tenant!.id,
          parsed.data.user_ids,
          actorUserIdOrNull(request)
        );
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_IDS") return reply.status(400).send({ error: "EmptyIds" });
        if (msg === "BAD_USER_IDS") return reply.status(400).send({ error: "BadUserIds" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/operators/bulk/max-sessions",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkWebPanelMaxSessionsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        await bulkPatchWebPanelStaffMaxSessions(
          request.tenant!.id,
          parsed.data.updates,
          actorUserIdOrNull(request)
        );
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_IDS") return reply.status(400).send({ error: "EmptyIds" });
        if (msg === "BAD_USER_IDS") return reply.status(400).send({ error: "BadUserIds" });
        if (msg === "BAD_MAX_SESSIONS") return reply.status(400).send({ error: "BadMaxSessions" });
        if (msg === "TOO_MANY_UPDATES") return reply.status(400).send({ error: "TooManyUpdates" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/operators/:id(\\d+)",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await getStaffRow(request.tenant!.id, "operator", id);
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send({ data: row });
    }
  );

  app.post(
    "/api/:slug/operators",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createOperatorBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createStaff(
          request.tenant!.id,
          "operator",
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_LOGIN") return reply.status(400).send({ error: "BadLogin" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_FIRST_NAME") return reply.status(400).send({ error: "BadFirstName" });
        if (msg === "LOGIN_EXISTS") return reply.status(409).send({ error: "LoginExists" });
        if (msg === "CashDeskNotFound") return reply.status(400).send({ error: "CashDeskNotFound" });
        if (msg === "UserRoleMismatch") return reply.status(400).send({ error: "UserRoleMismatch" });
        if (msg === "InvalidLinkRole") return reply.status(400).send({ error: "InvalidLinkRole" });
        if (msg === "CashDeskUserLinkExists")
          return reply.status(409).send({ error: "CashDeskUserLinkExists" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/operators/:id(\\d+)",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchOperatorBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchOperator(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_PASSWORD") return reply.status(400).send({ error: "BadPassword" });
        if (msg === "BAD_MAX_SESSIONS") return reply.status(400).send({ error: "BadMaxSessions" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/operators/:id(\\d+)/sessions",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listStaffSessions(request.tenant!.id, id, "operator");
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/operators/:id(\\d+)/sessions/revoke",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = revokeSessionsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        if ("all" in parsed.data && parsed.data.all) {
          await revokeStaffSessions(request.tenant!.id, id, "operator", { all: true }, actorUserIdOrNull(request));
        } else if ("token_ids" in parsed.data) {
          await revokeStaffSessions(
            request.tenant!.id,
            id,
            "operator",
            { tokenIds: parsed.data.token_ids },
            actorUserIdOrNull(request)
          );
        }
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_REVOKE") return reply.status(400).send({ error: "EmptyRevoke" });
        throw e;
      }
    }
  );
}
