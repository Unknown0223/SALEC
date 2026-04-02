import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import type { AccessJwtUser } from "../modules/auth/auth.prehandlers";

/** Sekin so‘rovlar uchun ogohlantirish (ms). SLO: [docs/SLO_AND_OBSERVABILITY.md](../../../docs/SLO_AND_OBSERVABILITY.md) */
const SLOW_REQUEST_MS = 500;

function pathOnly(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function extractActorUserId(request: FastifyRequest): number | undefined {
  const u = request.user as AccessJwtUser | undefined;
  if (!u?.sub) return undefined;
  const n = Number(u.sub);
  return Number.isFinite(n) ? n : undefined;
}

export const requestObservabilityPlugin = fp(async (app) => {
  app.addHook("onResponse", (request: FastifyRequest, reply: FastifyReply, done) => {
    const ms = reply.elapsedTime;
    const tenantId = request.tenant?.id;
    const actorUserId = extractActorUserId(request);
    const base = {
      requestId: request.id,
      method: request.method,
      path: pathOnly(request.url),
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(ms * 100) / 100,
      tenantId,
      actorUserId
    };
    if (ms >= SLOW_REQUEST_MS) {
      app.log.warn(base, "slow_request");
    } else if (env.NODE_ENV !== "production") {
      app.log.debug(base, "request_complete");
    } else {
      app.log.info(base, "request_complete");
    }
    done();
  });
});
