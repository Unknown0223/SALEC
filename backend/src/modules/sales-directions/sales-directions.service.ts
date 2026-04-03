import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent } from "../../lib/tenant-audit";

const CODE_MAX = 20;

export function salesRefStoredValue(row: { code: string | null; name: string }): string {
  const c = row.code?.trim();
  if (c) return c;
  return row.name.trim();
}

function normCode(raw: string | null | undefined): string | null {
  const t = raw?.trim().slice(0, CODE_MAX) ?? "";
  return t ? t : null;
}

function sortRu(a: string, b: string): number {
  return a.localeCompare(b, "ru");
}

export async function listActiveTradeDirectionLabels(tenantId: number): Promise<string[]> {
  const rows = await prisma.tradeDirection.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: { code: true, name: true }
  });
  const set = new Set<string>();
  for (const r of rows) {
    const v = salesRefStoredValue(r);
    if (v) set.add(v);
  }
  return [...set].sort(sortRu);
}

export async function listActiveSalesChannelLabels(tenantId: number): Promise<string[]> {
  const rows = await prisma.salesChannelRef.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: { code: true, name: true }
  });
  const set = new Set<string>();
  for (const r of rows) {
    const v = salesRefStoredValue(r);
    if (v) set.add(v);
  }
  return [...set].sort(sortRu);
}

export type TradeDirectionRow = {
  id: number;
  name: string;
  sort_order: number;
  code: string | null;
  comment: string | null;
  is_active: boolean;
  use_in_order_proposal: boolean;
};

export async function listTradeDirections(
  tenantId: number,
  q: { is_active?: boolean; search?: string; use_in_order_proposal?: boolean }
): Promise<TradeDirectionRow[]> {
  const where: Prisma.TradeDirectionWhereInput = { tenant_id: tenantId };
  if (q.is_active !== undefined) where.is_active = q.is_active;
  if (q.use_in_order_proposal === true) where.use_in_order_proposal = true;
  const s = q.search?.trim();
  if (s) {
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } },
      { comment: { contains: s, mode: "insensitive" } }
    ];
  }
  const rows = await prisma.tradeDirection.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sort_order: r.sort_order,
    code: r.code,
    comment: r.comment,
    is_active: r.is_active,
    use_in_order_proposal: r.use_in_order_proposal
  }));
}

export async function createTradeDirection(
  tenantId: number,
  input: {
    name: string;
    sort_order?: number;
    code?: string | null;
    comment?: string | null;
    is_active?: boolean;
    use_in_order_proposal?: boolean;
  },
  actorUserId: number | null
): Promise<TradeDirectionRow> {
  const code = normCode(input.code ?? null);
  if (code) {
    const dup = await prisma.tradeDirection.findFirst({
      where: { tenant_id: tenantId, code }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }
  const row = await prisma.tradeDirection.create({
    data: {
      tenant_id: tenantId,
      name: input.name.trim(),
      sort_order: input.sort_order ?? 0,
      code,
      comment: input.comment?.trim() || null,
      is_active: input.is_active ?? true,
      use_in_order_proposal: input.use_in_order_proposal ?? false
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "trade_direction",
    entityId: row.id,
    action: "create",
    payload: { name: row.name, code: row.code }
  });
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    code: row.code,
    comment: row.comment,
    is_active: row.is_active,
    use_in_order_proposal: row.use_in_order_proposal
  };
}

export async function patchTradeDirection(
  tenantId: number,
  id: number,
  input: Partial<{
    name: string;
    sort_order: number;
    code: string | null;
    comment: string | null;
    is_active: boolean;
    use_in_order_proposal: boolean;
  }>,
  actorUserId: number | null
): Promise<TradeDirectionRow> {
  const existing = await prisma.tradeDirection.findFirst({
    where: { id, tenant_id: tenantId }
  });
  if (!existing) throw new Error("NOT_FOUND");

  const code =
    input.code !== undefined ? normCode(input.code) : (existing.code as string | null);
  if (code && input.code !== undefined) {
    const dup = await prisma.tradeDirection.findFirst({
      where: { tenant_id: tenantId, code, NOT: { id } }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }

  const row = await prisma.tradeDirection.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
      ...(input.code !== undefined ? { code } : {}),
      ...(input.comment !== undefined ? { comment: input.comment?.trim() || null } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      ...(input.use_in_order_proposal !== undefined
        ? { use_in_order_proposal: input.use_in_order_proposal }
        : {})
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "trade_direction",
    entityId: row.id,
    action: "patch",
    payload: input
  });
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    code: row.code,
    comment: row.comment,
    is_active: row.is_active,
    use_in_order_proposal: row.use_in_order_proposal
  };
}

export type SalesChannelRefRow = {
  id: number;
  name: string;
  code: string | null;
  comment: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function listSalesChannelRefs(
  tenantId: number,
  q: { is_active?: boolean; search?: string }
): Promise<SalesChannelRefRow[]> {
  const where: Prisma.SalesChannelRefWhereInput = { tenant_id: tenantId };
  if (q.is_active !== undefined) where.is_active = q.is_active;
  const s = q.search?.trim();
  if (s) {
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } }
    ];
  }
  const rows = await prisma.salesChannelRef.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    comment: r.comment,
    sort_order: r.sort_order,
    is_active: r.is_active
  }));
}

