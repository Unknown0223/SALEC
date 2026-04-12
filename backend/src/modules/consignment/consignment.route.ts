import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  bulkPatchConsignmentAgentRows,
  bulkPatchConsignmentAgents,
  listConsignmentAgents,
  type ListConsignmentAgentsQuery
} from "./consignment.service";

const catalogRoles = ["admin", "operator"] as const;

const listQuerySchema = z.object({
  year_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  supervisor_user_id: z.coerce.number().int().positive().optional(),
  agents_without_supervisor: z.union([z.literal("1"), z.literal("true")]).optional(),
  consignment: z.enum(["all", "yes", "no"]).optional(),
  search: z.string().optional()
});

const bulkBodySchema = z.object({
  user_ids: z.array(z.number().int().positive()).min(1).max(500),
  consignment: z.boolean().optional(),
  consignment_limit_amount: z.union([z.string(), z.null()]).optional(),
  consignment_ignore_previous_months_debt: z.boolean().optional()
});

const bulkRowsBodySchema = z.object({
  rows: z
    .array(
      z.object({
        user_id: z.number().int().positive(),
        consignment: z.boolean(),
        consignment_limit_amount: z.union([z.string(), z.null()]),
        consignment_ignore_previous_months_debt: z.boolean()
      })
    )
    .min(1)
    .max(500)
});

export async function registerConsignmentRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/consignment/agents",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = listQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const aw = parsed.data.agents_without_supervisor;
      const q: ListConsignmentAgentsQuery = {
        year_month: parsed.data.year_month,
        supervisor_user_id: parsed.data.supervisor_user_id,
        agents_without_supervisor:
          aw === "1" || aw === "true" ? true : undefined,
        consignment: parsed.data.consignment,
        search: parsed.data.search
      };
      const result = await listConsignmentAgents(request.tenant!.id, q);
      return reply.send(result);
    }
  );

  app.patch(
    "/api/:slug/consignment/agents/bulk",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = actorUserIdOrNull(request);
        const out = await bulkPatchConsignmentAgents(request.tenant!.id, parsed.data, actor);
        return reply.send(out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_IDS") return reply.status(400).send({ error: "EmptyIds" });
        if (msg === "TOO_MANY_IDS") return reply.status(400).send({ error: "TooManyIds" });
        if (msg === "EMPTY_PATCH") return reply.status(400).send({ error: "EmptyPatch" });
        if (msg === "BAD_LIMIT") return reply.status(400).send({ error: "BadLimit" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/consignment/agents/bulk-rows",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkRowsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = actorUserIdOrNull(request);
        const out = await bulkPatchConsignmentAgentRows(
          request.tenant!.id,
          parsed.data.rows,
          actor
        );
        return reply.send(out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_ROWS") return reply.status(400).send({ error: "EmptyRows" });
        if (msg === "TOO_MANY_ROWS") return reply.status(400).send({ error: "TooManyRows" });
        if (msg === "BAD_LIMIT") return reply.status(400).send({ error: "BadLimit" });
        if (msg === "BAD_AGENT_ROW") {
          return reply.status(409).send({
            error: "BadAgentRow",
            message: "Один из агентов не найден или не принадлежит тенанту"
          });
        }
        throw e;
      }
    }
  );
}
