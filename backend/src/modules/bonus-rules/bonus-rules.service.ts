import type { BonusRule, BonusRuleCondition } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

type RuleWithConditions = BonusRule & { conditions: BonusRuleCondition[] };

export type BonusConditionRow = {
  id: number;
  min_qty: number | null;
  max_qty: number | null;
  step_qty: number;
  bonus_qty: number;
  max_bonus_qty: number | null;
  sort_order: number;
};

export type BonusRuleRow = {
  id: number;
  tenant_id: number;
  name: string;
  type: string;
  buy_qty: number | null;
  free_qty: number | null;
  min_sum: number | null;
  discount_pct: number | null;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
  client_category: string | null;
  payment_type: string | null;
  client_type: string | null;
  sales_channel: string | null;
  price_type: string | null;
  product_ids: number[];
  bonus_product_ids: number[];
  product_category_ids: number[];
  target_all_clients: boolean;
  selected_client_ids: number[];
  is_manual: boolean;
  in_blocks: boolean;
  once_per_client: boolean;
  one_plus_one_gift: boolean;
  prerequisite_rule_ids: number[];
  conditions: BonusConditionRow[];
};

export type BonusConditionInput = {
  min_qty?: number | null;
  max_qty?: number | null;
  step_qty: number;
  bonus_qty: number;
  max_bonus_qty?: number | null;
  sort_order?: number;
};

export type CreateBonusRuleInput = {
  name: string;
  type: string;
  buy_qty?: number | null;
  free_qty?: number | null;
  min_sum?: number | null;
  discount_pct?: number | null;
  priority?: number;
  is_active?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  client_category?: string | null;
  payment_type?: string | null;
  client_type?: string | null;
  sales_channel?: string | null;
  price_type?: string | null;
  product_ids?: number[];
  bonus_product_ids?: number[];
  product_category_ids?: number[];
  target_all_clients?: boolean;
  selected_client_ids?: number[];
  is_manual?: boolean;
  in_blocks?: boolean;
  once_per_client?: boolean;
  one_plus_one_gift?: boolean;
  prerequisite_rule_ids?: number[];
  conditions?: BonusConditionInput[];
};

export type UpdateBonusRuleInput = Partial<CreateBonusRuleInput>;

export const bonusRuleInclude = {
  conditions: {
    orderBy: { sort_order: "asc" as const }
  }
} as const;

function mapCondition(c: BonusRuleCondition): BonusConditionRow {
  return {
    id: c.id,
    min_qty: c.min_qty != null ? Number(c.min_qty) : null,
    max_qty: c.max_qty != null ? Number(c.max_qty) : null,
    step_qty: Number(c.step_qty),
    bonus_qty: Number(c.bonus_qty),
    max_bonus_qty: c.max_bonus_qty != null ? Number(c.max_bonus_qty) : null,
    sort_order: c.sort_order
  };
}

export function mapBonusRuleFull(r: RuleWithConditions): BonusRuleRow {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    name: r.name,
    type: r.type,
    buy_qty: r.buy_qty,
    free_qty: r.free_qty,
    min_sum: r.min_sum != null ? Number(r.min_sum) : null,
    discount_pct: r.discount_pct != null ? Number(r.discount_pct) : null,
    priority: r.priority,
    is_active: r.is_active,
    valid_from: r.valid_from ? r.valid_from.toISOString() : null,
    valid_to: r.valid_to ? r.valid_to.toISOString() : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    client_category: r.client_category,
    payment_type: r.payment_type,
    client_type: r.client_type,
    sales_channel: r.sales_channel,
    price_type: r.price_type,
    product_ids: [...r.product_ids],
    bonus_product_ids: [...r.bonus_product_ids],
    product_category_ids: [...r.product_category_ids],
    target_all_clients: r.target_all_clients,
    selected_client_ids: [...r.selected_client_ids],
    is_manual: r.is_manual,
    in_blocks: r.in_blocks,
    once_per_client: r.once_per_client,
    one_plus_one_gift: r.one_plus_one_gift,
    prerequisite_rule_ids: [...(r.prerequisite_rule_ids ?? [])],
    conditions: r.conditions.map(mapCondition)
  };
}

async function fetchBonusRuleFull(tenantId: number, id: number): Promise<BonusRuleRow | null> {
  const r = await prisma.bonusRule.findFirst({
    where: { id, tenant_id: tenantId },
    include: bonusRuleInclude
  });
  return r ? mapBonusRuleFull(r) : null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("BAD_DATE");
  }
  return d;
}

