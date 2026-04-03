import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/database";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { getTenantDefaultCurrencyCode } from "../tenant-settings/tenant-settings.service";
import {
  bulkUpsertPricesForType,
  getProductPrice,
  importProductPricesFromXlsx,
  listCategoryPricesMatrix,
  listProductPrices,
  syncProductPrices
} from "./product-prices.service";

const putPricesSchema = z.object({
  items: z.array(
    z.object({
      price_type: z.string().min(1),
      price: z.number().nonnegative()
    })
  )
});

const matrixPatchSchema = z.object({
  price_type: z.string().min(1).max(128),
  currency: z.string().min(2).max(20).optional(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        price: z.number().nonnegative()
      })
    )
    .min(1)
    .max(5000)
});

const catalogRoles = ["admin", "operator"] as const;

export async function registerProductPriceRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/product-prices/resolve",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const productId = Number.parseInt(q.product_id ?? "", 10);
      if (Number.isNaN(productId)) {
        return reply.status(400).send({ error: "BadQuery", message: "product_id majburiy" });
      }
      const priceType = (q.price_type ?? "retail").trim() || "retail";
      const product = await prisma.product.findFirst({
        where: { id: productId, tenant_id: request.tenant!.id }
      });
      if (!product) {
        return reply.status(404).send({ error: "NotFound" });
      }
      const price = await getProductPrice(request.tenant!.id, productId, priceType);
      const currency = await getTenantDefaultCurrencyCode(request.tenant!.id);
      return reply.send({
        product_id: productId,
        price_type: priceType,
        price,
        currency
      });
    }
  );

  app.get(
    "/api/:slug/products/prices/matrix",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const categoryId = Number.parseInt(q.category_id ?? "", 10);
      const priceType = (q.price_type ?? "").trim();
      if (Number.isNaN(categoryId) || !priceType) {
        return reply.status(400).send({ error: "BadQuery", message: "category_id va price_type majburiy" });
      }
      try {
        const currency = await getTenantDefaultCurrencyCode(request.tenant!.id);
        const data = await listCategoryPricesMatrix(request.tenant!.id, categoryId, priceType, currency);
        return reply.send({ data, currency });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/products/prices/matrix",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = matrixPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const cur =
        parsed.data.currency?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) ||
        (await getTenantDefaultCurrencyCode(request.tenant!.id));
      try {
        await bulkUpsertPricesForType(
          request.tenant!.id,
          parsed.data.price_type,
          parsed.data.items,
          cur,
          actorUserIdOrNull(request)
        );
        return reply.send({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/products/:id/prices",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const rows = await listProductPrices(request.tenant!.id, id);
        return reply.send({ data: rows });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.put(
    "/api/:slug/products/:id/prices",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = putPricesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const rows = await syncProductPrices(
          request.tenant!.id,
          id,
          parsed.data.items,
          actorUserIdOrNull(request)
        );
        return reply.send({ data: rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/products/prices/import",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "NoFile" });
      }
      const buf = await file.toBuffer();
      if (buf.length === 0) {
        return reply.status(400).send({ error: "EmptyFile" });
      }
      const result = await importProductPricesFromXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request)
      );
      return reply.send(result);
    }
  );
}
