import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  getTenantBonusStack,
  getTenantProfile,
  patchTenantProfile,
  updateTenantBonusStack
} from "./tenant-settings.service";

const adminRoles = ["admin"] as const;
const bonusStackReadRoles = ["admin", "operator"] as const;

const profilePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().max(500).nullable().optional(),
    address: z.string().max(4000).nullable().optional(),
    logo_url: z.string().max(4000).nullable().optional(),
    feature_flags: z.record(z.string(), z.unknown()).optional(),
    references: z
      .object({
        payment_types: z.array(z.string()).optional(),
        return_reasons: z.array(z.string()).optional(),
        regions: z.array(z.string()).optional()
      })
      .optional()
  })
  .strict();

const patchBodySchema = z
  .object({
    mode: z.enum(["all", "first_only", "capped"]).optional(),
    max_units: z.number().int().min(1).nullable().optional(),
    forbid_apply_all_eligible: z.boolean().optional()
  })
  .strict();

export async function registerTenantSettingsRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/settings/profile",
    { preHandler: [jwtAccessVerify, requireRoles(...bonusStackReadRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      try {
        const profile = await getTenantProfile(request.tenant!.id);
        return reply.send(profile);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/settings/profile",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = profilePatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const profile = await patchTenantProfile(request.tenant!.id, parsed.data);
        return reply.send(profile);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/settings/bonus-stack",
    { preHandler: [jwtAccessVerify, requireRoles(...bonusStackReadRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const json = await getTenantBonusStack(request.tenant!.id);
      return reply.send({ bonus_stack: json });
    }
  );

  app.patch(
    "/api/:slug/settings/bonus-stack",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = patchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const { json } = await updateTenantBonusStack(request.tenant!.id, parsed.data);
      return reply.send({ bonus_stack: json });
    }
  );
}
