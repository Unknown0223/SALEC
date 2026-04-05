/**
 * Auto-status cron worker.
 *
 * Periodically transitions orders based on time rules and emits
 * low-stock notifications for warehouse items below the threshold.
 */
import { prisma } from "../config/database";
import { canTransitionOrderStatus } from "../modules/orders/order-status";
import { emitOrderUpdated } from "./order-event-bus";

// ── Config (env with defaults) ──────────────────────────────────────
const AUTO_CLOSE_DAYS = parseInt(process.env.AUTO_CLOSE_DAYS ?? "7", 10);
const AUTO_PICKING_HOURS = parseInt(process.env.AUTO_PICKING_HOURS ?? "24", 10);
const AUTO_DELIVER_HOURS = parseInt(process.env.AUTO_DELIVER_HOURS ?? "48", 10);
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS ?? "3600000", 10);
const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD ?? "5", 10);

const SYSTEM_USER_ID = 0;
const SYSTEM_ROLE = "system";

// Shared interval handles so enable/disable works at module level.
let intervalAutoClose: ReturnType<typeof setInterval> | null = null;
let intervalLowStock: ReturnType<typeof setInterval> | null = null;

// ── Public API ──────────────────────────────────────────────────────

/** Start the periodic timers. */
export function enableAutoClose(): void {
  if (intervalAutoClose != null) return; // already running
  intervalAutoClose = setInterval(() => {
    void runAutoClose().catch((err) => {
      console.error("[order-auto-cron] runAutoClose error:", err);
    });
  }, CHECK_INTERVAL_MS);

  if (intervalLowStock != null) return;
  intervalLowStock = setInterval(() => {
    void runLowStockNotifications().catch((err) => {
      console.error("[order-auto-cron] runLowStockNotifications error:", err);
    });
  }, CHECK_INTERVAL_MS);

  console.log("[order-auto-cron] Timers started (interval = %d ms)", CHECK_INTERVAL_MS);
}

/** Stop all periodic timers. */
export function disableAutoClose(): void {
  if (intervalAutoClose != null) {
    clearInterval(intervalAutoClose);
    intervalAutoClose = null;
  }
  if (intervalLowStock != null) {
    clearInterval(intervalLowStock);
    intervalLowStock = null;
  }
  console.log("[order-auto-cron] Timers stopped.");
}

// ── Auto status transitions ─────────────────────────────────────────

type TransitionRule = {
  fromStatus: string;
  toStatus: string;
  label: string;
  cutoffDate: Date;
};

/**
 * Single run: scan all tenants and transition orders whose status has
 * been sitting too long.
 */
export async function runAutoClose(): Promise<{
  attempted: number;
  succeeded: number;
  skipped: { id: number; reason: string }[];
}> {
  const now = new Date();
  const closeCutoff = new Date(now.getTime() - AUTO_CLOSE_DAYS * 24 * 3600 * 1000);
  const pickingCutoff = new Date(now.getTime() - AUTO_PICKING_HOURS * 3600 * 1000);
  const deliverCutoff = new Date(now.getTime() - AUTO_DELIVER_HOURS * 3600 * 1000);

  // Build rules. Note: delivered -> cancelled is NOT a valid transition
  // (only delivered -> returned is).  We target *returned* for stale
  // delivered orders instead.
  const rules: TransitionRule[] = [
    {
      fromStatus: "delivered",
      toStatus: "returned",
      label: "auto-return-stale-delivered",
      cutoffDate: closeCutoff,
    },
    {
      fromStatus: "confirmed",
      toStatus: "picking",
      label: "auto-to-picking",
      cutoffDate: pickingCutoff,
    },
    {
      fromStatus: "picking",
      toStatus: "delivering",
      label: "auto-to-delivering",
      cutoffDate: deliverCutoff,
    },
  ];

  let attempted = 0;
  let succeeded = 0;
  const skipped: { id: number; reason: string }[] = [];

  for (const rule of rules) {
    // Find orders that match the rule and are older than the cutoff.
    const orders = await prisma.order.findMany({
      where: {
        status: rule.fromStatus,
        created_at: { lt: rule.cutoffDate },
      },
      select: { id: true, tenant_id: true, status: true },
    });

    for (const order of orders) {
      attempted++;

      // Double-check transition validity.
      if (!canTransitionOrderStatus(order.status, rule.toStatus)) {
        skipped.push({
          id: order.id,
          reason: `invalid transition ${order.status}->${rule.toStatus}`,
        });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          // 1. Update order status.
          await tx.order.update({
            where: { id: order.id },
            data: { status: rule.toStatus },
          });

          // 2. Log in OrderStatusLog.
          await tx.orderStatusLog.create({
            data: {
              order_id: order.id,
              from_status: rule.fromStatus,
              to_status: rule.toStatus,
              user_id: null, // system-initiated
            },
          });

          // 3. Log in OrderChangeLog.
          await tx.orderChangeLog.create({
            data: {
              order_id: order.id,
              user_id: null,
              action: rule.label,
              payload: {
                from_status: rule.fromStatus,
                to_status: rule.toStatus,
                reason: `Auto-transition: order was in "${rule.fromStatus}" past threshold (${rule.cutoffDate.toISOString()})`,
              },
            },
          });
        });

        succeeded++;
        emitOrderUpdated(order.tenant_id, order.id);
        console.log(
          "[order-auto-cron] Order #%d %s -> %s (%s)",
          order.id,
          rule.fromStatus,
          rule.toStatus,
          rule.label
        );
      } catch (err) {
        skipped.push({ id: order.id, reason: String(err) });
      }
    }
  }

  if (attempted > 0) {
    console.log(
      "[order-auto-cron] runAutoClose done: attempted=%d succeeded=%d skipped=%d",
      attempted,
      succeeded,
      skipped.length
    );
  }

  return { attempted, succeeded, skipped };
}

