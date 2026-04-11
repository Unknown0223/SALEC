import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendClientAuditLog } from "../clients/clients.service";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { invalidateDashboard } from "../../lib/redis-cache";
import { getPaymentAllocations, type PaymentAllocationRow } from "./payment-allocations.service";

export async function deletePayment(
  tenantId: number,
  paymentId: number,
  actorUserId: number | null,
  cancelReasonRef?: string | null
): Promise<void> {
  const reasonNote =
    cancelReasonRef != null && String(cancelReasonRef).trim()
      ? String(cancelReasonRef).trim().slice(0, 128)
      : null;
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId }
    });
    if (!payment) {
      throw new Error("NOT_FOUND");
    }

    // Reverse the balance adjustment
    const bal = await tx.clientBalance.findUnique({
      where: {
        tenant_id_client_id: { tenant_id: tenantId, client_id: payment.client_id }
      }
    });
    if (bal) {
      const isExpense = String(payment.entry_kind ?? "payment") === "client_expense";
      if (isExpense) {
        await tx.clientBalance.update({
          where: { id: bal.id },
          data: { balance: { increment: payment.amount } }
        });
        await tx.clientBalanceMovement.create({
          data: {
            client_balance_id: bal.id,
            delta: payment.amount,
            note: reasonNote
              ? `Rasxod klient #${payment.id} bekor — ${reasonNote}`
              : `Rasxod klient #${payment.id} bekor qilindi`,
            user_id: actorUserId
          }
        });
      } else {
        await tx.clientBalance.update({
          where: { id: bal.id },
          data: { balance: { decrement: payment.amount } }
        });
        await tx.clientBalanceMovement.create({
          data: {
            client_balance_id: bal.id,
            delta: payment.amount.neg(),
            note: reasonNote
              ? `To'lov #${payment.id} bekor qilindi — ${reasonNote}`
              : `To'lov #${payment.id} bekor qilindi`,
            user_id: actorUserId
          }
        });
      }
    }

    await tx.paymentAllocation.deleteMany({
      where: { tenant_id: tenantId, payment_id: paymentId }
    });
    await tx.payment.delete({ where: { id: paymentId } });
  });

  void invalidateDashboard(tenantId);

  if (actorUserId) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.finance,
      entityId: String(paymentId),
      action: "payment.delete",
      payload: { payment_id: paymentId, ...(reasonNote ? { cancel_reason_ref: reasonNote } : {}) }
    });
  }
}

export type PaymentListRow = {
  id: number;
  client_id: number;
  client_name: string;
  /** Yuridik nom */
  client_legal_name: string | null;
  client_code: string | null;
  client_balance: string;
  order_id: number | null;
  order_number: string | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  trade_direction: string | null;
  /** Mijoz agenti konsignatsiya rejimida */
  consignment: boolean;
  expeditor_user_id: number | null;
  expeditor_name: string | null;
  cash_desk_name: string | null;
  /** Doimiy: mijoz balansiga kirim / «Расход» */
  payment_kind: string;
  /** payment | client_expense */
  entry_kind: string;
  workflow_status: string;
  paid_at: string | null;
  received_at: string | null;
  confirmed_at: string | null;
  /** Mijoz manzili / hudud (chek guruhlash) */
  client_region: string | null;
  client_city: string | null;
  client_district: string | null;
};

export type PaymentDetailRow = PaymentListRow & {
  created_by_user_id: number | null;
  created_by_name: string | null;
};

export type PaymentDetailPayload = {
  payment: PaymentDetailRow;
  allocations: PaymentAllocationRow[];
  allocated_total: string;
  unallocated: string;
};