export async function createSalesChannelRef(
  tenantId: number,
  input: {
    name: string;
    code?: string | null;
    comment?: string | null;
    sort_order?: number;
    is_active?: boolean;
  },
  actorUserId: number | null
): Promise<SalesChannelRefRow> {
  const code = normCode(input.code ?? null);
  if (code) {
    const dup = await prisma.salesChannelRef.findFirst({
      where: { tenant_id: tenantId, code }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }
  const row = await prisma.salesChannelRef.create({
    data: {
      tenant_id: tenantId,
      name: input.name.trim(),
      code,
      comment: input.comment?.trim() || null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "sales_channel_ref",
    entityId: row.id,
    action: "create",
    payload: { name: row.name, code: row.code }
  });
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    comment: row.comment,
    sort_order: row.sort_order,
    is_active: row.is_active
  };
}

export async function patchSalesChannelRef(
  tenantId: number,
  id: number,
  input: Partial<{
    name: string;
    code: string | null;
    comment: string | null;
    sort_order: number;
    is_active: boolean;
  }>,
  actorUserId: number | null
): Promise<SalesChannelRefRow> {
  const existing = await prisma.salesChannelRef.findFirst({
    where: { id, tenant_id: tenantId }
  });
  if (!existing) throw new Error("NOT_FOUND");

  const code =
    input.code !== undefined ? normCode(input.code) : (existing.code as string | null);
  if (code && input.code !== undefined) {
    const dup = await prisma.salesChannelRef.findFirst({
      where: { tenant_id: tenantId, code, NOT: { id } }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }

  const row = await prisma.salesChannelRef.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
      ...(input.code !== undefined ? { code } : {}),
      ...(input.comment !== undefined ? { comment: input.comment?.trim() || null } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {})
    }
  });
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "sales_channel_ref",
    entityId: row.id,
    action: "patch",
    payload: input
  });
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    comment: row.comment,
    sort_order: row.sort_order,
    is_active: row.is_active
  };
}

export type KpiProductPreview = { id: number; name: string; sku: string };
export type KpiAgentPreview = { id: number; fio: string; code: string | null };

export type KpiGroupListRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number;
  comment: string | null;
  is_active: boolean;
  products: KpiProductPreview[];
  agents: KpiAgentPreview[];
  product_total: number;
  agent_total: number;
};

export type KpiGroupDetailRow = {
  id: number;
  name: string;
  code: string | null;
  sort_order: number;
  comment: string | null;
  is_active: boolean;
  product_ids: number[];
  agent_user_ids: number[];
};

function userFio(u: { name: string }): string {
  return u.name.trim();
}

export async function listKpiGroups(
  tenantId: number,
  q: { is_active?: boolean; search?: string }
): Promise<KpiGroupListRow[]> {
  const where: Prisma.KpiGroupWhereInput = { tenant_id: tenantId };
  if (q.is_active !== undefined) where.is_active = q.is_active;
  const s = q.search?.trim();
  if (s) {
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } },
      { comment: { contains: s, mode: "insensitive" } }
    ];
  }
  const rows = await prisma.kpiGroup.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { name: "asc" }, { id: "asc" }],
    include: {
      products: {
        take: 3,
        include: {
          product: { select: { id: true, name: true, sku: true } }
        }
      },
      agents: {
        take: 3,
        include: {
          user: { select: { id: true, name: true, code: true } }
        }
      },
      _count: { select: { products: true, agents: true } }
    }
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    sort_order: r.sort_order,
    comment: r.comment,
    is_active: r.is_active,
    products: r.products.map((x) => ({
      id: x.product.id,
      name: x.product.name,
      sku: x.product.sku
    })),
    agents: r.agents.map((x) => ({
      id: x.user.id,
      fio: userFio(x.user),
      code: x.user.code
    })),
    product_total: r._count.products,
    agent_total: r._count.agents
  }));
}

export async function getKpiGroupDetail(tenantId: number, id: number): Promise<KpiGroupDetailRow | null> {
  const row = await prisma.kpiGroup.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      products: { select: { product_id: true } },
      agents: { select: { user_id: true } }
    }
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    sort_order: row.sort_order,
    comment: row.comment,
    is_active: row.is_active,
    product_ids: row.products.map((p) => p.product_id),
    agent_user_ids: row.agents.map((a) => a.user_id)
  };
}

