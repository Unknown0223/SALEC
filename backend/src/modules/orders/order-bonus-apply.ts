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

/**
 * Qty bonus sovg‘a mahsuloti: `bonus_product_ids` bo‘lsa override ro‘yxatda bo‘lishi kerak;
 * ro‘yxat bo‘shsa sovg‘a = sotilgan mahsulot (`purchasedPid`).
 */
export function resolveQtyGiftProductId(
  rule: BonusRuleRow,
  purchasedPid: number,
  giftOverrides: ReadonlyMap<number, number>
): number {
  const allowed = rule.bonus_product_ids;
  const override = giftOverrides.get(rule.id);
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    if (allowed.length > 0) {
      if (allowed.includes(override)) return override;
    } else if (purchasedPid > 0 && override === purchasedPid) {
      return override;
    }
  }
  if (allowed.length > 0) return allowed[0]!;
  return purchasedPid;
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
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set()
): Promise<SumBonusPeek | null> {
  const now = new Date();
  const raw = await tx.bonusRule.findMany({
    where: activeRuleWhere(tenantId, "sum", now),
    include: bonusRuleInclude,
    orderBy: { priority: "desc" }
  });

  const rules = raw
    .map((r) => mapBonusRuleFull(r))
    .filter((r) => !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds));

  for (const rule of rules) {
    if (rule.min_sum == null) continue;
    const minSum = new PrismaClient.Decimal(rule.min_sum);
    if (baseSubtotalBeforeDiscount.lt(minSum)) continue;
    if (!ruleMatchesClient(rule, client)) continue;
    if (!ruleMatchesOrderProductScope(rule, orderedProductIds, productById)) continue;

    const giftPid = rule.bonus_product_ids[0];
    if (giftPid == null) continue;

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
 * `min_sum` dan keyin `free_qty` dona `bonus_product_ids[0]` sovg‘a (chegirmadan oldingi yig‘indiga qarab).
 */
export async function computeSumThresholdBonusLines(
  tx: Prisma.TransactionClient,
  tenantId: number,
  client: { id: number; category: string | null },
  baseSubtotalBeforeDiscount: PrismaClient.Decimal,
  orderedProductIds: ReadonlySet<number>,
  productById: ReadonlyMap<number, ProductLite>,
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set()
): Promise<BonusLineDraft[]> {
  const peek = await findWinningSumPeek(
    tx,
    tenantId,
    client,
    baseSubtotalBeforeDiscount,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds
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
  giftOverrides: ReadonlyMap<number, number> = new Map()
): Promise<QtyBonusPeek[]> {
  const now = new Date();
  const raw = await tx.bonusRule.findMany({
    where: activeRuleWhere(tenantId, "qty", now),
    include: bonusRuleInclude,
    orderBy: { priority: "desc" }
  });

  const rules = raw
    .map((r) => mapBonusRuleFull(r))
    .filter((r) => !ruleNeedsOrderContext(r) && !ruleBlockedByOncePerClient(r, clientUsedAutoBonusRuleIds));

  const peeks: QtyBonusPeek[] = [];

  let totalPaidQty = 0;
  for (const q of qtyByProduct.values()) {
    if (q > 0) totalPaidQty += q;
  }

  for (const rule of rules) {
    if (ruleHasPurchaseScope(rule)) continue;
    if (!ruleMatchesClient(rule, client)) continue;
    if (!ruleMatchesOrderProductScope(rule, orderedProductIds, productById)) continue;
    if (rule.bonus_product_ids.length === 0) continue;

    const bonusUnits = computeQtyBonusForRuleRow(rule, totalPaidQty);
    if (bonusUnits <= 0) continue;

    const giftPid = resolveQtyGiftProductId(rule, QTY_AGGREGATE_PURCHASED_PID, giftOverrides);
    peeks.push({
      rule,
      purchasedPid: QTY_AGGREGATE_PURCHASED_PID,
      giftPid,
      bonusQty: bonusUnits
    });
    break;
  }

  const scopedRules = rules.filter((r) => ruleHasPurchaseScope(r));

  for (const [purchasedPid, purchasedQty] of qtyByProduct) {
    if (purchasedQty <= 0) continue;
    const product = productById.get(purchasedPid);
    if (!product) continue;

    for (const rule of scopedRules) {
      if (!ruleMatchesClient(rule, client)) continue;
      if (!ruleMatchesProduct(rule, product)) continue;

      const bonusUnits = computeQtyBonusForRuleRow(rule, purchasedQty);
      if (bonusUnits <= 0) continue;

      const giftPid = resolveQtyGiftProductId(rule, purchasedPid, giftOverrides);
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
  clientUsedAutoBonusRuleIds: ReadonlySet<number> = new Set()
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
    new Map()
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
  qtyBonusGiftOverrides: ReadonlyMap<number, number> = new Map()
): Promise<{
  lines: PaidLineDraft[];
  total: PrismaClient.Decimal;
  bonusDrafts: BonusLineDraft[];
  appliedAutoBonusRuleIds: number[];
}> {
  const discountRules = await loadDiscountRulesForOrder(tx, tenantId);
  const discountRule = findWinningDiscountRule(
    discountRules,
    client,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds
  );

  const sumPeek = await findWinningSumPeek(
    tx,
    tenantId,
    client,
    baseSubtotalBeforeDiscount,
    orderedProductIds,
    productById,
    clientUsedAutoBonusRuleIds
  );

  const qtyPeeks = await findQtyBonusPeeks(
    tx,
    tenantId,
    client,
    qtyByProduct,
    productById,
    orderedProductIds,
    clientUsedAutoBonusRuleIds,
    qtyBonusGiftOverrides
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