function validateConditions(conditions: BonusConditionInput[]) {
  for (const c of conditions) {
    if (c.step_qty <= 0 || c.bonus_qty < 0) {
      throw new Error("VALIDATION");
    }
    const min = c.min_qty ?? null;
    const max = c.max_qty ?? null;
    if (min != null && max != null && min > max) {
      throw new Error("VALIDATION");
    }
  }
}

function validateForType(
  type: string,
  m: {
    buy_qty?: number | null;
    free_qty?: number | null;
    min_sum?: number | null;
    discount_pct?: number | null;
  },
  conditions: BonusConditionInput[] | undefined,
  onePlusOne: boolean
) {
  if (type === "qty") {
    const hasRows = conditions && conditions.length > 0;
    if (hasRows) {
      validateConditions(conditions!);
    } else if (onePlusOne) {
      // 1+1 — shartlar bo‘sh bo‘lishi mumkin (create da avtomatik to‘ldiriladi)
    } else if (m.buy_qty == null || m.buy_qty < 1 || m.free_qty == null || m.free_qty < 0) {
      throw new Error("VALIDATION");
    }
  }
  if (type === "sum") {
    if (m.min_sum == null || m.min_sum < 0) {
      throw new Error("VALIDATION");
    }
  }
  if (type === "discount") {
    if (m.discount_pct == null || m.discount_pct < 0 || m.discount_pct > 100) {
      throw new Error("VALIDATION");
    }
  }
}

/** Avtomatik qty / sum / discount: assortiment yoki kategoriya (kamida bittasi) majburiy — butun zakazga qo‘llanadigan «bo‘sh» qoidalarni oldini olish. */
function ruleNeedsOrderContextScalars(rule: {
  payment_type: string | null;
  client_type: string | null;
  sales_channel: string | null;
  price_type: string | null;
}): boolean {
  const nonempty = (s: string | null | undefined) => s != null && String(s).trim() !== "";
  return (
    nonempty(rule.payment_type) ||
    nonempty(rule.client_type) ||
    nonempty(rule.sales_channel) ||
    nonempty(rule.price_type)
  );
}

async function validatePrerequisiteRuleIds(
  tenantId: number,
  hostId: number | null,
  rawIds: number[] | undefined
): Promise<void> {
  const uniq = [...new Set((rawIds ?? []).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (hostId != null && uniq.includes(hostId)) {
    throw new Error("VALIDATION");
  }
  if (uniq.length === 0) return;

  const rows = await prisma.bonusRule.findMany({
    where: { tenant_id: tenantId, id: { in: uniq } },
    select: {
      id: true,
      is_manual: true,
      payment_type: true,
      client_type: true,
      sales_channel: true,
      price_type: true
    }
  });
  if (rows.length !== uniq.length) {
    throw new Error("VALIDATION");
  }
  for (const r of rows) {
    if (r.is_manual) throw new Error("VALIDATION");
    if (ruleNeedsOrderContextScalars(r)) throw new Error("VALIDATION");
  }

  const all = await prisma.bonusRule.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, prerequisite_rule_ids: true }
  });
  const adj = new Map<number, number[]>();
  for (const r of all) {
    if (hostId != null && r.id === hostId) continue;
    adj.set(r.id, [...r.prerequisite_rule_ids]);
  }
  const virtualHost = hostId ?? 0;
  adj.set(virtualHost, uniq);
  if (hostId != null) {
    adj.set(hostId, uniq);
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();
  function dfs(u: number): boolean {
    if (visiting.has(u)) return true;
    if (visited.has(u)) return false;
    visiting.add(u);
    for (const v of adj.get(u) ?? []) {
      if (dfs(v)) return true;
    }
    visiting.delete(u);
    visited.add(u);
    return false;
  }
  if (dfs(virtualHost)) {
    throw new Error("VALIDATION");
  }
}

function validateAutoBonusProductScope(
  type: string,
  isManual: boolean,
  productIds: readonly number[],
  categoryIds: readonly number[]
): void {
  if (isManual) return;
  if (type !== "qty" && type !== "sum" && type !== "discount") return;
  if (productIds.length > 0 || categoryIds.length > 0) return;
  throw new Error("PRODUCT_SCOPE_REQUIRED");
}

