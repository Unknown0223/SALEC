import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/database";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { createPayment, deletePayment, listPayments, listPaymentsForClient, listPaymentsForOrder } from "./payments.service";
import { allocatePayment, getPaymentAllocations } from "./payment-allocations.service";

const catalogRoles = ["admin", "operator"] as const;

const createBody = z.object({
  client_id: z.number().int().positive(),
  order_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive(),
  payment_type: z.string().min(1).max(64),
  note: z.string().max(2000).optional().nullable()
});

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/payments",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      const client_id = q.client_id ? Number.parseInt(q.client_id, 10) : undefined;
      const order_id = q.order_id ? Number.parseInt(q.order_id, 10) : undefined;
      const result = await listPayments(request.tenant!.id, {
        page,
        limit,
        client_id: client_id != null && client_id > 0 ? client_id : undefined,
        order_id: order_id != null && order_id > 0 ? order_id : undefined
      });
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
      try {
        await deletePayment(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );
}
