import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  createTransfer,
  getTransfers,
  getTransferById,
  getTransferPdfById,
  updateTransfer,
  startTransfer,
  receiveTransfer,
  cancelTransfer
} from "./warehouse-transfers.service";

function replyWarehouseTransferError(reply: FastifyReply, e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "EMPTY_LINES") {
    void reply.status(400).send({ error: "EmptyLines" });
    return true;
  }
  if (msg === "BAD_QTY") {
    void reply.status(400).send({ error: "BadQty" });
    return true;
  }
  if (msg === "BAD_PRODUCT") {
    void reply.status(400).send({ error: "BadProduct" });
    return true;
  }
  if (msg === "NOT_DRAFT") {
    void reply.status(400).send({ error: "NotDraft" });
    return true;
  }
  if (msg === "NOT_IN_TRANSIT") {
    void reply.status(400).send({ error: "NotInTransit" });
    return true;
  }
  if (msg === "NOT_FOUND") {
    void reply.status(404).send({ error: "NotFound" });
    return true;
  }
  if (msg === "SAME_WAREHOUSE" || msg === "BAD_WAREHOUSE") {
    void reply.status(400).send({ error: msg === "SAME_WAREHOUSE" ? "SameWarehouse" : "BadWarehouse" });
    return true;
  }
  if (msg.startsWith("INSUFFICIENT_STOCK:")) {
    void reply.status(400).send({ error: "InsufficientStock", detail: msg });
    return true;
  }
  if (msg === "STOCK_NOT_FOUND") {
    void reply.status(409).send({ error: "StockNotFound" });
    return true;
  }
  return false;
}

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

  app.get("/api/:slug/transfers/:id/pdf", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    try {
      const data = await getTransferPdfById(request.tenant!.id, parseInt(id));
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${data.filename}"`)
        .send(data.buffer);
    } catch (e) {
      if (replyWarehouseTransferError(reply, e)) return;
      throw e;
    }
  });

  app.post("/api/:slug/transfers", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as any;
    try {
      const data = await createTransfer(request.tenant!.id, body);
      return reply.status(201).send(data);
    } catch (e) {
      if (replyWarehouseTransferError(reply, e)) return;
      throw e;
    }
  });

  app.patch("/api/:slug/transfers/:id", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    const body = request.body as any;
    try {
      const data = await updateTransfer(request.tenant!.id, parseInt(id), body);
      return reply.send(data);
    } catch (e) {
      if (replyWarehouseTransferError(reply, e)) return;
      throw e;
    }
  });

  app.post("/api/:slug/transfers/:id/start", { preHandler }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { id } = (request.params as Record<string, string>);
    try {
      await startTransfer(request.tenant!.id, parseInt(id));
      return reply.send({ ok: true });
    } catch (e) {
      if (replyWarehouseTransferError(reply, e)) return;
      throw e;
    }
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
