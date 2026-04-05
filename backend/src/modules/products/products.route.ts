import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { actorUserIdOrNull } from "../../lib/request-actor";
import { ensureTenantContext } from "../../lib/tenant-context";
import { jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import { prisma } from "../../config/database";
import {
  buildProductCatalogImportTemplateBuffer,
  createProduct,
  createProductsBulk,
  exportTenantCatalogProductsXlsx,
  importProductsCatalogUpdateOnlyXlsx,
  importProductsFromCatalogTemplateXlsx,
  importProductsFromXlsx,
  productListInclude,
  softDeleteProduct,
  updateProduct
} from "./products.service";

const optionalIntNull = z.number().int().positive().nullable().optional();
const optionalNumStrNull = z.union([z.number(), z.string()]).nullable().optional();

const createBodySchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  category_id: z.number().int().positive(),
  is_active: z.boolean().optional(),
  product_group_id: optionalIntNull,
  brand_id: optionalIntNull,
  manufacturer_id: optionalIntNull,
  segment_id: optionalIntNull,
  weight_kg: optionalNumStrNull,
  volume_m3: optionalNumStrNull,
  qty_per_block: z.number().int().nullable().optional(),
  dimension_unit: z.string().max(8).nullable().optional(),
  width_cm: optionalNumStrNull,
  height_cm: optionalNumStrNull,
  length_cm: optionalNumStrNull,
  ikpu_code: z.string().max(64).nullable().optional(),
  hs_code: z.string().max(32).nullable().optional(),
  sell_code: z.string().max(64).nullable().optional(),
  comment: z.string().nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  is_blocked: z.boolean().optional()
});

const updateBodySchema = createBodySchema.partial().extend({
  category_id: z.number().int().positive().nullable().optional()
});

const bulkBodySchema = z.object({
  items: z.array(createBodySchema).min(1).max(150)
});

const catalogRoles = ["admin", "operator"] as const;

type ProductListRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  is_active: boolean;
  category_id: number | null;
  product_group_id: number | null;
  brand_id: number | null;
  manufacturer_id: number | null;
  segment_id: number | null;
  weight_kg: Prisma.Decimal | null;
  volume_m3: Prisma.Decimal | null;
  qty_per_block: number | null;
  dimension_unit: string | null;
  width_cm: Prisma.Decimal | null;
  height_cm: Prisma.Decimal | null;
  length_cm: Prisma.Decimal | null;
  ikpu_code: string | null;
  hs_code: string | null;
  sell_code: string | null;
  comment: string | null;
  sort_order: number | null;
  is_blocked: boolean;
  created_at: Date;
  category: { id: number; name: string } | null;
  product_group: { id: number; name: string } | null;
  brand: { id: number; name: string } | null;
  manufacturer: { id: number; name: string } | null;
  segment: { id: number; name: string } | null;
  prices?: { id: number; price_type: string; price: Prisma.Decimal; currency: string }[];
};

function mapProductToJson(r: ProductListRow) {
  const base = {
    id: r.id,
    sku: r.sku,
    name: r.name,
    unit: r.unit,
    barcode: r.barcode,
    is_active: r.is_active,
    category_id: r.category_id,
    product_group_id: r.product_group_id,
    brand_id: r.brand_id,
    manufacturer_id: r.manufacturer_id,
    segment_id: r.segment_id,
    weight_kg: r.weight_kg != null ? r.weight_kg.toString() : null,
    volume_m3: r.volume_m3 != null ? r.volume_m3.toString() : null,
    qty_per_block: r.qty_per_block,
    dimension_unit: r.dimension_unit,
    width_cm: r.width_cm != null ? r.width_cm.toString() : null,
    height_cm: r.height_cm != null ? r.height_cm.toString() : null,
    length_cm: r.length_cm != null ? r.length_cm.toString() : null,
    ikpu_code: r.ikpu_code,
    hs_code: r.hs_code,
    sell_code: r.sell_code,
    comment: r.comment,
    sort_order: r.sort_order,
    is_blocked: r.is_blocked,
    created_at: r.created_at.toISOString(),
    category: r.category ?? null,
    product_group: r.product_group ?? null,
    brand: r.brand ?? null,
    manufacturer: r.manufacturer ?? null,
    segment: r.segment ?? null
  };
  if (r.prices) {
    return {
      ...base,
      prices: r.prices.map((p) => ({
        id: p.id,
        price_type: p.price_type,
        price: p.price.toString(),
        currency: p.currency
      }))
    };
  }
  return base;
}

