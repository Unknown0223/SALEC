import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/database";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { parseSelectedMastersFromQuery, resolveConstraintScope } from "../linkage/linkage.service";
import {
  createPayment,
  deletePayment,
  getPaymentDetail,
  listPayments,
  listPaymentsForClient,
  listPaymentsForOrder,
  restorePayment,
  updatePayment,
  type PaymentListQuery
} from "./payments.service";
import { allocatePayment, getPaymentAllocations } from "./payment-allocations.service";

const catalogRoles = ["admin", "operator"] as const;

const createBody = z.object({
  client_id: z.number().int().positive(),
  order_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive(),
  payment_type: z.string().min(1).max(64),
  note: z.string().max(2000).optional().nullable(),
  cash_desk_id: z.number().int().positive().nullable().optional(),
  paid_at: z.string().max(40).optional().nullable(),
  entry_kind: z.enum(["payment", "client_expense"]).optional(),
  expeditor_user_id: z.number().int().positive().nullable().optional(),
  ledger_agent_id: z.number().int().positive().nullable().optional()
});

const patchPaymentBodySchema = z
  .object({
    amount: z.number().positive().optional(),
    payment_type: z.string().min(1).max(64).optional(),
    note: z.string().max(2000).optional().nullable(),
    cash_desk_id: z.number().int().positive().nullable().optional(),
    paid_at: z.string().max(48).optional().nullable(),
    order_id: z.number().int().positive().nullable().optional(),
    expeditor_user_id: z.number().int().positive().nullable().optional(),
    ledger_agent_id: z.number().int().positive().nullable().optional()
  })
  .refine(
    (b) =>
      b.amount !== undefined ||
      b.payment_type !== undefined ||
      b.note !== undefined ||
      b.cash_desk_id !== undefined ||
      b.paid_at !== undefined ||
      b.order_id !== undefined ||
      b.expeditor_user_id !== undefined ||
      b.ledger_agent_id !== undefined,
    { message: "empty" }
  );

