import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export type ListCatalogOpts = {
  search?: string;
  is_active?: boolean | null;
  page: number;
  limit: number;
};

function listWhere(
  tenantId: number,
  opts: ListCatalogOpts
): {
  tenant_id: number;
  is_active?: boolean;
  OR?: Prisma.ProductCatalogGroupWhereInput["OR"];
} {
  const where: {
    tenant_id: number;
    is_active?: boolean;
    OR?: Prisma.ProductCatalogGroupWhereInput["OR"];
  } = { tenant_id: tenantId };
  if (opts.is_active === true) where.is_active = true;
  if (opts.is_active === false) where.is_active = false;
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } }
    ];
  }
  return where;
}

function normCode(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const t = v.trim().slice(0, 24);
  return t || null;
}

// —— Product catalog groups (группа товаров) ——

export async function listProductCatalogGroups(tenantId: number, opts: ListCatalogOpts) {
  const where = listWhere(tenantId, opts);
  const [total, rows] = await Promise.all([
    prisma.productCatalogGroup.count({ where }),
    prisma.productCatalogGroup.findMany({
      where,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
    })
  ]);
  return { total, data: rows };
}

export async function createProductCatalogGroup(
  tenantId: number,
  input: { name: string; code?: string | null; sort_order?: number | null; is_active?: boolean }
) {
  const name = input.name.trim();
  if (!name) throw new Error("VALIDATION");
  return prisma.productCatalogGroup.create({
    data: {
      tenant_id: tenantId,
      name,
      code: normCode(input.code ?? null),
      sort_order: input.sort_order ?? null,
      is_active: input.is_active ?? true
    }
  });
}

export async function updateProductCatalogGroup(
  tenantId: number,
  id: number,
  input: Partial<{ name: string; code: string | null; sort_order: number | null; is_active: boolean }>
) {
  const row = await prisma.productCatalogGroup.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const data: Prisma.ProductCatalogGroupUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.code !== undefined) data.code = normCode(input.code);
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  return prisma.productCatalogGroup.update({ where: { id }, data });
}

export async function deleteProductCatalogGroup(tenantId: number, id: number) {
  const row = await prisma.productCatalogGroup.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const n = await prisma.product.count({ where: { tenant_id: tenantId, product_group_id: id } });
  if (n > 0) throw new Error("IN_USE");
  await prisma.productCatalogGroup.delete({ where: { id } });
}

// —— Brands ——

export async function listProductBrands(tenantId: number, opts: ListCatalogOpts) {
  const where = listWhere(tenantId, opts) as Prisma.ProductBrandWhereInput;
  const [total, data] = await Promise.all([
    prisma.productBrand.count({ where }),
    prisma.productBrand.findMany({
      where,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
    })
  ]);
  return { total, data };
}

export async function createProductBrand(
  tenantId: number,
  input: { name: string; code?: string | null; sort_order?: number | null; is_active?: boolean }
) {
  const name = input.name.trim();
  if (!name) throw new Error("VALIDATION");
  return prisma.productBrand.create({
    data: {
      tenant_id: tenantId,
      name,
      code: normCode(input.code ?? null),
      sort_order: input.sort_order ?? null,
      is_active: input.is_active ?? true
    }
  });
}

export async function updateProductBrand(
  tenantId: number,
  id: number,
  input: Partial<{ name: string; code: string | null; sort_order: number | null; is_active: boolean }>
) {
  const row = await prisma.productBrand.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const data: Prisma.ProductBrandUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.code !== undefined) data.code = normCode(input.code);
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  return prisma.productBrand.update({ where: { id }, data });
}

export async function deleteProductBrand(tenantId: number, id: number) {
  const row = await prisma.productBrand.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const n = await prisma.product.count({ where: { tenant_id: tenantId, brand_id: id } });
  if (n > 0) throw new Error("IN_USE");
  await prisma.productBrand.delete({ where: { id } });
}

// —— Manufacturers ——

export async function listProductManufacturers(tenantId: number, opts: ListCatalogOpts) {
  const where = listWhere(tenantId, opts) as Prisma.ProductManufacturerWhereInput;
  const [total, data] = await Promise.all([
    prisma.productManufacturer.count({ where }),
    prisma.productManufacturer.findMany({
      where,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
    })
  ]);
  return { total, data };
}