/** Ro‘yxat / filtrlash (GET /payments) */
export type PaymentListQuery = {
  page: number;
  limit: number;
  client_id?: number;
  order_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  amount_min?: number;
  amount_max?: number;
  agent_id?: number;
  expeditor_user_id?: number;
  payment_type?: string;
  trade_direction?: string;
  territory_region?: string;
  territory_city?: string;
  territory_district?: string;
  /** Mijozning agenti: `regular` — agent yo‘q yoki consignment=false; `consignment` — agent.consignment=true */
  deal_type?: "regular" | "consignment" | "both";
  /** Filtr: `deleted` — hozircha yozuvlar yo‘q (keyin soft-delete) */
  payment_status?: "pending_confirmation" | "confirmed" | "deleted";
  cash_desk_ids?: number[];
  /** payment — faqat to‘lovlar; client_expense — «расходы клиента» */
  entry_kind?: "payment" | "client_expense";
  /** Sanani qaysi maydonga qo‘llash (filtr) */
  date_field?: "created_at" | "paid_at" | "confirmed_at";
};

function paymentListInclude(tenantId: number): Prisma.PaymentInclude {
  return {
    client: {
      select: {
        name: true,
        legal_name: true,
        client_code: true,
        region: true,
        city: true,
        district: true,
        agent: {
          select: {
            id: true,
            name: true,
            code: true,
            trade_direction: true,
            consignment: true,
            trade_direction_row: { select: { name: true } }
          }
        },
        client_balances: {
          where: { tenant_id: tenantId },
          select: { balance: true },
          take: 1
        }
      }
    },
    order: {
      select: {
        number: true,
        expeditor_user: { select: { id: true, name: true } }
      }
    },
    cash_desk: { select: { name: true } },
    expeditor_user: { select: { id: true, name: true } }
  };
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPaymentToListRow(r: any, tenantId: number): PaymentListRow {
  const bal = r.client.client_balances[0]?.balance ?? new Prisma.Decimal(0);
  const ag = r.client.agent as
    | {
        id: number;
        name: string;
        code: string | null;
        trade_direction: string | null;
        consignment: boolean;
        trade_direction_row: { name: string } | null;
      }
    | null
    | undefined;
  const td =
    (ag?.trade_direction && String(ag.trade_direction).trim()) ||
    ag?.trade_direction_row?.name?.trim() ||
    null;
  const exOrder = r.order?.expeditor_user as { id: number; name: string } | null | undefined;
  const exDirect = r.expeditor_user as { id: number; name: string } | null | undefined;
  const ex = exDirect ?? exOrder;
  const desk = r.cash_desk as { name: string } | null | undefined;
  const ek = String(r.entry_kind ?? "payment");
  return {
    id: r.id,
    client_id: r.client_id,
    client_name: r.client.name,
    client_legal_name: r.client.legal_name ?? null,
    client_code: r.client.client_code ?? null,
    client_balance: bal.toString(),
    order_id: r.order_id,
    order_number: r.order?.number ?? null,
    amount: r.amount.toString(),
    payment_type: r.payment_type,
    note: r.note,
    created_at: r.created_at.toISOString(),
    agent_id: ag?.id ?? null,
    agent_name: ag?.name ?? null,
    agent_code: ag?.code ?? null,
    trade_direction: td,
    consignment: ag?.consignment ?? false,
    expeditor_user_id: ex?.id ?? null,
    expeditor_name: ex?.name ?? null,
    cash_desk_name: desk?.name ?? null,
    payment_kind: ek === "client_expense" ? "Расход" : "Оплата",
    entry_kind: ek,
    workflow_status: String(r.workflow_status ?? "confirmed"),
    paid_at: r.paid_at ? (r.paid_at as Date).toISOString() : null,
    received_at: r.received_at ? (r.received_at as Date).toISOString() : null,
    confirmed_at: r.confirmed_at ? (r.confirmed_at as Date).toISOString() : null,
    client_region: r.client.region?.trim() || null,
    client_city: r.client.city?.trim() || null,
    client_district: r.client.district?.trim() || null
  };
}

function buildPaymentListWhere(tenantId: number, q: PaymentListQuery): Prisma.PaymentWhereInput {
  const andParts: Prisma.PaymentWhereInput[] = [{ tenant_id: tenantId }];

  if (q.client_id != null && q.client_id > 0) andParts.push({ client_id: q.client_id });
  if (q.order_id != null && q.order_id > 0) andParts.push({ order_id: q.order_id });

  const ek = q.entry_kind;
  if (ek === "client_expense") {
    andParts.push({ entry_kind: "client_expense" });
  } else {
    andParts.push({ entry_kind: "payment" });
  }

  const df = parseUtcDayStart(q.date_from);
  const dt = parseUtcDayEnd(q.date_to);
  if (df || dt) {
    const field = q.date_field === "paid_at" ? "paid_at" : q.date_field === "confirmed_at" ? "confirmed_at" : "created_at";
    andParts.push({
      [field]: {
        ...(df ? { gte: df } : {}),
        ...(dt ? { lte: dt } : {})
      }
    } as Prisma.PaymentWhereInput);
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

  if (q.payment_type != null && q.payment_type.trim() !== "" && q.payment_type !== "__all__") {
    andParts.push({ payment_type: q.payment_type.trim() });
  }

  if (q.expeditor_user_id != null && q.expeditor_user_id > 0) {
    const exId = q.expeditor_user_id;
    andParts.push({
      OR: [{ order: { expeditor_user_id: exId } }, { expeditor_user_id: exId }]
    });
  }

  const clientAnd: Prisma.ClientWhereInput[] = [];

  if (q.agent_id != null && q.agent_id > 0) {
    clientAnd.push({ agent_id: q.agent_id });
  }

  if (q.trade_direction != null && q.trade_direction.trim() !== "" && q.trade_direction !== "__all__") {
    const td = q.trade_direction.trim();
    clientAnd.push({
      agent: {
        OR: [
          { trade_direction: { contains: td, mode: "insensitive" } },
          { trade_direction_row: { name: { contains: td, mode: "insensitive" } } }
        ]
      }
    });
  }

  if (q.territory_region?.trim()) {
    clientAnd.push({ region: { contains: q.territory_region.trim(), mode: "insensitive" } });
  }
  if (q.territory_city?.trim()) {
    clientAnd.push({ city: { contains: q.territory_city.trim(), mode: "insensitive" } });
  }
  if (q.territory_district?.trim()) {
    clientAnd.push({ district: { contains: q.territory_district.trim(), mode: "insensitive" } });
  }

  if (q.deal_type === "regular") {
    clientAnd.push({
      OR: [{ agent_id: null }, { agent: { is: { consignment: false } } }]
    });
  } else if (q.deal_type === "consignment") {
    clientAnd.push({ agent: { is: { consignment: true } } });
  }

  if (clientAnd.length) {
    andParts.push({ client: { AND: clientAnd } });
  }

  if (q.search?.trim()) {
    const s = q.search.trim();
    const idNum = Number.parseInt(s, 10);
    const orSearch: Prisma.PaymentWhereInput[] = [
      { client: { name: { contains: s, mode: "insensitive" } } },
      { client: { legal_name: { contains: s, mode: "insensitive" } } },
      { client: { client_code: { contains: s, mode: "insensitive" } } }
    ];
    if (Number.isFinite(idNum) && idNum > 0) {
      orSearch.push({ id: idNum });
    }
    andParts.push({ OR: orSearch });
  }

  if (q.payment_status === "pending_confirmation") {
    andParts.push({ workflow_status: "pending_confirmation" });
  } else if (q.payment_status === "confirmed") {
    andParts.push({ workflow_status: "confirmed" });
  } else if (q.payment_status === "deleted") {
    andParts.push({ id: -1 });
  }

  if (q.cash_desk_ids != null && q.cash_desk_ids.length > 0) {
    andParts.push({ cash_desk_id: { in: q.cash_desk_ids } });
  }

  return andParts.length === 1 ? andParts[0]! : { AND: andParts };
}

export async function getPaymentDetail(
  tenantId: number,
  paymentId: number
): Promise<PaymentDetailPayload | null> {
  const p = await prisma.payment.findFirst({
    where: { id: paymentId, tenant_id: tenantId },
    include: {
      ...paymentListInclude(tenantId),
      created_by: { select: { name: true } }
    }
  });
  if (!p) return null;

  const allocations = await getPaymentAllocations(tenantId, paymentId);
  const allocatedSum = allocations.reduce(
    (acc, row) => acc.add(new Prisma.Decimal(row.amount)),
    new Prisma.Decimal(0)
  );
  const rawUnalloc = p.amount.sub(allocatedSum);
  const unallocated = rawUnalloc.lt(0) ? new Prisma.Decimal(0) : rawUnalloc;

  const base = mapPaymentToListRow(p, tenantId);
  return {
    payment: {
      ...base,
      created_by_user_id: p.created_by_user_id,
      created_by_name: p.created_by?.name ?? null
    },
    allocations,
    allocated_total: allocatedSum.toString(),
    unallocated: unallocated.toString()
  };
}

export async function listPayments(
  tenantId: number,
  q: PaymentListQuery
): Promise<{ data: PaymentListRow[]; total: number; page: number; limit: number }> {
  const where = buildPaymentListWhere(tenantId, q);
  const inc = paymentListInclude(tenantId);

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: inc
    })
  ]);

  return {
    total,
    page: q.page,
    limit: q.limit,
    data: rows.map((r) => mapPaymentToListRow(r, tenantId))
  };
}

