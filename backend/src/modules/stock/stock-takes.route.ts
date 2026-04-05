import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { DIRECTORY_READ_ROLES, getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  cancelStockTake,
  createStockTake,
  getStockTake,
  listStockTakes,
  postStockTake,
  setStockTakeLines
} from "./stock-takes.service";

const writeRoles = ["admin", "operator"] as const;

const lineSchema = z.object({
  product_id: z.number().int().positive(),
  counted_qty: z.number().finite().nullable()
});

export async function registerStockTakeRoutes(app: FastifyInstance) {
  app.get("/api/:slug/stock-takes", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const q = z
      .object({
        warehouse_id: z.coerce.number().int().positive().optional(),
        status: z.string().max(32).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .parse(request.query);
    const result = await listStockTakes(tenantId, {
      warehouse_id: q.warehouse_id,
      status: q.status,
      page: q.page ?? 1,
      limit: q.limit ?? 20
    });
    return reply.send(result);
  });

  app.get("/api/:slug/stock-takes/:id", {
    preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const row = await getStockTake(tenantId, id);
    if (!row) return reply.status(404).send({ error: "NotFound" });
    return reply.send({ data: row });
  });

  app.post("/api/:slug/stock-takes", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = z
      .object({
        warehouse_id: z.number().int().positive(),
        title: z.string().max(500).nullable().optional(),
        notes: z.string().max(5000).nullable().optional()
      })
      .parse(request.body);
    const viewer = getAccessUser(request);
    const uid = Number.parseInt(viewer.sub, 10);
    try {
      const row = await createStockTake(
        tenantId,
        Number.isFinite(uid) && uid > 0 ? uid : undefined,
        body
      );
      return reply.status(201).send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "WarehouseNotFound") return reply.status(400).send({ error: "WarehouseNotFound" });
      throw e;
    }
  });

  app.put("/api/:slug/stock-takes/:id/lines", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = z.object({ lines: z.array(lineSchema) }).parse(request.body);
    try {
      const row = await setStockTakeLines(tenantId, id, body.lines);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NotDraft") return reply.status(409).send({ error: "NotDraft" });
      if (msg === "ProductNotFound") return reply.status(400).send({ error: "ProductNotFound" });
      throw e;
    }
  });

  app.post("/api/:slug/stock-takes/:id/post", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    try {
      const row = await postStockTake(tenantId, id);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NotDraft") return reply.status(409).send({ error: "NotDraft" });
      if (msg === "NoLines") return reply.status(400).send({ error: "NoLines" });
      if (msg === "IncompleteLines") return reply.status(400).send({ error: "IncompleteLines" });
      throw e;
    }
  });

  app.post("/api/:slug/stock-takes/:id/cancel", {
    preHandler: [jwtAccessVerify, requireRoles(...writeRoles)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    try {
      const row = await cancelStockTake(tenantId, id);
      if (!row) return reply.status(404).send({ error: "NotFound" });
      return reply.send({ data: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NotDraft") return reply.status(409).send({ error: "NotDraft" });
      throw e;
    }
  });
}
