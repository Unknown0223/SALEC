import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { getRedisForApp } from "../../lib/redis-cache";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import {
  priceTypeEntriesFromUnknown,
  priceTypeKey,
  resolveCurrencyEntries,
  resolvePaymentMethodEntries,
  uniqueSortedPriceTypeKeys
} from "../tenant-settings/finance-refs";

function settingsRefRecord(tenantId: number): Promise<Record<string, unknown>> {
  return prisma.tenant
    .findUnique({ where: { id: tenantId }, select: { settings: true } })
    .then((row) => {
      const st = row?.settings;
      if (st != null && typeof st === "object" && !Array.isArray(st)) {
        const refs = (st as Record<string, unknown>).references;
        if (refs != null && typeof refs === "object" && !Array.isArray(refs)) {
          return refs as Record<string, unknown>;
        }
      }
      return {};
    });
}

export async function listWarehousesForTenant(
  tenantId: number,
  opts?: { allowed_ids?: number[] }
) {
  const where: Prisma.WarehouseWhereInput = { tenant_id: tenantId };
  if (opts?.allowed_ids !== undefined) {
    where.id = { in: opts.allowed_ids };
  }
  return prisma.warehouse.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      stock_purpose: true,
      code: true,
      address: true,
      payment_method: true,
      van_selling: true,
      is_active: true
    }
  });
}

export type WarehouseTableRow = {
  id: number;
  name: string;
  type: string | null;
  stock_purpose: string;
  code: string | null;
  address: string | null;
  payment_method: string | null;
  van_selling: boolean;
  is_active: boolean;
  breakdown: { role: string; count: number }[];
  user_total: number;
};

/** Kassadagi kabi ombor bog‘lanish rollari + agent ustuni */
export const WAREHOUSE_LINK_ROLES = [
  "agent",
  "cashier",
  "manager",
  "operator",
  "storekeeper",
  "supervisor",
  "expeditor"
] as const;
export type WarehouseLinkRole = (typeof WAREHOUSE_LINK_ROLES)[number];

const ROLE_FOR_WAREHOUSE_LINK: Record<WarehouseLinkRole, string> = {
  agent: "agent",
  cashier: "operator",
  manager: "operator",
  operator: "operator",
  storekeeper: "operator",
  supervisor: "supervisor",
  expeditor: "expeditor"
};

export async function assertWarehouseLinkRoles(
  tenantId: number,
  links: { user_id: number; link_role: string }[]
) {
  if (!links.length) return;
  const userIds = [...new Set(links.map((l) => l.user_id))];
  const users = await prisma.user.findMany({
    where: { tenant_id: tenantId, id: { in: userIds } },
    select: { id: true, role: true }
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const l of links) {
    const u = byId.get(l.user_id);
    if (!u) throw new Error("UserNotFound");
    const role = l.link_role as WarehouseLinkRole;
    if (!WAREHOUSE_LINK_ROLES.includes(role)) throw new Error("InvalidLinkRole");
    const need = ROLE_FOR_WAREHOUSE_LINK[role];
    if (u.role !== need) throw new Error("UserRoleMismatch");
  }
}

export async function listWarehousePickers(tenantId: number) {
  const [agents, operators, supervisors, expeditors] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "agent" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    }),
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "operator" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    }),
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "supervisor" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    }),
    prisma.user.findMany({
      where: { tenant_id: tenantId, is_active: true, role: "expeditor" },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }, { login: "asc" }]
    })
  ]);
  return { agents, operators, supervisors, expeditors };
}

const warehouseDetailSelect = {
  id: true,
  name: true,
  type: true,
  stock_purpose: true,
  code: true,
  address: true,
  payment_method: true,
  van_selling: true,
  is_active: true,
  links: {
    select: {
      link_role: true,
      user: { select: { id: true, name: true, login: true } }
    }
  }
} as const;

export async function getWarehouseDetail(tenantId: number, id: number) {
  return prisma.warehouse.findFirst({
    where: { id, tenant_id: tenantId },
    select: warehouseDetailSelect
  });
}

