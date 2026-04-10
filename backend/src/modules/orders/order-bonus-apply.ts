import type { Prisma } from "@prisma/client";
import { Prisma as PrismaClient } from "@prisma/client";
import {
  bonusRuleInclude,
  computeQtyBonusForRuleRow,
  mapBonusRuleFull,
  type BonusRuleRow
} from "../bonus-rules/bonus-rules.service";
import { getProductPrice } from "../products/product-prices.service";
import { resolveBonusSlotTakeCount, type BonusStackPolicy } from "./bonus-stack-policy";

type ProductLite = { id: number; category_id: number | null };

export type PaidLineDraft = {
  product_id: number;
  qty: PrismaClient.Decimal;
  price: PrismaClient.Decimal;
  total: PrismaClient.Decimal;
};

export type BonusLineDraft = {
  product_id: number;
  qty: PrismaClient.Decimal;
  price: PrismaClient.Decimal;
  total: PrismaClient.Decimal;
  is_bonus: true;
};

function roundMoney(d: PrismaClient.Decimal): PrismaClient.Decimal {
  return d.toDecimalPlaces(2, PrismaClient.Decimal.ROUND_HALF_UP);
}

function ruleNeedsOrderContext(rule: BonusRuleRow): boolean {
  const nonempty = (s: string | null | undefined) => s != null && String(s).trim() !== "";
  return (
    nonempty(rule.payment_type) ||
    nonempty(rule.client_type) ||
    nonempty(rule.sales_channel) ||
    nonempty(rule.price_type)
  );
}

export function ruleMatchesClient(
  rule: BonusRuleRow,
  client: { id: number; category: string | null }
): boolean {
  if (!rule.target_all_clients && !rule.selected_client_ids.includes(client.id)) {
    return false;
  }
  if (rule.client_category != null && String(rule.client_category).trim() !== "") {
    if (String(rule.client_category).trim() !== String(client.category ?? "").trim()) {
      return false;
    }
  }
  return true;
}

