import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { getAccessUser, jwtAccessVerify } from "./auth.prehandlers";
import { login, logout, refresh } from "./auth.service";

const loginSchema = z.object({
  slug: z.string().min(1),
  login: z.string().min(1),
  password: z.string().min(1),
  device_name: z.string().max(255).nullable().optional(),
  user_agent: z.string().max(512).nullable().optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const AUTH_PREFIXES = ["/auth", "/api/auth"] as const;

const loginRouteOpts = {
  config: {
    rateLimit: {
      max: env.AUTH_LOGIN_RATE_MAX,
      timeWindow: env.AUTH_LOGIN_RATE_WINDOW_MS
    }
  }
};

function registerAuthAtBase(app: FastifyInstance, base: string) {
  app.post(`${base}/login`, loginRouteOpts, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }

    try {
      const ip =
        (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
        request.ip ||
        null;
      const result = await login(app, {
        ...parsed.data,
        ip_address: ip
      });
      return reply.send(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      if (msg === "TENANT_NOT_FOUND") {
        return reply.status(404).send({ error: msg });
      }
      if (msg === "INVALID_CREDENTIALS") {
        return reply.status(401).send({ error: msg });
      }
      if (msg === "SESSION_LIMIT") {
        return reply.status(403).send({ error: msg });
      }
      throw error;
    }
  });

  app.post(`${base}/refresh`, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }

    try {
      const result = await refresh(app, parsed.data);
      return reply.send(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      if (msg === "INVALID_REFRESH") {
        return reply.status(401).send({ error: msg });
      }
      throw error;
    }
  });

  app.post(`${base}/logout`, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
    }

    await logout(parsed.data);
    return reply.status(204).send();
  });

  app.get(
    `${base}/me`,
    { preHandler: [jwtAccessVerify] },
    async (request, _reply) => {
      const u = getAccessUser(request);
      return {
        user: {
          id: Number(u.sub),
          login: u.login,
          role: u.role,
          tenantId: u.tenantId
        }
      };
    }
  );
}

export async function registerAuthRoutes(app: FastifyInstance) {
  for (const prefix of AUTH_PREFIXES) {
    registerAuthAtBase(app, prefix);
  }
}
