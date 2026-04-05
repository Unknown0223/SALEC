import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  createTransfer,
  getTransfers,
  getTransferById,
  updateTransfer,
  startTransfer,
  receiveTransfer,
  cancelTransfer
} from "./warehouse-transfers.service";

export async function registerWarehouseTransferRoutes(app: FastifyInstance) {
  const preHandler = [jwtAccessVerify];

  app.get("/api/:slug/transfers", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const data = await getTransfers(request.tenant!.id, {
      status: q.status,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
      source_warehouse_id: q.sourceWarehouseId ? parseInt(q.sourceWarehouseId) : undefined,
      destination_warehouse_id: q.destinationWarehouseId ? parseInt(q.destinationWarehouseId) : undefined,
    });
    return reply.send(data);
  });

  app.get("/api/:slug/transfers/:id", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const data = await getTransferById(request.tenant!.id, parseInt(id));
    return reply.send(data);
  });

  app.post("/api/:slug/transfers", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as any;
    const data = await createTransfer(request.tenant!.id, body);
    return reply.status(201).send(data);
  });

  app.patch("/api/:slug/transfers/:id", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const body = request.body as any;
    const data = await updateTransfer(request.tenant!.id, parseInt(id), body);
    return reply.send(data);
  });

  app.post("/api/:slug/transfers/:id/start", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const data = await startTransfer(request.tenant!.id, parseInt(id));
    return reply.send(data);
  });

  app.post("/api/:slug/transfers/:id/receive", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const body = request.body as any;
    const jwtUser = getAccessUser(request);
    const data = await receiveTransfer(request.tenant!.id, parseInt(id), Number(jwtUser.sub), body.adjustments || []);
    return reply.send(data);
  });

  app.post("/api/:slug/transfers/:id/cancel", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const data = await cancelTransfer(request.tenant!.id, parseInt(id));
    return reply.send(data);
  });
}
