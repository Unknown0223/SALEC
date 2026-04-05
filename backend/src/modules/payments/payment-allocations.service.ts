import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

// ── Types ────────────────────────────────────────────────────────────────

export type PaymentAllocationRow = {
  id: number;
  payment_id: number;
  order_id: number;
  order_number: string;
  amount: string;
  created_at: string;
};

export type AgingBucket = {
  client_id: number;
  client_name: string;
  total_orders: string;
  total_payments: string;
  outstanding: string;
  current: string;        // 0-30 days
  bucket_30: string;       // 31-60 days
  bucket_60: string;       // 61-90 days
  bucket_90: string;       // 91-120 days
  bucket_120: string;      // 120+ days
};

export type ClientAgingOptions = {
  asOf?: Date | string;
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function assertTenantAccess(tenantId: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !tenant.is_active) {
    throw new Error("TENANT_NOT_FOUND");
  }
  return tenant;
}

// Compute total already allocated for an order from payment_allocations
async function getAllocatedForOrder(
  tx: Prisma.TransactionClient | typeof prisma,
  tenantId: number,
  orderId: number
): Promise<Prisma.Decimal> {
  const result = await (tx as typeof prisma).paymentAllocation.aggregate({
    _sum: { amount: true },
    where: { tenant_id: tenantId, order_id: orderId }
  });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

// Compute total already allocated from a payment
async function getAllocatedForPayment(
  tx: Prisma.TransactionClient | typeof prisma,
  tenantId: number,
  paymentId: number
): Promise<Prisma.Decimal> {
  const result = await (tx as typeof prisma).paymentAllocation.aggregate({
    _sum: { amount: true },
    where: { tenant_id: tenantId, payment_id: paymentId }
  });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

// ── Allocate payment to oldest unpaid orders (FIFO) ──────────────────────

export async function allocatePayment(
  tenantId: number,
  paymentId: number,
  actorUserId: number | null
): Promise<PaymentAllocationRow[]> {
  await assertTenantAccess(tenantId);

  const created: PaymentAllocationRow[] = await prisma.$transaction(async (tx) => {
    // Fetch payment details
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId }
    });
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");

    // Remaining payment amount after any previous allocations
    const alreadyAllocated = await getAllocatedForPayment(tx, tenantId, paymentId);
    let remaining = payment.amount.sub(alreadyAllocated);

    if (remaining.lte(0)) {
      // Nothing left to allocate
      return [];
    }

    // Fetch all orders for the client sorted by date (oldest first)
    const orders = await tx.order.findMany({
      where: {
        tenant_id: tenantId,
        client_id: payment.client_id
        // No status filter — include all orders; unpaid computed from totals
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        number: true,
        total_sum: true
      }
    });

    const allocations: PaymentAllocationRow[] = [];

    for (const order of orders) {
      if (remaining.lte(0)) break;

      // Compute remaining unpaid amount
      const alreadyAllocatedToOrder = await getAllocatedForOrder(tx, tenantId, order.id);
      const orderRemaining = order.total_sum.sub(alreadyAllocatedToOrder);

      if (orderRemaining.lte(0)) continue; // Fully paid

      const allocAmount = remaining.lt(orderRemaining) ? remaining : orderRemaining;

      // Create allocation record
      const allocation = await tx.paymentAllocation.create({
        data: {
          tenant_id: tenantId,
          payment_id: paymentId,
          order_id: order.id,
          amount: allocAmount
        }
      });

      allocations.push({
        id: allocation.id,
        payment_id: allocation.payment_id,
        order_id: allocation.order_id,
        order_number: order.number,
        amount: allocation.amount.toString(),
        created_at: allocation.created_at.toISOString()
      });

      remaining = remaining.sub(allocAmount);
    }

    // Audit log
    if (actorUserId && allocations.length > 0) {
      await appendTenantAuditEvent({
        tenantId,
        actorUserId,
        entityType: AuditEntityType.finance,
        entityId: String(paymentId),
        action: "payment.allocate",
        payload: {
          payment_id: paymentId,
          allocations_count: allocations.length,
          total_allocated: allocations
            .reduce((s, a) => s.add(new Prisma.Decimal(a.amount)), new Prisma.Decimal(0))
            .toString()
        }
      });
    }

    return allocations;
  });

  return created;
}

// ── Get payment allocations ──────────────────────────────────────────────

export async function getPaymentAllocations(
  tenantId: number,
  paymentId: number
): Promise<PaymentAllocationRow[]> {
  await assertTenantAccess(tenantId);

  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      tenant_id: tenantId,
      payment_id: paymentId
    },
    orderBy: { order_id: "asc" }
  });

  // Resolve order numbers
  const orderIds = allocations.map((a) => a.order_id);
  const orders = orderIds.length > 0
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } })
    : [];
  const orderMap = new Map(orders.map((o) => [o.id, o.number]));

  return allocations.map((a) => ({
    id: a.id,
    payment_id: a.payment_id,
    order_id: a.order_id,
    order_number: orderMap.get(a.order_id) ?? `#${a.order_id}`,
    amount: a.amount.toString(),
    created_at: a.created_at.toISOString()
  }));
}

// ── Allocate multiple payments ───────────────────────────────────────────