function parseOptPositiveInt(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseOptAmount(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number.parseFloat(raw.trim().replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parseCashDeskIds(raw: string | undefined): number[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const ids = raw
    .split(/[,]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

function parsePaymentListQuery(q: Record<string, string | undefined>): PaymentListQuery {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));

  const client_id = parseOptPositiveInt(q.client_id);
  const order_id = parseOptPositiveInt(q.order_id);
  const agent_id = parseOptPositiveInt(q.agent_id);
  const expeditor_user_id = parseOptPositiveInt(q.expeditor_user_id);

  const date_from = q.date_from?.trim() || undefined;
  const date_to = q.date_to?.trim() || undefined;
  const search = q.search?.trim() || undefined;

  const amount_min = parseOptAmount(q.amount_min);
  const amount_max = parseOptAmount(q.amount_max);

  const payment_typeRaw = q.payment_type?.trim();
  const payment_type =
    payment_typeRaw && payment_typeRaw !== "" && payment_typeRaw !== "__all__" ? payment_typeRaw : undefined;

  const trade_directionRaw = q.trade_direction?.trim();
  const trade_direction =
    trade_directionRaw && trade_directionRaw !== "" && trade_directionRaw !== "__all__"
      ? trade_directionRaw
      : undefined;

  const territory_region = q.territory_region?.trim() || undefined;
  const territory_city = q.territory_city?.trim() || undefined;
  const territory_district = q.territory_district?.trim() || undefined;
  const territory_zone = q.territory_zone?.trim() || undefined;
  const territory_neighborhood = q.territory_neighborhood?.trim() || undefined;

  const dt = q.deal_type?.trim();
  let deal_type: PaymentListQuery["deal_type"] | undefined;
  if (dt === "regular" || dt === "consignment" || dt === "both") {
    deal_type = dt;
  }

  const ps = q.payment_status?.trim();
  let payment_status: PaymentListQuery["payment_status"] | undefined;
  if (ps === "pending_confirmation" || ps === "confirmed" || ps === "deleted") {
    payment_status = ps;
  }

  const cash_desk_ids = parseCashDeskIds(q.cash_desk_ids);

  const ekRaw = q.entry_kind?.trim();
  let entry_kind: PaymentListQuery["entry_kind"] | undefined;
  if (ekRaw === "client_expense" || ekRaw === "payment") {
    entry_kind = ekRaw;
  }

  const dfRaw = q.date_field?.trim();
  let date_field: PaymentListQuery["date_field"] | undefined;
  if (dfRaw === "created_at" || dfRaw === "paid_at" || dfRaw === "confirmed_at") {
    date_field = dfRaw;
  }

  return {
    page,
    limit,
    ...(client_id !== undefined ? { client_id } : {}),
    ...(order_id !== undefined ? { order_id } : {}),
    ...(date_from ? { date_from } : {}),
    ...(date_to ? { date_to } : {}),
    ...(search ? { search } : {}),
    ...(amount_min !== undefined ? { amount_min } : {}),
    ...(amount_max !== undefined ? { amount_max } : {}),
    ...(agent_id !== undefined ? { agent_id } : {}),
    ...(expeditor_user_id !== undefined ? { expeditor_user_id } : {}),
    ...(payment_type ? { payment_type } : {}),
    ...(trade_direction ? { trade_direction } : {}),
    ...(territory_region ? { territory_region } : {}),
    ...(territory_city ? { territory_city } : {}),
    ...(territory_district ? { territory_district } : {}),
    ...(territory_zone ? { territory_zone } : {}),
    ...(territory_neighborhood ? { territory_neighborhood } : {}),
    ...(deal_type !== undefined && deal_type !== "both" ? { deal_type } : {}),
    ...(payment_status !== undefined ? { payment_status } : {}),
    ...(cash_desk_ids !== undefined ? { cash_desk_ids } : {}),
    ...(entry_kind !== undefined ? { entry_kind } : {}),
    ...(date_field !== undefined ? { date_field } : {})
  };
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/payments",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const selected = parseSelectedMastersFromQuery(q);
      const scope = await resolveConstraintScope(request.tenant!.id, selected);
      const query = parsePaymentListQuery(q);
      if (scope.constrained) {
        query.client_ids = scope.client_ids;
        query.cash_desk_ids = scope.cash_desk_ids;
        query.expeditor_user_ids = scope.expeditor_ids;
        query.warehouse_ids = scope.warehouse_ids;
      }
      const result = await listPayments(request.tenant!.id, query);
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/orders/:id/payments",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const data = await listPaymentsForOrder(request.tenant!.id, id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/clients/:id/payments",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const data = await listPaymentsForClient(request.tenant!.id, id, 100);
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/payments",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createPayment(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (msg === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (msg === "BAD_AMOUNT") return reply.status(400).send({ error: "BadAmount" });
        if (msg === "BAD_PAYMENT_TYPE") return reply.status(400).send({ error: "BadPaymentType" });
        if (msg === "BAD_CASH_DESK") return reply.status(400).send({ error: "BadCashDesk" });
        if (msg === "BAD_EXPEDITOR") return reply.status(400).send({ error: "BadExpeditor" });
        if (msg === "BAD_LEDGER_AGENT") return reply.status(400).send({ error: "BadLedgerAgent" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/payments/:id/allocations",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenantId = request.tenant!.id;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const one = await prisma.payment.findFirst({ where: { id, tenant_id: tenantId }, select: { id: true } });
      if (!one) return reply.status(404).send({ error: "NotFound" });
      const data = await getPaymentAllocations(tenantId, id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/payments/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenantId = request.tenant!.id;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const payload = await getPaymentDetail(tenantId, id);
      if (!payload) return reply.status(404).send({ error: "NotFound" });
      return reply.send(payload);
    }
  );

  app.patch(
    "/api/:slug/payments/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenantId = request.tenant!.id;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchPaymentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const payload = await updatePayment(tenantId, id, parsed.data, actorUserIdOrNull(request));
        return reply.send(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "PAYMENT_VOIDED") return reply.status(409).send({ error: "PaymentVoided" });
        if (msg === "EMPTY_PATCH") return reply.status(400).send({ error: "ValidationError" });
        if (msg === "BAD_AMOUNT") return reply.status(400).send({ error: "BadAmount" });
        if (msg === "BAD_PAYMENT_TYPE") return reply.status(400).send({ error: "BadPaymentType" });
        if (msg === "BAD_CASH_DESK") return reply.status(400).send({ error: "BadCashDesk" });
        if (msg === "BAD_PAID_AT") return reply.status(400).send({ error: "BadPaidAt" });
        if (msg === "BAD_ORDER") return reply.status(400).send({ error: "BadOrder" });
        if (msg === "BAD_EXPEDITOR") return reply.status(400).send({ error: "BadExpeditor" });
        if (msg === "BAD_EXPEDITOR_SCOPE") return reply.status(400).send({ error: "BadExpeditorScope" });
        if (msg === "BAD_LEDGER_AGENT") return reply.status(400).send({ error: "BadLedgerAgent" });
        if (msg === "AMOUNT_BELOW_ALLOCATED") {
          return reply.status(400).send({ error: "AmountBelowAllocated" });
        }
        if (msg === "ORDER_LOCKED_BY_ALLOCATIONS") {
          return reply.status(400).send({ error: "OrderLockedByAllocations" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/payments/:id/allocate",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenantId = request.tenant!.id;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const viewer = getAccessUser(request);
      const uid = Number.parseInt(viewer.sub, 10);
      try {
        const data = await allocatePayment(
          tenantId,
          id,
          Number.isFinite(uid) && uid > 0 ? uid : null
        );
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "PAYMENT_NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "PAYMENT_VOIDED") return reply.status(409).send({ error: "PaymentVoided" });
        if (msg === "TENANT_NOT_FOUND") return reply.status(404).send({ error: "TenantNotFound" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/payments/:id",
    { preHandler: [jwtAccessVerify, requireRoles("admin")] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = z
        .object({ cancel_reason_ref: z.string().max(128).optional() })
        .parse((request.query as Record<string, unknown>) ?? {});
      try {
        await deletePayment(
          request.tenant!.id,
          id,
          actorUserIdOrNull(request),
          q.cancel_reason_ref?.trim() || null
        );
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "ALREADY_VOIDED") return reply.status(409).send({ error: "AlreadyVoided" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/payments/:id/restore",
    { preHandler: [jwtAccessVerify, requireRoles("admin")] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await restorePayment(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "NOT_VOIDED") return reply.status(409).send({ error: "NotVoided" });
        throw e;
      }
    }
  );
}
