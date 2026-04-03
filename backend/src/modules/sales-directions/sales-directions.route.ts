import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createKpiGroup,
  createSalesChannelRef,
  createTradeDirection,
  getKpiGroupDetail,
  listKpiGroups,
  listSalesChannelRefs,
  listTradeDirections,
  patchKpiGroup,
  patchSalesChannelRef,
  patchTradeDirection
} from "./sales-directions.service";

const catalogRoles = ["admin", "operator"] as const;

const boolQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === "true" ? true : v === "false" ? false : undefined));

function mapSalesDirError(err: unknown, reply: FastifyReply) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
  if (msg === "DUPLICATE_CODE") return reply.status(409).send({ error: "DuplicateCode" });
  if (msg === "BAD_PRODUCT_IDS") return reply.status(400).send({ error: "BadProductIds" });
  if (msg === "BAD_AGENT_IDS") return reply.status(400).send({ error: "BadAgentIds" });
  throw err;
}

const tradeCreateBody = z.object({
  name: z.string().min(1).max(500),
  sort_order: z.number().int().optional(),
  code: z.string().max(20).nullable().optional(),
  comment: z.string().max(8000).nullable().optional(),
  is_active: z.boolean().optional(),
  use_in_order_proposal: z.boolean().optional()
});

const tradePatchBody = tradeCreateBody.partial().refine((o) => Object.keys(o).length > 0, { message: "empty" });

const channelCreateBody = z.object({
  name: z.string().min(1).max(500),
  code: z.string().max(20).nullable().optional(),
  comment: z.string().max(8000).nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional()
});

const channelPatchBody = channelCreateBody.partial().refine((o) => Object.keys(o).length > 0, { message: "empty" });

const kpiCreateBody = z.object({
  name: z.string().min(1).max(500),
  code: z.string().max(20).nullable().optional(),
  sort_order: z.number().int().optional(),
  comment: z.string().max(8000).nullable().optional(),
  is_active: z.boolean().optional(),
  product_ids: z.array(z.number().int().positive()).optional(),
  agent_user_ids: z.array(z.number().int().positive()).optional()
});

const kpiPatchBody = kpiCreateBody.partial().refine((o) => Object.keys(o).length > 0, { message: "empty" });

export async function registerSalesDirectionRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/trade-directions",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const is_active = boolQuery.safeParse(q.is_active).data;
      const useProp = boolQuery.safeParse(q.use_in_order_proposal).data;
      const search = q.search?.trim() || q.q?.trim();
      try {
        const data = await listTradeDirections(request.tenant!.id, {
          is_active,
          search,
          use_in_order_proposal: useProp === true ? true : undefined
        });
        return reply.send({ data });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.post(
    "/api/:slug/trade-directions",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = tradeCreateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createTradeDirection(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.patch(
    "/api/:slug/trade-directions/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.status(400).send({ error: "ValidationError" });
      }
      const parsed = tradePatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchTradeDirection(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.get(
    "/api/:slug/sales-channels",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const is_active = boolQuery.safeParse(q.is_active).data;
      const search = q.search?.trim() || q.q?.trim();
      try {
        const data = await listSalesChannelRefs(request.tenant!.id, { is_active, search });
        return reply.send({ data });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.post(
    "/api/:slug/sales-channels",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = channelCreateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createSalesChannelRef(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.patch(
    "/api/:slug/sales-channels/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.status(400).send({ error: "ValidationError" });
      }
      const parsed = channelPatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchSalesChannelRef(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.get(
    "/api/:slug/kpi-groups",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const is_active = boolQuery.safeParse(q.is_active).data;
      const search = q.search?.trim() || q.q?.trim();
      try {
        const data = await listKpiGroups(request.tenant!.id, { is_active, search });
        return reply.send({ data });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.get(
    "/api/:slug/kpi-groups/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.status(400).send({ error: "ValidationError" });
      }
      const row = await getKpiGroupDetail(request.tenant!.id, id);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    }
  );

  app.post(
    "/api/:slug/kpi-groups",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = kpiCreateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createKpiGroup(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );

  app.patch(
    "/api/:slug/kpi-groups/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.status(400).send({ error: "ValidationError" });
      }
      const parsed = kpiPatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await patchKpiGroup(request.tenant!.id, id, parsed.data, actorUserIdOrNull(request));
        return reply.send({ data: row });
      } catch (e) {
        return mapSalesDirError(e, reply);
      }
    }
  );
}