/** Zakazdagi mahsulotlar to‘plami qoida filtriga mos keladimi. */
export function ruleMatchesOrderProductScope(
  rule: BonusRuleRow,
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>
): boolean {
  if (rule.product_ids.length > 0) {
    if (!rule.product_ids.some((id) => orderedProductIds.has(id))) {
      return false;
    }
  }
  if (rule.product_category_ids.length > 0) {
    let ok = false;
    for (const pid of orderedProductIds) {
      const p = productById.get(pid);
      if (p?.category_id != null && rule.product_category_ids.includes(p.category_id)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** Sotib olish doirasi: mahsulot yoki kategoriya tanlangan bo‘lsa — har SKU alohida; bo‘shsa — zakaz bo‘yicha umumiy miqdor. */
export function ruleHasPurchaseScope(rule: BonusRuleRow): boolean {
  return rule.product_ids.length > 0 || rule.product_category_ids.length > 0;
}

/** Umumiy miqdor (asortimentsiz qty) peeklarida `purchasedPid` o‘rniga. */
export const QTY_AGGREGATE_PURCHASED_PID = 0;

export type QtyGiftResolveContext = {
  /** Omborda mavjud (qty − reserved), bonus tanlash uchun */
  availableByProductId?: ReadonlyMap<number, number>;
  /** Kamida shuncha dona chiqarish mumkin bo‘lishi kerak */
  minUnits?: number;
};

function pickGiftFromAllowedList(
  allowed: number[],
  purchasedPid: number,
  avail: ReadonlyMap<number, number> | undefined,
  minUnits: number
): number {
  if (allowed.length === 0) return purchasedPid > 0 ? purchasedPid : 0;

  const canServe = (pid: number) => (avail?.get(pid) ?? Number.POSITIVE_INFINITY) >= minUnits;

  if (purchasedPid > 0 && allowed.includes(purchasedPid)) {
    if (avail == null || canServe(purchasedPid)) return purchasedPid;
  }

  if (avail != null && allowed.length > 1) {
    const sorted = [...allowed].sort((a, b) => (avail.get(b) ?? 0) - (avail.get(a) ?? 0));
    for (const pid of sorted) {
      if (canServe(pid)) return pid;
    }
    return sorted[0]!;
  }

  return allowed[0]!;
}

/**
 * Qty bonus sovg‘a mahsuloti:
 * - `bonus_product_ids` bo‘sh → `purchasedPid` (trigger qatori / agregatda eng ko‘p sotilgan SKU).
 * - Ro‘yxat bor → avvalo **shu qatordagi** mahsulot ro‘yxatda bo‘lsa va omborda yetarli bo‘lsa shu;
 *   aks holda ro‘yxatdan **eng ko‘p qoldiq** bo‘yicha (mijoz «boshqa razmer» holati).
 */
export function resolveQtyGiftProductId(
  rule: BonusRuleRow,
  purchasedPid: number,
  giftOverrides: ReadonlyMap<number, number>,
  ctx?: QtyGiftResolveContext
): number {
  const allowed = rule.bonus_product_ids;
  const minUnits = Math.max(1, ctx?.minUnits ?? 1);
  const avail = ctx?.availableByProductId;

  const override = giftOverrides.get(rule.id);
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    if (allowed.length > 0) {
      if (allowed.includes(override)) return override;
    } else if (purchasedPid > 0 && override === purchasedPid) {
      return override;
    }
  }

  if (allowed.length === 0) {
    return purchasedPid > 0 ? purchasedPid : 0;
  }

  const linePid =
    purchasedPid === QTY_AGGREGATE_PURCHASED_PID || purchasedPid <= 0 ? -1 : purchasedPid;

  return pickGiftFromAllowedList(allowed, linePid, avail, minUnits);
}

async function loadAvailableQtyByProductId(
  tx: Prisma.TransactionClient,
  tenantId: number,
  warehouseId: number | null | undefined,
  productIds: Iterable<number>
): Promise<Map<number, number>> {
  const ids = [...new Set(productIds)].filter((id) => id > 0);
  if (warehouseId == null || warehouseId < 1 || ids.length === 0) {
    return new Map();
  }
  const rows = await tx.stock.findMany({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, product_id: { in: ids } },
    select: { product_id: true, qty: true, reserved_qty: true }
  });
  const map = new Map<number, number>();
  for (const s of rows) {
    const free = Number(s.qty) - Number(s.reserved_qty);
    map.set(s.product_id, Math.max(0, free));
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

/** Mijoz uchun avval `once_per_client` qoidalar qaysi ID lar bilan qo‘llangan (faqat shu qatorlar). */
export async function fetchClientUsedAutoBonusRuleIds(
  tx: Prisma.TransactionClient,
  tenantId: number,
  clientId: number
): Promise<Set<number>> {
  const rows = await tx.order.findMany({
    where: { tenant_id: tenantId, client_id: clientId },
    select: { applied_auto_bonus_rule_ids: true }
  });
  const out = new Set<number>();
  for (const r of rows) {
    for (const id of r.applied_auto_bonus_rule_ids) {
      out.add(id);
    }
  }
  return out;
}

/** `once_per_client` hisobida joriy zakaz (tahrir) hisobga olinmasin. */
export async function fetchClientUsedAutoBonusRuleIdsExcludingOrder(
  tx: Prisma.TransactionClient,
  tenantId: number,
  clientId: number,
  excludeOrderId: number
): Promise<Set<number>> {
  const rows = await tx.order.findMany({
    where: {
      tenant_id: tenantId,
      client_id: clientId,
      id: { not: excludeOrderId }
    },
    select: { applied_auto_bonus_rule_ids: true }
  });
  const out = new Set<number>();
  for (const r of rows) {
    for (const id of r.applied_auto_bonus_rule_ids) {
      out.add(id);
    }
  }
  return out;
}

function ruleBlockedByOncePerClient(rule: BonusRuleRow, clientUsedRuleIds: ReadonlySet<number>): boolean {
  return rule.once_per_client && clientUsedRuleIds.has(rule.id);
}

function ruleMatchesProduct(rule: BonusRuleRow, product: ProductLite): boolean {
  if (rule.product_ids.length > 0 && !rule.product_ids.includes(product.id)) {
    return false;
  }
  if (rule.product_category_ids.length > 0) {
    if (product.category_id == null || !rule.product_category_ids.includes(product.category_id)) {
      return false;
    }
  }
  return true;
}

/** Summa bonusi: `bonus_product_ids` bo‘sh bo‘lsa — zakazdagi mos qatorlardan eng ko‘p miqdorli SKU (tenglikda kichik id). */
function resolveSumRuleGiftProductId(
  rule: BonusRuleRow,
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  qtyByProduct: ReadonlyMap<number, number>
): number | null {
  const direct = rule.bonus_product_ids[0];
  if (direct != null && direct > 0) return direct;

  let bestPid = 0;
  let bestQty = -1;
  for (const pid of orderedProductIds) {
    const p = productById.get(pid);
    if (!p) continue;
    if (!ruleMatchesProduct(rule, p)) continue;
    const q = qtyByProduct.get(pid) ?? 0;
    if (bestPid === 0) {
      bestPid = pid;
      bestQty = q;
      continue;
    }
    if (q > bestQty || (q === bestQty && pid < bestPid)) {
      bestPid = pid;
      bestQty = q;
    }
  }
  return bestPid > 0 ? bestPid : null;
}

const activeRuleWhere = (tenantId: number, type: string, now: Date) => ({
  tenant_id: tenantId,
  type,
  is_active: true,
  is_manual: false,
  AND: [
    { OR: [{ valid_from: null }, { valid_from: { lte: now } }] },
    { OR: [{ valid_to: null }, { valid_to: { gte: now } }] }
  ]
});

/** Zakaz yechimi: qoida daraxti (o‘zaro bog‘langan qoidalar) uchun kontekst. */
export type OrderBonusPrereqEnv = {
  tx: Prisma.TransactionClient;
  tenantId: number;
  client: { id: number; category: string | null };
  orderedProductIds: ReadonlySet<number>;
  productById: ReadonlyMap<number, ProductLite>;
  baseSubtotalBeforeDiscount: PrismaClient.Decimal;
  qtyByProduct: ReadonlyMap<number, number>;
  clientUsedAutoBonusRuleIds: ReadonlySet<number>;
  giftOverrides: ReadonlyMap<number, number>;
  warehouseId?: number | null;
  availableByProductId: ReadonlyMap<number, number>;
  ruleCache: Map<number, BonusRuleRow | null>;
};

function ruleActiveAt(rule: BonusRuleRow, now: Date): boolean {
  if (!rule.is_active) return false;
  if (rule.valid_from) {
    const vf = new Date(rule.valid_from);
    if (vf > now) return false;
  }
  if (rule.valid_to) {
    const vt = new Date(rule.valid_to);
    if (vt < now) return false;
  }
  return true;
}

async function ensurePrereqRule(env: OrderBonusPrereqEnv, id: number): Promise<BonusRuleRow | null> {
  if (env.ruleCache.has(id)) return env.ruleCache.get(id) ?? null;
  const raw = await env.tx.bonusRule.findFirst({
    where: { id, tenant_id: env.tenantId },
    include: bonusRuleInclude
  });
  const row = raw ? mapBonusRuleFull(raw) : null;
  env.ruleCache.set(id, row);
  return row;
}

function qtyRuleWouldProduceAnyPeek(rule: BonusRuleRow, env: OrderBonusPrereqEnv): boolean {
  let totalPaidQty = 0;
  for (const q of env.qtyByProduct.values()) {
    if (q > 0) totalPaidQty += q;
  }

  if (!ruleHasPurchaseScope(rule)) {
    const bonusUnits = computeQtyBonusForRuleRow(rule, totalPaidQty);
    if (bonusUnits <= 0) return false;
    const ctx: QtyGiftResolveContext = { availableByProductId: env.availableByProductId, minUnits: bonusUnits };
    if (rule.bonus_product_ids.length === 0) {
      let heroPid = 0;
      let heroQ = 0;
      for (const [pid, q] of env.qtyByProduct) {
        if (q > heroQ) {
          heroQ = q;
          heroPid = pid;
        }
      }
      if (heroPid <= 0) return false;
      return resolveQtyGiftProductId(rule, heroPid, env.giftOverrides, ctx) > 0;
    }
    return resolveQtyGiftProductId(rule, QTY_AGGREGATE_PURCHASED_PID, env.giftOverrides, ctx) > 0;
  }

  for (const [purchasedPid, purchasedQty] of env.qtyByProduct) {
    if (purchasedQty <= 0) continue;
    const product = env.productById.get(purchasedPid);
    if (!product) continue;
    if (!ruleMatchesProduct(rule, product)) continue;
    const bonusUnits = computeQtyBonusForRuleRow(rule, purchasedQty);
    if (bonusUnits <= 0) continue;
    const giftPid = resolveQtyGiftProductId(rule, purchasedPid, env.giftOverrides, {
      availableByProductId: env.availableByProductId,
      minUnits: bonusUnits
    });
    if (giftPid > 0) return true;
  }
  return false;
}

function ruleMatchesAsStandaloneAutoBonusForOrder(rule: BonusRuleRow, env: OrderBonusPrereqEnv, now: Date): boolean {
  if (rule.is_manual) return false;
  if (ruleNeedsOrderContext(rule)) return false;
  if (!ruleActiveAt(rule, now)) return false;
  if (ruleBlockedByOncePerClient(rule, env.clientUsedAutoBonusRuleIds)) return false;
  if (!ruleMatchesClient(rule, env.client)) return false;
  if (!ruleMatchesOrderProductScope(rule, env.orderedProductIds, env.productById)) return false;

  if (rule.type === "discount") {
    return rule.discount_pct != null && rule.discount_pct > 0;
  }
  if (rule.type === "sum") {
    if (rule.min_sum == null) return false;
    if (env.baseSubtotalBeforeDiscount.lt(new PrismaClient.Decimal(rule.min_sum))) return false;
    const giftPid = resolveSumRuleGiftProductId(rule, env.orderedProductIds, env.productById, env.qtyByProduct);
    return giftPid != null && giftPid > 0;
  }
  if (rule.type === "qty") {
    return qtyRuleWouldProduceAnyPeek(rule, env);
  }
  return false;
}

async function ruleTreeSatisfiedForOrder(
  rule: BonusRuleRow,
  env: OrderBonusPrereqEnv,
  now: Date,
  stack: Set<number>
): Promise<boolean> {
  if (stack.has(rule.id)) return false;
  stack.add(rule.id);
  try {
    const ids = rule.prerequisite_rule_ids ?? [];
    for (const pid of ids) {
      const pr = await ensurePrereqRule(env, pid);
      if (!pr) return false;
      if (!(await ruleTreeSatisfiedForOrder(pr, env, now, stack))) return false;
    }
    return ruleMatchesAsStandaloneAutoBonusForOrder(rule, env, now);
  } finally {
    stack.delete(rule.id);
  }
}

async function findWinningDiscountRuleWithPrereqs(
  discountRulesSorted: BonusRuleRow[],
  client: { id: number; category: string | null },
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number>,
  prereqEnv: OrderBonusPrereqEnv,
  now: Date
): Promise<BonusRuleRow | null> {
  const candidates = discountRulesSorted
    .filter((r) => r.type === "discount" && !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds))
    .filter((r) => ruleMatchesClient(r, client))
    .filter((r) => ruleMatchesOrderProductScope(r, orderedProductIds, productById))
    .filter((r) => r.discount_pct != null && r.discount_pct > 0);
  for (const r of candidates) {
    if (!(await ruleTreeSatisfiedForOrder(r, prereqEnv, now, new Set()))) continue;
    return r;
  }
  return null;
}

export function findWinningDiscountRule(
  discountRulesSorted: BonusRuleRow[],
  client: { id: number; category: string | null },
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set()
): BonusRuleRow | null {
  const candidates = discountRulesSorted
    .filter((r) => r.type === "discount" && !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds))
    .filter((r) => ruleMatchesClient(r, client))
    .filter((r) => ruleMatchesOrderProductScope(r, orderedProductIds, productById))
    .filter((r) => r.discount_pct != null && r.discount_pct > 0);
  return candidates[0] ?? null;
}

export function applyDiscountWithRule(
  rule: BonusRuleRow,
  paidLines: PaidLineDraft[],
  paidTotal: PrismaClient.Decimal
): { lines: PaidLineDraft[]; total: PrismaClient.Decimal } {
  if (rule.discount_pct == null) {
    return { lines: paidLines.map((l) => ({ ...l })), total: paidTotal };
  }
  const lines = paidLines.map((l) => ({ ...l }));
  const hundred = new PrismaClient.Decimal(100);
  const factor = hundred.sub(new PrismaClient.Decimal(rule.discount_pct)).div(hundred);
  const target = roundMoney(paidTotal.mul(factor));
  if (lines.length === 0) {
    return { lines, total: target };
  }

  let allocated = new PrismaClient.Decimal(0);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (i === lines.length - 1) {
      const nt = roundMoney(target.sub(allocated));
      l.total = nt;
      l.price = nt.div(l.qty);
      continue;
    }
    const nt = roundMoney(l.total.mul(factor));
    allocated = allocated.add(nt);
    l.total = nt;
    l.price = nt.div(l.qty);
  }
  return { lines, total: target };
}

/**
 * Birinchi mos `discount` qoidasi (priority kamayish): to‘lov qatorlariga foizli chegirma.
 */
export function applyAutomaticDiscountToPaidLines(
  paidLines: PaidLineDraft[],
  paidTotal: PrismaClient.Decimal,
  discountRulesSorted: BonusRuleRow[],
  client: { id: number; category: string | null },
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set()
): { lines: PaidLineDraft[]; total: PrismaClient.Decimal } {
  const rule = findWinningDiscountRule(
    discountRulesSorted,
    client,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds
  );
  if (!rule) {
    return { lines: paidLines.map((l) => ({ ...l })), total: paidTotal };
  }
  return applyDiscountWithRule(rule, paidLines, paidTotal);
}

export type SumBonusPeek = {
  rule: BonusRuleRow;
  giftPid: number;
  units: number;
};

/**
 * Summa qoidasining birinchi mos varianti (narx olinmaydi).
 */
export async function findWinningSumPeek(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  baseSubtotalBeforeDiscount: PrismaClient.Decimal,
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set(),
  qtyByProduct: ReadonlyMap<number, number> = new Map(),
  engineOpts?: { rules?: BonusRuleRow[]; prereqEnv?: OrderBonusPrereqEnv }
): Promise<SumBonusPeek | null> {
  const now = new Date();
  const rules =
    engineOpts?.rules ??
    (
      await tx.bonusRule.findMany({
        where: activeRuleWhere(tenantId, "sum", now),
        include: bonusRuleInclude,
        orderBy: { priority: "desc" }
      })
    ).map((r) => mapBonusRuleFull(r));

  const filtered = rules.filter(
    (r) => !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds)
  );

  for (const rule of filtered) {
    if (rule.min_sum == null) continue;
    const minSum = new PrismaClient.Decimal(rule.min_sum);
    if (baseSubtotalBeforeDiscount.lt(minSum)) continue;
    if (!ruleMatchesClient(rule, client)) continue;
    if (!ruleMatchesOrderProductScope(rule, orderedProductIds, productById)) continue;

    const giftPid = resolveSumRuleGiftProductId(rule, orderedProductIds, productById, qtyByProduct);
    if (giftPid == null || giftPid <= 0) continue;

    if (engineOpts?.prereqEnv) {
      if (!(await ruleTreeSatisfiedForOrder(rule, engineOpts.prereqEnv, now, new Set()))) continue;
    }

    const units = rule.free_qty != null && rule.free_qty > 0 ? rule.free_qty : 1;
    return { rule, giftPid, units };
  }

  return null;
}

