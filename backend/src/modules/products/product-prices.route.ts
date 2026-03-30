import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/database";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  getProductPrice,
  importProductPricesFromXlsx,
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
      return reply.send({
        product_id: productId,
        price_type: priceType,
        price,
        currency: "UZS"
      });
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
        const rows = await syncProductPrices(request.tenant!.id, id, parsed.data.items);
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
      const result = await importProductPricesFromXlsx(request.tenant!.id, buf);
      return reply.send(result);
    }
  );
}