function normalizeConditions(
  type: string,
  input: CreateBonusRuleInput
): BonusConditionInput[] | undefined {
  if (type !== "qty") return undefined;

  if (input.one_plus_one_gift && (!input.conditions || input.conditions.length === 0)) {
    return [{ step_qty: 1, bonus_qty: 1, sort_order: 0 }];
  }
  if (input.conditions && input.conditions.length > 0) {
    return input.conditions;
  }
  if (input.buy_qty != null && input.free_qty != null) {
    return [
      {
        step_qty: input.buy_qty,
        bonus_qty: input.free_qty,
        sort_order: 0
      }
    ];
  }
  return undefined;
}

function ruleScalarsFromInput(
  tenantId: number,
  input: CreateBonusRuleInput,
  valid_from: Date | null,
  valid_to: Date | null,
  buyQty: number | null,
  freeQty: number | null
) {
  const allClients = input.target_all_clients ?? true;
  return {
    tenant_id: tenantId,
    name: input.name.trim(),
    type: input.type,
    buy_qty: buyQty,
    free_qty: freeQty,
    min_sum: input.min_sum ?? null,
    discount_pct: input.discount_pct ?? null,
    priority: input.priority ?? 0,
    is_active: input.is_active ?? true,
    valid_from,
    valid_to,
    client_category: input.client_category?.trim() || null,
    payment_type: input.payment_type?.trim() || null,
    client_type: input.client_type?.trim() || null,
    sales_channel: input.sales_channel?.trim() || null,
    price_type: input.price_type?.trim() || null,
    product_ids: input.product_ids ?? [],
    bonus_product_ids: input.bonus_product_ids ?? [],
    product_category_ids: input.product_category_ids ?? [],
    target_all_clients: allClients,
    selected_client_ids: allClients ? [] : (input.selected_client_ids ?? []),
    is_manual: input.is_manual ?? false,
    in_blocks: input.in_blocks ?? true,
    once_per_client: input.once_per_client ?? false,
    one_plus_one_gift: input.one_plus_one_gift ?? false,
    prerequisite_rule_ids: [...new Set((input.prerequisite_rule_ids ?? []).filter((n) => n > 0))].slice(0, 200)
  };
}

export async function createBonusRule(
  tenantId: number,
  input: CreateBonusRuleInput,
  actorUserId: number | null = null
): Promise<BonusRuleRow> {
  const conditions = normalizeConditions(input.type, input);
  const buyForVal =
    conditions && conditions.length > 0 ? Math.floor(conditions[0].step_qty) : (input.buy_qty ?? null);
  const freeForVal =
    conditions && conditions.length > 0 ? Math.floor(conditions[0].bonus_qty) : (input.free_qty ?? null);

  validateForType(
    input.type,
    { buy_qty: buyForVal, free_qty: freeForVal, min_sum: input.min_sum, discount_pct: input.discount_pct },
    conditions,
    Boolean(input.one_plus_one_gift)
  );

  const valid_from = parseOptionalDate(input.valid_from ?? null);
  const valid_to = parseOptionalDate(input.valid_to ?? null);

  const scalars = ruleScalarsFromInput(tenantId, input, valid_from, valid_to, buyForVal, freeForVal);
  validateAutoBonusProductScope(
    scalars.type,
    scalars.is_manual,
    scalars.product_ids,
    scalars.product_category_ids
  );

  await validatePrerequisiteRuleIds(tenantId, null, scalars.prerequisite_rule_ids);

  const created = await prisma.$transaction(async (tx) => {
    const rule = await tx.bonusRule.create({
      data: scalars
    });
    if (conditions && conditions.length > 0) {
      await tx.bonusRuleCondition.createMany({
        data: conditions.map((c, i) => ({
          bonus_rule_id: rule.id,
          min_qty: c.min_qty ?? null,
          max_qty: c.max_qty ?? null,
          step_qty: c.step_qty,
          bonus_qty: c.bonus_qty,
          max_bonus_qty: c.max_bonus_qty ?? null,
          sort_order: c.sort_order ?? i
        }))
      });
    }
    return rule.id;
  });

  const full = await fetchBonusRuleFull(tenantId, created);
  if (!full) throw new Error("NOT_FOUND");
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.bonus_rule,
    entityId: full.id,
    action: "create",
    payload: { name: full.name, type: full.type, is_active: full.is_active }
  });
  return full;
}

