import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type PriceMatrixEntry = {
  id: number;
  tenant_id: number;
  product_id: number;
  client_category: string;
  client_type: string | null;
  sales_channel: string | null;
  price: string;
  min_price: string | null;
  max_price: string | null;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type PriceMatrixEntryWithProduct = PriceMatrixEntry & {
  product_name: string;
  product_sku: string;
};

export type PriceApplyResult = {
  productId: number;
  basePrice: string;
  matrixPrice: string | null;
  effectivePrice: string;
};

export type BulkUpsertItem = {
  product_id: number;
  client_category: string;
  client_type?: string | null;
  sales_channel?: string | null;
  price: number | string;
  min_price?: number | string | null;
  max_price?: number | string | null;
  currency?: string;
  valid_from?: string;
  valid_to?: string;
  is_active?: boolean;
};

export type GetPricesByCategoryOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

type PriceMatrixRow = {
  id: number;
  tenant_id: number;
  product_id: number;
  client_category: string;
  client_type: string | null;
  sales_channel: string | null;
  price: Prisma.Decimal;
  min_price: Prisma.Decimal | null;
  max_price: Prisma.Decimal | null;
  currency: string;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
  created_at: Date | null;
  updated_at: Date | null;
};

/* ------------------------------------------------------------------ */
/*  1. getPriceForClient                                                */
/* ------------------------------------------------------------------ */

export async function getPriceForClient(
  tenantId: number,
  productId: number,
  clientCategory: string,
  clientType?: string,
  salesChannel?: string
): Promise<{ price: string | null; min_price: string | null; max_price: string | null } | null> {
  let match = await queryOne(tenantId, productId, clientCategory, clientType || null, salesChannel || null);
  if (match) return match;

  if (clientType) {
    match = await queryOne(tenantId, productId, clientCategory, clientType, null);
    if (match) return match;
  }

  if (salesChannel) {
    match = await queryOne(tenantId, productId, clientCategory, null, salesChannel);
    if (match) return match;
  }

  return queryOne(tenantId, productId, clientCategory, null, null);
}

async function queryOne(
  tenantId: number,
  productId: number,
  clientCategory: string,
  clientType: string | null,
  salesChannel: string | null
): Promise<{ price: string | null; min_price: string | null; max_price: string | null } | null> {
  const match = await queryMatrix(tenantId, productId, clientCategory, clientType, salesChannel);
  if (!match) return null;
  const now = Date.now();
  const from = match.valid_from ? new Date(match.valid_from).getTime() : 0;
  const to = match.valid_to ? new Date(match.valid_to).getTime() : Infinity;
  if (now < from || now > to) return null;
  if (!match.is_active) return null;

  return {
    price: match.price.toString(),
    min_price: match.min_price?.toString() ?? null,
    max_price: match.max_price?.toString() ?? null
  };
}

async function queryMatrix(
  tenantId: number,
  productId: number,
  clientCategory: string,
  clientType: string | null,
  salesChannel: string | null
): Promise<PriceMatrixRow | null> {
  const where: Prisma.PriceMatrixWhereInput = {
    tenant_id: tenantId,
    product_id: productId,
    client_category: clientCategory,
    is_active: true
  };
  if (clientType !== null) where.client_type = clientType;
  else where.client_type = { equals: null };
  if (salesChannel !== null) where.sales_channel = salesChannel;
  else where.sales_channel = { equals: null };

  return prisma.priceMatrix.findFirst({ where });
}

/* ------------------------------------------------------------------ */
/*  2. getProductPrices                                                 */
/* ------------------------------------------------------------------ */

export async function getProductPrices(tenantId: number, productId: number): Promise<PriceMatrixEntry[]> {
  const rows = await prisma.priceMatrix.findMany({
    where: { tenant_id: tenantId, product_id: productId },
    orderBy: [{ client_category: "asc" }, { client_type: "asc" }]
  });
  return rows.map(normalizeEntry);
}

/* ------------------------------------------------------------------ */
/*  3. bulkUpsertPrices                                                 */
/* ------------------------------------------------------------------ */

export async function bulkUpsertPrices(
  tenantId: number,
  items: BulkUpsertItem[]
): Promise<{ inserted: number; updated: number }> {
  if (items.length === 0) return { inserted: 0, updated: 0 };

  const productIds = [...new Set(items.map((i) => i.product_id))];
  if (productIds.length === 0) throw new Error("NoProducts");

  const count = await prisma.product.count({
    where: { id: { in: productIds }, tenant_id: tenantId }
  });
  if (count !== productIds.length) throw new Error("SomeProductsNotOwned");

  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const price = new Prisma.Decimal(item.price);
    const data = {
      tenant_id: tenantId,
      product_id: item.product_id,
      client_category: item.client_category,
      client_type: item.client_type ?? null,
      sales_channel: item.sales_channel ?? null,
      price,
      min_price: item.min_price != null ? new Prisma.Decimal(item.min_price) : null,
      max_price: item.max_price != null ? new Prisma.Decimal(item.max_price) : null,
      currency: item.currency ?? "UZS",
      valid_from: item.valid_from ? new Date(item.valid_from) : null,
      valid_to: item.valid_to ? new Date(item.valid_to) : null,
      is_active: item.is_active ?? true
    };

    try {
      await prisma.priceMatrix.upsert({
        where: {
          tenant_id_product_id_client_category_client_type_sales_channe: {
            tenant_id: tenantId,
            product_id: item.product_id,
            client_category: item.client_category,
            client_type: item.client_type ?? null,
            sales_channel: item.sales_channel ?? null
          }
        },
        update: data,
        create: data
      });
      updated++;
    } catch {
      await prisma.priceMatrix.create({ data });
      inserted++;
    }
  }

  return { inserted, updated };
}

