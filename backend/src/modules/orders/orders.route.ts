import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getErrorCode } from "../../lib/app-error";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { parseSelectedMastersFromQuery, resolveConstraintScope } from "../linkage/linkage.service";
import { getExchangeSourceAvailability } from "./exchange-source-limits.service";
import { getOrderCreateContextBundle } from "./order-create-context.service";
import {
  bulkUpdateOrderExpeditor,
  bulkUpdateOrderStatus,
  createOrder,
  getOrderDetail,
  listOrdersPaged,
  requestBulkOrderNakladnoy,
  updateOrderLines,
  updateOrderMeta,
  updateOrderStatus
} from "./orders.service";

const createBodySchema = z
  .object({
  client_id: z.number().int().positive(),
  /** Majburiy — qaysi ombordan jo'natiladi */
  warehouse_id: z.number().int().positive(),
  agent_id: z.number().int().positive().nullable().optional(),
  expeditor_user_id: z.number().int().positive().nullable().optional(),
  price_type: z.string().trim().min(1).max(128).optional().nullable(),
  /** Hujjat tipi: order | return | exchange | partial_return | return_by_order */
  order_type: z.enum(["order", "return", "exchange", "partial_return", "return_by_order"]).optional(),
  apply_bonus: z.boolean().optional(),
  bonus_gift_overrides: z
    .array(
      z.object({
        bonus_rule_id: z.number().int().positive(),
        bonus_product_id: z.number().int().positive()
      })
    )
    .optional(),
  comment: z.string().max(4000).optional().nullable(),
  request_type_ref: z.string().trim().max(128).optional().nullable(),
  is_consignment: z.boolean().optional(),
  /** ISO sana yoki `YYYY-MM-DD` */
  consignment_due_date: z.string().max(40).optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .default([]),
  payment_method_ref: z.string().trim().max(64).optional().nullable(),
  source_order_ids: z.array(z.number().int().positive()).optional(),
  minus_lines: z
    .array(
      z.object({
        order_id: z.number().int().positive(),
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .optional(),
  plus_lines: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        qty: z.number().positive()
      })
    )
    .optional(),
  reason_ref: z.string().trim().max(256).optional().nullable()
})
  .superRefine((data, ctx) => {
    const ot = data.order_type ?? "order";
    if (ot === "exchange") {
      if (!data.source_order_ids?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Manba zakazlar (source_order_ids) majburiy",
          path: ["source_order_ids"]
        });
      }
      if (!data.minus_lines?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Kamayuvchi qatorlar (minus_lines) majburiy",
          path: ["minus_lines"]
        });
      }
      if (!data.plus_lines?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Qo‘shiluvchi qatorlar (plus_lines) majburiy",
          path: ["plus_lines"]
        });
      }
      return;
    }
    if (!data.items.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kamida bitta qator kerak",
        path: ["items"]
      });
    }
    if (ot !== "order") return;
    if (data.agent_id == null || data.agent_id < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agent majburiy",
        path: ["agent_id"]
      });
    }
    const pm = (data.payment_method_ref ?? "").trim();
    if (!pm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "To‘lov usuli majburiy",
        path: ["payment_method_ref"]
      });
    }
  });

const catalogRoles = ["admin", "operator"] as const;

const patchStatusBodySchema = z.object({
  status: z.string().min(1)
});

const bulkStatusBodySchema = z.object({
  order_ids: z.array(z.number().int().positive()).min(1).max(500),
  status: z.string().min(1)
});

const bulkNakladnoyBodySchema = z.object({
  order_ids: z.array(z.number().int().positive()).min(1).max(500),
  template: z.enum(["nakladnoy_warehouse", "nakladnoy_expeditor"]),
  format: z.enum(["xlsx", "pdf"]).optional(),
  code_column: z.enum(["sku", "barcode"]).optional(),
  separate_sheets: z.boolean().optional(),
  group_by: z.enum(["territory", "agent", "expeditor"]).optional()
});