export async function createProductManufacturer(
  tenantId: number,
  input: { name: string; code?: string | null; sort_order?: number | null; is_active?: boolean }
) {
  const name = input.name.trim();
  if (!name) throw new Error("VALIDATION");
  return prisma.productManufacturer.create({
    data: {
      tenant_id: tenantId,
      name,
      code: normCode(input.code ?? null),
      sort_order: input.sort_order ?? null,
      is_active: input.is_active ?? true
    }
  });
}

export async function updateProductManufacturer(
  tenantId: number,
  id: number,
  input: Partial<{ name: string; code: string | null; sort_order: number | null; is_active: boolean }>
) {
  const row = await prisma.productManufacturer.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const data: Prisma.ProductManufacturerUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.code !== undefined) data.code = normCode(input.code);
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  return prisma.productManufacturer.update({ where: { id }, data });
}

export async function deleteProductManufacturer(tenantId: number, id: number) {
  const row = await prisma.productManufacturer.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const n = await prisma.product.count({ where: { tenant_id: tenantId, manufacturer_id: id } });
  if (n > 0) throw new Error("IN_USE");
  await prisma.productManufacturer.delete({ where: { id } });
}

// —— Segments ——

export async function listProductSegments(tenantId: number, opts: ListCatalogOpts) {
  const where = listWhere(tenantId, opts) as Prisma.ProductSegmentWhereInput;
  const [total, data] = await Promise.all([
    prisma.productSegment.count({ where }),
    prisma.productSegment.findMany({
      where,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
    })
  ]);
  return { total, data };
}

export async function createProductSegment(
  tenantId: number,
  input: { name: string; code?: string | null; sort_order?: number | null; is_active?: boolean }
) {
  const name = input.name.trim();
  if (!name) throw new Error("VALIDATION");
  return prisma.productSegment.create({
    data: {
      tenant_id: tenantId,
      name,
      code: normCode(input.code ?? null),
      sort_order: input.sort_order ?? null,
      is_active: input.is_active ?? true
    }
  });
}

export async function updateProductSegment(
  tenantId: number,
  id: number,
  input: Partial<{ name: string; code: string | null; sort_order: number | null; is_active: boolean }>
) {
  const row = await prisma.productSegment.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const data: Prisma.ProductSegmentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.code !== undefined) data.code = normCode(input.code);
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  return prisma.productSegment.update({ where: { id }, data });
}

export async function deleteProductSegment(tenantId: number, id: number) {
  const row = await prisma.productSegment.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  const n = await prisma.product.count({ where: { tenant_id: tenantId, segment_id: id } });
  if (n > 0) throw new Error("IN_USE");
  await prisma.productSegment.delete({ where: { id } });
}

// —— Interchangeable groups ——

export type InterchangeableGroupRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  products: { id: number; sku: string; name: string }[];
  price_types: string[];
};

export async function listInterchangeableProductGroups(
  tenantId: number,
  opts: ListCatalogOpts
): Promise<{ total: number; data: InterchangeableGroupRow[] }> {
  const base: Prisma.InterchangeableProductGroupWhereInput = { tenant_id: tenantId };
  if (opts.is_active === true) base.is_active = true;
  if (opts.is_active === false) base.is_active = false;
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    base.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } }
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.interchangeableProductGroup.count({ where: base }),
    prisma.interchangeableProductGroup.findMany({
      where: base,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }],
      include: {
        products: {
          include: {
            product: { select: { id: true, sku: true, name: true } }
          }
        },
        price_type_links: true
      }
    })
  ]);
  const data: InterchangeableGroupRow[] = rows.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    sort_order: g.sort_order,
    comment: g.comment,
    is_active: g.is_active,
    created_at: g.created_at,
    updated_at: g.updated_at,
    products: g.products.map((l) => l.product),
    price_types: g.price_type_links.map((p) => p.price_type)
  }));
  return { total, data };
}