/* ------------------------------------------------------------------ */
/*  4. getPricesByCategory                                              */
/* ------------------------------------------------------------------ */

export async function getPricesByCategory(
  tenantId: number,
  clientCategory: string,
  options?: GetPricesByCategoryOptions
): Promise<{ data: PriceMatrixEntryWithProduct[]; total: number; page: number; limit: number }> {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 50, 500);
  const offset = (page - 1) * limit;
  const search = options?.search?.trim();

  const where: Prisma.PriceMatrixWhereInput = {
    tenant_id: tenantId,
    client_category: clientCategory
  };
  if (search) {
    where.product = { name: { contains: search, mode: "insensitive" as const } };
  }

  const [total, rows] = await Promise.all([
    prisma.priceMatrix.count({ where }),
    prisma.priceMatrix.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset
    })
  ]);

  return {
    data: rows.map((r) => ({
      ...normalizeEntry(r),
      product_name: r.product.name,
      product_sku: r.product.sku
    })),
    total,
    page,
    limit
  };
}

/* ------------------------------------------------------------------ */
/*  5. applyCategoryPricing                                             */
/* ------------------------------------------------------------------ */

export async function applyCategoryPricing(
  tenantId: number,
  clientCategory: string,
  clientType: string | null,
  salesChannel: string | null,
  basePrices: Map<number, Prisma.Decimal>
): Promise<PriceApplyResult[]> {
  const results: PriceApplyResult[] = [];

  for (const [productId, basePrice] of basePrices) {
    const match = await getPriceForClient(tenantId, productId, clientCategory, clientType ?? undefined, salesChannel ?? undefined);

    if (!match || match.price === null) {
      results.push({
        productId,
        basePrice: basePrice.toString(),
        matrixPrice: null,
        effectivePrice: basePrice.toString()
      });
      continue;
    }

    let effective = new Prisma.Decimal(match.price);
    if (match.min_price) {
      const min = new Prisma.Decimal(match.min_price);
      if (effective.lt(min)) effective = min;
    }
    if (match.max_price) {
      const max = new Prisma.Decimal(match.max_price);
      if (effective.gt(max)) effective = max;
    }

    results.push({
      productId,
      basePrice: basePrice.toString(),
      matrixPrice: match.price,
      effectivePrice: effective.toString()
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeEntry(r: PriceMatrixRow): PriceMatrixEntry {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    product_id: r.product_id,
    client_category: r.client_category,
    client_type: r.client_type,
    sales_channel: r.sales_channel,
    price: r.price.toString(),
    min_price: r.min_price?.toString() ?? null,
    max_price: r.max_price?.toString() ?? null,
    currency: r.currency,
    valid_from: r.valid_from ? r.valid_from.toISOString() : null,
    valid_to: r.valid_to ? r.valid_to.toISOString() : null,
    is_active: r.is_active,
    created_at: r.created_at ? r.created_at.toISOString() : null,
    updated_at: r.updated_at ? r.updated_at.toISOString() : null
  };
}