/** Jadval / sklad UI: sahifalash, qidiruv, foydalanuvchilar rollari bo‘yicha soni */
export async function listWarehousesTable(
  tenantId: number,
  opts: { is_active?: boolean; q?: string; page: number; limit: number }
): Promise<{ data: WarehouseTableRow[]; total: number; page: number; limit: number }> {
  const where: Prisma.WarehouseWhereInput = { tenant_id: tenantId };
  if (opts.is_active !== undefined) where.is_active = opts.is_active;
  const q = (opts.q ?? "").trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { type: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { payment_method: { contains: q, mode: "insensitive" } }
    ];
  }
  const skip = (opts.page - 1) * opts.limit;
  const [total, rows] = await Promise.all([
    prisma.warehouse.count({ where }),
    prisma.warehouse.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip,
      take: opts.limit,
      select: {
        id: true,
        name: true,
        type: true,
        stock_purpose: true,
        code: true,
        address: true,
        payment_method: true,
        van_selling: true,
        is_active: true
      }
    })
  ]);

  const ids = rows.map((r) => r.id);
  const statsByWh = new Map<number, Map<string, number>>();
  for (const wid of ids) statsByWh.set(wid, new Map());

  if (ids.length > 0) {
    const grouped = await prisma.warehouseUserLink.groupBy({
      by: ["warehouse_id", "link_role"],
      where: { warehouse_id: { in: ids } },
      _count: { _all: true }
    });
    for (const g of grouped) {
      const m = statsByWh.get(g.warehouse_id);
      if (m) m.set(g.link_role, g._count._all);
    }
  }

  const data: WarehouseTableRow[] = rows.map((row) => {
    const roleMap = statsByWh.get(row.id)!;
    const breakdown = [...roleMap.entries()]
      .map(([role, count]) => ({ role, count }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
    const user_total = breakdown.reduce((s, x) => s + x.count, 0);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      stock_purpose: row.stock_purpose,
      code: row.code,
      address: row.address,
      payment_method: row.payment_method,
      van_selling: row.van_selling,
      is_active: row.is_active,
      breakdown,
      user_total
    };
  });

  return { data, total, page: opts.page, limit: opts.limit };
}

const STOCK_PURPOSE_VALUES = ["sales", "return", "reserve"] as const;

export async function createWarehouseRow(
  tenantId: number,
  input: {
    name: string;
    type?: string | null;
    stock_purpose?: (typeof STOCK_PURPOSE_VALUES)[number];
    address?: string | null;
    code?: string | null;
    payment_method?: string | null;
    van_selling?: boolean;
    is_active?: boolean;
    links?: { user_id: number; link_role: string }[];
  },
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
  const code = input.code?.trim() ? input.code.trim().slice(0, 40) : null;
  const payment_method = input.payment_method?.trim() ? input.payment_method.trim().slice(0, 200) : null;
  const links = input.links ?? [];
  await assertWarehouseLinkRoles(tenantId, links);
  const purpose =
    input.stock_purpose != null &&
    (STOCK_PURPOSE_VALUES as readonly string[]).includes(input.stock_purpose)
      ? input.stock_purpose
      : "sales";
  const row = await prisma.warehouse.create({
    data: {
      tenant_id: tenantId,
      name,
      type: input.type?.trim() || null,
      stock_purpose: purpose,
      address: input.address?.trim() || null,
      code,
      payment_method,
      van_selling: input.van_selling ?? false,
      is_active: input.is_active ?? true,
      links: {
        create: links.map((l) => ({
          user_id: l.user_id,
          link_role: l.link_role
        }))
      }
    },
    select: warehouseDetailSelect
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.warehouse,
    entityId: row.id,
    action: "create",
    payload: { name: row.name, type: row.type, address: row.address, code: row.code }
  });
  return row;
}

export async function updateWarehouseRow(
  tenantId: number,
  warehouseId: number,
  patch: {
    name?: string;
    type?: string | null;
    stock_purpose?: (typeof STOCK_PURPOSE_VALUES)[number];
    address?: string | null;
    code?: string | null;
    payment_method?: string | null;
    van_selling?: boolean;
    is_active?: boolean;
    links?: { user_id: number; link_role: string }[];
  },
  actorUserId: number | null = null
) {
  const existing = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  const data: {
    name?: string;
    type?: string | null;
    stock_purpose?: string;
    address?: string | null;
    code?: string | null;
    payment_method?: string | null;
    van_selling?: boolean;
    is_active?: boolean;
  } = {};
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
  if (patch.stock_purpose !== undefined) {
    if (!(STOCK_PURPOSE_VALUES as readonly string[]).includes(patch.stock_purpose)) {
      throw new Error("InvalidStockPurpose");
    }
    data.stock_purpose = patch.stock_purpose;
  }
  if (patch.address !== undefined) {
    data.address = patch.address === null || patch.address === "" ? null : patch.address.trim();
  }
  if (patch.code !== undefined) {
    data.code = patch.code === null || patch.code === "" ? null : patch.code.trim().slice(0, 40);
  }
  if (patch.payment_method !== undefined) {
    data.payment_method =
      patch.payment_method === null || patch.payment_method === ""
        ? null
        : patch.payment_method.trim().slice(0, 200);
  }
  if (patch.van_selling !== undefined) {
    data.van_selling = patch.van_selling;
  }
  if (patch.is_active !== undefined) {
    data.is_active = patch.is_active;
  }
  if (patch.links !== undefined) {
    await assertWarehouseLinkRoles(tenantId, patch.links);
  }
  if (Object.keys(data).length === 0 && patch.links === undefined) {
    throw new Error("EMPTY_PATCH");
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.warehouse.update({ where: { id: warehouseId }, data });
    }
    if (patch.links !== undefined) {
      await tx.warehouseUserLink.deleteMany({ where: { warehouse_id: warehouseId } });
      if (patch.links.length > 0) {
        await tx.warehouseUserLink.createMany({
          data: patch.links.map((l) => ({
            warehouse_id: warehouseId,
            user_id: l.user_id,
            link_role: l.link_role
          }))
        });
      }
    }
  });

  const updated = await getWarehouseDetail(tenantId, warehouseId);
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.warehouse,
    entityId: warehouseId,
    action: "update",
    payload: { ...data, links_updated: patch.links !== undefined }
  });
  return updated!;
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

