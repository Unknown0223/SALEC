import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { parseSelectedMastersFromQuery, resolveConstraintScope } from "../linkage/linkage.service";
import {
  createSalesReturn,
  listSalesReturns,
  listSalesReturnsForOrder
} from "./sales-returns.service";
import {
  getClientReturnsData,
  createPeriodReturn,
  createPeriodReturnBatch,
  createFullReturnFromOrder,
  MAX_RETURN_ITEMS
} from "./returns-enhanced.service";

const catalogRoles = ["admin", "operator"] as const;

const priceTypeOptional = z.string().trim().min(1).max(128).optional().nullable();

const createBody = z.object({
  warehouse_id: z.number().int().positive(),
  client_id: z.number().int().positive().nullable().optional(),
  order_id: z.number().int().positive().nullable().optional(),
  price_type: priceTypeOptional,
  refund_amount: z.number().positive().nullable().optional(),
  note: z.string().max(2000).optional().nullable(),
  refusal_reason_ref: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .min(1)
});

const periodReturnLine = z.object({
  product_id: z.number().int().positive(),
  qty: z.number().positive().optional(),
  paid_qty: z.number().min(0).optional(),
  bonus_qty: z.number().min(0).optional(),
  bonus_cash: z.number().min(0).optional()
});

const periodReturnBody = z.object({
  client_id: z.number().int().positive(),
  order_id: z.number().int().positive().optional(),
  warehouse_id: z.number().int().positive().optional(),
  price_type: priceTypeOptional,
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  note: z.string().max(2000).optional().nullable(),
  refusal_reason_ref: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(periodReturnLine)
    .min(1)
    .refine(
      (lines) =>
        lines.reduce((a, l) => {
          const q = l.qty ?? 0;
          if (q > 0) return a + q;
          return a + (l.paid_qty ?? 0) + (l.bonus_qty ?? 0);
        }, 0) <= MAX_RETURN_ITEMS,
      { message: `Max ${MAX_RETURN_ITEMS} ta mahsulot qaytarish mumkin` }
    )
});

const periodReturnBatchLine = z.object({
  order_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  qty: z.number().positive().optional(),
  paid_qty: z.number().min(0).optional(),
  bonus_qty: z.number().min(0).optional(),
  bonus_cash: z.number().min(0).optional()
});

const periodReturnBatchBody = z.object({
  client_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive().optional(),
  price_type: priceTypeOptional,
  note: z.string().max(2000).optional().nullable(),
  refusal_reason_ref: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(periodReturnBatchLine)
    .min(1)
    .refine(
      (lines) =>
        lines.reduce((a, l) => {
          const q = l.qty ?? 0;
          if (q > 0) return a + q;
          return a + (l.paid_qty ?? 0) + (l.bonus_qty ?? 0);
        }, 0) <= MAX_RETURN_ITEMS,
      { message: `Max ${MAX_RETURN_ITEMS} ta mahsulot qaytarish mumkin` }
    )
});

const fullReturnBody = z.object({
  order_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive().optional(),
  price_type: priceTypeOptional,
  refund_amount: z.number().positive().optional(),
  note: z.string().max(2000).optional().nullable(),
  refusal_reason_ref: z.string().trim().max(128).optional().nullable()
});

function sendReturnNotInterchangeable(reply: FastifyReply, e: unknown) {
  const pid = (e as Error & { product_id?: number }).product_id;
  return reply.status(400).send({
    error: "ReturnNotInterchangeable",
    ...(pid != null ? { product_id: pid } : {}),
    message:
      "Mahsulot faol interchangeable guruhda emas yoki tanlangan narx turi guruh bilan mos emas. Katalogda guruhni tekshiring."
  });
}