const bulkExpeditorBodySchema = z.object({
  order_ids: z.array(z.number().int().positive()).min(1).max(500),
  /** null — ekspeditordan yechish */
  expeditor_user_id: z.number().int().positive().nullable()
});

const patchOrderLinesBodySchema = z.object({
  warehouse_id: z.number().int().positive().nullable().optional(),
  agent_id: z.number().int().positive().nullable().optional(),
  payment_method_ref: z.string().trim().max(64).optional().nullable(),
  apply_bonus: z.boolean().optional(),
  bonus_gift_overrides: z
    .array(
      z.object({
        bonus_rule_id: z.number().int().positive(),
        bonus_product_id: z.number().int().positive()
      })
    )
    .optional(),
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
    agent_id: z.number().int().positive().nullable().optional(),
    expeditor_user_id: z.number().int().positive().nullable().optional(),
    comment: z.string().max(4000).optional().nullable(),
    payment_method_ref: z.string().trim().max(64).optional().nullable()
  })
  .refine(
    (b) =>
      b.warehouse_id !== undefined ||
      b.agent_id !== undefined ||
      b.expeditor_user_id !== undefined ||
      b.comment !== undefined ||
      b.payment_method_ref !== undefined,
    {
      message: "At least one of warehouse_id, agent_id, expeditor_user_id, comment, payment_method_ref"
    }
  );