export async function buildSumBonusDraft(
  tenantId: number,
  giftPid: number,
  units: number
): Promise<BonusLineDraft[]> {
  const priceStr = await getProductPrice(tenantId, giftPid, "retail");
  if (priceStr == null) return [];

  const price = new PrismaClient.Decimal(priceStr);
  const qty = new PrismaClient.Decimal(units);
  const total = roundMoney(qty.mul(price));
  return [{ product_id: giftPid, qty, price, total, is_bonus: true }];
}

/**
 * `min_sum` dan keyin `free_qty` dona sovg‘a (chegirmadan oldingi yig‘indiga qarab).
 * `bonus_product_ids` bo‘sh bo‘lsa — zakazdagi mos qatorlardan eng ko‘p miqdorli mahsulot.
 */
export async function computeSumThresholdBonusLines(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  baseSubtotalBeforeDiscount: PrismaClient.Decimal,
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set(),
  qtyByProduct: ReadonlyMap<number, number> = new Map()
): Promise<BonusLineDraft[]> {
  const peek = await findWinningSumPeek(
    tx,
    tenantId,
    client,
    baseSubtotalBeforeDiscount,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds,
    qtyByProduct
  );
  if (!peek) return [];
  return buildSumBonusDraft(tenantId, peek.giftPid, peek.units);
}

