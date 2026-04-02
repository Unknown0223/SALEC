import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { prisma } from "../../config/database";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  bonusRuleInclude,
  createBonusRule,
  fetchBonusRuleFull,
  mapBonusRuleFull,
  previewQtyBonus,
  setBonusRuleActive,
  softDeactivateBonusRule,
  updateBonusRule
} from "./bonus-rules.service";

const bonusTypeSchema = z.enum(["qty", "sum", "discount"]);

const conditionSchema = z.object({
  min_qty: z.number().nonnegative().nullable().optional(),
  max_qty: z.number().nonnegative().nullable().optional(),
  step_qty: z.number().positive(),
  bonus_qty: z.number().nonnegative(),
  max_bonus_qty: z.number().nonnegative().nullable().optional(),
  sort_order: z.number().int().optional()
});

const targetingFields = {
  client_category: z.string().nullable().optional(),
  payment_type: z.string().nullable().optional(),
  client_type: z.string().nullable().optional(),
  sales_channel: z.string().nullable().optional(),
  price_type: z.string().nullable().optional(),
  product_ids: z.array(z.number().int().positive()).optional(),
  bonus_product_ids: z.array(z.number().int().positive()).optional(),
  product_category_ids: z.array(z.number().int().positive()).optional(),
  target_all_clients: z.boolean().optional(),
  selected_client_ids: z.array(z.number().int().positive()).optional(),
  is_manual: z.boolean().optional(),
  in_blocks: z.boolean().optional(),
  once_per_client: z.boolean().optional(),
  one_plus_one_gift: z.boolean().optional(),
  conditions: z.array(conditionSchema).optional()
};

const createBodySchema = z
  .object({
    name: z.string().min(1),
    type: bonusTypeSchema,
    buy_qty: z.number().int().nonnegative().nullable().optional(),
    free_qty: z.number().int().nonnegative().nullable().optional(),
    min_sum: z.number().nonnegative().nullable().optional(),
    discount_pct: z.number().min(0).max(100).nullable().optional(),
    priority: z.number().int().default(0),
    is_active: z.boolean().optional(),
    valid_from: z.string().nullable().optional(),
    valid_to: z.string().nullable().optional()
  })
  .extend(targetingFields);

const updateBodySchema = createBodySchema.partial();

const activeBodySchema = z.object({
  is_active: z.boolean()
});

const previewQtyBodySchema = z.object({
  purchased_qty: z.number().nonnegative()
});

const catalogRoles = ["admin", "operator"] as const;

export async function registerBonusRuleRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/bonus-rules",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;

      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50));

      const where: Prisma.BonusRuleWhereInput = {
        tenant_id: request.tenant!.id
      };
      if (q.is_active === "true") where.is_active = true;
      if (q.is_active === "false") where.is_active = false;

      const [total, rows] = await Promise.all([
        prisma.bonusRule.count({ where }),
        prisma.bonusRule.findMany({
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: [{ priority: "desc" }, { id: "asc" }],
          include: bonusRuleInclude
        })
      ]);

      return reply.send({
        data: rows.map(mapBonusRuleFull),
        total,
        page: pageNum,
        limit: limitNum
      });
    }
  );

  app.get(
    "/api/:slug/bonus-rules/:id",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const row = await fetchBonusRuleFull(request.tenant!.id, id);
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send(row);
    }
  );

  app.post(
    "/api/:slug/bonus-rules/:id/preview-qty",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = previewQtyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const result = await previewQtyBonus(request.tenant!.id, id, parsed.data.purchased_qty);
      if ("error" in result) {
        if (result.error === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (result.error === "WRONG_TYPE") {
          return reply.status(400).send({ error: "WrongType", message: "Faqat miqdor (qty) turidagi qoida" });
        }
        return reply.status(400).send({ error: "NoConditions", message: "Shartlar yoki buy_qty/free_qty yo‘q" });
      }
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/bonus-rules",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createBonusRule(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        if (msg === "BAD_DATE") return reply.status(400).send({ error: "BadDate" });
        throw e;
      }
    }
  );

  app.put(
    "/api/:slug/bonus-rules/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = updateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      if (Object.keys(parsed.data).length === 0) {
        return reply.status(400).send({ error: "EmptyBody" });
      }
      try {
        const row = await updateBonusRule(
          request.tenant!.id,
          id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        if (msg === "BAD_DATE") return reply.status(400).send({ error: "BadDate" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/bonus-rules/:id/active",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = activeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await setBonusRuleActive(
          request.tenant!.id,
          id,
          parsed.data.is_active,
          actorUserIdOrNull(request)
        );
        return reply.send(row);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/bonus-rules/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const row = await softDeactivateBonusRule(
          request.tenant!.id,
          id,
          actorUserIdOrNull(request)
        );
        return reply.send(row);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );
}
