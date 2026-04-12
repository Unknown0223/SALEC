import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { jwtAccessVerify, getAccessUser } from "../auth/auth.prehandlers";
import {
  listTerritories,
  getTerritory,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  restoreTerritory,
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
    const archiveRaw = q.archive?.trim().toLowerCase();
    const archive = archiveRaw === "true" || archiveRaw === "1" || archiveRaw === "yes";
    const data = await listTerritories(request.tenant!.id, {
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 50,
      q: q.q?.trim() || undefined,
      is_active: q.is_active === "true" ? true : q.is_active === "false" ? false : undefined,
      archive
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
    try {
      const data = await updateTerritory(
        request.tenant!.id,
        parseInt((request.params as any).id),
        request.body as any
      );
      if (!data) return reply.status(404).send({ error: "NotFound" });
      return reply.send(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "VOIDED") return reply.status(409).send({ error: "Voided" });
      if (msg === "CodeTaken") return reply.status(409).send({ error: "CodeTaken" });
      throw e;
    }
  });

  app.delete("/api/:slug/territories/:id", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(id) || id < 1) {
      return reply.status(400).send({ error: "InvalidId" });
    }
    try {
      await deleteTerritory(request.tenant!.id, id, actorUserIdOrNull(request));
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
      if (msg === "ALREADY_VOIDED") return reply.status(409).send({ error: "AlreadyVoided" });
      throw e;
    }
  });

  app.post("/api/:slug/territories/:id/restore", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(id) || id < 1) {
      return reply.status(400).send({ error: "InvalidId" });
    }
    try {
      await restoreTerritory(request.tenant!.id, id);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
      if (msg === "NOT_VOIDED") return reply.status(409).send({ error: "NotVoided" });
      throw e;
    }
  });

  app.post("/api/:slug/territories/:id/assign", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as { userId: number };
    const jwtUser = getAccessUser(request);
    const data = await assignUser(
      request.tenant!.id,
      parseInt((request.params as any).id),
      body.userId,
      Number(jwtUser.sub)
    );
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
    const data = await getTerritoryStats(request.tenant!.id, { from: q.from, to: q.to });
    return reply.send(data);
  });
}
