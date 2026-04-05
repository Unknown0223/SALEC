import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify } from "../auth/auth.prehandlers";
import {
  enqueueOrder,
  getPendingCount,
  syncDelta,
  syncFull,
  syncOrders,
  registerFcmToken,
  uploadVisitPhoto,
} from "./mobile.service";

export async function registerMobileRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // POST /api/:slug/mobile/sync/full  — full data sync
  // -----------------------------------------------------------------------
  app.post(
    "/api/:slug/mobile/sync/full",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      const userId = Number(getAccessUser(request).sub);
      if (!ensureTenantContext(request, reply)) return;
      const body = request.body as any;
      const lastSyncAt = body?.last_sync_at ? new Date(body.last_sync_at) : null;

      const result = await syncFull(request.tenant!.id, userId, lastSyncAt);
      return reply.send(result);
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/:slug/mobile/sync/delta  — delta sync for single entity
  // -----------------------------------------------------------------------
  app.post(
    "/api/:slug/mobile/sync/delta",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      const userId = Number(getAccessUser(request).sub);
      if (!ensureTenantContext(request, reply)) return;
      const body = request.body as any;
      const lastSyncAt = body?.last_sync_at ? new Date(body.last_sync_at) : null;
      const entityType = body?.entity_type as
        | "clients"
        | "products"
        | "prices"
        | "orders"
        | undefined;

      const result = await syncDelta(request.tenant!.id, userId, lastSyncAt, entityType);
      return reply.send(result);
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/:slug/mobile/orders/enqueue  — queue an offline order
  // -----------------------------------------------------------------------
  app.post(
    "/api/:slug/mobile/orders/enqueue",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      const body = request.body as any;

      const items = body?.items as Array<{ product_id: number; qty: number; price?: number }>;
      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ error: "EmptyItems" });
      }

      if (!ensureTenantContext(request, reply)) return;
      const userId = Number(getAccessUser(request).sub);

      const offlineCreated = body?.offline_created_at
        ? new Date(body.offline_created_at)
        : new Date();

      const result = await enqueueOrder(
        request.tenant!.id,
        userId,
        body?.client_local_id ?? body?.client_id,
        items,
        offlineCreated,
      );
      return reply.status(201).send(result);
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/:slug/mobile/orders/pending  — count pending offline orders
  // -----------------------------------------------------------------------
  app.get(
    "/api/:slug/mobile/orders/pending",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const userId = Number(getAccessUser(request).sub);
      const result = await getPendingCount(request.tenant!.id, userId);
      return reply.send(result);
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/:slug/mobile/fcm/register  — register FCM device token
  // -----------------------------------------------------------------------
  app.post(
    "/api/:slug/mobile/fcm/register",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const body = request.body as any;
      const userId = Number(getAccessUser(request).sub);

      const token = body?.token as string;
      const deviceType = (body?.device_type as "android" | "ios" | "web") ?? "android";

      if (!token) {
        return reply.status(400).send({ error: "MissingToken" });
      }

      const result = await registerFcmToken(request.tenant!.id, userId, token, deviceType);
      return reply.send(result);
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/:slug/mobile/visits/:id/photo  — upload photo to a visit
  // -----------------------------------------------------------------------
  app.post(
    "/api/:slug/mobile/visits/:id/photo",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;

      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidVisitId" });
      }

      const body = request.body as any;
      const photoUrl = body?.photo_url as string;
      if (!photoUrl) {
        return reply.status(400).send({ error: "MissingPhotoUrl" });
      }

      try {
        const result = await uploadVisitPhoto(
          request.tenant!.id,
          id,
          photoUrl,
          body?.notes as string | undefined,
        );
        return reply.send(result);
      } catch (e) {
        if (e instanceof Error && e.message === "VisitNotFound") {
          return reply.status(404).send({ error: "VisitNotFound" });
        }
        throw e;
      }
    },
  );
}
