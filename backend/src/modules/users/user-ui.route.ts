import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify } from "../auth/auth.prehandlers";
import { getUserUiPreferences, patchUserUiPreferences } from "./user-ui-preferences.service";

/** Jadval sozlamalari: ustun tartibi, yashirin ustunlar, sahifa o‘lchami */
const tableStateSchema = z
  .object({
    columnOrder: z.array(z.string().max(80)).max(100).optional(),
    hiddenColumnIds: z.array(z.string().max(80)).max(100).optional(),
    pageSize: z.number().int().min(5).max(2000).optional()
  })
  .strict();

const patchUiPrefsSchema = z
  .object({
    tables: z.record(z.string().min(1).max(80), tableStateSchema).optional()
  })
  .strict()
  .refine((o) => o.tables == null || Object.keys(o.tables).length <= 80, {
    message: "TooManyTables",
    path: ["tables"]
  });

export async function registerUserUiRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/me/ui-preferences",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const jwt = getAccessUser(request);
      const userId = Number.parseInt(jwt.sub, 10);
      if (!Number.isFinite(userId) || userId <= 0) {
        return reply.status(400).send({ error: "BadUserId" });
      }
      if (Number(jwt.tenantId) !== request.tenant!.id) {
        return reply.status(403).send({ error: "CrossTenantDenied" });
      }
      try {
        const data = await getUserUiPreferences(request.tenant!.id, userId);
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/me/ui-preferences",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const jwt = getAccessUser(request);
      const userId = Number.parseInt(jwt.sub, 10);
      if (!Number.isFinite(userId) || userId <= 0) {
        return reply.status(400).send({ error: "BadUserId" });
      }
      if (Number(jwt.tenantId) !== request.tenant!.id) {
        return reply.status(403).send({ error: "CrossTenantDenied" });
      }
      const parsed = patchUiPrefsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const data = await patchUserUiPreferences(request.tenant!.id, userId, parsed.data);
        return reply.send({ data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "UI_PREFS_TOO_LARGE") {
          return reply.status(400).send({ error: "UiPreferencesTooLarge" });
        }
        throw e;
      }
    }
  );
}
