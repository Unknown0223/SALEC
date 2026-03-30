import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createProductCategoryRow,
  deleteProductCategoryRow,
  listDistinctPriceTypesForTenant,
  listProductCategoriesForTenant,
  listUsersForOrderAgent,
  listWarehousesForTenant,
  updateProductCategoryRow
} from "./reference.service";

const catalogRoles = ["admin", "operator"] as const;
const adminRoles = ["admin"] as const;

const createCategoryBody = z.object({
  name: z.string().min(1),
  parent_id: z.number().int().positive().nullable().optional()
});

const patchCategoryBody = z
  .object({
    name: z.string().min(1).optional(),
    parent_id: z.number().int().positive().nullable().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

export async function registerReferenceRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/warehouses",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listWarehousesForTenant(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/users",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listUsersForOrderAgent(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.get(
    "/api/:slug/product-categories",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listProductCategoriesForTenant(request.tenant!.id);
      return reply.send({ data });
    }
  );

  app.post(
    "/api/:slug/product-categories",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createCategoryBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createProductCategoryRow(
          request.tenant!.id,
          parsed.data.name,
          parsed.data.parent_id ?? null
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_NAME") return reply.status(400).send({ error: "EmptyName" });
        if (msg === "BAD_PARENT") return reply.status(400).send({ error: "BadParent" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/product-categories/:categoryId",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { categoryId: string }).categoryId, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchCategoryBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await updateProductCategoryRow(request.tenant!.id, id, parsed.data);
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_NAME" || msg === "BAD_PARENT") {
          return reply.status(400).send({ error: msg === "EMPTY_NAME" ? "EmptyName" : "BadParent" });
        }
        if (msg === "EMPTY_PATCH") return reply.status(400).send({ error: "EmptyBody" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/product-categories/:categoryId",
    { preHandler: [jwtAccessVerify, requireRoles(...adminRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { categoryId: string }).categoryId, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await deleteProductCategoryRow(request.tenant!.id, id);
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "CATEGORY_IN_USE") return reply.status(409).send({ error: "CategoryInUse" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/price-types",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const data = await listDistinctPriceTypesForTenant(request.tenant!.id);
      return reply.send({ data });
    }
  );
}
