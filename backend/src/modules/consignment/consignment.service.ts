import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE } from "../orders/order-status";

export type ConsignmentOutstandingOptions = {
  ignorePreviousMonthsDebt: boolean;
  /** UTC: hisobot oyi 1-kuni 00:00 */
  monthStartsAt: Date;
};

/** `YYYY-MM` yoki bo‘sh — joriy oy */
export function parseYearMonth(raw: string | undefined): { year: number; month: number } {
  const t = raw?.trim();
  if (t && /^\d{4}-\d{2}$/.test(t)) {
    const [ys, ms] = t.split("-");
    const year = Number(ys);
    const month = Number(ms);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function utcMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

/**
 * Zakaz bo‘yicha to‘langan summa: avvalo `payment_allocations`, bo‘sh bo‘lsa `order_id` li to‘lovlar.
 */
export async function computeAgentConsignmentOutstanding(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: number,
  agentId: number,
  opts: ConsignmentOutstandingOptions
): Promise<Prisma.Decimal> {
  const orders = await db.order.findMany({
    where: {
      tenant_id: tenantId,
      agent_id: agentId,
      is_consignment: true,
      order_type: "order",
      status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
    },
    select: { id: true, total_sum: true, created_at: true }
  });

  const filtered = orders.filter((o) => {
    if (!opts.ignorePreviousMonthsDebt) return true;
    return o.created_at >= opts.monthStartsAt;
  });

  if (filtered.length === 0) return new Prisma.Decimal(0);

  const ids = filtered.map((o) => o.id);
  const totalById = new Map(filtered.map((o) => [o.id, o.total_sum]));

  const allocGroups = await db.paymentAllocation.groupBy({
    by: ["order_id"],
    where: { tenant_id: tenantId, order_id: { in: ids } },
    _sum: { amount: true }
  });
  const allocMap = new Map<number, Prisma.Decimal>();
  for (const g of allocGroups) {
    if (g.order_id != null) {
      allocMap.set(g.order_id, g._sum.amount ?? new Prisma.Decimal(0));
    }
  }

  const payGroups = await db.payment.groupBy({
    by: ["order_id"],
    where: {
      tenant_id: tenantId,
      order_id: { in: ids },
      entry_kind: "payment",
      workflow_status: "confirmed",
      deleted_at: null
    },
    _sum: { amount: true }
  });
  const payMap = new Map<number, Prisma.Decimal>();
  for (const g of payGroups) {
    if (g.order_id != null) {
      payMap.set(g.order_id, g._sum.amount ?? new Prisma.Decimal(0));
    }
  }

  let outstanding = new Prisma.Decimal(0);
  for (const oid of ids) {
    const total = totalById.get(oid) ?? new Prisma.Decimal(0);
    const alloc = allocMap.get(oid) ?? new Prisma.Decimal(0);
    const paid = alloc.gt(0) ? alloc : payMap.get(oid) ?? new Prisma.Decimal(0);
    const unpaid = total.sub(paid);
    if (unpaid.gt(0)) outstanding = outstanding.add(unpaid);
  }
  return outstanding;
}

export type ConsignmentAgentRow = {
  id: number;
  code: string | null;
  name: string;
  consignment: boolean;
  consignment_limit_amount: string | null;
  consignment_ignore_previous_months_debt: boolean;
  consignment_updated_at: string | null;
  supervisor_user_id: number | null;
  supervisor_name: string | null;
  outstanding_debt: string;
  remaining_limit: string | null;
};

export type ListConsignmentAgentsQuery = {
  year_month?: string;
  supervisor_user_id?: number;
  /** `true` — faqat `supervisor_user_id === null` agentlar */
  agents_without_supervisor?: boolean;
  consignment?: "all" | "yes" | "no";
  search?: string;
};

function toFio(u: {
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  name: string;
}): string {
  const parts = [u.last_name, u.first_name, u.middle_name].filter((x) => x && x.trim().length > 0);
  return parts.length > 0 ? parts.join(" ") : u.name;
}

export async function listConsignmentAgents(
  tenantId: number,
  q: ListConsignmentAgentsQuery
): Promise<{ data: ConsignmentAgentRow[] }> {
  const { year, month } = parseYearMonth(q.year_month);
  const monthStartsAt = utcMonthStart(year, month);

  const where: Prisma.UserWhereInput = { tenant_id: tenantId, role: "agent" };
  const c = q.consignment ?? "all";
  if (c === "yes") where.consignment = true;
  else if (c === "no") where.consignment = false;
  if (q.agents_without_supervisor === true) {
    where.supervisor_user_id = null;
  } else if (q.supervisor_user_id != null && q.supervisor_user_id > 0) {
    where.supervisor_user_id = q.supervisor_user_id;
  }
  const s = q.search?.trim();
  if (s) {
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { code: { contains: s, mode: "insensitive" } },
      { first_name: { contains: s, mode: "insensitive" } },
      { last_name: { contains: s, mode: "insensitive" } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: { supervisor: { select: { name: true } } },
    orderBy: [{ code: "asc" }, { id: "asc" }]
  });

  const rows: ConsignmentAgentRow[] = [];
  for (const u of users) {
    const ignore = u.consignment_ignore_previous_months_debt;
    const outstanding = await computeAgentConsignmentOutstanding(prisma, tenantId, u.id, {
      ignorePreviousMonthsDebt: ignore,
      monthStartsAt
    });
    const limitAmt = u.consignment_limit_amount;
    let remaining: string | null = null;
    if (limitAmt != null) {
      const rem = limitAmt.sub(outstanding);
      remaining = (rem.gt(0) ? rem : new Prisma.Decimal(0)).toString();
    }
    rows.push({
      id: u.id,
      code: u.code,
      name: toFio(u),
      consignment: u.consignment,
      consignment_limit_amount: limitAmt?.toString() ?? null,
      consignment_ignore_previous_months_debt: ignore,
      consignment_updated_at: u.consignment_updated_at?.toISOString() ?? null,
      supervisor_user_id: u.supervisor_user_id,
      supervisor_name: u.supervisor?.name ?? null,
      outstanding_debt: outstanding.toString(),
      remaining_limit: remaining
    });
  }

  return { data: rows };
}

export type BulkPatchConsignmentInput = {
  user_ids: number[];
  consignment?: boolean;
  consignment_limit_amount?: string | null;
  consignment_ignore_previous_months_debt?: boolean;
};

export async function bulkPatchConsignmentAgents(
  tenantId: number,
  input: BulkPatchConsignmentInput,
  actorUserId: number | null
): Promise<{ updated: number }> {
  const ids = [...new Set(input.user_ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) throw new Error("EMPTY_IDS");
  if (ids.length > 500) throw new Error("TOO_MANY_IDS");

  const data: Prisma.UserUpdateManyMutationInput = {
    consignment_updated_at: new Date()
  };
  if (input.consignment !== undefined) data.consignment = input.consignment;
  if (input.consignment_ignore_previous_months_debt !== undefined) {
    data.consignment_ignore_previous_months_debt = input.consignment_ignore_previous_months_debt;
  }
  if (input.consignment_limit_amount !== undefined) {
    if (input.consignment_limit_amount == null || String(input.consignment_limit_amount).trim() === "") {
      data.consignment_limit_amount = null;
      data.consignment_ignore_previous_months_debt = false;
    } else {
      const d = new Prisma.Decimal(input.consignment_limit_amount);
      if (d.lt(0)) throw new Error("BAD_LIMIT");
      data.consignment_limit_amount = d;
    }
  }

  const hasField =
    input.consignment !== undefined ||
    input.consignment_limit_amount !== undefined ||
    input.consignment_ignore_previous_months_debt !== undefined;
  if (!hasField) throw new Error("EMPTY_PATCH");

  const res = await prisma.user.updateMany({
    where: { tenant_id: tenantId, role: "agent", id: { in: ids } },
    data
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: 0,
    action: "bulk.consignation",
    payload: { user_ids: ids, keys: Object.keys(data).filter((k) => k !== "consignment_updated_at") }
  });

  return { updated: res.count };
}

export type ConsignmentAgentRowPatch = {
  user_id: number;
  consignment: boolean;
  consignment_limit_amount: string | null;
  consignment_ignore_previous_months_debt: boolean;
};

/**
 * Bir nechta agent uchun konsignatsiya sozlamalarini bitta tranzaksiyada yangilash
 * (har qator uchun alohida HTTP o‘rniga bitta so‘rov).
 */
export async function bulkPatchConsignmentAgentRows(
  tenantId: number,
  rows: ConsignmentAgentRowPatch[],
  actorUserId: number | null
): Promise<{ updated: number }> {
  const seen = new Set<number>();
  const cleaned: ConsignmentAgentRowPatch[] = [];
  for (const r of rows) {
    if (!Number.isInteger(r.user_id) || r.user_id <= 0) continue;
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    cleaned.push(r);
  }
  if (cleaned.length === 0) throw new Error("EMPTY_ROWS");
  if (cleaned.length > 500) throw new Error("TOO_MANY_ROWS");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const row of cleaned) {
      let limitAmt: Prisma.Decimal | null = null;
      if (
        row.consignment_limit_amount != null &&
        String(row.consignment_limit_amount).trim() !== ""
      ) {
        const d = new Prisma.Decimal(row.consignment_limit_amount);
        if (d.lt(0)) throw new Error("BAD_LIMIT");
        limitAmt = d;
      }
      const ignoreDebt =
        limitAmt == null || !row.consignment ? false : row.consignment_ignore_previous_months_debt;

      const res = await tx.user.updateMany({
        where: { id: row.user_id, tenant_id: tenantId, role: "agent" },
        data: {
          consignment: row.consignment,
          consignment_limit_amount: limitAmt,
          consignment_ignore_previous_months_debt: ignoreDebt,
          consignment_updated_at: now
        }
      });
      if (res.count !== 1) throw new Error("BAD_AGENT_ROW");
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: 0,
    action: "bulk.consignation_rows",
    payload: { user_ids: cleaned.map((r) => r.user_id), count: cleaned.length }
  });

  return { updated: cleaned.length };
}