export type QtyBonusPeek = {
  rule: BonusRuleRow;
  purchasedPid: number;
  giftPid: number;
  bonusQty: number;
};

/**
 * Qty bonus: (1) asortiment/kategoriya **bo‘sh** — zakazdagi **barcha** pullik qatorlar miqdori yig‘indisi bo‘yicha
 * **bitta** eng yuqori priority mos qoida; (2) asortiment **bor** — har SKU bo‘yicha avvalgidek.
 */
export async function findQtyBonusPeeks(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  qtyByProduct: ReadonlyMap<number, number>,
  productById: ReadonlyMap<number, ProductLite>,
  orderedProductIds: ReadonlySet<number>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set(),
  giftOverrides: ReadonlyMap<number, number> = new Map(),
  warehouseId?: number | null,
  engineOpts?: {
    rules?: BonusRuleRow[];
    prereqEnv?: OrderBonusPrereqEnv;
    availableByProductId?: Map<number, number>;
  }
): Promise<QtyBonusPeek[]> {
  const now = new Date();
  const rules =
    engineOpts?.rules ??
    (
      await tx.bonusRule.findMany({
        where: activeRuleWhere(tenantId, "qty", now),
        include: bonusRuleInclude,
        orderBy: { priority: "desc" }
      })
    ).map((r) => mapBonusRuleFull(r));

  const filtered = rules.filter(
    (r) => !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds)
  );

  const stockProductIds = new Set<number>();
  for (const pid of qtyByProduct.keys()) stockProductIds.add(pid);
  for (const r of filtered) {
    for (const id of r.bonus_product_ids) stockProductIds.add(id);
  }
  const availableByProductId =
    engineOpts?.availableByProductId ??
    (await loadAvailableQtyByProductId(tx, tenantId, warehouseId, stockProductIds));

  const peeks: QtyBonusPeek[] = [];

  let totalPaidQty = 0;
  for (const q of qtyByProduct.values()) {
    if (q > 0) totalPaidQty += q;
  }

  for (const rule of filtered) {
    if (ruleHasPurchaseScope(rule)) continue;
    if (!ruleMatchesClient(rule, client)) continue;
    if (!ruleMatchesOrderProductScope(rule, orderedProductIds, productById)) continue;

    const bonusUnits = computeQtyBonusForRuleRow(rule, totalPaidQty);
    if (bonusUnits <= 0) continue;

    const ctx: QtyGiftResolveContext = { availableByProductId, minUnits: bonusUnits };

    if (rule.bonus_product_ids.length === 0) {
      let heroPid = 0;
      let heroQ = 0;
      for (const [pid, q] of qtyByProduct) {
        if (q > heroQ) {
          heroQ = q;
          heroPid = pid;
        }
      }
      if (heroPid <= 0) continue;
      const giftPid = resolveQtyGiftProductId(rule, heroPid, giftOverrides, ctx);
      if (giftPid <= 0) continue;
      if (engineOpts?.prereqEnv) {
        if (!(await ruleTreeSatisfiedForOrder(rule, engineOpts.prereqEnv, now, new Set()))) continue;
      }
      peeks.push({
        rule,
        purchasedPid: QTY_AGGREGATE_PURCHASED_PID,
        giftPid,
        bonusQty: bonusUnits
      });
      break;
    }

    const giftPid = resolveQtyGiftProductId(rule, QTY_AGGREGATE_PURCHASED_PID, giftOverrides, ctx);
    if (giftPid <= 0) continue;
    if (engineOpts?.prereqEnv) {
      if (!(await ruleTreeSatisfiedForOrder(rule, engineOpts.prereqEnv, now, new Set()))) continue;
    }
    peeks.push({
      rule,
      purchasedPid: QTY_AGGREGATE_PURCHASED_PID,
      giftPid,
      bonusQty: bonusUnits
    });
    break;
  }

  const scopedRules = filtered.filter((r) => ruleHasPurchaseScope(r));

  for (const [purchasedPid, purchasedQty] of qtyByProduct) {
    if (purchasedQty <= 0) continue;
    const product = productById.get(purchasedPid);
    if (!product) continue;

    for (const rule of scopedRules) {
      if (!ruleMatchesClient(rule, client)) continue;
      if (!ruleMatchesProduct(rule, product)) continue;

      const bonusUnits = computeQtyBonusForRuleRow(rule, purchasedQty);
      if (bonusUnits <= 0) continue;

      const giftPid = resolveQtyGiftProductId(rule, purchasedPid, giftOverrides, {
        availableByProductId,
        minUnits: bonusUnits
      });
      if (giftPid <= 0) continue;
      if (engineOpts?.prereqEnv) {
        if (!(await ruleTreeSatisfiedForOrder(rule, engineOpts.prereqEnv, now, new Set()))) continue;
      }
      peeks.push({ rule, purchasedPid, giftPid, bonusQty: bonusUnits });
      break;
    }
  }

  return peeks;
}

