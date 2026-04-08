import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

// ── Types ────────────────────────────────────────────────────────────────

export type ExpenseListQuery = {
  page: number;
  limit: number;
  status?: string;
  expense_type?: string;
  agent_id?: number | null;
  warehouse_id?: number | null;
  from?: Date | string;
  to?: Date | string;
};

export type ExpenseListRow = {
  id: number;
  expense_type: string;
  agent_id: number | null;
  agent_name: string | null;
  amount: string;
  currency: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  status: string;
  note: string | null;
  expense_date: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
  approved_by_user_id: number | null;
  approved_by_name: string | null;
  rejection_note: string | null;
  created_at: string;
};

export type CreateExpenseInput = {
  expense_type: string;
  agent_id?: number | null;
  amount: number;
  currency?: string;
  warehouse_id?: number | null;
  note?: string | null;
  expense_date?: Date;
};

export type ExpenseSummaryItem = {
  key: string;
  label: string;
  count: number;
  total: string;
};

export type ExpenseSummaryByType = ExpenseSummaryItem[];
export type ExpenseSummaryByAgent = ExpenseSummaryItem[];

export type PnlReport = {
  revenue: string;
  total_expenses_approved: string;
  total_expenses_draft: string;
  net_profit: string;
  period_from?: string;
  period_to?: string;
};

// ── Validation helpers ───────────────────────────────────────────────────

async function assertTenantAccess(tenantId: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !tenant.is_active) {
    throw new Error("TENANT_NOT_FOUND");
  }
  return tenant;
}

// ── Name resolution helper ───────────────────────────────────────────────

/** Resolve user/warehouse names for a list of expenses */
async function resolveNames(expenses: Array<{
  id: number; agent_id: number | null; warehouse_id: number | null;
  created_by_user_id: number | null; approved_by_user_id: number | null;
}>) {
  const userIds = new Set<number>();
  const warehouseIds = new Set<number>();
  for (const e of expenses) {
    if (e.agent_id) userIds.add(e.agent_id);
    if (e.created_by_user_id) userIds.add(e.created_by_user_id);
    if (e.approved_by_user_id) userIds.add(e.approved_by_user_id);
    if (e.warehouse_id) warehouseIds.add(e.warehouse_id);
  }

  const [users, warehouses] = await Promise.all([
    userIds.size > 0 ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
    warehouseIds.size > 0 ? prisma.warehouse.findMany({ where: { id: { in: [...warehouseIds] } }, select: { id: true, name: true } }) : Promise.resolve([])
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));
  return { userMap, whMap };
}

function enrichExpense(
  expense: { id: number; expense_type: string; agent_id: number | null; amount: Prisma.Decimal; currency: string; warehouse_id: number | null; status: string; note: string | null; expense_date: Date; created_by_user_id: number | null; approved_by_user_id: number | null; rejection_note: string | null; created_at: Date },
  userMap: Map<number, string>,
  whMap: Map<number, string>
): ExpenseListRow {
  return {
    id: expense.id,
    expense_type: expense.expense_type,
    agent_id: expense.agent_id,
    agent_name: expense.agent_id != null ? (userMap.get(expense.agent_id) ?? null) : null,
    amount: expense.amount.toString(),
    currency: expense.currency,
    warehouse_id: expense.warehouse_id,
    warehouse_name: expense.warehouse_id != null ? (whMap.get(expense.warehouse_id) ?? null) : null,
    status: expense.status,
    note: expense.note,
    expense_date: expense.expense_date.toISOString(),
    created_by_user_id: expense.created_by_user_id,
    created_by_name: expense.created_by_user_id != null ? (userMap.get(expense.created_by_user_id) ?? null) : null,
    approved_by_user_id: expense.approved_by_user_id,
    approved_by_name: expense.approved_by_user_id != null ? (userMap.get(expense.approved_by_user_id) ?? null) : null,
    rejection_note: expense.rejection_note,
    created_at: expense.created_at.toISOString()
  };
}

// ── List expenses with pagination and filters ────────────────────────────

