import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { invalidateStock } from "../../lib/redis-cache";
import { appendClientAuditLog } from "../clients/clients.service";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { assertReturnProductsInterchangeableStrict } from "../products/product-catalog.service";

export type SalesReturnListRow = {
  id: number;
  number: string;
  client_id: number | null;
  client_name: string | null;
  order_id: number | null;
  order_number: string | null;
  warehouse_id: number;
  warehouse_name: string;
  status: string;
  refund_amount: string | null;
  note: string | null;
  refusal_reason_ref: string | null;
  created_at: string;
};

export async function listSalesReturns(
  tenantId: number,
  q: {
    page: number;
    limit: number;
    warehouse_id?: number;
    client_id?: number;
    warehouse_ids?: number[];
    client_ids?: number[];
  }
): Promise<{ data: SalesReturnListRow[]; total: number; page: number; limit: number }> {
  const where: Prisma.SalesReturnWhereInput = { tenant_id: tenantId, status: "posted" };
  if (q.warehouse_id != null && q.warehouse_id > 0) where.warehouse_id = q.warehouse_id;
  if (q.client_id != null && q.client_id > 0) where.client_id = q.client_id;
  if (q.warehouse_ids != null && q.warehouse_ids.length > 0) where.warehouse_id = { in: q.warehouse_ids };
  if (q.client_ids != null && q.client_ids.length > 0) where.client_id = { in: q.client_ids };

  const [total, rows] = await Promise.all([
    prisma.salesReturn.count({ where }),
    prisma.salesReturn.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } },
        warehouse: { select: { name: true } }
      }
    })
  ]);

  return {
    total,
    page: q.page,
    limit: q.limit,
    data: rows.map((r) => ({
      id: r.id,
      number: r.number,
      client_id: r.client_id,
      client_name: r.client?.name ?? null,
      order_id: r.order_id,
      order_number: r.order?.number ?? null,
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse.name,
      status: r.status,
      refund_amount: r.refund_amount?.toString() ?? null,
      note: r.note,
      refusal_reason_ref: r.refusal_reason_ref ?? null,
      created_at: r.created_at.toISOString()
    }))
  };
}

export async function listSalesReturnsForOrder(tenantId: number, orderId: number): Promise<SalesReturnListRow[]> {
  const rows = await prisma.salesReturn.findMany({
    where: { tenant_id: tenantId, order_id: orderId, status: "posted" },
    orderBy: { created_at: "desc" },
    include: {
      client: { select: { name: true } },
      order: { select: { number: true } },
      warehouse: { select: { name: true } }
    }
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    client_id: r.client_id,
    client_name: r.client?.name ?? null,
    order_id: r.order_id,
    order_number: r.order?.number ?? null,
    warehouse_id: r.warehouse_id,
    warehouse_name: r.warehouse.name,
    status: r.status,
    refund_amount: r.refund_amount?.toString() ?? null,
    note: r.note,
    refusal_reason_ref: r.refusal_reason_ref ?? null,
    created_at: r.created_at.toISOString()
  }));
}

export type CreateSalesReturnInput = {
  warehouse_id: number;
  client_id?: number | null;
  order_id?: number | null;
  price_type?: string | null;
  refund_amount?: number | null;
  note?: string | null;
  refusal_reason_ref?: string | null;
  lines: { product_id: number; qty: number }[];
};

