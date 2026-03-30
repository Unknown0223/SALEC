import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { prisma } from "../../config/database";
import {
  createProduct,
  importProductsFromXlsx,
  softDeleteProduct,
  updateProduct
} from "./products.service";

const createBodySchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional()
});

const updateBodySchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional()
});

const catalogRoles = ["admin", "operator"] as const;

export async function registerProductRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/products",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;

      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "20", 10) || 20));
      const search = q.search?.trim();

      const where: Prisma.ProductWhereInput = {
        tenant_id: request.tenant!.id
      };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } }
        ];
      }

      if (q.is_active === "true") where.is_active = true;
      if (q.is_active === "false") where.is_active = false;

      const categoryId = q.category_id ? Number.parseInt(q.category_id, 10) : NaN;
      if (!Number.isNaN(categoryId)) {
        where.category_id = categoryId;
      }

      const includePrices = q.include_prices === "1" || q.include_prices === "true";

      const [total, rows] = await Promise.all([
        prisma.product.count({ where }),
        includePrices
          ? prisma.product.findMany({
              where,
              skip: (pageNum - 1) * limitNum,
              take: limitNum,
              orderBy: [{ name: "asc" }, { id: "asc" }],
              include: {
                prices: {
                  select: { id: true, price_type: true, price: true, currency: true }
                }
              }
            })
          : prisma.product.findMany({
              where,
              skip: (pageNum - 1) * limitNum,
              take: limitNum,
              orderBy: [{ name: "asc" }, { id: "asc" }],
              select: {
                id: true,
                sku: true,
                name: true,
                unit: true,
                barcode: true,
                is_active: true,
                category_id: true
              }
            })
      ]);

      const data = includePrices
        ? (
            rows as {
              id: number;
              sku: string;
              name: string;
              unit: string;
              barcode: string | null;
              is_active: boolean;
              category_id: number | null;
              prices: { id: number; price_type: string; price: Prisma.Decimal; currency: string }[];
            }[]
          ).map((r) => ({
            id: r.id,
            sku: r.sku,
            name: r.name,
            unit: r.unit,
            barcode: r.barcode,
            is_active: r.is_active,
            category_id: r.category_id,
            prices: r.prices.map((p) => ({
              id: p.id,
              price_type: p.price_type,
              price: p.price.toString(),
              currency: p.currency
            }))
          }))
        : rows;

      return reply.send({
        data,
        total,
        page: pageNum,
        limit: limitNum
      });
    }
  );

  app.get(
    "/api/:slug/products/:id",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      const includePrices = q.include_prices === "1" || q.include_prices === "true";

      const row = includePrices
        ? await prisma.product.findFirst({
            where: { id, tenant_id: request.tenant!.id },
            include: {
              prices: {
                select: { id: true, price_type: true, price: true, currency: true }
              }
            }
          })
        : await prisma.product.findFirst({
            where: { id, tenant_id: request.tenant!.id },
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true,
              barcode: true,
              is_active: true,
              category_id: true
            }
          });
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      if (includePrices && "prices" in row) {
        const r = row as typeof row & {
          prices: { id: number; price_type: string; price: Prisma.Decimal; currency: string }[];
        };
        return reply.send({
          id: r.id,
          sku: r.sku,
          name: r.name,
          unit: r.unit,
          barcode: r.barcode,
          is_active: r.is_active,
          category_id: r.category_id,
          prices: r.prices.map((p) => ({
            id: p.id,
            price_type: p.price_type,
            price: p.price.toString(),
            currency: p.currency
          }))
        });
      }
      return reply.send(row);
    }
  );

  app.post(
    "/api/:slug/products",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createProduct(request.tenant!.id, parsed.data);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "SKU_EXISTS") return reply.status(409).send({ error: "SkuExists" });
        if (msg === "BAD_CATEGORY") return reply.status(400).send({ error: "BadCategory" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        throw e;
      }
    }
  );

  app.put(
    "/api/:slug/products/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = updateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      if (Object.keys(parsed.data).length === 0) {
        return reply.status(400).send({ error: "EmptyBody" });
      }
      try {
        const row = await updateProduct(request.tenant!.id, id, parsed.data);
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "SKU_EXISTS") return reply.status(409).send({ error: "SkuExists" });
        if (msg === "BAD_CATEGORY") return reply.status(400).send({ error: "BadCategory" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/products/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const row = await softDeleteProduct(request.tenant!.id, id);
        return reply.send(row);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/products/import",
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
      const result = await importProductsFromXlsx(request.tenant!.id, buf);
      return reply.send(result);
    }
  );
}