export async function registerSalesReturnRoutes(app: FastifyInstance) {
  // ─── List returns ──────────────────────────────────────────────────────
  app.get(
    "/api/:slug/returns",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      const warehouse_id = q.warehouse_id ? Number.parseInt(q.warehouse_id, 10) : undefined;
      const client_id = q.client_id ? Number.parseInt(q.client_id, 10) : undefined;
      const selected = parseSelectedMastersFromQuery(q);
      const scope = await resolveConstraintScope(request.tenant!.id, selected);
      const result = await listSalesReturns(request.tenant!.id, {
        page, limit,
        warehouse_id: warehouse_id != null && warehouse_id > 0 ? warehouse_id : undefined,
        client_id: client_id != null && client_id > 0 ? client_id : undefined,
        warehouse_ids: scope.constrained ? scope.warehouse_ids : undefined,
        client_ids: scope.constrained ? scope.client_ids : undefined
      });
      return reply.send(result);
    }
  );

  // ─── Returns for a specific order ──────────────────────────────────────
  app.get(
    "/api/:slug/orders/:id/returns",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) return reply.status(400).send({ error: "InvalidId" });
      const data = await listSalesReturnsForOrder(request.tenant!.id, id);
      return reply.send({ data });
    }
  );

  // ─── Client returns data (with date filter) ────────────────────────────
  app.get(
    "/api/:slug/returns/client-data",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const clientId = Number.parseInt(q.client_id ?? "0", 10);
      if (!Number.isFinite(clientId) || clientId < 1) {
        return reply.status(400).send({ error: "ClientIdRequired" });
      }
      const selected = parseSelectedMastersFromQuery(q);
      const scope = await resolveConstraintScope(request.tenant!.id, selected);
      if (scope.constrained && !scope.client_ids.includes(clientId)) {
        return reply.status(400).send({ error: "BadClientScope" });
      }
      const orderIdsRaw = q.order_ids?.trim();
      let orderIds: number[] | undefined;
      if (orderIdsRaw) {
        const parsed = orderIdsRaw
          .split(/[, ]+/)
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        const uniq = [...new Set(parsed)];
        if (uniq.length > 0) orderIds = uniq;
      }
      const orderRaw = q.order_id?.trim();
      let orderId: number | undefined;
      if (!orderIds?.length && orderRaw) {
        const n = Number.parseInt(orderRaw, 10);
        if (!Number.isNaN(n) && n > 0) orderId = n;
      }
      try {
        const data = await getClientReturnsData(
          request.tenant!.id,
          clientId,
          q.date_from,
          q.date_to,
          orderId,
          orderIds
        );
        return reply.send(data);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (code === "ORDER_NOT_DELIVERED")
          return reply.status(400).send({
            error: "OrderNotDelivered",
            message: "Возврат с полки доступен только для заказов со статусом «Доставлен»."
          });
        if (code === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        throw e;
      }
    }
  );

  // ─── Create period return (Vazvrat Polki) ──────────────────────────────
  app.post(
    "/api/:slug/returns/period",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = periodReturnBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const data = await createPeriodReturn(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(data);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (code === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (code === "EMPTY_LINES") return reply.status(400).send({ error: "EmptyLines" });
        if (code === "TOO_MANY_ITEMS")
          return reply.status(400).send({ error: "TooManyItems", max: MAX_RETURN_ITEMS });
        if (code === "RETURN_QTY_EXCEEDS_ORDERED")
          return reply.status(400).send({ error: "QtyExceedsOrdered" });
        if (code === "NOTHING_TO_RETURN")
          return reply.status(400).send({ error: "NothingToReturn" });
        if (code === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (code === "ORDER_NOT_DELIVERED")
          return reply.status(400).send({
            error: "OrderNotDelivered",
            message: "Возврат с полки доступен только для заказов со статусом «Доставлен»."
          });
        if (code === "NO_WAREHOUSE") return reply.status(400).send({ error: "NoWarehouse" });
        if (code === "BONUS_CASH_EXCEEDS")
          return reply.status(400).send({ error: "BonusCashExceeds" });
        if (code === "MIXED_LINE_MODES" || code === "MIXED_LINE_FIELDS")
          return reply.status(400).send({ error: "BadLineMode" });
        if (code === "EMPTY_LINE") return reply.status(400).send({ error: "EmptyLine" });
        if (code === "RETURN_NOT_INTERCHANGEABLE") return sendReturnNotInterchangeable(reply, e);
        throw e;
      }
    }
  );

  // ─── Create period return — bir nechta zakaz (polki po zakaz) ───────────
  app.post(
    "/api/:slug/returns/period-batch",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = periodReturnBatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const data = await createPeriodReturnBatch(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(data);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (code === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (code === "EMPTY_LINES") return reply.status(400).send({ error: "EmptyLines" });
        if (code === "TOO_MANY_ITEMS")
          return reply.status(400).send({ error: "TooManyItems", max: MAX_RETURN_ITEMS });
        if (code === "RETURN_QTY_EXCEEDS_ORDERED")
          return reply.status(400).send({ error: "QtyExceedsOrdered" });
        if (code === "NOTHING_TO_RETURN")
          return reply.status(400).send({ error: "NothingToReturn" });
        if (code === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (code === "ORDER_NOT_DELIVERED")
          return reply.status(400).send({
            error: "OrderNotDelivered",
            message: "Возврат с полки доступен только для заказов со статусом «Доставлен»."
          });
        if (code === "NO_WAREHOUSE") return reply.status(400).send({ error: "NoWarehouse" });
        if (code === "BONUS_CASH_EXCEEDS")
          return reply.status(400).send({ error: "BonusCashExceeds" });
        if (code === "MIXED_LINE_MODES" || code === "MIXED_LINE_FIELDS")
          return reply.status(400).send({ error: "BadLineMode" });
        if (code === "EMPTY_LINE") return reply.status(400).send({ error: "EmptyLine" });
        if (code === "RETURN_NOT_INTERCHANGEABLE") return sendReturnNotInterchangeable(reply, e);
        throw e;
      }
    }
  );

  // ─── Full order return ─────────────────────────────────────────────────
  app.post(
    "/api/:slug/returns/full-order",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = fullReturnBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const data = await createFullReturnFromOrder(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(data);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (code === "ORDER_NOT_RETURNABLE")
          return reply.status(400).send({ error: "OrderNotReturnable" });
        if (code === "ORDER_ALREADY_FULLY_RETURNED")
          return reply.status(409).send({ error: "OrderAlreadyFullyReturned" });
        if (code === "NO_WAREHOUSE") return reply.status(400).send({ error: "NoWarehouse" });
        if (code === "RETURN_NOT_INTERCHANGEABLE") return sendReturnNotInterchangeable(reply, e);
        throw e;
      }
    }
  );

  // ─── Basic create return (backward compat) ─────────────────────────────
  app.post(
    "/api/:slug/returns",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createSalesReturn(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_WAREHOUSE") return reply.status(400).send({ error: "BadWarehouse" });
        if (msg === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (msg === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (msg === "BAD_ORDER_CLIENT") return reply.status(400).send({ error: "BadOrderClient" });
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        if (msg === "EMPTY_LINES") return reply.status(400).send({ error: "EmptyLines" });
        if (msg === "REFUND_NEEDS_CLIENT") return reply.status(400).send({ error: "RefundNeedsClient" });
        if (msg === "RETURN_NOT_INTERCHANGEABLE") return sendReturnNotInterchangeable(reply, e);
        throw e;
      }
    }
  );
}