export async function listPaymentsForOrder(tenantId: number, orderId: number): Promise<PaymentListRow[]> {
  const inc = paymentListInclude(tenantId);
  const rows = await prisma.payment.findMany({
    where: { tenant_id: tenantId, order_id: orderId },
    orderBy: { created_at: "desc" },
    include: inc
  });
  return rows.map((r) => mapPaymentToListRow(r, tenantId));
}

export async function listPaymentsForClient(tenantId: number, clientId: number, limit = 50): Promise<PaymentListRow[]> {
  const inc = paymentListInclude(tenantId);
  const rows = await prisma.payment.findMany({
    where: { tenant_id: tenantId, client_id: clientId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: inc
  });
  return rows.map((r) => mapPaymentToListRow(r, tenantId));
}

export type CreatePaymentInput = {
  client_id: number;
  order_id?: number | null;
  amount: number;
  payment_type: string;
  note?: string | null;
  cash_desk_id?: number | null;
  /** ISO 8601; bo‘lmasa — hozirgi vaqt */
  paid_at?: string | null;
  entry_kind?: "payment" | "client_expense";
  /** «Расход клиента» — zakazsiz ekskpeditor */
  expeditor_user_id?: number | null;
};

export async function createClientExpense(
  tenantId: number,
  input: CreatePaymentInput,
  actorUserId: number | null
): Promise<PaymentListRow> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("BAD_AMOUNT");
  }
  const pt = input.payment_type.trim();
  if (!pt) throw new Error("BAD_PAYMENT_TYPE");

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

  let expeditorId: number | null = null;
  if (input.expeditor_user_id != null && input.expeditor_user_id > 0) {
    const ex = await prisma.user.findFirst({
      where: { id: input.expeditor_user_id, tenant_id: tenantId, is_active: true }
    });
    if (!ex) throw new Error("BAD_EXPEDITOR");
    expeditorId = ex.id;
  }

  const amountDec = new Prisma.Decimal(input.amount);
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  let eventAt = new Date();
  if (input.paid_at != null && String(input.paid_at).trim()) {
    const parsed = new Date(String(input.paid_at).trim());
    if (!Number.isNaN(parsed.getTime())) {
      eventAt = parsed;
    }
  }

  const neg = amountDec.neg();

  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        tenant_id: tenantId,
        client_id: input.client_id,
        order_id: null,
        amount: amountDec,
        payment_type: pt,
        note: input.note?.trim() || null,
        created_by_user_id: uid,
        cash_desk_id: cashDeskId,
        workflow_status: "confirmed",
        paid_at: eventAt,
        received_at: eventAt,
        confirmed_at: eventAt,
        entry_kind: "client_expense",
        expeditor_user_id: expeditorId
      }
    });

    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: input.client_id } },
      create: { tenant_id: tenantId, client_id: input.client_id, balance: neg },
      update: { balance: { decrement: amountDec } }
    });
    await tx.clientBalanceMovement.create({
      data: {
        client_balance_id: bal.id,
        delta: neg,
        note: `Rasxod klient #${p.id}`,
        user_id: uid
      }
    });

    return tx.payment.findFirstOrThrow({
      where: { id: p.id },
      include: paymentListInclude(tenantId)
    });
  });

  await appendClientAuditLog(tenantId, input.client_id, actorUserId, "client.client_expense", {
    payment_id: row.id,
    amount: input.amount,
    payment_type: pt
  });

  void invalidateDashboard(tenantId);

  return mapPaymentToListRow(row, tenantId);
}

