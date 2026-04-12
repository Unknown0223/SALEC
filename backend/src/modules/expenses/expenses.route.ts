import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  restoreExpense,
  approveExpense,
  rejectExpense,
  getExpense,
  getExpenseSummary,
  getPnlReport
} from "./expenses.service";

export async function registerExpenseRoutes(app: FastifyInstance) {
  const preHandler = [jwtAccessVerify];

  app.get("/api/:slug/expenses", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const archiveRaw = q.archive?.trim().toLowerCase();
    const archive = archiveRaw === "true" || archiveRaw === "1" || archiveRaw === "yes";
    const data = await listExpenses(request.tenant!.id, {
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
      status: q.status,
      expense_type: q.type,
      agent_id: q.agentId ? parseInt(q.agentId) : undefined,
      warehouse_id: q.warehouseId ? parseInt(q.warehouseId) : undefined,
      from: q.from,
      to: q.to,
      archive
    });
    return reply.send(data);
  });

  app.get("/api/:slug/expenses/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await getExpense(request.tenant!.id, parseInt((request.params as any).id));
    return reply.send(data);
  });

  app.post("/api/:slug/expenses", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const jwtUser = getAccessUser(request);
    const data = await createExpense(request.tenant!.id, request.body as any, Number(jwtUser.sub));
    return reply.status(201).send(data);
  });

  app.patch("/api/:slug/expenses/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const jwtUser = getAccessUser(request);
    const data = await updateExpense(request.tenant!.id, parseInt((request.params as any).id), request.body as any, Number(jwtUser.sub));
    return reply.send(data);
  });

  app.delete("/api/:slug/expenses/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(id)) {
      return reply.status(400).send({ error: "InvalidId" });
    }
    const q = z
      .object({ delete_reason_ref: z.string().max(128).optional() })
      .parse((request.query as Record<string, unknown>) ?? {});
    try {
      await deleteExpense(
        request.tenant!.id,
        id,
        actorUserIdOrNull(request),
        q.delete_reason_ref?.trim() || null
      );
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
      if (msg === "ALREADY_VOIDED") return reply.status(409).send({ error: "AlreadyVoided" });
      if (msg === "CANNOT_DELETE_NON_DRAFT") return reply.status(409).send({ error: "CannotDeleteNonDraft" });
      throw e;
    }
  });

  app.post("/api/:slug/expenses/:id/restore", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(id) || id < 1) {
      return reply.status(400).send({ error: "InvalidId" });
    }
    try {
      await restoreExpense(request.tenant!.id, id, actorUserIdOrNull(request));
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
      if (msg === "NOT_VOIDED") return reply.status(409).send({ error: "NotVoided" });
      if (msg === "CANNOT_RESTORE_NON_DRAFT") return reply.status(409).send({ error: "CannotRestoreNonDraft" });
      throw e;
    }
  });

  app.post("/api/:slug/expenses/:id/approve", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const jwtUser = getAccessUser(request);
    const data = await approveExpense(request.tenant!.id, parseInt((request.params as any).id), Number(jwtUser.sub));
    return reply.send(data);
  });

  app.post("/api/:slug/expenses/:id/reject", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const jwtUser = getAccessUser(request);
    const body = request.body as { note?: string } | undefined;
    const data = await rejectExpense(
      request.tenant!.id,
      parseInt((request.params as any).id),
      Number(jwtUser.sub),
      body?.note ?? ""
    );
    return reply.send(data);
  });

  app.get("/api/:slug/expenses/summary", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const data = await getExpenseSummary(request.tenant!.id, q.from, q.to);
    return reply.send(data);
  });

  app.get("/api/:slug/expenses/pnl", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const data = await getPnlReport(request.tenant!.id, q.from, q.to);
    return reply.send(data);
  });
}
