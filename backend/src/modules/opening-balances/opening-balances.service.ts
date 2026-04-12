import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendClientAuditLog } from "../clients/clients.service";
import { invalidateDashboard } from "../../lib/redis-cache";

function parseUtcDayStart(isoDate: string | undefined): Date | undefined {
  if (!isoDate?.trim()) return undefined;
  const d = new Date(`${isoDate.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseUtcDayEnd(isoDate: string | undefined): Date | undefined {
  if (!isoDate?.trim()) return undefined;
  const d = new Date(`${isoDate.trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type OpeningBalanceListQuery = {
  page: number;
  limit: number;
  date_from?: string;
  date_to?: string;
  /** created_at | paid_at */
  date_field?: "created_at" | "paid_at";
  client_ids?: number[];
  payment_type?: string;
  trade_direction?: string;
  agent_id?: number;
  cash_desk_ids?: number[];
  balance_type?: "debt" | "surplus";
  amount_min?: number;
  amount_max?: number;
  search?: string;
  /** true — faqat arxiv (yumshoq o‘chirilgan) */
  archive?: boolean;
};

export type OpeningBalanceListRow = {
  id: number;
  created_at: string;
  client_id: number;
  client_name: string;
  agent_id: number | null;
  agent_name: string | null;
  trade_direction: string | null;
  cash_desk_name: string | null;
  balance_type: string;
  balance_type_label: string;
  payment_type: string;
  amount: string;
  note: string | null;
  paid_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
  deleted_by_name: string | null;
  delete_reason_ref: string | null;
};

const listInclude = {
  client: {
    select: {
      id: true,
      name: true,
      agent_id: true,
      agent: { select: { id: true, name: true, code: true } }
    }
  },
  cash_desk: { select: { name: true } },
  deleted_by: { select: { id: true, name: true } }
} satisfies Prisma.ClientOpeningBalanceEntryInclude;

function mapRow(r: Prisma.ClientOpeningBalanceEntryGetPayload<{ include: typeof listInclude }>): OpeningBalanceListRow {
  const bt = String(r.balance_type);
  const label = bt === "debt" ? "Долг" : bt === "surplus" ? "Излишек" : bt;
  const ag = r.client.agent;
  const dbid = r.deleted_by_user_id ?? null;
  return {
    id: r.id,
    created_at: r.created_at.toISOString(),
    client_id: r.client_id,
    client_name: r.client.name,
    agent_id: ag?.id ?? r.client.agent_id ?? null,
    agent_name: ag?.name ?? null,
    trade_direction: r.trade_direction?.trim() || null,
    cash_desk_name: r.cash_desk?.name ?? null,
    balance_type: bt,
    balance_type_label: label,
    payment_type: r.payment_type,
    amount: r.amount.toString(),
    note: r.note,
    paid_at: r.paid_at ? r.paid_at.toISOString() : null,
    deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
    deleted_by_user_id: dbid,
    deleted_by_name: r.deleted_by?.name ?? null,
    delete_reason_ref: r.delete_reason_ref?.trim() || null
  };
}

function buildWhere(tenantId: number, q: OpeningBalanceListQuery): Prisma.ClientOpeningBalanceEntryWhereInput {
  const andParts: Prisma.ClientOpeningBalanceEntryWhereInput[] = [{ tenant_id: tenantId }];

  if (q.archive) {
    andParts.push({ deleted_at: { not: null } });
  } else {
    andParts.push({ deleted_at: null });
  }

  if (q.client_ids != null && q.client_ids.length > 0) {
    andParts.push({ client_id: { in: q.client_ids } });
  }

  const df = parseUtcDayStart(q.date_from);
  const dt = parseUtcDayEnd(q.date_to);
  if (df || dt) {
    const field = q.date_field === "paid_at" ? "paid_at" : "created_at";
    andParts.push({
      [field]: {
        ...(df ? { gte: df } : {}),
        ...(dt ? { lte: dt } : {})
      }
    } as Prisma.ClientOpeningBalanceEntryWhereInput);
  }

  if (q.payment_type?.trim()) {
    andParts.push({ payment_type: q.payment_type.trim() });
  }
  if (q.trade_direction?.trim()) {
    andParts.push({ trade_direction: q.trade_direction.trim() });
  }
  if (q.agent_id != null && q.agent_id > 0) {
    andParts.push({ client: { agent_id: q.agent_id } });
  }
  if (q.cash_desk_ids != null && q.cash_desk_ids.length > 0) {
    andParts.push({ cash_desk_id: { in: q.cash_desk_ids } });
  }
  if (q.balance_type === "debt" || q.balance_type === "surplus") {
    andParts.push({ balance_type: q.balance_type });
  }

  if (q.amount_min != null || q.amount_max != null) {
    const decMin =
      q.amount_min != null && Number.isFinite(q.amount_min) ? new Prisma.Decimal(q.amount_min) : undefined;
    const decMax =
      q.amount_max != null && Number.isFinite(q.amount_max) ? new Prisma.Decimal(q.amount_max) : undefined;
    andParts.push({
      amount: {
        ...(decMin != null ? { gte: decMin } : {}),
        ...(decMax != null ? { lte: decMax } : {})
      }
    });
  }

  const s = q.search?.trim();
  if (s) {
    andParts.push({
      OR: [
        { note: { contains: s, mode: "insensitive" } },
        { client: { name: { contains: s, mode: "insensitive" } } },
        { payment_type: { contains: s, mode: "insensitive" } }
      ]
    });
  }

  return { AND: andParts };
}

export async function listOpeningBalances(
  tenantId: number,
  q: OpeningBalanceListQuery
): Promise<{ data: OpeningBalanceListRow[]; total: number; page: number; limit: number }> {
  const where = buildWhere(tenantId, q);
  const [total, rows] = await prisma.$transaction([
    prisma.clientOpeningBalanceEntry.count({ where }),
    prisma.clientOpeningBalanceEntry.findMany({
      where,
      include: listInclude,
      orderBy: { created_at: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit
    })
  ]);
  return {
    data: rows.map((r) => mapRow(r)),
    total,
    page: q.page,
    limit: q.limit
  };
}

export type CreateOpeningBalanceInput = {
  client_id: number;
  balance_type: "debt" | "surplus";
  amount: number;
  payment_type: string;
  cash_desk_id?: number | null;
  trade_direction?: string | null;
  note?: string | null;
  paid_at?: string | null;
};

export async function createOpeningBalance(
  tenantId: number,
  input: CreateOpeningBalanceInput,
  actorUserId: number | null
): Promise<OpeningBalanceListRow> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("BAD_AMOUNT");
  const pt = input.payment_type.trim();
  if (!pt) throw new Error("BAD_PAYMENT_TYPE");
  if (input.balance_type !== "debt" && input.balance_type !== "surplus") throw new Error("BAD_BALANCE_TYPE");

  const client = await prisma.client.findFirst({
    where: { id: input.client_id, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  let cashDeskId: number | null = null;
  if (input.cash_desk_id != null && input.cash_desk_id > 0) {
    const desk = await prisma.cashDesk.findFirst({
      where: { id: input.cash_desk_id, tenant_id: tenantId, is_active: true }
    });
    if (!desk) throw new Error("BAD_CASH_DESK");
    cashDeskId = desk.id;
  }

  const amountDec = new Prisma.Decimal(input.amount);
  const delta = input.balance_type === "surplus" ? amountDec : amountDec.neg();
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  let paidAt: Date | null = null;
  if (input.paid_at != null && String(input.paid_at).trim()) {
    const parsed = new Date(String(input.paid_at).trim());
    if (!Number.isNaN(parsed.getTime())) paidAt = parsed;
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.clientOpeningBalanceEntry.create({
      data: {
        tenant_id: tenantId,
        client_id: input.client_id,
        balance_type: input.balance_type,
        amount: amountDec,
        payment_type: pt,
        cash_desk_id: cashDeskId,
        trade_direction: input.trade_direction?.trim() || null,
        note: input.note?.trim() || null,
        paid_at: paidAt,
        created_by_user_id: uid
      }
    });

    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: input.client_id } },
      create: { tenant_id: tenantId, client_id: input.client_id, balance: delta },
      update: { balance: { increment: delta } }
    });
    await tx.clientBalanceMovement.create({
      data: {
        client_balance_id: bal.id,
        delta,
        note: `Начальный баланс #${created.id}`,
        user_id: uid
      }
    });

    return tx.clientOpeningBalanceEntry.findFirstOrThrow({
      where: { id: created.id },
      include: listInclude
    });
  });

  await appendClientAuditLog(tenantId, input.client_id, actorUserId, "client.opening_balance", {
    entry_id: row.id,
    amount: input.amount,
    balance_type: input.balance_type,
    payment_type: pt
  });

  void invalidateDashboard(tenantId);
  return mapRow(row);
}

export async function deleteOpeningBalance(
  tenantId: number,
  entryId: number,
  actorUserId: number | null,
  reasonRef?: string | null
): Promise<void> {
  let clientId = 0;
  const note =
    reasonRef != null && String(reasonRef).trim() ? String(reasonRef).trim().slice(0, 128) : null;
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const entry = await tx.clientOpeningBalanceEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId }
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.deleted_at != null) throw new Error("ALREADY_VOIDED");
    clientId = entry.client_id;

    const amountDec = entry.amount;
    const reverseDelta = entry.balance_type === "surplus" ? amountDec.neg() : amountDec;

    const bal = await tx.clientBalance.findUnique({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: entry.client_id } }
    });
    if (bal) {
      await tx.clientBalance.update({
        where: { id: bal.id },
        data: { balance: { increment: reverseDelta } }
      });
      await tx.clientBalanceMovement.create({
        data: {
          client_balance_id: bal.id,
          delta: reverseDelta,
          note: `Начальный баланс #${entry.id} в архив`,
          user_id: uid
        }
      });
    }

    await tx.clientOpeningBalanceEntry.update({
      where: { id: entryId },
      data: {
        deleted_at: now,
        deleted_by_user_id: uid,
        delete_reason_ref: note
      }
    });
  });

  await appendClientAuditLog(tenantId, clientId, actorUserId, "client.opening_balance.void", {
    entry_id: entryId,
    soft: true,
    ...(note ? { reason: note } : {})
  });

  void invalidateDashboard(tenantId);
}

