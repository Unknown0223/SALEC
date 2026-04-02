import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

export async function listWarehousesForTenant(tenantId: number) {
  return prisma.warehouse.findMany({
    where: { tenant_id: tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, address: true }
  });
}

export async function createWarehouseRow(
  tenantId: number,
  input: { name: string; type?: string | null; address?: string | null },
  actorUserId: number | null = null
) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("EMPTY_NAME");
  }
  const dup = await prisma.warehouse.findFirst({
    where: { tenant_id: tenantId, name: { equals: name, mode: "insensitive" } }
  });
  if (dup) {
    throw new Error("NAME_EXISTS");
  }
  const row = await prisma.warehouse.create({
    data: {
      tenant_id: tenantId,
      name,
      type: input.type?.trim() || null,
      address: input.address?.trim() || null
    },
    select: { id: true, name: true, type: true, address: true }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.warehouse,
    entityId: row.id,
    action: "create",
    payload: { name: row.name, type: row.type, address: row.address }
  });
  return row;
}

export async function updateWarehouseRow(
  tenantId: number,
  warehouseId: number,
  patch: { name?: string; type?: string | null; address?: string | null },
  actorUserId: number | null = null
) {
  const existing = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  const data: { name?: string; type?: string | null; address?: string | null } = {};
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) {
      throw new Error("EMPTY_NAME");
    }
    const dup = await prisma.warehouse.findFirst({
      where: {
        tenant_id: tenantId,
        name: { equals: t, mode: "insensitive" },
        NOT: { id: warehouseId }
      }
    });
    if (dup) {
      throw new Error("NAME_EXISTS");
    }
    data.name = t;
  }
  if (patch.type !== undefined) {
    data.type = patch.type === null || patch.type === "" ? null : patch.type.trim();
  }
  if (patch.address !== undefined) {
    data.address = patch.address === null || patch.address === "" ? null : patch.address.trim();
  }
  if (Object.keys(data).length === 0) {
    throw new Error("EMPTY_PATCH");
  }
  const updated = await prisma.warehouse.update({
    where: { id: warehouseId },
    data,
    select: { id: true, name: true, type: true, address: true }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.warehouse,
    entityId: updated.id,
    action: "update",
    payload: data
  });
  return updated;
}

export async function deleteWarehouseRow(
  tenantId: number,
  warehouseId: number,
  actorUserId: number | null = null
): Promise<void> {
  const row = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenant_id: tenantId }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const stockN = await prisma.stock.count({
    where: { tenant_id: tenantId, warehouse_id: warehouseId }
  });
  if (stockN > 0) {
    throw new Error("HAS_STOCK");
  }
  const orderN = await prisma.order.count({
    where: { tenant_id: tenantId, warehouse_id: warehouseId }
  });
  if (orderN > 0) {
    throw new Error("HAS_ORDERS");
  }
  await prisma.warehouse.delete({ where: { id: warehouseId } });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.warehouse,
    entityId: warehouseId,
    action: "delete",
    payload: { name: row.name }
  });
}

export async function listUsersForOrderAgent(tenantId: number) {
  return prisma.user.findMany({
    where: { tenant_id: tenantId, is_active: true, role: { not: "supervisor" } },
    orderBy: { login: "asc" },
    select: { id: true, login: true, name: true, role: true, supervisor_user_id: true }
  });
}

export type ProductCategoryListRow = {
  id: number;
  name: string;
  parent_id: number | null;
  code: string | null;
  sort_order: number | null;
  default_unit: string | null;
  is_active: boolean;
  comment: string | null;
  created_at: Date;
};

async function depthFromRoot(tenantId: number, id: number): Promise<number> {
  let d = 0;
  let cur = await prisma.productCategory.findFirst({
    where: { id, tenant_id: tenantId },
    select: { parent_id: true }
  });
  while (cur?.parent_id != null) {
    d++;
    cur = await prisma.productCategory.findFirst({
      where: { id: cur.parent_id, tenant_id: tenantId },
      select: { parent_id: true }
    });
    if (d > 20) throw new Error("BAD_CHAIN");
  }
  return d;
}

async function maxDepthBelow(tenantId: number, rootId: number): Promise<number> {
  const children = await prisma.productCategory.findMany({
    where: { tenant_id: tenantId, parent_id: rootId },
    select: { id: true }
  });
  if (children.length === 0) return 0;
  let m = 0;
  for (const ch of children) {
    m = Math.max(m, 1 + (await maxDepthBelow(tenantId, ch.id)));
  }
  return m;
}

async function assertParentAllowed(tenantId: number, parentId: number | null): Promise<void> {
  if (parentId == null) return;
  const d = await depthFromRoot(tenantId, parentId);
  if (d > 1) {
    throw new Error("BAD_PARENT");
  }
}

function normalizeCategoryCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const u = raw.trim().toUpperCase();
  if (!u) return null;
  if (!/^[A-Z0-9_]+$/.test(u)) {
    throw new Error("BAD_CODE");
  }
  return u.slice(0, 24);
}

