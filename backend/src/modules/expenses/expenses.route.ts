import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
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
    const data = await listExpenses(request.tenant!.id, {
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
      status: q.status,
      expense_type: q.type,
      agent_id: q.agentId ? parseInt(q.agentId) : undefined,
      warehouse_id: q.warehouseId ? parseInt(q.warehouseId) : undefined,
      from: q.from,
      to: q.to
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
    const jwtUser = getAccessUser(request);
    await deleteExpense(request.tenant!.id, parseInt((request.params as any).id), Number(jwtUser.sub));
    return reply.status(204).send();
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