export async function materializeQtyPeeks(
  tenantId: number,
  peeks: QtyBonusPeek[]
): Promise<BonusLineDraft[]> {
  const giftQtyByProduct = new Map<number, PrismaClient.Decimal>();
  for (const p of peeks) {
    const add = new PrismaClient.Decimal(p.bonusQty);
    const prev = giftQtyByProduct.get(p.giftPid) ?? new PrismaClient.Decimal(0);
    giftQtyByProduct.set(p.giftPid, prev.add(add));
  }

  const out: BonusLineDraft[] = [];
  for (const [giftPid, qty] of giftQtyByProduct) {
    if (qty.lte(0)) continue;
    const priceStr = await getProductPrice(tenantId, giftPid, "retail");
    if (priceStr == null) continue;
    const price = new PrismaClient.Decimal(priceStr);
    const total = roundMoney(qty.mul(price));
    out.push({
      product_id: giftPid,
      qty,
      price,
      total,
      is_bonus: true
    });
  }

  return out;
}

/**
 * Faol `qty` bonus qoidalaridan (avtomatik) zakaz uchun bonus qatorlarni hisoblaydi.
 * Har bir sotib olingan mahsulot uchun eng yuqori `priority` li mos qoidadan bittasini qo‘llaydi.
 */
export async function computeAutoQtyBonusLines(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  qtyByProduct: ReadonlyMap<number, number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set(),
  warehouseId?: number | null
): Promise<BonusLineDraft[]> {
  const orderedProductIds = new Set(qtyByProduct.keys());
  const peeks = await findQtyBonusPeeks(
    tx,
    tenantId,
    client,
    qtyByProduct,
    productById,
    orderedProductIds,
    clientUsedAutoBonusRuleIds,
    new Map(),
    warehouseId
  );
  return materializeQtyPeeks(tenantId, peeks);
}