export async function createInterchangeableProductGroup(
  tenantId: number,
  input: {
    name: string;
    code?: string | null;
    sort_order?: number | null;
    comment?: string | null;
    is_active?: boolean;
    product_ids?: number[];
    price_types?: string[];
  }
) {
  const name = input.name.trim();
  if (!name) throw new Error("VALIDATION");
  const productIds = [...new Set((input.product_ids ?? []).filter((x) => Number.isInteger(x) && x > 0))];
  const priceTypes = [...new Set((input.price_types ?? []).map((t) => t.trim()).filter(Boolean))];

  if (productIds.length) {
    const cnt = await prisma.product.count({
      where: { tenant_id: tenantId, id: { in: productIds } }
    });
    if (cnt !== productIds.length) throw new Error("BAD_PRODUCT");
  }

  return prisma.$transaction(async (tx) => {
    const g = await tx.interchangeableProductGroup.create({
      data: {
        tenant_id: tenantId,
        name,
        code: normCode(input.code ?? null),
        sort_order: input.sort_order ?? null,
        comment: input.comment?.trim() || null,
        is_active: input.is_active ?? true
      }
    });
    if (productIds.length) {
      await tx.interchangeableGroupProduct.createMany({
        data: productIds.map((product_id) => ({ group_id: g.id, product_id }))
      });
    }
    if (priceTypes.length) {
      await tx.interchangeableGroupPriceType.createMany({
        data: priceTypes.map((price_type) => ({ group_id: g.id, price_type }))
      });
    }
    return g;
  });
}

export async function updateInterchangeableProductGroup(
  tenantId: number,
  id: number,
  input: Partial<{
    name: string;
    code: string | null;
    sort_order: number | null;
    comment: string | null;
    is_active: boolean;
    product_ids: number[];
    price_types: string[];
  }>
) {
  const row = await prisma.interchangeableProductGroup.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");

  if (input.product_ids !== undefined) {
    const productIds = [...new Set(input.product_ids.filter((x) => Number.isInteger(x) && x > 0))];
    if (productIds.length) {
      const cnt = await prisma.product.count({
        where: { tenant_id: tenantId, id: { in: productIds } }
      });
      if (cnt !== productIds.length) throw new Error("BAD_PRODUCT");
    }
  }

  return prisma.$transaction(async (tx) => {
    const data: Prisma.InterchangeableProductGroupUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.code !== undefined) data.code = normCode(input.code);
    if (input.sort_order !== undefined) data.sort_order = input.sort_order;
    if (input.comment !== undefined) data.comment = input.comment?.trim() || null;
    if (input.is_active !== undefined) data.is_active = input.is_active;
    if (Object.keys(data).length) {
      await tx.interchangeableProductGroup.update({ where: { id }, data });
    }

    if (input.product_ids !== undefined) {
      const productIds = [...new Set(input.product_ids.filter((x) => Number.isInteger(x) && x > 0))];
      await tx.interchangeableGroupProduct.deleteMany({ where: { group_id: id } });
      if (productIds.length) {
        await tx.interchangeableGroupProduct.createMany({
          data: productIds.map((product_id) => ({ group_id: id, product_id }))
        });
      }
    }

    if (input.price_types !== undefined) {
      const priceTypes = [...new Set(input.price_types.map((t) => t.trim()).filter(Boolean))];
      await tx.interchangeableGroupPriceType.deleteMany({ where: { group_id: id } });
      if (priceTypes.length) {
        await tx.interchangeableGroupPriceType.createMany({
          data: priceTypes.map((price_type) => ({ group_id: id, price_type }))
        });
      }
    }

    return tx.interchangeableProductGroup.findFirstOrThrow({ where: { id } });
  });
}

export async function deleteInterchangeableProductGroup(tenantId: number, id: number) {
  const row = await prisma.interchangeableProductGroup.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw new Error("NOT_FOUND");
  await prisma.interchangeableProductGroup.delete({ where: { id } });
}

export async function getInterchangeableProductGroup(
  tenantId: number,
  id: number
): Promise<InterchangeableGroupRow | null> {
  const g = await prisma.interchangeableProductGroup.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      products: {
        include: {
          product: { select: { id: true, sku: true, name: true } }
        }
      },
      price_type_links: true
    }
  });
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    code: g.code,
    sort_order: g.sort_order,
    comment: g.comment,
    is_active: g.is_active,
    created_at: g.created_at,
    updated_at: g.updated_at,
    products: g.products.map((l) => l.product),
    price_types: g.price_type_links.map((p) => p.price_type)
  };
}