export async function createPayment(
  tenantId: number,
  input: CreatePaymentInput,
  actorUserId: number | null
): Promise<PaymentListRow> {
  const kind = input.entry_kind ?? "payment";
  if (kind === "client_expense") {
    return createClientExpense(tenantId, input, actorUserId);
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("BAD_AMOUNT");
  }
  const pt = input.payment_type.trim();
  if (!pt) throw new Error("BAD_PAYMENT_TYPE");

  const client = await prisma.client.findFirst({
    where: { id: input.client_id, tenant_id: tenantId, merged_into_client_id: null }
  });
  if (!client) throw new Error("BAD_CLIENT");

  if (input.order_id != null && input.order_id > 0) {
    const ord = await prisma.order.findFirst({
      where: { id: input.order_id, tenant_id: tenantId, client_id: input.client_id }
    });
    if (!ord) throw new Error("BAD_ORDER");
  }

  let cashDeskId: number | null = null;
  if (input.cash_desk_id != null && input.cash_desk_id > 0) {
    const desk = await prisma.cashDesk.findFirst({
      where: { id: input.cash_desk_id, tenant_id: tenantId, is_active: true }
    });
    if (!desk) throw new Error("BAD_CASH_DESK");
    cashDeskId = desk.id;
  }

  const amountDec = new Prisma.Decimal(input.amount);
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  let eventAt = new Date();
  if (input.paid_at != null && String(input.paid_at).trim()) {
    const parsed = new Date(String(input.paid_at).trim());
    if (!Number.isNaN(parsed.getTime())) {
      eventAt = parsed;
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        tenant_id: tenantId,
        client_id: input.client_id,
        order_id: input.order_id != null && input.order_id > 0 ? input.order_id : null,
        amount: amountDec,
        payment_type: pt,
        note: input.note?.trim() || null,
        created_by_user_id: uid,
        cash_desk_id: cashDeskId,
        workflow_status: "confirmed",
        paid_at: eventAt,
        received_at: eventAt,
        confirmed_at: eventAt,
        entry_kind: "payment"
      }
    });

    const bal = await tx.clientBalance.upsert({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: input.client_id } },
      create: { tenant_id: tenantId, client_id: input.client_id, balance: amountDec },
      update: { balance: { increment: amountDec } }
    });
    await tx.clientBalanceMovement.create({
      data: {
        client_balance_id: bal.id,
        delta: amountDec,
        note: `To‘lov #${p.id}${input.order_id ? ` (zakaz #${input.order_id})` : ""}`,
        user_id: uid
      }
    });

    return tx.payment.findFirstOrThrow({
      where: { id: p.id },
      include: paymentListInclude(tenantId)
    });
  });

  await appendClientAuditLog(tenantId, input.client_id, actorUserId, "client.payment", {
    payment_id: row.id,
    amount: input.amount,
    payment_type: pt,
    order_id: input.order_id ?? null
  });

  void invalidateDashboard(tenantId);

  return mapPaymentToListRow(row, tenantId);
}
