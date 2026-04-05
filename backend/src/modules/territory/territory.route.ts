import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  listTerritories,
  getTerritory,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  assignUser,
  unassignUser,
  validateCheckin,
  getTerritoryStats
} from "./territory.service";

export async function registerTerritoryRoutes(app: FastifyInstance) {
  const preHandler = [jwtAccessVerify];

  app.get("/api/:slug/territories", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const data = await listTerritories(request.tenant!.id, {
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 50,
      user_id: q.userId ? parseInt(q.userId) : undefined
    });
    return reply.send(data);
  });

  app.get("/api/:slug/territories/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await getTerritory(request.tenant!.id, parseInt((request.params as any).id));
    return reply.send(data);
  });

  app.post("/api/:slug/territories", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await createTerritory(request.tenant!.id, request.body as any);
    return reply.status(201).send(data);
  });

  app.patch("/api/:slug/territories/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const data = await updateTerritory(request.tenant!.id, parseInt((request.params as any).id), request.body as any);
    return reply.send(data);
  });

  app.delete("/api/:slug/territories/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    await deleteTerritory(request.tenant!.id, parseInt((request.params as any).id));
    return reply.status(204).send();
  });

  app.post("/api/:slug/territories/:id/assign", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as { userId: number; role?: string };
    const data = await assignUser(request.tenant!.id, parseInt((request.params as any).id), body.userId, body.role);
    return reply.send(data);
  });

  app.post("/api/:slug/territories/:id/unassign", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as { userId: number };
    await unassignUser(request.tenant!.id, parseInt((request.params as any).id), body.userId);
    return reply.status(204).send();
  });

  app.post("/api/:slug/territories/:id/validate-checkin", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as { lat: number; lng: number };
    const data = await validateCheckin(request.tenant!.id, parseInt((request.params as any).id), body.lat, body.lng);
    return reply.send(data);
  });

  app.get("/api/:slug/territories/stats", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const data = await getTerritoryStats(request.tenant!.id, q.from, q.to);
    return reply.send(data);
  });
}
