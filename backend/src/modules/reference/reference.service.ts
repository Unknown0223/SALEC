import { prisma } from "../../config/database";

export async function listWarehousesForTenant(tenantId: number) {
  return prisma.warehouse.findMany({
    where: { tenant_id: tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
}

export async function listUsersForOrderAgent(tenantId: number) {
  return prisma.user.findMany({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { login: "asc" },
    select: { id: true, login: true, name: true, role: true }
  });
}

export async function listProductCategoriesForTenant(tenantId: number) {
  return prisma.productCategory.findMany({
    where: { tenant_id: tenantId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, parent_id: true }
  });
}

export async function listDistinctPriceTypesForTenant(tenantId: number): Promise<string[]> {
  const rows = await prisma.productPrice.findMany({
    where: { tenant_id: tenantId },
    distinct: ["price_type"],
    select: { price_type: true },
    orderBy: { price_type: "asc" }
  });
  return rows.map((r) => r.price_type);
}

export async function createProductCategoryRow(
  tenantId: number,
  name: string,
  parentId: number | null | undefined
) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("EMPTY_NAME");
  }
  if (parentId != null) {
    const p = await prisma.productCategory.findFirst({
      where: { id: parentId, tenant_id: tenantId }
    });
    if (!p) {
      throw new Error("BAD_PARENT");
    }
  }
  return prisma.productCategory.create({
    data: {
      tenant_id: tenantId,
      name: trimmed,
      parent_id: parentId ?? null
    },
    select: { id: true, name: true, parent_id: true }
  });
}

export async function updateProductCategoryRow(
  tenantId: number,
  id: number,
  patch: { name?: string; parent_id?: number | null }
) {
  const row = await prisma.productCategory.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const data: { name?: string; parent_id?: number | null } = {};
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) {
      throw new Error("EMPTY_NAME");
    }
    data.name = t;
  }
  if (patch.parent_id !== undefined) {
    if (patch.parent_id === null) {
      data.parent_id = null;
    } else {
      if (patch.parent_id === id) {
        throw new Error("BAD_PARENT");
      }
      const p = await prisma.productCategory.findFirst({
        where: { id: patch.parent_id, tenant_id: tenantId }
      });
      if (!p) {
        throw new Error("BAD_PARENT");
      }
      data.parent_id = patch.parent_id;
    }
  }
  if (Object.keys(data).length === 0) {
    throw new Error("EMPTY_PATCH");
  }
  return prisma.productCategory.update({
    where: { id },
    data,
    select: { id: true, name: true, parent_id: true }
  });
}

export async function deleteProductCategoryRow(tenantId: number, id: number): Promise<void> {
  const row = await prisma.productCategory.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const n = await prisma.product.count({
    where: { tenant_id: tenantId, category_id: id }
  });
  if (n > 0) {
    throw new Error("CATEGORY_IN_USE");
  }
  await prisma.productCategory.delete({ where: { id } });
}
