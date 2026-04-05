import type { FastifyInstance } from "fastify";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify } from "../auth/auth.prehandlers";
import {
  getPriceForClient,
  getProductPrices,
  bulkUpsertPrices,
  getPricesByCategory,
  applyCategoryPricing
} from "./price-matrix.service";
import { Prisma } from "@prisma/client";

export async function registerPriceMatrixRoutes(app: FastifyInstance) {
  const preHandler = [jwtAccessVerify];

  app.get("/api/:slug/price-matrix/lookup", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    if (!q.productId || !q.clientCategory) {
      return reply.status(400).send({ error: "MissingParams", message: "productId and clientCategory required" });
    }
    const data = await getPriceForClient(
      request.tenant!.id,
      parseInt(q.productId),
      q.clientCategory,
      q.clientType,
      q.salesChannel
    );
    return reply.send(data);
  });

  app.get("/api/:slug/price-matrix/product/:productId", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { productId } = request.params as Record<string, string>;
    const data = await getProductPrices(request.tenant!.id, parseInt(productId));
    return reply.send(data);
  });

  app.get("/api/:slug/price-matrix/category/:category", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const { category } = request.params as Record<string, string>;
    const q = request.query as Record<string, string | undefined>;
    const data = await getPricesByCategory(request.tenant!.id, category, {
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 50,
      search: q.search
    });
    return reply.send(data);
  });

  app.post("/api/:slug/price-matrix/bulk", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as { items: Array<{
      product_id: number;
      client_category: string;
      client_type?: string;
      sales_channel?: string;
      price: number | string;
      min_price?: number | string;
      max_price?: number | string;
      currency?: string;
      valid_from?: string;
      valid_to?: string;
      is_active?: boolean;
    }> };
    if (!body.items || !Array.isArray(body.items)) {
      return reply.status(400).send({ error: "InvalidBody", message: "items array required" });
    }
    const data = await bulkUpsertPrices(request.tenant!.id, body.items);
    return reply.send(data);
  });

  app.post("/api/:slug/price-matrix/apply", { preHandler }, async (request, reply) => {
    if (!ensureTenantContext(request, reply)) return;
    const body = request.body as {
      client_category: string;
      client_type?: string;
      sales_channel?: string;
      prices: Record<string, number>;
    };
    const prices = new Map<number, Prisma.Decimal>();
    if (body.prices) {
      for (const [pid, price] of Object.entries(body.prices)) {
        prices.set(parseInt(pid), new Prisma.Decimal(price));
      }
    }
    const data = await applyCategoryPricing(
      request.tenant!.id,
      body.client_category,
      body.client_type ?? null,
      body.sales_channel ?? null,
      prices
    );
    return reply.send(data);
  });
}