function parseFilterId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

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
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } }
        ];
      }

      if (q.is_active === "true") where.is_active = true;
      if (q.is_active === "false") where.is_active = false;

      const categoryId = parseFilterId(q.category_id);
      if (categoryId !== undefined) where.category_id = categoryId;

      const productGroupId = parseFilterId(q.product_group_id);
      if (productGroupId !== undefined) where.product_group_id = productGroupId;

      const brandId = parseFilterId(q.brand_id);
      if (brandId !== undefined) where.brand_id = brandId;

      const manufacturerId = parseFilterId(q.manufacturer_id);
      if (manufacturerId !== undefined) where.manufacturer_id = manufacturerId;

      const segmentId = parseFilterId(q.segment_id);
      if (segmentId !== undefined) where.segment_id = segmentId;

      const includePrices = q.include_prices === "1" || q.include_prices === "true";

      const include = {
        ...productListInclude,
        ...(includePrices
          ? {
              prices: {
                select: { id: true, price_type: true, price: true, currency: true }
              }
            }
          : {})
      } as const;

      const [total, rows] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }],
          include
        })
      ]);

      const data = (rows as unknown as ProductListRow[]).map(mapProductToJson);

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

      const include = {
        ...productListInclude,
        ...(includePrices
          ? {
              prices: {
                select: { id: true, price_type: true, price: true, currency: true }
              }
            }
          : {})
      } as const;

      const row = await prisma.product.findFirst({
        where: { id, tenant_id: request.tenant!.id },
        include
      });
      if (!row) {
        return reply.status(404).send({ error: "NotFound" });
      }
      return reply.send(mapProductToJson(row as unknown as ProductListRow));
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
        const row = await createProduct(request.tenant!.id, parsed.data, actorUserIdOrNull(request));
        return reply.status(201).send(mapProductToJson(row as unknown as ProductListRow));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "SKU_EXISTS") return reply.status(409).send({ error: "SkuExists" });
        if (msg === "BAD_CATEGORY") return reply.status(400).send({ error: "BadCategory" });
        if (msg === "BAD_REF") return reply.status(400).send({ error: "BadRef" });
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
        const row = await updateProduct(
          request.tenant!.id,
          id,
          parsed.data,
          actorUserIdOrNull(request)
        );
        return reply.send(mapProductToJson(row as unknown as ProductListRow));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "SKU_EXISTS") return reply.status(409).send({ error: "SkuExists" });
        if (msg === "BAD_CATEGORY") return reply.status(400).send({ error: "BadCategory" });
        if (msg === "BAD_REF") return reply.status(400).send({ error: "BadRef" });
        throw e;
      }
    }
  );

  /** Mahsulotni fizik o‘chirmaydi — `is_active: false` (neaktiv ro‘yxatga o‘tadi). */
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
        const row = await softDeleteProduct(request.tenant!.id, id, actorUserIdOrNull(request));
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
      const result = await importProductsFromXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request)
      );
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/products/import-template",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const buf = await buildProductCatalogImportTemplateBuffer();
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header(
          "Content-Disposition",
          'attachment; filename="import-products-template.xlsx"'
        )
        .send(buf);
    }
  );

  app.get(
    "/api/:slug/products/export-catalog",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const buf = await exportTenantCatalogProductsXlsx(request.tenant!.id);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header(
          "Content-Disposition",
          'attachment; filename="products-catalog-export.xlsx"'
        )
        .send(buf);
    }
  );

  app.post(
    "/api/:slug/products/import-catalog",
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
      const result = await importProductsFromCatalogTemplateXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request)
      );
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/products/import-catalog-update",
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
      const result = await importProductsCatalogUpdateOnlyXlsx(
        request.tenant!.id,
        buf,
        actorUserIdOrNull(request)
      );
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/products/bulk",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const result = await createProductsBulk(
          request.tenant!.id,
          parsed.data.items,
          actorUserIdOrNull(request)
        );
        return reply.status(201).send(result);
      } catch (e) {
        throw e;
      }
    }
  );
}
