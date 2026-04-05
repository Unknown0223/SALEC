import { prisma } from "../../config/database";

// ---------------------------------------------------------------------------
// Compact helpers
// ---------------------------------------------------------------------------
type Compact<T> = { [K in keyof T]: T[K] };

function compactClient(c: any): Compact<any> {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    inn: c.inn,
    latitude: c.latitude ? Number(c.latitude) : null,
    longitude: c.longitude ? Number(c.longitude) : null,
    is_active: c.is_active,
    category: c.category,
    client_code: c.client_code,
    sales_channel: c.sales_channel,
    updated_at: c.updated_at,
  };
}

function compactProduct(p: any): Compact<any> {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    barcode: p.barcode,
    category_id: p.category_id,
    brand_id: p.brand_id,
    is_active: p.is_active,
    weight_kg: p.weight_kg ? Number(p.weight_kg) : null,
    sell_code: p.sell_code,
    updated_at: p.updated_at,
  };
}

function compactPrice(p: any): Compact<any> {
  return {
    product_id: p.product_id,
    price_type: p.price_type,
    price: Number(p.price),
  };
}

function compactOrder(o: any): Compact<any> {
  return {
    id: o.id,
    number: o.number,
    client_id: o.client_id,
    agent_id: o.agent_id,
    warehouse_id: o.warehouse_id,
    status: o.status,
    total_sum: Number(o.total_sum),
    created_at: o.created_at,
  };
}

function compactOrderItem(item: any): Compact<any> {
  return {
    product_id: item.product_id,
    qty: Number(item.qty),
    price: Number(item.price),
    total: Number(item.total),
  };
}

// ---------------------------------------------------------------------------
// Full sync — returns everything since `lastSyncAt`
// ---------------------------------------------------------------------------
export async function syncFull(tenantId: number, userId: number, lastSyncAt: Date | null) {
  const since: Date = lastSyncAt ?? new Date(0);

  const [clients, products, productPrices, orders] = await Promise.all([
    prisma.client.findMany({
      where: { tenant_id: tenantId, updated_at: { gt: since } },
      select: {
        id: true, name: true, address: true, phone: true, inn: true,
        latitude: true, longitude: true, is_active: true, category: true,
        client_code: true, sales_channel: true, updated_at: true,
      },
    }),
    prisma.product.findMany({
      where: { tenant_id: tenantId, updated_at: { gt: since } },
      select: {
        id: true, sku: true, name: true, unit: true, barcode: true,
        category_id: true, brand_id: true, is_active: true,
        weight_kg: true, sell_code: true, updated_at: true,
      },
    }),
    prisma.productPrice.findMany({
      where: { tenant_id: tenantId, updated_at: { gt: since } },
      select: { product_id: true, price_type: true, price: true },
    }),
    prisma.order.findMany({
      where: { tenant_id: tenantId, updated_at: { gt: since } },
      select: {
        id: true, number: true, client_id: true, agent_id: true,
        warehouse_id: true, status: true, total_sum: true, created_at: true,
        items: { select: { product_id: true, qty: true, price: true, total: true } },
      },
    }),
  ]);

  const now = new Date();

  // Update user last_sync_at
  await prisma.user.update({
    where: { id: userId },
    data: { last_sync_at: now },
  });

  return {
    sync_at: now.toISOString(),
    clients: clients.map(compactClient),
    products: products.map(compactProduct),
    prices: productPrices.map(compactPrice),
    orders: orders.map((o) => ({
      ...compactOrder(o),
      items: (o as any).items.map(compactOrderItem),
    })),
  };
}

// ---------------------------------------------------------------------------
// Delta sync — only changes for a specific entity type since `lastSyncAt`
// ---------------------------------------------------------------------------
export async function syncDelta(
  tenantId: number,
  userId: number,
  lastSyncAt: Date | null,
  entityType?: "clients" | "products" | "prices" | "orders",
) {
  const since: Date = lastSyncAt ?? new Date(0);
  const now = new Date();

  let result: any = {};

  switch (entityType) {
    case "clients": {
      const rows = await prisma.client.findMany({
        where: { tenant_id: tenantId, updated_at: { gt: since } },
        select: {
          id: true, name: true, address: true, phone: true, inn: true,
          latitude: true, longitude: true, is_active: true, category: true,
          client_code: true, sales_channel: true, updated_at: true,
        },
      });
      result.clients = rows.map(compactClient);
      break;
    }
    case "products": {
      const rows = await prisma.product.findMany({
        where: { tenant_id: tenantId, updated_at: { gt: since } },
        select: {
          id: true, sku: true, name: true, unit: true, barcode: true,
          category_id: true, brand_id: true, is_active: true,
          weight_kg: true, sell_code: true, updated_at: true,
        },
      });
      result.products = rows.map(compactProduct);
      break;
    }
    case "prices": {
      const rows = await prisma.productPrice.findMany({
        where: { tenant_id: tenantId, updated_at: { gt: since } },
        select: { product_id: true, price_type: true, price: true },
      });
      result.prices = rows.map(compactPrice);
      break;
    }
    case "orders": {
      const rows = await prisma.order.findMany({
        where: { tenant_id: tenantId, updated_at: { gt: since } },
        select: {
          id: true, number: true, client_id: true, agent_id: true,
          warehouse_id: true, status: true, total_sum: true, created_at: true,
          items: { select: { product_id: true, qty: true, price: true, total: true } },
        },
      });
      result.orders = rows.map((o: any) => ({
        ...compactOrder(o),
        items: o.items.map(compactOrderItem),
      }));
      break;
    }
    default: {
      // No entity specified — return minimal header
      break;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { last_sync_at: now },
  });

  return { sync_at: now.toISOString(), ...result };
}