export async function createSalesReturn(
  tenantId: number,
  input: CreateSalesReturnInput,
  actorUserId: number | null
): Promise<SalesReturnListRow> {
  if (!input.lines.length) throw new Error("EMPTY_LINES");

  const wh = await prisma.warehouse.findFirst({
    where: { id: input.warehouse_id, tenant_id: tenantId }
  });
  if (!wh) throw new Error("BAD_WAREHOUSE");

  let clientId: number | null = input.client_id != null && input.client_id > 0 ? input.client_id : null;
  if (clientId != null) {
    const c = await prisma.client.findFirst({
      where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null }
    });
    if (!c) throw new Error("BAD_CLIENT");
  }

  let orderId: number | null = input.order_id != null && input.order_id > 0 ? input.order_id : null;
  if (orderId != null) {
    const ord = await prisma.order.findFirst({
      where: { id: orderId, tenant_id: tenantId }
    });
    if (!ord) throw new Error("BAD_ORDER");
    if (clientId == null) clientId = ord.client_id;
    if (clientId != null && ord.client_id !== clientId) throw new Error("BAD_ORDER_CLIENT");
  }

  const productIds = [...new Set(input.lines.map((l) => l.product_id))];
  const products = await prisma.product.findMany({
    where: { tenant_id: tenantId, id: { in: productIds }, is_active: true }
  });
  if (products.length !== productIds.length) throw new Error("BAD_PRODUCT");

  const returnPriceType = (input.price_type ?? "").trim() || "retail";
  await assertReturnProductsInterchangeableStrict(tenantId, productIds, returnPriceType);

  const refund =
    input.refund_amount != null && Number.isFinite(input.refund_amount) && input.refund_amount > 0
      ? new Prisma.Decimal(input.refund_amount)
      : null;

  if (refund != null && (clientId == null || clientId < 1)) {
    throw new Error("REFUND_NEEDS_CLIENT");
  }

  const number = `R-${tenantId}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const uid =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const row = await prisma.$transaction(async (tx) => {
    const ret = await tx.salesReturn.create({
      data: {
        tenant_id: tenantId,
        number,
        client_id: clientId,
        order_id: orderId,
        warehouse_id: input.warehouse_id,
        status: "posted",
        refund_amount: refund,
        note: input.note?.trim() || null,
        refusal_reason_ref:
          input.refusal_reason_ref != null && String(input.refusal_reason_ref).trim()
            ? String(input.refusal_reason_ref).trim().slice(0, 128)
            : null,
        created_by_user_id: uid,
        lines: {
          create: input.lines.map((l) => ({
            product_id: l.product_id,
            qty: new Prisma.Decimal(l.qty)
          }))
        }
      }
    });

    for (const line of input.lines) {
      if (!Number.isFinite(line.qty) || line.qty <= 0) throw new Error("BAD_QTY");
      const delta = new Prisma.Decimal(line.qty);
      await tx.stock.upsert({
        where: {
          tenant_id_warehouse_id_product_id: {
            tenant_id: tenantId,
            warehouse_id: input.warehouse_id,
            product_id: line.product_id
          }
        },
        create: {
          tenant_id: tenantId,
          warehouse_id: input.warehouse_id,
          product_id: line.product_id,
          qty: delta
        },
        update: { qty: { increment: delta } }
      });
    }

    if (refund != null && clientId != null) {
      const bal = await tx.clientBalance.upsert({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
        create: { tenant_id: tenantId, client_id: clientId, balance: refund },
        update: { balance: { increment: refund } }
      });
      await tx.clientBalanceMovement.create({
        data: {
          client_balance_id: bal.id,
          delta: refund,
          note: `Qaytarish ${number}`,
          user_id: uid
        }
      });
    }

    return tx.salesReturn.findFirstOrThrow({
      where: { id: ret.id },
      include: {
        client: { select: { name: true } },
        order: { select: { number: true } },
        warehouse: { select: { name: true } }
      }
    });
  });

  void invalidateStock(tenantId, input.warehouse_id);

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: String(input.warehouse_id),
    action: "sales_return",
    payload: { return_id: row.id, number: row.number, line_count: input.lines.length }
  });

  if (clientId != null) {
    await appendClientAuditLog(tenantId, clientId, actorUserId, "client.sales_return", {
      return_id: row.id,
      number: row.number,
      refund: refund?.toString() ?? null
    });
  }

  return {
    id: row.id,
    number: row.number,
    client_id: row.client_id,
    client_name: row.client?.name ?? null,
    order_id: row.order_id,
    order_number: row.order?.number ?? null,
    warehouse_id: row.warehouse_id,
    warehouse_name: row.warehouse.name,
    status: row.status,
    refund_amount: row.refund_amount?.toString() ?? null,
    note: row.note,
    refusal_reason_ref: row.refusal_reason_ref ?? null,
    created_at: row.created_at.toISOString()
  };
}