const PRICE_TYPES_CACHE_TTL_SEC = 45;

async function computeDistinctPriceTypesForTenant(
  tenantId: number,
  kind?: "sale" | "purchase"
): Promise<string[]> {
  const rows = await prisma.productPrice.findMany({
    where: { tenant_id: tenantId },
    distinct: ["price_type"],
    select: { price_type: true },
    orderBy: { price_type: "asc" }
  });
  const fromDb = rows.map((r) => r.price_type);
  const ref = await settingsRefRecord(tenantId);
  const entries = priceTypeEntriesFromUnknown(ref.price_type_entries).filter((e) => e.active !== false);
  const filtered = kind ? entries.filter((e) => e.kind === kind) : entries;
  const fromCatalog = filtered.map((e) => priceTypeKey(e));
  return uniqueSortedPriceTypeKeys([...fromDb, ...fromCatalog]);
}

export async function listDistinctPriceTypesForTenant(
  tenantId: number,
  kind?: "sale" | "purchase"
): Promise<string[]> {
  const suffix = kind === "sale" ? "sale" : kind === "purchase" ? "purchase" : "all";
  const cacheKey = `tenant:${tenantId}:price_types:${suffix}`;
  try {
    const redis = await getRedisForApp();
    const hit = await redis.get(cacheKey);
    if (hit) {
      return JSON.parse(hit) as string[];
    }
  } catch {
    /* Redis yo‘q yoki xato — hisoblash */
  }
  const out = await computeDistinctPriceTypesForTenant(tenantId, kind);
  try {
    const redis = await getRedisForApp();
    await redis.set(cacheKey, JSON.stringify(out), "EX", PRICE_TYPES_CACHE_TTL_SEC);
  } catch {
    /* ignore */
  }
  return out;
}

export type FinancePriceOverviewRow = {
  price_type: string;
  price_type_name: string;
  payment_method: string | null;
  last_price_at: string | null;
};

export async function listFinancePriceOverview(
  tenantId: number,
  kind: "sale" | "purchase"
): Promise<FinancePriceOverviewRow[]> {
  const ref = await settingsRefRecord(tenantId);
  const currencies = resolveCurrencyEntries(ref);
  const paymentMethods = resolvePaymentMethodEntries(ref, currencies);
  const pmById = new Map(paymentMethods.map((p) => [p.id, p]));
  const allEntries = priceTypeEntriesFromUnknown(ref.price_type_entries);
  const filtered = allEntries.filter((e) => e.active !== false && e.kind === kind);

  const aggregates = await prisma.productPrice.groupBy({
    by: ["price_type"],
    where: { tenant_id: tenantId },
    _max: { updated_at: true }
  });
  const lastByType = new Map(aggregates.map((a) => [a.price_type, a._max.updated_at]));

  if (filtered.length > 0) {
    return [...filtered]
      .sort((a, b) => {
        const ao = a.sort_order ?? 1_000_000;
        const bo = b.sort_order ?? 1_000_000;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name, "uz");
      })
      .map((e) => {
        const key = priceTypeKey(e);
        const last = lastByType.get(key);
        return {
          price_type: key,
          price_type_name: e.name,
          payment_method: pmById.get(e.payment_method_id)?.name ?? null,
          last_price_at: last ? last.toISOString() : null
        };
      });
  }

  const dbTypes = await prisma.productPrice.findMany({
    where: { tenant_id: tenantId },
    distinct: ["price_type"],
    select: { price_type: true },
    orderBy: { price_type: "asc" }
  });
  return dbTypes.map((r) => {
    const last = lastByType.get(r.price_type);
    return {
      price_type: r.price_type,
      price_type_name: r.price_type,
      payment_method: null as string | null,
      last_price_at: last ? last.toISOString() : null
    };
  });
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
