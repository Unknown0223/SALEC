import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { DIRECTORY_READ_ROLES, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  createProductCategoryRow,
  createWarehouseRow,
  deleteProductCategoryRow,
  deleteWarehouseRow,
  listDistinctPriceTypesForTenant,
  listProductCategoriesForTenant,
  listUsersForOrderAgent,
  listWarehousesForTenant,
  updateProductCategoryRow,
  updateWarehouseRow
} from "./reference.service";

const catalogRoles = ["admin", "operator"] as const;
const adminRoles = ["admin"] as const;

const createCategoryBody = z.object({
  name: z.string().min(1).max(500),
  parent_id: z.number().int().positive().nullable().optional(),
  code: z.string().max(24).nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  default_unit: z.string().max(64).nullable().optional(),
  is_active: z.boolean().optional(),
  comment: z.string().max(4000).nullable().optional()
});

const patchCategoryBody = z
  .object({
    name: z.string().min(1).max(500).optional(),
    parent_id: z.number().int().positive().nullable().optional(),
    code: z.string().max(24).nullable().optional(),
    sort_order: z.number().int().nullable().optional(),
    default_unit: z.string().max(64).nullable().optional(),
    is_active: z.boolean().optional(),
    comment: z.string().max(4000).nullable().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const createWarehouseBody = z.object({
  name: z.string().min(1).max(300),
  type: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional()
});

const patchWarehouseBody = z
  .object({
    name: z.string().min(1).max(300).optional(),
    type: z.string().max(200).nullable().optional(),
    address: z.string().max(500).nullable().optional()
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

  app.post(
    "/api/:slug/warehouses",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createWarehouseBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createWarehouseRow(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_NAME") return reply.status(400).send({ error: "EmptyName" });
        if (msg === "NAME_EXISTS") return reply.status(409).send({ error: "WarehouseNameExists" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/warehouses/:warehouseId",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { warehouseId: string }).warehouseId, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchWarehouseBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await updateWarehouseRow(
          request.tenant!.id,
          id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_NAME") return reply.status(400).send({ error: "EmptyName" });
        if (msg === "NAME_EXISTS") return reply.status(409).send({ error: "WarehouseNameExists" });
        if (msg === "EMPTY_PATCH") return reply.status(400).send({ error: "EmptyBody" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/warehouses/:warehouseId",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { warehouseId: string }).warehouseId, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await deleteWarehouseRow(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "HAS_STOCK") return reply.status(409).send({ error: "WarehouseHasStock" });
        if (msg === "HAS_ORDERS") return reply.status(409).send({ error: "WarehouseHasOrders" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/users",
    { preHandler: [jwtAccessVerify, requireRoles(...DIRECTORY_READ_ROLES)] },
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
          {
            name: parsed.data.name,
            parent_id: parsed.data.parent_id ?? null,
            code: parsed.data.code ?? null,
            sort_order: parsed.data.sort_order ?? null,
            default_unit: parsed.data.default_unit ?? null,
            is_active: parsed.data.is_active,
            comment: parsed.data.comment ?? null
          },
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "EMPTY_NAME") return reply.status(400).send({ error: "EmptyName" });
        if (msg === "BAD_PARENT") return reply.status(400).send({ error: "BadParent" });
        if (msg === "BAD_CODE") return reply.status(400).send({ error: "BadCode" });
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
        const row = await updateProductCategoryRow(
          request.tenant!.id,
          id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "EMPTY_NAME" || msg === "BAD_PARENT") {
          return reply.status(400).send({ error: msg === "EMPTY_NAME" ? "EmptyName" : "BadParent" });
        }
        if (msg === "BAD_CODE") return reply.status(400).send({ error: "BadCode" });
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
        await deleteProductCategoryRow(request.tenant!.id, id, actorUserIdOrNull(request));
        return reply.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "HAS_CHILDREN") return reply.status(409).send({ error: "HasChildren" });
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