type BonusSlot =
  | { kind: "discount"; priority: number; rule: BonusRuleRow }
  | { kind: "sum"; priority: number; peek: SumBonusPeek }
  | { kind: "qty"; priority: number; peek: QtyBonusPeek };

function slotSortKey(s: BonusSlot): string {
  if (s.kind === "discount") return `d:${s.rule.id}`;
  if (s.kind === "sum") return `s:${s.peek.rule.id}`;
  return `q:${s.peek.rule.id}:p${s.peek.purchasedPid}`;
}

/**
 * Chegirma + summa + qty ni `bonus_stack` siyosati bo‘yicha birlashtiradi.
 */
export async function resolveOrderBonusesForCreate(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  paidLines: PaidLineDraft[],
  paidTotal: PrismaClient.Decimal,
  baseSubtotalBeforeDiscount: PrismaClient.Decimal,
  qtyByProduct: ReadonlyMap<number, number>,
  productById: ReadonlyMap<number, ProductLite>,
  orderedProductIds: ReadonlySet<number>,
  stackPolicy: BonusStackPolicy,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set(),
  qtyBonusGiftOverrides: ReadonlyMap<number, number> = new Map(),
  warehouseId?: number | null
): Promise<{
  lines: PaidLineDraft[];
  total: PrismaClient.Decimal;
  bonusDrafts: BonusLineDraft[];
  appliedAutoBonusRuleIds: number[];
}> {
  const now = new Date();
  const [discountRules, sumRaw, qtyRaw] = await Promise.all([
    loadDiscountRulesForOrder(tx, tenantId),
    tx.bonusRule.findMany({
      where: activeRuleWhere(tenantId, "sum", now),
      include: bonusRuleInclude,
      orderBy: { priority: "desc" }
    }),
    tx.bonusRule.findMany({
      where: activeRuleWhere(tenantId, "qty", now),
      include: bonusRuleInclude,
      orderBy: { priority: "desc" }
    })
  ]);
  const sumRules = sumRaw.map((r) => mapBonusRuleFull(r));
  const qtyRules = qtyRaw.map((r) => mapBonusRuleFull(r));

  const stockProductIds = new Set<number>();
  for (const pid of qtyByProduct.keys()) stockProductIds.add(pid);
  for (const r of [...discountRules, ...sumRules, ...qtyRules]) {
    for (const id of r.bonus_product_ids) stockProductIds.add(id);
  }
  const availableByProductId = await loadAvailableQtyByProductId(tx, tenantId, warehouseId, stockProductIds);

  const prereqEnv: OrderBonusPrereqEnv = {
    tx,
    tenantId,
    client,
    orderedProductIds,
    productById,
    baseSubtotalBeforeDiscount,
    qtyByProduct,
    clientUsedAutoBonusRuleIds,
    giftOverrides: qtyBonusGiftOverrides,
    warehouseId,
    availableByProductId,
    ruleCache: new Map()
  };

  const discountRule = await findWinningDiscountRuleWithPrereqs(
    discountRules,
    client,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds,
    prereqEnv,
    now
  );

  const sumPeek = await findWinningSumPeek(
    tx,
    tenantId,
    client,
    baseSubtotalBeforeDiscount,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds,
    qtyByProduct,
    { rules: sumRules, prereqEnv }
  );

  const qtyPeeks = await findQtyBonusPeeks(
    tx,
    tenantId,
    client,
    qtyByProduct,
    productById,
    orderedProductIds,
    clientUsedAutoBonusRuleIds,
    qtyBonusGiftOverrides,
    warehouseId,
    { rules: qtyRules, prereqEnv, availableByProductId }
  );

  const slots: BonusSlot[] = [];
  if (discountRule) {
    slots.push({ kind: "discount", priority: discountRule.priority, rule: discountRule });
  }
  if (sumPeek) {
    slots.push({ kind: "sum", priority: sumPeek.rule.priority, peek: sumPeek });
  }
  for (const qp of qtyPeeks) {
    slots.push({ kind: "qty", priority: qp.rule.priority, peek: qp });
  }

  slots.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return slotSortKey(a).localeCompare(slotSortKey(b));
  });

  const take = resolveBonusSlotTakeCount(slots.length, stackPolicy);
  const chosen = slots.slice(0, take);

  let lines = paidLines.map((l) => ({ ...l }));
  let total = paidTotal;

  if (chosen.some((s) => s.kind === "discount") && discountRule) {
    const applied = applyDiscountWithRule(discountRule, lines, total);
    lines = applied.lines;
    total = applied.total;
  }

  const bonusParts: BonusLineDraft[] = [];

  if (chosen.some((s) => s.kind === "sum") && sumPeek) {
    bonusParts.push(...(await buildSumBonusDraft(tenantId, sumPeek.giftPid, sumPeek.units)));
  }

  const chosenQty = chosen.filter((s): s is BonusSlot & { kind: "qty" } => s.kind === "qty");
  if (chosenQty.length > 0) {
    bonusParts.push(...(await materializeQtyPeeks(tenantId, chosenQty.map((s) => s.peek))));
  }

  const appliedOnceRuleIds: number[] = [];
  if (chosen.some((s) => s.kind === "discount") && discountRule?.once_per_client) {
    appliedOnceRuleIds.push(discountRule.id);
  }
  if (chosen.some((s) => s.kind === "sum") && sumPeek?.rule.once_per_client) {
    appliedOnceRuleIds.push(sumPeek.rule.id);
  }
  for (const s of chosenQty) {
    if (s.peek.rule.once_per_client) {
      appliedOnceRuleIds.push(s.peek.rule.id);
    }
  }
  const uniqueApplied = [...new Set(appliedOnceRuleIds)];

  return {
    lines,
    total,
    bonusDrafts: mergeBonusLineDrafts(bonusParts),
    appliedAutoBonusRuleIds: uniqueApplied
  };
}

export function mergeBonusLineDrafts(drafts: BonusLineDraft[]): BonusLineDraft[] {
  const map = new Map<number, { qty: PrismaClient.Decimal; price: PrismaClient.Decimal }>();
  for (const d of drafts) {
    const cur = map.get(d.product_id);
    if (!cur) {
      map.set(d.product_id, { qty: d.qty, price: d.price });
    } else {
      map.set(d.product_id, {
        qty: cur.qty.add(d.qty),
        price: d.price
      });
    }
  }
  const out: BonusLineDraft[] = [];
  for (const [product_id, { qty, price }] of map) {
    out.push({
      product_id,
      qty,
      price,
      total: roundMoney(qty.mul(price)),
      is_bonus: true
    });
  }
  return out;
}

export async function loadDiscountRulesForOrder(
  tx: Prisma.TransactionClient,
  tenantId: number
): Promise<BonusRuleRow[]> {
  const now = new Date();
  const raw = await tx.bonusRule.findMany({
    where: activeRuleWhere(tenantId, "discount", now),
    include: bonusRuleInclude,
    orderBy: { priority: "desc" }
  });
  return raw.map((r) => mapBonusRuleFull(r));
}