// ── Low-stock notifications ─────────────────────────────────────────

/**
 * Check all tenants' warehouses.  If any product's available quantity
 * (qty - reserved_qty) drops below LOW_STOCK_THRESHOLD and there is no
 * InAppNotification for that user within the last 24 hours on the same
 * topic, create one.
 */
export async function runLowStockNotifications(): Promise<number> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  // 1. Find all (tenant, product) combos below threshold.
  const lowStock = await prisma.stock.groupBy({
    by: ["tenant_id", "product_id"],
    where: {},
    _sum: { qty: true, reserved_qty: true },
  });

  const threshold = LOW_STOCK_THRESHOLD;
  // Filter to items where available qty < threshold
  const belowThreshold: { tenant_id: number; product_id: number }[] = [];
  for (const row of lowStock) {
    const qty = row._sum.qty?.toNumber() ?? 0;
    const reserved = row._sum.reserved_qty?.toNumber() ?? 0;
    if (qty - reserved < threshold) {
      belowThreshold.push({ tenant_id: row.tenant_id, product_id: row.product_id });
    }
  }

  if (belowThreshold.length === 0) return 0;

  // 2. Collect distinct tenant IDs.
  const tenantIds = [...new Set(belowThreshold.map((x) => x.tenant_id))];

  // 3. For each tenant find admins and supervisors.
  const users = await prisma.user.findMany({
    where: {
      tenant_id: { in: tenantIds },
      role: { in: ["admin", "supervisor"] },
      is_active: true,
    },
    select: { id: true, tenant_id: true, role: true },
  });

  // 4. Build a set of users that already received a low_stock notification
  //    in the last 24 hours (same tenant).
  const recentlyNotified = await prisma.inAppNotification.findMany({
    where: {
      tenant_id: { in: tenantIds },
      title: { contains: "Low Stock" },
      created_at: { gte: twentyFourHoursAgo },
    },
    select: { tenant_id: true, user_id: true },
  });
  const notifiedSet = new Set<string>();
  for (const n of recentlyNotified) {
    notifiedSet.add(`${n.tenant_id}:${n.user_id}`);
  }

  // 5. Get product details for the message body.
  const productIds = [...new Set(belowThreshold.map((x) => x.product_id))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });
  const productMap = new Map<number, { name: string; sku: string }>();
  for (const p of products) {
    productMap.set(p.id, { name: p.name, sku: p.sku ?? "" });
  }

  // 6. Create notifications for users who haven't been notified in 24 h.
  let created = 0;
  for (const tenantId of tenantIds) {
    const tenantUsers = users.filter((u) => u.tenant_id === tenantId);
    for (const user of tenantUsers) {
      const key = `${tenantId}:${user.id}`;
      if (notifiedSet.has(key)) continue;

      // Build a summary of low-stock products for this tenant.
      const tenantLowProducts = belowThreshold
        .filter((x) => x.tenant_id === tenantId)
        .slice(0, 10)
        .map((x) => {
          const prod = productMap.get(x.product_id);
          return prod ? `${prod.name} (${prod.sku})` : `Product #${x.product_id}`;
        });

      await prisma.inAppNotification.create({
        data: {
          tenant_id: tenantId,
          user_id: user.id,
          title: "Low Stock Alert",
          body: `The following products are running low (< ${threshold} available):\n${tenantLowProducts.join("\n")}`,
        },
      });
      created++;
      notifiedSet.add(key);
    }
  }

  if (created > 0) {
    console.log(
      "[order-auto-cron] Created %d low-stock notifications for %d tenant(s)",
      created,
      tenantIds.length
    );
  }

  return created;
}