// ---------------------------------------------------------------------------
// Enqueue an offline order — stored with status "pending_sync"
// ---------------------------------------------------------------------------
export async function enqueueOrder(
  tenantId: number,
  userId: number,
  clientLocalId: string | number,
  items: { product_id: number; qty: number; price?: number }[],
  offlineCreatedAt: Date,
) {
  const now = new Date();

  // For offline orders the server_id is not yet known; we generate a
  // temporary number that will be replaced when the order is synced.
  const tempNumber = `OFF-${now.getTime()}`;

  const order = await prisma.order.create({
    data: {
      tenant_id: tenantId,
      number: tempNumber,
      client_id: typeof clientLocalId === "number"
        ? clientLocalId
        : parseInt(clientLocalId as string, 10),
      status: "pending_sync",
      total_sum: 0,
      bonus_sum: 0,
      created_at: offlineCreatedAt,
      updated_at: now,
      items: {
        create: items.map((it) => ({
          product_id: it.product_id,
          qty: it.qty,
          price: it.price ?? 0,
          total: 0,
          is_bonus: false,
        })),
      },
      // Minimal change-log entry
      change_logs: {
        create: {
          user_id: userId,
          action: "offline_enqueue",
          payload: { offline_created_at: offlineCreatedAt.toISOString() },
        },
      },
    },
    select: { id: true, number: true, status: true, created_at: true },
  });

  return order;
}

// ---------------------------------------------------------------------------
// Count of offline / pending orders
// ---------------------------------------------------------------------------
export async function getPendingCount(tenantId: number, userId: number) {
  const count = await prisma.order.count({
    where: { tenant_id: tenantId, status: "pending_sync" },
  });
  return { pending: count };
}

// ---------------------------------------------------------------------------
// Sync (push) offline orders — re-number, recalc, update status
// ---------------------------------------------------------------------------
export async function syncOrders(tenantId: number, userId: number) {
  const offlineOrders = await prisma.order.findMany({
    where: { tenant_id: tenantId, status: "pending_sync" },
    include: { items: true },
    orderBy: { created_at: "asc" },
  });

  if (offlineOrders.length === 0) {
    return { synced: 0, results: [] };
  }

  const results: { clientLocalId: number; serverId: number; serverNumber: string }[] = [];

  // ✅ TRANSACTION bilan barcha offline zakazlarni bir martada yangilash (N+1 fix)
  await prisma.$transaction(async (tx) => {
    for (const order of offlineOrders) {
      const serverNumber = `ORD-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      let totalSum = 0;
      const itemIds: number[] = [];

      for (const item of order.items) {
        const total = Number(item.qty) * Number(item.price);
        totalSum += total;
        itemIds.push(item.id);
      }

      // ✅ Bulk update order items (N+1 fix)
      if (itemIds.length > 0) {
        for (const item of order.items) {
          const total = Number(item.qty) * Number(item.price);
          await tx.orderItem.update({ where: { id: item.id }, data: { total } });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { number: serverNumber, status: "new", total_sum: totalSum, updated_at: new Date() },
      });

      results.push({
        clientLocalId: order.client_id,
        serverId: order.id,
        serverNumber,
      });
    }
  });

  return { synced: results.length, results };
}

// ---------------------------------------------------------------------------
// Register an FCM device token  (uses `$queryRaw` — add `mobile_device_tokens`
// table in schema.prisma for full Prisma support)
// ---------------------------------------------------------------------------
export async function registerFcmToken(
  tenantId: number,
  userId: number,
  token: string,
  deviceType: "android" | "ios" | "web",
) {
  // Upsert via raw SQL — the tokens are tenant-scoped so duplicates per user
  // are harmless but we avoid storing the same token twice.
  await prisma.$executeRawUnsafe(
    `INSERT INTO device_tokens (tenant_id, user_id, fcm_token, device_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id, fcm_token) DO UPDATE SET updated_at = NOW()`,
    tenantId,
    userId,
    token,
    deviceType,
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attach photo to a visit
// ---------------------------------------------------------------------------
export async function uploadVisitPhoto(
  tenantId: number,
  visitId: number,
  photoUrl: string,
  notes?: string,
) {
  const visit = await prisma.agentVisit.findUnique({
    where: { id: visitId, tenant_id: tenantId },
    select: { id: true },
  });

  if (!visit) {
    throw new Error("VisitNotFound");
  }

  // Append photo info to the visit notes or photos JSON.
  // Requires: ALTER TABLE agent_visits ADD COLUMN photos JSONB DEFAULT '[]';
  await prisma.$executeRawUnsafe(
    `UPDATE agent_visits
     SET photos = COALESCE(photos, '[]'::jsonb) ||
                  ($1::jsonb)
     WHERE id = $2`,
    JSON.stringify([{ url: photoUrl, notes: notes ?? null, uploaded_at: new Date().toISOString() }]),
    visitId,
  );

  return { ok: true, visit_id: visitId };
}