export async function listExpenses(
  tenantId: number,
  q: ExpenseListQuery
): Promise<{ data: ExpenseListRow[]; total: number; page: number; limit: number }> {
  await assertTenantAccess(tenantId);

  const where: Prisma.ExpenseWhereInput = { tenant_id: tenantId };

  if (q.status) where.status = q.status;
  if (q.expense_type) where.expense_type = q.expense_type;
  if (q.agent_id != null) where.agent_id = q.agent_id;
  if (q.warehouse_id != null) where.warehouse_id = q.warehouse_id;
  if (q.from || q.to) {
    where.expense_date = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {})
    };
  }

  const [total, rows] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      orderBy: { expense_date: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit
    })
  ]);

  const { userMap, whMap } = await resolveNames(rows);

  return {
    total,
    page: q.page,
    limit: q.limit,
    data: rows.map((row) => enrichExpense(row, userMap, whMap))
  };
}

// ── Create expense (auto "draft" status) ─────────────────────────────────

export async function createExpense(
  tenantId: number,
  input: CreateExpenseInput,
  actorUserId: number | null
): Promise<ExpenseListRow> {
  await assertTenantAccess(tenantId);

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("BAD_AMOUNT");
  }

  const type = input.expense_type.trim();
  if (!type) throw new Error("BAD_EXPENSE_TYPE");

  if (input.agent_id != null && input.agent_id > 0) {
    const agent = await prisma.user.findFirst({
      where: { id: input.agent_id, tenant_id: tenantId }
    });
    if (!agent) throw new Error("BAD_AGENT");
  }

  if (input.warehouse_id != null && input.warehouse_id > 0) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }

  const amountDec = new Prisma.Decimal(input.amount);
  const uid = actorUserId != null && actorUserId > 0 ? actorUserId : null;
  const expenseDate = input.expense_date ?? new Date();

  const expense = await prisma.expense.create({
    data: {
      tenant_id: tenantId,
      expense_type: type,
      agent_id: input.agent_id != null && input.agent_id > 0 ? input.agent_id : null,
      amount: amountDec,
      currency: input.currency || "UZS",
      warehouse_id: input.warehouse_id != null && input.warehouse_id > 0 ? input.warehouse_id : null,
      status: "draft",
      note: input.note?.trim() || null,
      expense_date: expenseDate,
      created_by_user_id: uid
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId: uid,
    entityType: AuditEntityType.finance,
    entityId: String(expense.id),
    action: "expense.create",
    payload: { expense_id: expense.id, amount: input.amount, expense_type: type, status: "draft" }
  });

  const { userMap, whMap } = await resolveNames([{
    id: expense.id, agent_id: expense.agent_id, warehouse_id: expense.warehouse_id,
    created_by_user_id: expense.created_by_user_id, approved_by_user_id: expense.approved_by_user_id
  }]);
  return enrichExpense(expense, userMap, whMap);
}

// ── Update expense ───────────────────────────────────────────────────────

export async function updateExpense(
  tenantId: number,
  expenseId: number,
  input: Partial<CreateExpenseInput>,
  actorUserId: number | null
): Promise<ExpenseListRow> {
  await assertTenantAccess(tenantId);

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, tenant_id: tenantId }
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "draft") throw new Error("CANNOT_EDIT_NON_DRAFT");

  if (input.amount != null && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    throw new Error("BAD_AMOUNT");
  }

  const updateData: Prisma.ExpenseUpdateInput = {};
  if (input.expense_type) updateData.expense_type = input.expense_type.trim();
  if (input.amount != null) updateData.amount = new Prisma.Decimal(input.amount);
  if (input.currency) updateData.currency = input.currency;
  if (input.agent_id != null) {
    if (input.agent_id > 0) {
      const agent = await prisma.user.findFirst({
        where: { id: input.agent_id, tenant_id: tenantId }
      });
      if (!agent) throw new Error("BAD_AGENT");
    }
    updateData.agent_id = input.agent_id > 0 ? input.agent_id : null;
  }
  if (input.warehouse_id != null) {
    if (input.warehouse_id > 0) {
      const wh = await prisma.warehouse.findFirst({
        where: { id: input.warehouse_id, tenant_id: tenantId }
      });
      if (!wh) throw new Error("BAD_WAREHOUSE");
    }
    updateData.warehouse_id = input.warehouse_id > 0 ? input.warehouse_id : null;
  }
  if (input.note !== undefined) updateData.note = input.note?.trim() || null;
  if (input.expense_date) updateData.expense_date = input.expense_date;

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data: updateData
  });

  const { userMap, whMap } = await resolveNames([{
    id: expense.id, agent_id: expense.agent_id, warehouse_id: expense.warehouse_id,
    created_by_user_id: expense.created_by_user_id, approved_by_user_id: expense.approved_by_user_id
  }]);
  return enrichExpense(expense, userMap, whMap);
}

