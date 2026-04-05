import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendClientAuditLog } from "../clients/clients.service";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { invalidateDashboard } from "../../lib/redis-cache";

export async function deletePayment(
  tenantId: number,
  paymentId: number,
  actorUserId: number | null
): Promise<void> {
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
      await tx.clientBalance.update({
        where: { id: bal.id },
        data: { balance: { decrement: payment.amount } }
      });
      await tx.clientBalanceMovement.create({
        data: {
          client_balance_id: bal.id,
          delta: payment.amount.neg(),
          note: `To'lov #${payment.id} bekor qilindi`,
          user_id: actorUserId
        }
      });
    }

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
      payload: { payment_id: paymentId }
    });
  }
}

export type PaymentListRow = {
  id: number;
  client_id: number;
  client_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
};

export async function listPayments(
  tenantId: number,
  q: { page: number; limit: number; client_id?: number; order_id?: number }
): Promise<{ data: PaymentListRow[]; total: number; page: number; limit: number }> {
  const where: Prisma.PaymentWhereInput = { tenant_id: tenantId };
  if (q.client_id != null && q.client_id > 0) where.client_id = q.client_id;
  if (q.order_id != null && q.order_id > 0) where.order_id = q.order_id;

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } }
      }
    })
  ]);

  return {
    total,
    page: q.page,
    limit: q.limit,
    data: rows.map((r) => ({
      id: r.id,
      client_id: r.client_id,
      client_name: r.client.name,
      order_id: r.order_id,
      order_number: r.order?.number ?? null,
      amount: r.amount.toString(),
      payment_type: r.payment_type,
      note: r.note,
      created_at: r.created_at.toISOString()
    }))
  };
}

export async function listPaymentsForOrder(tenantId: number, orderId: number): Promise<PaymentListRow[]> {
  const rows = await prisma.payment.findMany({
    where: { tenant_id: tenantId, order_id: orderId },
    orderBy: { created_at: "desc" },
    include: {
      client: { select: { name: true } },
      order: { select: { number: true } }
    }
  });
  return rows.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    client_name: r.client.name,
    order_id: r.order_id,
    order_number: r.order?.number ?? null,
    amount: r.amount.toString(),
    payment_type: r.payment_type,
    note: r.note,
    created_at: r.created_at.toISOString()
  }));
}

export async function listPaymentsForClient(tenantId: number, clientId: number, limit = 50): Promise<PaymentListRow[]> {
  const rows = await prisma.payment.findMany({
    where: { tenant_id: tenantId, client_id: clientId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      client: { select: { name: true } },
      order: { select: { number: true } }
    }
  });
  return rows.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    client_name: r.client.name,
    order_id: r.order_id,
    order_number: r.order?.number ?? null,
    amount: r.amount.toString(),
    payment_type: r.payment_type,
    note: r.note,
    created_at: r.created_at.toISOString()
  }));
}

export type CreatePaymentInput = {
  client_id: number;
  order_id?: number | null;
  amount: number;
  payment_type: string;
  note?: string | null;
};

export async function createPayment(
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

  if (input.order_id != null && input.order_id > 0) {
    const ord = await prisma.order.findFirst({
      where: { id: input.order_id, tenant_id: tenantId, client_id: input.client_id }
    });
    if (!ord) throw new Error("BAD_ORDER");
  }

  const amountDec = new Prisma.Decimal(input.amount);
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        tenant_id: tenantId,
        client_id: input.client_id,
        order_id: input.order_id != null && input.order_id > 0 ? input.order_id : null,
        amount: amountDec,
        payment_type: pt,
        note: input.note?.trim() || null,
        created_by_user_id: uid
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
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } }
      }
    });
  });

  await appendClientAuditLog(tenantId, input.client_id, actorUserId, "client.payment", {
    payment_id: row.id,
    amount: input.amount,
    payment_type: pt,
    order_id: input.order_id ?? null
  });

  void invalidateDashboard(tenantId);

  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client.name,
    order_id: row.order_id,
    order_number: row.order?.number ?? null,
    amount: row.amount.toString(),
    payment_type: row.payment_type,
    note: row.note,
    created_at: row.created_at.toISOString()
  };
}