export async function restoreOpeningBalance(
  tenantId: number,
  entryId: number,
  actorUserId: number | null
): Promise<OpeningBalanceListRow> {
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const row = await prisma.$transaction(async (tx) => {
    const entry = await tx.clientOpeningBalanceEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId }
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.deleted_at == null) throw new Error("NOT_VOIDED");

    const amountDec = entry.amount;
    const delta = entry.balance_type === "surplus" ? amountDec : amountDec.neg();

    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: entry.client_id } },
      create: { tenant_id: tenantId, client_id: entry.client_id, balance: delta },
      update: { balance: { increment: delta } }
    });
    await tx.clientBalanceMovement.create({
      data: {
        client_balance_id: bal.id,
        delta,
        note: `Начальный баланс #${entry.id} восстановлен`,
        user_id: uid
      }
    });

    await tx.clientOpeningBalanceEntry.update({
      where: { id: entryId },
      data: { deleted_at: null, deleted_by_user_id: null, delete_reason_ref: null }
    });

    return tx.clientOpeningBalanceEntry.findFirstOrThrow({
      where: { id: entryId },
      include: listInclude
    });
  });

  await appendClientAuditLog(tenantId, row.client_id, actorUserId, "client.opening_balance.restore", {
    entry_id: entryId
  });

  void invalidateDashboard(tenantId);
  return mapRow(row);
}
