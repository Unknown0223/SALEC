import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getErrorCode } from "../../lib/app-error";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createOrder,
  getOrderDetail,
  listOrdersPaged,
  updateOrderLines,
  updateOrderMeta,
  updateOrderStatus
} from "./orders.service";

const createBodySchema = z.object({
  client_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive().nullable().optional(),
  agent_id: z.number().int().positive().nullable().optional(),
  apply_bonus: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .min(1)
});

const catalogRoles = ["admin", "operator"] as const;

const patchStatusBodySchema = z.object({
  status: z.string().min(1)
});

const patchOrderLinesBodySchema = z.object({
  warehouse_id: z.number().int().positive().nullable().optional(),
  agent_id: z.number().int().positive().nullable().optional(),
  apply_bonus: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .min(1)
});

const patchOrderMetaBodySchema = z
  .object({
    warehouse_id: z.number().int().positive().nullable().optional(),
    agent_id: z.number().int().positive().nullable().optional()
  })
  .refine((b) => b.warehouse_id !== undefined || b.agent_id !== undefined, {
    message: "At least one of warehouse_id, agent_id"
  });

export async function registerOrderRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/orders",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      const status = q.status?.trim() || undefined;
      const clientRaw = q.client_id?.trim();
      let client_id: number | undefined;
      if (clientRaw) {
        const n = Number.parseInt(clientRaw, 10);
        if (!Number.isNaN(n) && n > 0) client_id = n;
      }
      const result = await listOrdersPaged(request.tenant!.id, {
        page: pageNum,
        limit: limitNum,
        status,
        client_id
      });
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/orders/:id",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const viewer = getAccessUser(request);
        const row = await getOrderDetail(request.tenant!.id, id, viewer.role);
        return reply.send(row);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/orders/:id/meta",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchOrderMetaBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const viewer = getAccessUser(request);
        const sub = Number.parseInt(viewer.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const row = await updateOrderMeta(
          request.tenant!.id,
          id,
          parsed.data,
          viewer.role,
          actorUserId
        );
        return reply.send(row);
      } catch (e) {
        const msg = getErrorCode(e) ?? "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "ORDER_NOT_EDITABLE") {
          return reply.status(400).send({ error: "OrderNotEditable" });
        }
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_AGENT") return reply.status(400).send({ error: "BadAgent" });
        if (msg === "EMPTY_META_PATCH") {
          return reply.status(400).send({ error: "ValidationError" });
        }
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/orders/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchOrderLinesBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const viewer = getAccessUser(request);
        const sub = Number.parseInt(viewer.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const row = await updateOrderLines(
          request.tenant!.id,
          id,
          parsed.data,
          viewer.role,
          actorUserId
        );
        return reply.send(row);
      } catch (e) {
        const msg = getErrorCode(e) ?? "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "ORDER_NOT_EDITABLE") {
          return reply.status(400).send({ error: "OrderNotEditable" });
        }
        if (msg === "FORBIDDEN_OPERATOR_ORDER_LINES_EDIT") {
          return reply.status(403).send({ error: "ForbiddenOperatorOrderLinesEdit" });
        }
        if (msg === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_AGENT") return reply.status(400).send({ error: "BadAgent" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        if (msg === "DUPLICATE_PRODUCT") return reply.status(400).send({ error: "DuplicateProduct" });
        if (msg === "EMPTY_ITEMS") return reply.status(400).send({ error: "EmptyItems" });
        if (msg === "NO_PRICE") {
          const pid = (e as Error & { product_id?: number }).product_id;
          return reply.status(400).send({ error: "NoRetailPrice", product_id: pid });
        }
        if (msg === "CREDIT_LIMIT_EXCEEDED") {
          const ex = e as Error & { credit_limit?: string; outstanding?: string; order_total?: string };
          return reply.status(400).send({
            error: "CreditLimitExceeded",
            credit_limit: ex.credit_limit,
            outstanding: ex.outstanding,
            order_total: ex.order_total
          });
        }
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/orders/:id/status",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchStatusBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const actorSub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(actorSub) && actorSub > 0 ? actorSub : null;
        const row = await updateOrderStatus(
          request.tenant!.id,
          id,
          parsed.data.status,
          actorUserId,
          actor.role
        );
        return reply.send(row);
      } catch (e) {
        const msg = getErrorCode(e) ?? "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "FORBIDDEN_REVERT") {
          return reply.status(403).send({ error: "ForbiddenRevert" });
        }
        if (msg === "FORBIDDEN_REOPEN_CANCELLED") {
          return reply.status(403).send({ error: "ForbiddenReopenCancelled" });
        }
        if (msg === "FORBIDDEN_OPERATOR_CANCEL_LATE") {
          return reply.status(403).send({ error: "ForbiddenOperatorCancelLate" });
        }
        if (msg === "INVALID_STATUS") return reply.status(400).send({ error: "InvalidStatus" });
        if (msg === "INVALID_TRANSITION") {
          const ex = e as Error & { from?: string; to?: string };
          return reply.status(400).send({
            error: "InvalidTransition",
            from: ex.from,
            to: ex.to
          });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/orders",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const viewer = getAccessUser(request);
        const row = await createOrder(request.tenant!.id, parsed.data, viewer.role);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = getErrorCode(e) ?? "";
        if (msg === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_AGENT") return reply.status(400).send({ error: "BadAgent" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        if (msg === "DUPLICATE_PRODUCT") return reply.status(400).send({ error: "DuplicateProduct" });
        if (msg === "EMPTY_ITEMS") return reply.status(400).send({ error: "EmptyItems" });
        if (msg === "NO_PRICE") {
          const pid = (e as Error & { product_id?: number }).product_id;
          return reply.status(400).send({ error: "NoRetailPrice", product_id: pid });
        }
        if (msg === "CREDIT_LIMIT_EXCEEDED") {
          const ex = e as Error & { credit_limit?: string; outstanding?: string; order_total?: string };
          return reply.status(400).send({
            error: "CreditLimitExceeded",
            credit_limit: ex.credit_limit,
            outstanding: ex.outstanding,
            order_total: ex.order_total
          });
        }
        throw e;
      }
    }
  );
}