export async function allocateMultiple(
  tenantId: number,
  paymentIds: number[],
  actorUserId: number | null
): Promise<{ payment_id: number; allocations: PaymentAllocationRow[] }[]> {
  await assertTenantAccess(tenantId);

  const results: { payment_id: number; allocations: PaymentAllocationRow[] }[] = [];

  for (const pid of paymentIds) {
    try {
      const allocations = await allocatePayment(tenantId, pid, actorUserId);
      results.push({ payment_id: pid, allocations });
    } catch (err) {
      results.push({
        payment_id: pid,
        allocations: [],
      } as unknown as { payment_id: number; allocations: PaymentAllocationRow[] });
      // Continue with next payment instead of aborting all
      console.error(`[allocation] Failed for payment ${pid}:`, err);
    }
  }

  return results;
}

// ── Client aging report (30/60/90/120 day buckets) ───────────────────────

export async function getClientAging(
  tenantId: number,
  options?: ClientAgingOptions
): Promise<AgingBucket[]> {
  await assertTenantAccess(tenantId);

  const asOfDate = options?.asOf ? new Date(options.asOf) : new Date();

  // Helper: difference in days between asOf and order date
  const toDays = (d: Date): number =>
    Math.floor((asOfDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  // Fetch all orders and payments for the tenant
  const [orders, payments] = await Promise.all([
    prisma.order.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        client_id: true,
        total_sum: true,
        created_at: true
      }
    }),
    prisma.payment.findMany({
      where: { tenant_id: tenantId },
      select: {
        client_id: true,
        amount: true,
        created_at: true
      }
    })
  ]);

  // Fetch allocations to get what's actually been allocated per order
  const allocations = await prisma.paymentAllocation.findMany({
    where: { tenant_id: tenantId },
    select: { order_id: true, amount: true, created_at: true }
  });

  // Aggregate per client
  const clientData = new Map<number, {
    clientName?: string;
    orderTotal: Prisma.Decimal;
    paymentTotal: Prisma.Decimal;
    buckets: { current: Prisma.Decimal; b30: Prisma.Decimal; b60: Prisma.Decimal; b90: Prisma.Decimal; b120: Prisma.Decimal };
  }>();

  // Build allocated map per order
  const allocatedPerOrder = new Map<number, Prisma.Decimal>();
  for (const alloc of allocations) {
    const prev = allocatedPerOrder.get(alloc.order_id) ?? new Prisma.Decimal(0);
    allocatedPerOrder.set(alloc.order_id, prev.add(alloc.amount));
  }

  // Process orders: only include outstanding (unallocated) amounts in aging
  const orderIds = new Set(orders.map((o) => o.client_id));
  for (const clientId of orderIds) {
    if (!clientData.has(clientId)) {
      clientData.set(clientId, {
        orderTotal: new Prisma.Decimal(0),
        paymentTotal: new Prisma.Decimal(0),
        buckets: {
          current: new Prisma.Decimal(0),
          b30: new Prisma.Decimal(0),
          b60: new Prisma.Decimal(0),
          b90: new Prisma.Decimal(0),
          b120: new Prisma.Decimal(0)
        }
      });
    }
  }

  // Sum order totals per client
  for (const order of orders) {
    const cd = clientData.get(order.client_id);
    if (!cd) continue;
    cd.orderTotal = cd.orderTotal.add(order.total_sum);

    const allocated = allocatedPerOrder.get(order.id) ?? new Prisma.Decimal(0);
    const outstanding = order.total_sum.sub(allocated);
    if (outstanding.lte(0)) continue;

    // Determine day bucket based on order creation date
    const days = toDays(order.created_at);
    if (days <= 30) {
      cd.buckets.current = cd.buckets.current.add(outstanding);
    } else if (days <= 60) {
      cd.buckets.b30 = cd.buckets.b30.add(outstanding);
    } else if (days <= 90) {
      cd.buckets.b60 = cd.buckets.b60.add(outstanding);
    } else if (days <= 120) {
      cd.buckets.b90 = cd.buckets.b90.add(outstanding);
    } else {
      cd.buckets.b120 = cd.buckets.b120.add(outstanding);
    }
  }

  // Sum payment totals per client
  for (const payment of payments) {
    const cd = clientData.get(payment.client_id);
    if (!cd) continue;
    cd.paymentTotal = cd.paymentTotal.add(payment.amount);
  }

  // Fetch client names
  const clientIds = Array.from(clientData.keys());
  const clients =
    clientIds.length > 0
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true }
        })
      : [];
  const clientNameMap = new Map(clients.map((c) => [c.id, c.name]));

  // Build result
  const result: AgingBucket[] = Array.from(clientData.entries())
    .map(([clientId, data]) => {
      const outstanding = data.orderTotal.sub(data.paymentTotal);
      return {
        client_id: clientId,
        client_name: clientNameMap.get(clientId) ?? `Client #${clientId}`,
        total_orders: data.orderTotal.toString(),
        total_payments: data.paymentTotal.toString(),
        outstanding: outstanding.toString(),
        current: data.buckets.current.toString(),
        bucket_30: data.buckets.b30.toString(),
        bucket_60: data.buckets.b60.toString(),
        bucket_90: data.buckets.b90.toString(),
        bucket_120: data.buckets.b120.toString()
      };
    })
    .sort((a, b) => b.outstanding.localeCompare(a.outstanding));

  return result;
}