export async function listProductCategoriesForTenant(tenantId: number): Promise<ProductCategoryListRow[]> {
  const rows = await prisma.productCategory.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      name: true,
      parent_id: true,
      code: true,
      sort_order: true,
      default_unit: true,
      is_active: true,
      comment: true,
      created_at: true
    }
  });
  return [...rows].sort((a, b) => {
    const ao = a.sort_order ?? 1_000_000;
    const bo = b.sort_order ?? 1_000_000;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, "uz");
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
  input: {
    name: string;
    parent_id?: number | null;
    code?: string | null;
    sort_order?: number | null;
    default_unit?: string | null;
    is_active?: boolean;
    comment?: string | null;
  },
  actorUserId: number | null = null
): Promise<ProductCategoryListRow> {
  const trimmed = input.name.trim();
  if (!trimmed) {
    throw new Error("EMPTY_NAME");
  }
  const parentId = input.parent_id ?? null;
  await assertParentAllowed(tenantId, parentId);
  if (parentId != null) {
    const p = await prisma.productCategory.findFirst({
      where: { id: parentId, tenant_id: tenantId }
    });
    if (!p) {
      throw new Error("BAD_PARENT");
    }
  }
  let code: string | null = null;
  try {
    code = normalizeCategoryCode(input.code ?? null);
  } catch {
    throw new Error("BAD_CODE");
  }
  const row = await prisma.productCategory.create({
    data: {
      tenant_id: tenantId,
      name: trimmed,
      parent_id: parentId,
      code,
      sort_order: input.sort_order ?? null,
      default_unit: input.default_unit?.trim() || null,
      is_active: input.is_active ?? true,
      comment: input.comment?.trim() || null
    },
    select: {
      id: true,
      name: true,
      parent_id: true,
      code: true,
      sort_order: true,
      default_unit: true,
      is_active: true,
      comment: true,
      created_at: true
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product_category,
    entityId: row.id,
    action: "create",
    payload: { name: row.name, parent_id: row.parent_id }
  });
  return row;
}

export async function updateProductCategoryRow(
  tenantId: number,
  id: number,
  patch: {
    name?: string;
    parent_id?: number | null;
    code?: string | null;
    sort_order?: number | null;
    default_unit?: string | null;
    is_active?: boolean;
    comment?: string | null;
  },
  actorUserId: number | null = null
): Promise<ProductCategoryListRow> {
  const existing = await prisma.productCategory.findFirst({ where: { id, tenant_id: tenantId } });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  const data: {
    name?: string;
    parent_id?: number | null;
    code?: string | null;
    sort_order?: number | null;
    default_unit?: string | null;
    is_active?: boolean;
    comment?: string | null;
  } = {};
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) {
      throw new Error("EMPTY_NAME");
    }
    data.name = t;
  }
  if (patch.code !== undefined) {
    try {
      data.code = normalizeCategoryCode(patch.code);
    } catch {
      throw new Error("BAD_CODE");
    }
  }
  if (patch.sort_order !== undefined) {
    data.sort_order = patch.sort_order;
  }
  if (patch.default_unit !== undefined) {
    data.default_unit = patch.default_unit?.trim() || null;
  }
  if (patch.is_active !== undefined) {
    data.is_active = patch.is_active;
  }
  if (patch.comment !== undefined) {
    data.comment = patch.comment?.trim() || null;
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
      let walk: { id: number; parent_id: number | null } | null = p;
      while (walk != null) {
        if (walk.id === id) {
          throw new Error("BAD_PARENT");
        }
        if (walk.parent_id == null) break;
        walk = await prisma.productCategory.findFirst({
          where: { id: walk.parent_id, tenant_id: tenantId },
          select: { id: true, parent_id: true }
        });
      }
      const dP = await depthFromRoot(tenantId, patch.parent_id);
      const below = await maxDepthBelow(tenantId, id);
      if (dP + 1 + below > 2) {
        throw new Error("BAD_PARENT");
      }
      data.parent_id = patch.parent_id;
    }
  }
  if (Object.keys(data).length === 0) {
    throw new Error("EMPTY_PATCH");
  }
  const updated = await prisma.productCategory.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      parent_id: true,
      code: true,
      sort_order: true,
      default_unit: true,
      is_active: true,
      comment: true,
      created_at: true
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product_category,
    entityId: updated.id,
    action: "update",
    payload: data
  });
  return updated;
}

export async function deleteProductCategoryRow(
  tenantId: number,
  id: number,
  actorUserId: number | null = null
): Promise<void> {
  const row = await prisma.productCategory.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const nChild = await prisma.productCategory.count({
    where: { tenant_id: tenantId, parent_id: id }
  });
  if (nChild > 0) {
    throw new Error("HAS_CHILDREN");
  }
  const n = await prisma.product.count({
    where: { tenant_id: tenantId, category_id: id }
  });
  if (n > 0) {
    throw new Error("CATEGORY_IN_USE");
  }
  await prisma.productCategory.delete({ where: { id } });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.product_category,
    entityId: id,
    action: "delete",
    payload: { name: row.name }
  });
}