// ── Delete expense ───────────────────────────────────────────────────────

export async function deleteExpense(
  tenantId: number,
  expenseId: number,
  actorUserId: number | null
): Promise<void> {
  await assertTenantAccess(tenantId);

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, tenant_id: tenantId }
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "draft") throw new Error("CANNOT_DELETE_NON_DRAFT");

  await prisma.expense.delete({ where: { id: expenseId } });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.finance,
    entityId: String(expenseId),
    action: "expense.delete",
    payload: { expense_id: expenseId }
  });
}

// ── Approve expense (draft → approved) ───────────────────────────────────

export async function approveExpense(
  tenantId: number,
  expenseId: number,
  approverId: number
): Promise<ExpenseListRow> {
  await assertTenantAccess(tenantId);

  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findFirst({
      where: { id: expenseId, tenant_id: tenantId }
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "draft") throw new Error("ALREADY_PROCESSED");

    return tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "approved",
        approved_by_user_id: approverId
      }
    });
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId: approverId,
    entityType: AuditEntityType.finance,
    entityId: String(expenseId),
    action: "expense.approve",
    payload: { expense_id: expenseId, amount: expense.amount.toString() }
  });

  const { userMap, whMap } = await resolveNames([{
    id: expense.id, agent_id: expense.agent_id, warehouse_id: expense.warehouse_id,
    created_by_user_id: expense.created_by_user_id, approved_by_user_id: expense.approved_by_user_id
  }]);
  return enrichExpense(expense, userMap, whMap);
}

// ── Reject expense (draft → rejected) ────────────────────────────────────

export async function rejectExpense(
  tenantId: number,
  expenseId: number,
  approverId: number,
  note: string
): Promise<ExpenseListRow> {
  await assertTenantAccess(tenantId);

  if (!note.trim()) throw new Error("REJECTION_NOTE_REQUIRED");

  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findFirst({
      where: { id: expenseId, tenant_id: tenantId }
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "draft") throw new Error("ALREADY_PROCESSED");

    return tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "rejected",
        approved_by_user_id: approverId,
        rejection_note: note.trim()
      }
    });
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId: approverId,
    entityType: AuditEntityType.finance,
    entityId: String(expenseId),
    action: "expense.reject",
    payload: { expense_id: expenseId, rejection_note: note.trim() }
  });

  const { userMap, whMap } = await resolveNames([{
    id: expense.id, agent_id: expense.agent_id, warehouse_id: expense.warehouse_id,
    created_by_user_id: expense.created_by_user_id, approved_by_user_id: expense.approved_by_user_id
  }]);
  return enrichExpense(expense, userMap, whMap);
}

// ── Get a single expense ─────────────────────────────────────────────────

export async function getExpense(
  tenantId: number,
  expenseId: number
): Promise<ExpenseListRow> {
  await assertTenantAccess(tenantId);

  const row = await prisma.expense.findFirst({
    where: { id: expenseId, tenant_id: tenantId }
  });
  if (!row) throw new Error("NOT_FOUND");

  const { userMap, whMap } = await resolveNames([{
    id: row.id, agent_id: row.agent_id, warehouse_id: row.warehouse_id,
    created_by_user_id: row.created_by_user_id, approved_by_user_id: row.approved_by_user_id
  }]);
  return enrichExpense(row, userMap, whMap);
}

