import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { prisma } from "../../config/database";
import { createNotification, listNotifications, markAllRead, markNotificationRead } from "./notifications.service";

const adminWrite = ["admin", "operator"] as const;

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/:slug/notifications", {
    preHandler: [jwtAccessVerify, requireRoles("admin", "operator", "supervisor", "agent", "expeditor")]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const viewer = getAccessUser(request);
    const userId = Number.parseInt(viewer.sub, 10);
    if (!Number.isFinite(userId) || userId < 1) return reply.status(400).send({ error: "BadUser" });
    const q = z
      .object({
        unread_only: z.enum(["true", "false"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .parse(request.query);
    const result = await listNotifications(tenantId, userId, {
      unread_only: q.unread_only === "true",
      limit: q.limit ?? 40
    });
    return reply.send(result);
  });

  app.patch("/api/:slug/notifications/:id/read", {
    preHandler: [jwtAccessVerify, requireRoles("admin", "operator", "supervisor", "agent", "expeditor")]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const viewer = getAccessUser(request);
    const userId = Number.parseInt(viewer.sub, 10);
    if (!Number.isFinite(userId) || userId < 1) return reply.status(400).send({ error: "BadUser" });
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const row = await markNotificationRead(tenantId, userId, id);
    if (!row) return reply.status(404).send({ error: "NotFound" });
    return reply.send(row);
  });

  app.post("/api/:slug/notifications/read-all", {
    preHandler: [jwtAccessVerify, requireRoles("admin", "operator", "supervisor", "agent", "expeditor")]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const viewer = getAccessUser(request);
    const userId = Number.parseInt(viewer.sub, 10);
    if (!Number.isFinite(userId) || userId < 1) return reply.status(400).send({ error: "BadUser" });
    return reply.send(await markAllRead(tenantId, userId));
  });

  app.post("/api/:slug/notifications", {
    preHandler: [jwtAccessVerify, requireRoles(...adminWrite)]
  }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const tenantId = request.tenant!.id;
    const body = z
      .object({
        user_id: z.number().int().positive(),
        title: z.string().min(1).max(500),
        body: z.string().max(4000).nullable().optional(),
        link_href: z.string().max(512).nullable().optional()
      })
      .parse(request.body);
    const target = await prisma.user.findFirst({
      where: { id: body.user_id, tenant_id: tenantId },
      select: { id: true }
    });
    if (!target) return reply.status(400).send({ error: "UserNotFound" });
    const u = await createNotification({
      tenant_id: tenantId,
      user_id: body.user_id,
      title: body.title,
      body: body.body,
      link_href: body.link_href
    });
    return reply.status(201).send({ data: { id: u.id } });
  });
}