export async function updateBonusRule(
  tenantId: number,
  id: number,
  input: UpdateBonusRuleInput,
  actorUserId: number | null = null
): Promise<BonusRuleRow> {
  const existing = await prisma.bonusRule.findFirst({
    where: { id, tenant_id: tenantId },
    include: bonusRuleInclude
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  const type = input.type ?? existing.type;
  const merged: CreateBonusRuleInput = {
    name: (input.name ?? existing.name).trim(),
    type,
    buy_qty: input.buy_qty !== undefined ? input.buy_qty : existing.buy_qty,
    free_qty: input.free_qty !== undefined ? input.free_qty : existing.free_qty,
    min_sum: input.min_sum !== undefined ? input.min_sum : existing.min_sum != null ? Number(existing.min_sum) : null,
    discount_pct:
      input.discount_pct !== undefined
        ? input.discount_pct
        : existing.discount_pct != null
          ? Number(existing.discount_pct)
          : null,
    priority: input.priority ?? existing.priority,
    is_active: input.is_active ?? existing.is_active,
    valid_from:
      input.valid_from !== undefined ? input.valid_from : existing.valid_from ? existing.valid_from.toISOString() : null,
    valid_to: input.valid_to !== undefined ? input.valid_to : existing.valid_to ? existing.valid_to.toISOString() : null,
    client_category:
      input.client_category !== undefined ? input.client_category : existing.client_category,
    payment_type: input.payment_type !== undefined ? input.payment_type : existing.payment_type,
    client_type: input.client_type !== undefined ? input.client_type : existing.client_type,
    sales_channel: input.sales_channel !== undefined ? input.sales_channel : existing.sales_channel,
    price_type: input.price_type !== undefined ? input.price_type : existing.price_type,
    product_ids: input.product_ids ?? [...existing.product_ids],
    bonus_product_ids: input.bonus_product_ids ?? [...existing.bonus_product_ids],
    product_category_ids: input.product_category_ids ?? [...existing.product_category_ids],
    target_all_clients: input.target_all_clients ?? existing.target_all_clients,
    selected_client_ids:
      input.target_all_clients === true
        ? []
        : input.selected_client_ids !== undefined
          ? input.selected_client_ids
          : [...existing.selected_client_ids],
    is_manual: input.is_manual ?? existing.is_manual,
    in_blocks: input.in_blocks ?? existing.in_blocks,
    once_per_client: input.once_per_client ?? existing.once_per_client,
    one_plus_one_gift: input.one_plus_one_gift ?? existing.one_plus_one_gift,
    prerequisite_rule_ids:
      input.prerequisite_rule_ids !== undefined
        ? input.prerequisite_rule_ids
        : [...existing.prerequisite_rule_ids]
  };

  let nextConditions: BonusConditionInput[] | undefined;
  if (input.conditions !== undefined) {
    nextConditions = input.conditions;
  } else if (type === "qty") {
    nextConditions = existing.conditions.map((c) => ({
      min_qty: c.min_qty != null ? Number(c.min_qty) : null,
      max_qty: c.max_qty != null ? Number(c.max_qty) : null,
      step_qty: Number(c.step_qty),
      bonus_qty: Number(c.bonus_qty),
      max_bonus_qty: c.max_bonus_qty != null ? Number(c.max_bonus_qty) : null,
      sort_order: c.sort_order
    }));
  } else {
    nextConditions = [];
  }

  const normalized = normalizeConditions(type, { ...merged, conditions: nextConditions });
  const buyForVal =
    normalized && normalized.length > 0
      ? Math.floor(normalized[0].step_qty)
      : (merged.buy_qty ?? null);
  const freeForVal =
    normalized && normalized.length > 0
      ? Math.floor(normalized[0].bonus_qty)
      : (merged.free_qty ?? null);

  validateForType(
    type,
    { buy_qty: buyForVal, free_qty: freeForVal, min_sum: merged.min_sum, discount_pct: merged.discount_pct },
    normalized,
    Boolean(merged.one_plus_one_gift)
  );

  validateAutoBonusProductScope(
    type,
    merged.is_manual ?? false,
    merged.product_ids ?? [],
    merged.product_category_ids ?? []
  );

  if (input.prerequisite_rule_ids !== undefined) {
    await validatePrerequisiteRuleIds(tenantId, id, merged.prerequisite_rule_ids);
  }

  let valid_from: Date | null | undefined = undefined;
  let valid_to: Date | null | undefined = undefined;
  if (input.valid_from !== undefined) {
    valid_from = parseOptionalDate(input.valid_from);
  }
  if (input.valid_to !== undefined) {
    valid_to = parseOptionalDate(input.valid_to);
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = merged.name;
  if (input.type !== undefined) data.type = merged.type;
  if (input.buy_qty !== undefined || input.conditions !== undefined || input.one_plus_one_gift !== undefined) {
    data.buy_qty = buyForVal;
    data.free_qty = freeForVal;
  }
  if (input.min_sum !== undefined) data.min_sum = merged.min_sum;
  if (input.discount_pct !== undefined) data.discount_pct = merged.discount_pct;
  if (input.priority !== undefined) data.priority = merged.priority;
  if (input.is_active !== undefined) data.is_active = merged.is_active;
  if (valid_from !== undefined) data.valid_from = valid_from;
  if (valid_to !== undefined) data.valid_to = valid_to;

  if (input.client_category !== undefined) data.client_category = merged.client_category?.trim() || null;
  if (input.payment_type !== undefined) data.payment_type = merged.payment_type?.trim() || null;
  if (input.client_type !== undefined) data.client_type = merged.client_type?.trim() || null;
  if (input.sales_channel !== undefined) data.sales_channel = merged.sales_channel?.trim() || null;
  if (input.price_type !== undefined) data.price_type = merged.price_type?.trim() || null;
  if (input.product_ids !== undefined) data.product_ids = merged.product_ids;
  if (input.bonus_product_ids !== undefined) data.bonus_product_ids = merged.bonus_product_ids;
  if (input.product_category_ids !== undefined) data.product_category_ids = merged.product_category_ids;
  if (input.target_all_clients !== undefined) {
    data.target_all_clients = merged.target_all_clients;
    if (merged.target_all_clients) {
      data.selected_client_ids = [];
    }
  }
  if (input.selected_client_ids !== undefined) data.selected_client_ids = merged.selected_client_ids;
  if (input.is_manual !== undefined) data.is_manual = merged.is_manual;
  if (input.in_blocks !== undefined) data.in_blocks = merged.in_blocks;
  if (input.once_per_client !== undefined) data.once_per_client = merged.once_per_client;
  if (input.one_plus_one_gift !== undefined) data.one_plus_one_gift = merged.one_plus_one_gift;
  if (input.prerequisite_rule_ids !== undefined) {
    data.prerequisite_rule_ids = [...new Set((merged.prerequisite_rule_ids ?? []).filter((n) => n > 0))].slice(0, 200);
  }

  await prisma.$transaction(async (tx) => {
    if (input.type !== undefined && type !== "qty") {
      await tx.bonusRuleCondition.deleteMany({ where: { bonus_rule_id: id } });
    }
    if (Object.keys(data).length > 0) {
      await tx.bonusRule.update({ where: { id }, data });
    }
    if (input.conditions !== undefined && type === "qty") {
      let toWrite = normalized ?? [];
      if (toWrite.length === 0) {
        if (merged.buy_qty != null && merged.free_qty != null) {
          toWrite = [{ step_qty: merged.buy_qty, bonus_qty: merged.free_qty, sort_order: 0 }];
        } else {
          throw new Error("VALIDATION");
        }
      }
      validateConditions(toWrite);
      await tx.bonusRuleCondition.deleteMany({ where: { bonus_rule_id: id } });
      await tx.bonusRuleCondition.createMany({
        data: toWrite.map((c, i) => ({
          bonus_rule_id: id,
          min_qty: c.min_qty ?? null,
          max_qty: c.max_qty ?? null,
          step_qty: c.step_qty,
          bonus_qty: c.bonus_qty,
          max_bonus_qty: c.max_bonus_qty ?? null,
          sort_order: c.sort_order ?? i
        }))
      });
      await tx.bonusRule.update({
        where: { id },
        data: { buy_qty: buyForVal, free_qty: freeForVal }
      });
    }
  });

  const full = await fetchBonusRuleFull(tenantId, id);
  if (!full) throw new Error("NOT_FOUND");
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.bonus_rule,
    entityId: id,
    action: "update",
    payload: { changed_keys: Object.keys(input) }
  });
  return full;
}

export async function softDeactivateBonusRule(
  tenantId: number,
  id: number,
  actorUserId: number | null = null
): Promise<BonusRuleRow> {
  const existing = await prisma.bonusRule.findFirst({
    where: { id, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  await prisma.bonusRule.update({
    where: { id },
    data: { is_active: false }
  });
  const full = await fetchBonusRuleFull(tenantId, id);
  if (!full) throw new Error("NOT_FOUND");
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.bonus_rule,
    entityId: id,
    action: "soft_delete",
    payload: { is_active: false, name: full.name }
  });
  return full;
}

export async function setBonusRuleActive(
  tenantId: number,
  id: number,
  is_active: boolean,
  actorUserId: number | null = null
): Promise<BonusRuleRow> {
  const existing = await prisma.bonusRule.findFirst({
    where: { id, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  await prisma.bonusRule.update({
    where: { id },
    data: { is_active }
  });
  const full = await fetchBonusRuleFull(tenantId, id);
  if (!full) throw new Error("NOT_FOUND");
  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.bonus_rule,
    entityId: id,
    action: "patch.active",
    payload: { is_active }
  });
  return full;
}

/** Shart qatorlari ichidan sotib olingan miqdorga mos birinchi qator (sort_order bo‘yicha). */
export function pickMatchingCondition(
  rows: BonusConditionRow[],
  purchasedQty: number
): BonusConditionRow | null {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  for (const c of sorted) {
    const minOk = c.min_qty == null || purchasedQty >= c.min_qty;
    const maxOk = c.max_qty == null || purchasedQty <= c.max_qty;
    if (minOk && maxOk) return c;
  }
  return null;
}

export function computeQtyBonus(
  purchasedQty: number,
  cond: { step_qty: number; bonus_qty: number; max_bonus_qty: number | null },
  inBlocks: boolean
): number {
  if (inBlocks) {
    let raw = Math.floor(purchasedQty / cond.step_qty) * cond.bonus_qty;
    if (cond.max_bonus_qty != null) raw = Math.min(raw, cond.max_bonus_qty);
    return raw;
  }
  if (purchasedQty < cond.step_qty) return 0;
  let b = cond.bonus_qty;
  if (cond.max_bonus_qty != null) b = Math.min(b, cond.max_bonus_qty);
  return b;
}

export type QtyPreviewResult = {
  purchased_qty: number;
  rule_id: number;
  rule_name: string;
  type: string;
  in_blocks: boolean;
  applied_condition: BonusConditionRow | null;
  bonus_qty: number;
  matched: boolean;
};

/**
 * Zakaz / preview uchun: qoidaga ko‘ra sotib olingan miqdordan bonus dona soni.
 * `previewQtyBonus` bilan bir xil shart tanlash mantiq.
 */
export function computeQtyBonusForRuleRow(rule: BonusRuleRow, purchasedQty: number): number {
  if (rule.type !== "qty") return 0;
  let conditions = rule.conditions;
  if (conditions.length === 0 && rule.buy_qty != null && rule.free_qty != null) {
    conditions = [
      {
        id: 0,
        min_qty: null,
        max_qty: null,
        step_qty: rule.buy_qty,
        bonus_qty: rule.free_qty,
        max_bonus_qty: null,
        sort_order: 0
      }
    ];
  }
  if (conditions.length === 0) return 0;
  const matched = pickMatchingCondition(conditions, purchasedQty);
  if (!matched) return 0;
  return computeQtyBonus(purchasedQty, matched, rule.in_blocks);
}

export async function previewQtyBonus(
  tenantId: number,
  ruleId: number,
  purchasedQty: number
): Promise<QtyPreviewResult | { error: "NOT_FOUND" | "WRONG_TYPE" | "NO_CONDITIONS" }> {
  const row = await fetchBonusRuleFull(tenantId, ruleId);
  if (!row) return { error: "NOT_FOUND" };
  if (row.type !== "qty") return { error: "WRONG_TYPE" };

  let conditions = row.conditions;
  if (conditions.length === 0 && row.buy_qty != null && row.free_qty != null) {
    conditions = [
      {
        id: 0,
        min_qty: null,
        max_qty: null,
        step_qty: row.buy_qty,
        bonus_qty: row.free_qty,
        max_bonus_qty: null,
        sort_order: 0
      }
    ];
  }
  if (conditions.length === 0) return { error: "NO_CONDITIONS" };

  const matched = pickMatchingCondition(conditions, purchasedQty);
  if (!matched) {
    return {
      purchased_qty: purchasedQty,
      rule_id: row.id,
      rule_name: row.name,
      type: row.type,
      in_blocks: row.in_blocks,
      applied_condition: null,
      bonus_qty: 0,
      matched: false
    };
  }

  const bonus_qty = computeQtyBonus(purchasedQty, matched, row.in_blocks);
  return {
    purchased_qty: purchasedQty,
    rule_id: row.id,
    rule_name: row.name,
    type: row.type,
    in_blocks: row.in_blocks,
    applied_condition: matched,
    bonus_qty,
    matched: true
  };
}

export { fetchBonusRuleFull };