export async function registerOrderRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/orders",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const selected = parseSelectedMastersFromQuery(q);
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      const status = q.status?.trim() || undefined;
      const search = (q.q ?? q.search ?? "").trim() || undefined;
      const clientRaw = q.client_id?.trim();
      let client_id: number | undefined;
      if (clientRaw) {
        const n = Number.parseInt(clientRaw, 10);
        if (!Number.isNaN(n) && n > 0) client_id = n;
      }
      const parseOptId = (raw: string | undefined): number | undefined => {
        if (!raw?.trim()) return undefined;
        const n = Number.parseInt(raw.trim(), 10);
        return !Number.isNaN(n) && n > 0 ? n : undefined;
      };
      const warehouse_id = parseOptId(q.warehouse_id);
      const agent_id = parseOptId(q.agent_id);
      let agent_ids: number[] | undefined;
      const agentIdsRaw = q.agent_ids?.trim();
      if (agentIdsRaw) {
        const parts = agentIdsRaw.split(/[,;\s]+/).map((s) => Number.parseInt(s.trim(), 10));
        const ids = parts.filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length > 0) agent_ids = ids;
      }
      const noAgentRaw = q.no_agent?.trim().toLowerCase();
      const include_no_agent = noAgentRaw === "1" || noAgentRaw === "true" || noAgentRaw === "yes";
      const expeditor_user_id = parseOptId(q.expeditor_id ?? q.expeditor_user_id);
      const product_id = parseOptId(q.product_id);
      const client_category = q.client_category?.trim() || undefined;
      const date_from = q.date_from?.trim() || q.from?.trim() || undefined;
      const date_to = q.date_to?.trim() || q.to?.trim() || undefined;
      const order_type = q.order_type?.trim() || undefined;
      const icRaw = q.is_consignment?.trim().toLowerCase();
      let is_consignment: boolean | undefined;
      if (icRaw === "true" || icRaw === "1" || icRaw === "yes") is_consignment = true;
      else if (icRaw === "false" || icRaw === "0" || icRaw === "no") is_consignment = false;
      const product_category_id = parseOptId(q.product_category_id);
      const payment_type = q.payment_type?.trim() || undefined;
      const payment_method_ref = q.payment_method_ref?.trim() || undefined;
      const date_mode = q.date_mode?.trim() || undefined;
      const viewer = getAccessUser(request);
      const result = await listOrdersPaged(
        request.tenant!.id,
        {
          page: pageNum,
          limit: limitNum,
          status,
          client_id,
          search,
          warehouse_id: warehouse_id ?? (selected.selected_warehouse_id ?? undefined),
          agent_id: agent_ids?.length
            ? undefined
            : agent_id ?? (selected.selected_agent_id ?? undefined),
          agent_ids,
          include_no_agent: include_no_agent || undefined,
          expeditor_user_id: expeditor_user_id ?? (selected.selected_expeditor_user_id ?? undefined),
          client_category,
          product_id,
          date_from,
          date_to,
          date_mode,
          order_type,
          is_consignment,
          product_category_id,
          payment_type,
          payment_method_ref
        },
        viewer.role ?? ""
      );
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/orders/create-context",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const selected = parseSelectedMastersFromQuery(q);
      const bundle = await getOrderCreateContextBundle(request.tenant!.id, selected);
      return reply.send(bundle);
    }
  );

  /** Obmen manbalari: polki qoldiq − avvalgi obmen minuslari (har `order_id`+`product_id`). */
  app.get(
    "/api/:slug/orders/exchange-source-availability",
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
      const raw = q.order_ids?.trim();
      if (!raw) {
        return reply.status(400).send({ error: "OrderIdsRequired" });
      }
      const parsed = raw
        .split(/[, ]+/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const uniq = [...new Set(parsed)];
      if (uniq.length < 1) {
        return reply.status(400).send({ error: "OrderIdsRequired" });
      }
      try {
        const data = await getExchangeSourceAvailability(request.tenant!.id, clientId, uniq);
        return reply.send({ data });
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (code === "BAD_ORDER" || code === "ORDER_NOT_DELIVERED") {
          return reply.status(400).send({
            error: "BadOrder",
            message: "Barcha manba zakazlar yetkazilgan (delivered) bo‘lishi kerak."
          });
        }
        throw e;
      }
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
        if (msg === "ORDER_REQUIRES_AGENT") {
          return reply.status(400).send({ error: "OrderRequiresAgent" });
        }
        if (msg === "ORDER_REQUIRES_WAREHOUSE") {
          return reply.status(400).send({ error: "OrderRequiresWarehouse" });
        }
        if (msg === "ORDER_REQUIRES_PAYMENT_METHOD") {
          return reply.status(400).send({ error: "OrderRequiresPaymentMethod" });
        }
        if (msg === "BAD_EXPEDITOR") return reply.status(400).send({ error: "BadExpeditor" });
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
        if (msg === "ORDER_REQUIRES_AGENT") {
          return reply.status(400).send({ error: "OrderRequiresAgent" });
        }
        if (msg === "ORDER_REQUIRES_WAREHOUSE") {
          return reply.status(400).send({ error: "OrderRequiresWarehouse" });
        }
        if (msg === "ORDER_REQUIRES_PAYMENT_METHOD") {
          return reply.status(400).send({ error: "OrderRequiresPaymentMethod" });
        }
        if (msg === "BAD_PRODUCT") return reply.status(400).send({ error: "BadProduct" });
        if (msg === "BAD_QTY") return reply.status(400).send({ error: "BadQty" });
        if (msg === "DUPLICATE_PRODUCT") return reply.status(400).send({ error: "DuplicateProduct" });
        if (msg === "EMPTY_ITEMS") return reply.status(400).send({ error: "EmptyItems" });
        if (msg === "NO_PRICE") {
          const ex = e as Error & { product_id?: number; price_type?: string };
          return reply.status(400).send({
            error: "NoPrice",
            product_id: ex.product_id,
            price_type: ex.price_type ?? "retail"
          });
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
        if (msg === "BAD_BONUS_GIFT_OVERRIDE") {
          return reply.status(400).send({ error: "BadBonusGiftOverride" });
        }
        if (msg === "INSUFFICIENT_STOCK") {
          const ex = e as Error & { product_id?: number; available?: string; requested?: string };
          return reply.status(400).send({
            error: "InsufficientStock",
            product_id: ex.product_id,
            available: ex.available,
            requested: ex.requested
          });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/orders/bulk/status",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkStatusBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const actor = getAccessUser(request);
      const actorSub = Number.parseInt(actor.sub, 10);
      const actorUserId = Number.isFinite(actorSub) && actorSub > 0 ? actorSub : null;
      const result = await bulkUpdateOrderStatus(
        request.tenant!.id,
        parsed.data.order_ids,
        parsed.data.status,
        actorUserId,
        actor.role
      );
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/orders/bulk/expeditor",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkExpeditorBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const actor = getAccessUser(request);
      const actorSub = Number.parseInt(actor.sub, 10);
      const actorUserId = Number.isFinite(actorSub) && actorSub > 0 ? actorSub : null;
      const result = await bulkUpdateOrderExpeditor(
        request.tenant!.id,
        parsed.data.order_ids,
        parsed.data.expeditor_user_id,
        actorUserId,
        actor.role
      );
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/orders/bulk/nakladnoy",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkNakladnoyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const result = await requestBulkOrderNakladnoy(
          request.tenant!.id,
          parsed.data.order_ids,
          parsed.data.template,
          {
            codeColumn: parsed.data.code_column ?? "sku",
            separateSheets: parsed.data.separate_sheets ?? false,
            groupBy: parsed.data.group_by ?? "agent"
          },
          parsed.data.format ?? "xlsx"
        );
        return reply
          .header(
            "Content-Type",
            result.format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          )
          .header("Content-Disposition", `attachment; filename="${result.filename}"`)
          .send(result.buffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "ORDERS_NOT_FOUND") {
          const ex = e as Error & { missing_ids?: number[] };
          return reply.status(400).send({ error: "OrdersNotFound", missing_ids: ex.missing_ids ?? [] });
        }
        if (msg === "EMPTY_ORDER_IDS") {
          return reply.status(400).send({ error: "EmptyOrderIds" });
        }
        if (msg === "TOO_MANY_ORDERS") {
          return reply.status(400).send({ error: "TooManyOrders" });
        }
        if (msg === "INVALID_NAKLADNOY_TEMPLATE") {
          return reply.status(400).send({ error: "InvalidNakladnoyTemplate" });
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
          const ex = e as Error & { product_id?: number; price_type?: string };
          return reply.status(400).send({
            error: "NoPrice",
            product_id: ex.product_id,
            price_type: ex.price_type ?? "retail"
          });
        }
        if (msg === "INSUFFICIENT_STOCK") {
          const ex = e as Error & { product_id?: number; available?: string; requested?: string };
          return reply.status(400).send({
            error: "InsufficientStock",
            product_id: ex.product_id,
            available: ex.available,
            requested: ex.requested
          });
        }
        if (msg === "BAD_EXPEDITOR") {
          return reply.status(400).send({ error: "BadExpeditor" });
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
        if (msg === "ORDER_REQUIRES_AGENT") {
          return reply.status(400).send({ error: "OrderRequiresAgent" });
        }
        if (msg === "ORDER_REQUIRES_WAREHOUSE") {
          return reply.status(400).send({ error: "OrderRequiresWarehouse" });
        }
        if (msg === "ORDER_REQUIRES_PAYMENT_METHOD") {
          return reply.status(400).send({ error: "OrderRequiresPaymentMethod" });
        }
        if (msg === "CONSIGNMENT_REQUIRES_AGENT") {
          return reply.status(400).send({ error: "ConsignmentRequiresAgent" });
        }
        if (msg === "CONSIGNMENT_AGENT_DISABLED") {
          return reply.status(400).send({ error: "ConsignmentAgentDisabled" });
        }
        if (msg === "CONSIGNMENT_LIMIT_EXCEEDED") {
          const ex = e as Error & {
            consignment_limit?: string;
            outstanding?: string;
            order_total?: string;
          };
          return reply.status(400).send({
            error: "ConsignmentLimitExceeded",
            consignment_limit: ex.consignment_limit,
            outstanding: ex.outstanding,
            order_total: ex.order_total
          });
        }
        if (msg === "BAD_CONSIGNMENT_DUE_DATE") {
          return reply.status(400).send({ error: "BadConsignmentDueDate" });
        }
        if (msg === "BAD_BONUS_GIFT_OVERRIDE") {
          return reply.status(400).send({ error: "BadBonusGiftOverride" });
        }
        if (msg === "EXCHANGE_PAYLOAD_REQUIRED") {
          return reply.status(400).send({ error: "ExchangePayloadRequired" });
        }
        if (msg === "EXCHANGE_REQUIRES_AGENT") {
          return reply.status(400).send({ error: "ExchangeRequiresAgent" });
        }
        if (msg === "EXCHANGE_SOURCE_ORDERS_REQUIRED") {
          return reply.status(400).send({ error: "ExchangeSourceOrdersRequired" });
        }
        if (msg === "EXCHANGE_LINES_REQUIRED") {
          return reply.status(400).send({ error: "ExchangeLinesRequired" });
        }
        if (msg === "EXCHANGE_DUPLICATE_MINUS_LINE") {
          return reply.status(400).send({ error: "ExchangeDuplicateMinusLine" });
        }
        if (msg === "EXCHANGE_DUPLICATE_PLUS_LINE") {
          return reply.status(400).send({ error: "ExchangeDuplicatePlusLine" });
        }
        if (msg === "EXCHANGE_MINUS_ORDER_NOT_IN_SOURCE") {
          return reply.status(400).send({ error: "ExchangeMinusOrderNotInSource" });
        }
        if (msg === "EXCHANGE_MINUS_OVER_LIMIT") {
          const ex = e as Error & { order_id?: number; product_id?: number; max_qty?: string };
          return reply.status(400).send({
            error: "ExchangeMinusOverLimit",
            order_id: ex.order_id,
            product_id: ex.product_id,
            max_qty: ex.max_qty
          });
        }
        if (msg === "EXCHANGE_NO_INTERCHANGEABLE_GROUP") {
          return reply.status(400).send({ error: "ExchangeNoInterchangeableGroup" });
        }
        if (msg === "EXCHANGE_INTERCHANGEABLE_INCOMPLETE") {
          return reply.status(400).send({ error: "ExchangeInterchangeableIncomplete" });
        }
        if (msg === "EXCHANGE_PRICE_TYPE_NOT_IN_GROUP") {
          return reply.status(400).send({ error: "ExchangePriceTypeNotInGroup" });
        }
        if (msg === "EXCHANGE_MINUS_NOT_IN_GROUP") {
          return reply.status(400).send({ error: "ExchangeMinusNotInGroup" });
        }
        if (msg === "EXCHANGE_PLUS_NOT_INTERCHANGEABLE") {
          const ex = e as Error & { product_id?: number };
          return reply.status(400).send({
            error: "ExchangePlusNotInterchangeable",
            product_id: ex.product_id
          });
        }
        if (msg === "EXCHANGE_BAD_SOURCE_LINE") {
          return reply.status(400).send({ error: "ExchangeBadSourceLine" });
        }
        if (msg === "LINKAGE_CLIENT_FORBIDDEN") {
          return reply.status(403).send({ error: "LinkageClientForbidden" });
        }
        if (msg === "LINKAGE_WAREHOUSE_FORBIDDEN") {
          return reply.status(403).send({ error: "LinkageWarehouseForbidden" });
        }
        if (msg === "LINKAGE_PRODUCT_FORBIDDEN") {
          const ex = e as Error & { product_id?: number };
          return reply.status(403).send({
            error: "LinkageProductForbidden",
            product_id: ex.product_id
          });
        }
        throw e;
      }
    }
  );
}
