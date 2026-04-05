import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
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

type TerritoryNodePatch = {
  id: string;
  name: string;
  code?: string | null;
  comment?: string | null;
  sort_order?: number | null;
  active?: boolean;
  children: TerritoryNodePatch[];
};

type UnitMeasurePatch = {
  id: string;
  name: string;
  title?: string | null;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
};

type BranchPatch = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
  territory?: string | null;
  city?: string | null;
  cashbox?: string | null;
  cash_desk_id?: number | null;
  user_links?: {
    role: string;
    user_ids: number[];
  }[];
};

const territoryNodeSchema: z.ZodType<TerritoryNodePatch> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(500),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]+$/)
      .max(20)
      .nullable()
      .optional(),
    comment: z.string().max(4000).nullable().optional(),
    sort_order: z.number().int().nullable().optional(),
    active: z.boolean().optional(),
    children: z.array(territoryNodeSchema).max(200)
  })
);

const unitMeasureSchema: z.ZodType<UnitMeasurePatch> = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  title: z.string().max(500).nullable().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/)
    .max(20)
    .nullable()
    .optional(),
  sort_order: z.number().int().nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional()
});

const clientRefEntrySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/)
    .max(20)
    .nullable()
    .optional(),
  sort_order: z.number().int().nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
  color: z.string().max(32).nullable().optional()
});

const currencyEntrySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  code: z.string().trim().min(2).max(20),
  sort_order: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
  is_default: z.boolean().optional()
});

const paymentMethodEntrySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  code: z.string().trim().max(30).nullable().optional(),
  currency_code: z.string().trim().min(2).max(20),
  sort_order: z.number().int().nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  active: z.boolean().optional()
});

const priceTypeEntrySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  code: z.string().trim().max(20).nullable().optional(),
  payment_method_id: z.string().min(1).max(128),
  kind: z.enum(["sale", "purchase"]).optional(),
  sort_order: z.number().int().nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
  manual: z.boolean().optional(),
  attached_clients_only: z.boolean().optional()
});

const branchSchema: z.ZodType<BranchPatch> = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/)
    .max(20)
    .nullable()
    .optional(),
  sort_order: z.number().int().nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
  territory: z.string().max(500).nullable().optional(),
  city: z.string().max(500).nullable().optional(),
  cashbox: z.string().max(500).nullable().optional(),
  cash_desk_id: z.number().int().positive().nullable().optional(),
  user_links: z
    .array(
      z.object({
        role: z.string().min(1).max(100),
        user_ids: z.array(z.number().int().positive()).max(2000)
      })
    )
    .max(100)
    .optional()
});

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
        regions: z.array(z.string()).optional(),
        client_categories: z.array(z.string()).optional(),
        client_type_codes: z.array(z.string()).optional(),
        client_formats: z.array(z.string()).optional(),
        sales_channels: z.array(z.string()).optional(),
        client_product_category_refs: z.array(z.string()).optional(),
        client_districts: z.array(z.string()).optional(),
        client_cities: z.array(z.string()).optional(),
        client_neighborhoods: z.array(z.string()).optional(),
        client_zones: z.array(z.string()).optional(),
        client_logistics_services: z.array(z.string()).optional(),
        territory_levels: z.array(z.string()).optional(),
        territory_nodes: z.array(territoryNodeSchema).max(120).optional(),
        unit_measures: z.array(unitMeasureSchema).max(1000).optional(),
        branches: z.array(branchSchema).max(1000).optional(),
        client_format_entries: z.array(clientRefEntrySchema).max(2000).optional(),
        client_type_entries: z.array(clientRefEntrySchema).max(2000).optional(),
        client_category_entries: z.array(clientRefEntrySchema).max(2000).optional(),
        territory_tree: z
          .array(
            z.object({
              zone: z.string(),
              region: z.string(),
              cities: z.array(z.string())
            })
          )
          .optional(),
        currency_entries: z.array(currencyEntrySchema).max(200).optional(),
        payment_method_entries: z.array(paymentMethodEntrySchema).max(500).optional(),
        price_type_entries: z.array(priceTypeEntrySchema).max(500).optional()
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
        const profile = await patchTenantProfile(
          request.tenant!.id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send(profile);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        if (e instanceof Error && e.message === "INVALID_BRANCH_CASH_DESK") {
          return reply.status(400).send({ error: "InvalidBranchCashDesk" });
        }
        if (e instanceof Error && e.message === "DUPLICATE_BRANCH_CASH_DESK") {
          return reply.status(400).send({ error: "DuplicateBranchCashDesk" });
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
      const { json } = await updateTenantBonusStack(
        request.tenant!.id,
        parsed.data,
        actorUserIdOrNull(request)
      );
      return reply.send({ bonus_stack: json });
    }
  );
}