// ── Get expense summary ──────────────────────────────────────────────────

export async function getExpenseSummary(
  tenantId: number,
  from?: Date | string,
  to?: Date | string
): Promise<{ byType: ExpenseSummaryByType; byAgent: ExpenseSummaryByAgent }> {
  await assertTenantAccess(tenantId);

  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  const where: Prisma.ExpenseWhereInput = {
    tenant_id: tenantId,
    ...(Object.keys(dateFilter).length > 0 ? { expense_date: dateFilter } : {})
  };

  const allExpenses = await prisma.expense.findMany({
    where,
    select: {
      id: true,
      expense_type: true,
      amount: true,
      agent_id: true,
      status: true
    }
  });

  // Group by type
  const typeMap = new Map<string, { count: number; total: Prisma.Decimal }>();
  for (const e of allExpenses) {
    const entry = typeMap.get(e.expense_type);
    if (!entry) {
      typeMap.set(e.expense_type, { count: 1, total: e.amount });
    } else {
      entry.count++;
      entry.total = entry.total.add(e.amount);
    }
  }
  const byType: ExpenseSummaryByType = Array.from(typeMap.entries())
    .map(([key, v]) => ({
      key,
      label: key,
      count: v.count,
      total: v.total.toString()
    }))
    .sort((a, b) => b.total.localeCompare(a.total));

  // Group by agent
  const agentMap = new Map<number | null, { count: number; total: Prisma.Decimal }>();
  for (const e of allExpenses) {
    const entry = agentMap.get(e.agent_id);
    if (!entry) {
      agentMap.set(e.agent_id, { count: 1, total: e.amount });
    } else {
      entry.count++;
      entry.total = entry.total.add(e.amount);
    }
  }
  const agentIds = Array.from(agentMap.keys()).filter((k) => k !== null) as number[];
  const agents =
    agentIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true }
        })
      : [];
  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  const byAgent: ExpenseSummaryByAgent = Array.from(agentMap.entries())
    .map(([key, v]) => ({
      key: key === null ? "unassigned" : String(key),
      label: key === null ? "Unassigned" : agentNameMap.get(key) || `Agent #${key}`,
      count: v.count,
      total: v.total.toString()
    }))
    .sort((a, b) => b.total.localeCompare(a.total));

  return { byType, byAgent };
}

// ── Get P&L Report ───────────────────────────────────────────────────────

export async function getPnlReport(
  tenantId: number,
  from?: Date | string,
  to?: Date | string
): Promise<PnlReport> {
  await assertTenantAccess(tenantId);

  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  const revenueResult = await prisma.order.aggregate({
    _sum: { total_sum: true },
    where: {
      tenant_id: tenantId,
      ...(Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {})
    }
  });
  const revenue = revenueResult._sum.total_sum ?? new Prisma.Decimal(0);

  const expensesWhere: Prisma.ExpenseWhereInput = {
    tenant_id: tenantId,
    ...(Object.keys(dateFilter).length > 0 ? { expense_date: dateFilter } : {})
  };

  const [approvedResult, draftResult] = await Promise.all([
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { amount: true },
      where: { ...expensesWhere, status: "approved" }
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { amount: true },
      where: { ...expensesWhere, status: "draft" }
    })
  ]);

  const totalApproved = approvedResult._sum.amount ?? new Prisma.Decimal(0);
  const totalDraft = draftResult._sum.amount ?? new Prisma.Decimal(0);
  const netProfit = revenue.sub(totalApproved);

  return {
    revenue: revenue.toString(),
    total_expenses_approved: totalApproved.toString(),
    total_expenses_draft: totalDraft.toString(),
    net_profit: netProfit.toString(),
    period_from: from ? new Date(from).toISOString() : undefined,
    period_to: to ? new Date(to).toISOString() : undefined
  };
}
