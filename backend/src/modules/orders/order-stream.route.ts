import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import type { AccessJwtUser } from "../auth/auth.prehandlers";
import { subscribeOrderEvents, type OrderStreamPayload } from "../../lib/order-event-bus";

async function verifyAccessFromQueryOrHeader(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const q = request.query as { access_token?: string };
  const token = q.access_token?.trim();
  if (token) {
    try {
      const decoded = await request.server.jwt.verify<AccessJwtUser>(token);
      request.user = decoded;
      return true;
    } catch {
      await reply.status(401).send({ error: "Unauthorized" });
      return false;
    }
  }
  try {
    await request.jwtVerify<AccessJwtUser>();
    return true;
  } catch {
    await reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
}

/**
 * Zakazlar o‘zgarishlari — SSE (EventSource). Token: `?access_token=` yoki `Authorization`.
 * Bir server jarayonida ishlaydi; ko‘p instans — keyin Redis.
 */
export async function registerOrderStreamRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/stream/orders",
    async (request, reply) => {
      if (!(await verifyAccessFromQueryOrHeader(request, reply))) return;
      if (!ensureTenantContext(request, reply)) return;

      reply.hijack();
      const allowOrigin = request.headers.origin ?? "*";
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": allowOrigin,
        Vary: "Origin"
      });

      const send = (payload: OrderStreamPayload) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch {
          /* ignore */
        }
      };

      const listener = (payload: OrderStreamPayload) => {
        if (payload.tenant_id === request.tenant!.id) {
          send(payload);
        }
      };

      const unsubscribe = subscribeOrderEvents(listener);

      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: ping\n\n`);
        } catch {
          /* ignore */
        }
      }, 25000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          reply.raw.end();
        } catch {
          /* ignore */
        }
      };

      request.raw.on("close", cleanup);
      request.raw.on("error", cleanup);
    }
  );
}
