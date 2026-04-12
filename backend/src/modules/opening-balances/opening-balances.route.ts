import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createOpeningBalance,
  deleteOpeningBalance,
  listOpeningBalances,
  restoreOpeningBalance,
  type OpeningBalanceListQuery
} from "./opening-balances.service";

const catalogRoles = ["admin", "operator"] as const;

const createBody = z.object({
  client_id: z.number().int().positive(),
  balance_type: z.enum(["debt", "surplus"]),
  amount: z.number().positive(),
  payment_type: z.string().min(1).max(64),
  cash_desk_id: z.number().int().positive().nullable().optional(),
  trade_direction: z.string().max(128).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  paid_at: z.string().max(40).optional().nullable()
});

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

function parseClientIds(raw: string | undefined): number[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const ids = raw
    .split(/[,]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

function parseCashDeskIds(raw: string | undefined): number[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const ids = raw
    .split(/[,]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

function parseListQuery(q: Record<string, string | undefined>): OpeningBalanceListQuery {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));

  const client_ids = parseClientIds(q.client_ids);
  const agent_id = parseOptPositiveInt(q.agent_id);
  const cash_desk_ids = parseCashDeskIds(q.cash_desk_ids);
  const amount_min = parseOptAmount(q.amount_min);
  const amount_max = parseOptAmount(q.amount_max);

  const payment_type = q.payment_type?.trim() || undefined;
  const trade_direction = q.trade_direction?.trim() || undefined;
  const search = q.search?.trim() || undefined;
  const date_from = q.date_from?.trim() || undefined;
  const date_to = q.date_to?.trim() || undefined;

  const df = q.date_field?.trim();
  let date_field: OpeningBalanceListQuery["date_field"];
  if (df === "paid_at" || df === "created_at") date_field = df;

  const bt = q.balance_type?.trim();
  let balance_type: OpeningBalanceListQuery["balance_type"];
  if (bt === "debt" || bt === "surplus") balance_type = bt;

  const archiveRaw = q.archive?.trim().toLowerCase();
  const archive = archiveRaw === "true" || archiveRaw === "1" || archiveRaw === "yes";

  return {
    page,
    limit,
    ...(archive ? { archive: true } : {}),
    ...(date_from ? { date_from } : {}),
    ...(date_to ? { date_to } : {}),
    ...(date_field ? { date_field } : {}),
    ...(client_ids ? { client_ids } : {}),
    ...(payment_type && payment_type !== "__all__" ? { payment_type } : {}),
    ...(trade_direction && trade_direction !== "__all__" ? { trade_direction } : {}),
    ...(agent_id !== undefined ? { agent_id } : {}),
    ...(cash_desk_ids ? { cash_desk_ids } : {}),
    ...(balance_type ? { balance_type } : {}),
    ...(amount_min !== undefined ? { amount_min } : {}),
    ...(amount_max !== undefined ? { amount_max } : {}),
    ...(search ? { search } : {})
  };
}

export async function registerOpeningBalanceRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/opening-balances",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const result = await listOpeningBalances(request.tenant!.id, parseListQuery(q));
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/opening-balances",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createOpeningBalance(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "BAD_CLIENT") return reply.status(400).send({ error: "BadClient" });
        if (msg === "BAD_AMOUNT") return reply.status(400).send({ error: "BadAmount" });
        if (msg === "BAD_PAYMENT_TYPE") return reply.status(400).send({ error: "BadPaymentType" });
        if (msg === "BAD_BALANCE_TYPE") return reply.status(400).send({ error: "BadBalanceType" });
        if (msg === "BAD_CASH_DESK") return reply.status(400).send({ error: "BadCashDesk" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/opening-balances/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const dq = z
        .object({ delete_reason_ref: z.string().max(128).optional() })
        .parse((request.query as Record<string, unknown>) ?? {});
      try {
        await deleteOpeningBalance(
          request.tenant!.id,
          id,
          actorUserIdOrNull(request),
          dq.delete_reason_ref?.trim() || null
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
    "/api/:slug/opening-balances/:id/restore",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const row = await restoreOpeningBalance(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "NOT_VOIDED") return reply.status(409).send({ error: "NotVoided" });
        throw e;
      }
    }
  );
}