async function assertKpiProductIds(tenantId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const uniq = [...new Set(ids)];
  const n = await prisma.product.count({
    where: { tenant_id: tenantId, id: { in: uniq } }
  });
  if (n !== uniq.length) throw new Error("BAD_PRODUCT_IDS");
}

async function assertKpiAgentUserIds(tenantId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const uniq = [...new Set(ids)];
  const n = await prisma.user.count({
    where: { tenant_id: tenantId, id: { in: uniq }, role: "agent" }
  });
  if (n !== uniq.length) throw new Error("BAD_AGENT_IDS");
}

export async function createKpiGroup(
  tenantId: number,
  input: {
    name: string;
    code?: string | null;
    sort_order?: number;
    comment?: string | null;
    is_active?: boolean;
    product_ids?: number[];
    agent_user_ids?: number[];
  },
  actorUserId: number | null
): Promise<KpiGroupDetailRow> {
  const code = normCode(input.code ?? null);
  if (code) {
    const dup = await prisma.kpiGroup.findFirst({
      where: { tenant_id: tenantId, code }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }
  const product_ids = input.product_ids ?? [];
  const agent_user_ids = input.agent_user_ids ?? [];
  await assertKpiProductIds(tenantId, product_ids);
  await assertKpiAgentUserIds(tenantId, agent_user_ids);

  const row = await prisma.$transaction(async (tx) => {
    const g = await tx.kpiGroup.create({
      data: {
        tenant_id: tenantId,
        name: input.name.trim(),
        code,
        sort_order: input.sort_order ?? 0,
        comment: input.comment?.trim() || null,
        is_active: input.is_active ?? true
      }
    });
    if (product_ids.length) {
      await tx.kpiGroupProduct.createMany({
        data: product_ids.map((product_id) => ({ kpi_group_id: g.id, product_id }))
      });
    }
    if (agent_user_ids.length) {
      await tx.kpiGroupAgent.createMany({
        data: agent_user_ids.map((user_id) => ({ kpi_group_id: g.id, user_id }))
      });
    }
    return g;
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "kpi_group",
    entityId: row.id,
    action: "create",
    payload: { name: row.name, product_ids, agent_user_ids }
  });

  const detail = await getKpiGroupDetail(tenantId, row.id);
  if (!detail) throw new Error("NOT_FOUND");
  return detail;
}

export async function patchKpiGroup(
  tenantId: number,
  id: number,
  input: Partial<{
    name: string;
    code: string | null;
    sort_order: number;
    comment: string | null;
    is_active: boolean;
    product_ids: number[];
    agent_user_ids: number[];
  }>,
  actorUserId: number | null
): Promise<KpiGroupDetailRow> {
  const existing = await prisma.kpiGroup.findFirst({ where: { id, tenant_id: tenantId } });
  if (!existing) throw new Error("NOT_FOUND");

  const code =
    input.code !== undefined ? normCode(input.code) : (existing.code as string | null);
  if (code && input.code !== undefined) {
    const dup = await prisma.kpiGroup.findFirst({
      where: { tenant_id: tenantId, code, NOT: { id } }
    });
    if (dup) throw new Error("DUPLICATE_CODE");
  }

  if (input.product_ids !== undefined) {
    await assertKpiProductIds(tenantId, input.product_ids);
  }
  if (input.agent_user_ids !== undefined) {
    await assertKpiAgentUserIds(tenantId, input.agent_user_ids);
  }

  await prisma.$transaction(async (tx) => {
    await tx.kpiGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
        ...(input.code !== undefined ? { code } : {}),
        ...(input.comment !== undefined ? { comment: input.comment?.trim() || null } : {}),
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {})
      }
    });
    if (input.product_ids !== undefined) {
      await tx.kpiGroupProduct.deleteMany({ where: { kpi_group_id: id } });
      if (input.product_ids.length) {
        await tx.kpiGroupProduct.createMany({
          data: input.product_ids.map((product_id) => ({ kpi_group_id: id, product_id }))
        });
      }
    }
    if (input.agent_user_ids !== undefined) {
      await tx.kpiGroupAgent.deleteMany({ where: { kpi_group_id: id } });
      if (input.agent_user_ids.length) {
        await tx.kpiGroupAgent.createMany({
          data: input.agent_user_ids.map((user_id) => ({ kpi_group_id: id, user_id }))
        });
      }
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: "kpi_group",
    entityId: id,
    action: "patch",
    payload: input
  });

  const detail = await getKpiGroupDetail(tenantId, id);
  if (!detail) throw new Error("NOT_FOUND");
  return detail;
}
