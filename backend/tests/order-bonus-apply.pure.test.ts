import { describe, expect, it } from "vitest";
import type { BonusRuleRow } from "../src/modules/bonus-rules/bonus-rules.service";
import { Prisma as PrismaClient } from "@prisma/client";
import {
  effectivePurchasedQtyForQtyRule,
  effectiveSubtotalForSumMinRule,
  QTY_AGGREGATE_PURCHASED_PID,
  resolveQtyGiftProductId,
  ruleHasPurchaseScope,
  ruleMatchesClient,
  ruleMatchesOrderAgentScope,
  ruleMatchesOrderProductScope
} from "../src/modules/orders/order-bonus-apply";

function rule(over: Partial<BonusRuleRow>): BonusRuleRow {
  return {
    id: 1,
    tenant_id: 1,
    name: "t",
    type: "qty",
    buy_qty: null,
    free_qty: null,
    min_sum: null,
    sum_threshold_scope: "order",
    discount_pct: null,
    priority: 1,
    is_active: true,
    valid_from: null,
    valid_to: null,
    created_at: "",
    updated_at: "",
    client_category: null,
    payment_type: null,
    client_type: null,
    sales_channel: null,
    price_type: null,
    product_ids: [],
    bonus_product_ids: [],
    product_category_ids: [],
    target_all_clients: true,
    selected_client_ids: [],
    is_manual: false,
    in_blocks: false,
    once_per_client: false,
    one_plus_one_gift: false,
    prerequisite_rule_ids: [],
    scope_branch_codes: [],
    scope_agent_user_ids: [],
    scope_trade_direction_ids: [],
    conditions: [],
    ...over
  };
}

describe("effectivePurchasedQtyForQtyRule", () => {
  it("order — faqat joriy miqdor", () => {
    const r = rule({ type: "qty", sum_threshold_scope: "order" });
    expect(
      effectivePurchasedQtyForQtyRule(r, {
        orderQty: 10,
        productIdForMonthLookup: null,
        monthAggregateExclOrder: 50,
        monthByProductExclOrder: new Map()
      })
    ).toBe(10);
  });

  it("calendar_month — agregat: oy + zakaz", () => {
    const r = rule({ type: "qty", sum_threshold_scope: "calendar_month" });
    expect(
      effectivePurchasedQtyForQtyRule(r, {
        orderQty: 10,
        productIdForMonthLookup: null,
        monthAggregateExclOrder: 50,
        monthByProductExclOrder: new Map()
      })
    ).toBe(60);
  });

  it("calendar_month — SKU bo‘yicha", () => {
    const r = rule({ type: "qty", sum_threshold_scope: "calendar_month" });
    const m = new Map([[5, 20]]);
    expect(
      effectivePurchasedQtyForQtyRule(r, {
        orderQty: 3,
        productIdForMonthLookup: 5,
        monthAggregateExclOrder: 999,
        monthByProductExclOrder: m
      })
    ).toBe(23);
  });
});

describe("effectiveSubtotalForSumMinRule", () => {
  it("order — faqat bazaviy summa", () => {
    const r = rule({ type: "sum", sum_threshold_scope: "order" });
    const base = new PrismaClient.Decimal(100);
    const month = new PrismaClient.Decimal(500);
    expect(effectiveSubtotalForSumMinRule(r, base, month).toString()).toBe("100");
  });

  it("calendar_month — oy + joriy zakaz", () => {
    const r = rule({ type: "sum", sum_threshold_scope: "calendar_month" });
    const base = new PrismaClient.Decimal(100);
    const month = new PrismaClient.Decimal(500);
    expect(effectiveSubtotalForSumMinRule(r, base, month).toString()).toBe("600");
  });
});

describe("ruleMatchesOrderAgentScope", () => {
  const agent = (over: Partial<{ userId: number; branch: string | null; trade_direction_id: number | null }>) => ({
    userId: 1,
    branch: "Tash" as string | null,
    trade_direction_id: 10 as number | null,
    ...over
  });

  it("hammasi bo‘sh — true", () => {
    const r = rule({});
    expect(ruleMatchesOrderAgentScope(r, null)).toBe(true);
    expect(ruleMatchesOrderAgentScope(r, agent({}))).toBe(true);
  });

  it("filial mos — true", () => {
    const r = rule({ scope_branch_codes: ["Tash"] });
    expect(ruleMatchesOrderAgentScope(r, agent({ branch: "tash" }))).toBe(true);
  });

  it("filial mos emas, agent ro‘yxatda — OR", () => {
    const r = rule({ scope_branch_codes: ["Other"], scope_agent_user_ids: [1] });
    expect(ruleMatchesOrderAgentScope(r, agent({ userId: 1, branch: "X" }))).toBe(true);
  });

  it("agent yo‘q, cheklov bor — false", () => {
    const r = rule({ scope_agent_user_ids: [1] });
    expect(ruleMatchesOrderAgentScope(r, null)).toBe(false);
  });

  it("yo‘nalish ID mos emas — false", () => {
    const r = rule({ scope_trade_direction_ids: [99] });
    expect(ruleMatchesOrderAgentScope(r, agent({ trade_direction_id: 10 }))).toBe(false);
  });
});

describe("ruleMatchesClient", () => {
  it("rad etadi — target_all_clients false va mijoz ro‘yxatda yo‘q", () => {
    const r = rule({ target_all_clients: false, selected_client_ids: [9] });
    expect(ruleMatchesClient(r, { id: 1, category: null })).toBe(false);
  });

  it("qabul qiladi — target_all_clients true", () => {
    const r = rule({ target_all_clients: true, client_category: null });
    expect(ruleMatchesClient(r, { id: 1, category: "retail" })).toBe(true);
  });

  it("client_category mos kelmasa — false", () => {
    const r = rule({ target_all_clients: true, client_category: "wholesale" });
    expect(ruleMatchesClient(r, { id: 1, category: "retail" })).toBe(false);
  });
});

describe("ruleMatchesOrderProductScope", () => {
  const map = new Map<number, { id: number; category_id: number | null }>([
    [10, { id: 10, category_id: 5 }],
    [20, { id: 20, category_id: null }]
  ]);

  it("product_ids bo‘lsa va zakazda yo‘q — false", () => {
    const r = rule({ product_ids: [99], product_category_ids: [] });
    expect(ruleMatchesOrderProductScope(r, new Set([10]), map)).toBe(false);
  });

  it("product_category_ids bo‘lsa va mos kategoriya bor — true", () => {
    const r = rule({ product_ids: [], product_category_ids: [5] });
    expect(ruleMatchesOrderProductScope(r, new Set([10]), map)).toBe(true);
  });
});

describe("ruleHasPurchaseScope", () => {
  it("bo‘sh asortiment — false (umumiy miqdor rejimi)", () => {
    expect(ruleHasPurchaseScope(rule({ product_ids: [], product_category_ids: [] }))).toBe(false);
  });
  it("product_ids bor — true", () => {
    expect(ruleHasPurchaseScope(rule({ product_ids: [1], product_category_ids: [] }))).toBe(true);
  });
  it("faqat kategoriya — true", () => {
    expect(ruleHasPurchaseScope(rule({ product_ids: [], product_category_ids: [2] }))).toBe(true);
  });
});

describe("resolveQtyGiftProductId", () => {
  it("override ro‘yxatda — override", () => {
    const r = rule({ id: 7, bonus_product_ids: [10, 20] });
    const m = new Map([[7, 20]]);
    expect(resolveQtyGiftProductId(r, 99, m)).toBe(20);
  });
  it("override noto‘g‘ri — birinchi default", () => {
    const r = rule({ id: 7, bonus_product_ids: [10, 20] });
    expect(resolveQtyGiftProductId(r, 99, new Map([[7, 999]]))).toBe(10);
  });
  it("bonus ro‘yxat bo‘sh — sotilgan mahsulot", () => {
    const r = rule({ bonus_product_ids: [] });
    expect(resolveQtyGiftProductId(r, 55, new Map())).toBe(55);
  });
  it("aggregate placeholder bilan", () => {
    const r = rule({ id: 3, bonus_product_ids: [8, 9] });
    expect(resolveQtyGiftProductId(r, QTY_AGGREGATE_PURCHASED_PID, new Map([[3, 9]]))).toBe(9);
  });
  it("qator mahsuloti ro‘yxatda lekin omborda yetarli emas — boshqa SKU (qoldiq bo‘yicha)", () => {
    const r = rule({ bonus_product_ids: [10, 20] });
    const avail = new Map<number, number>([
      [10, 0],
      [20, 5]
    ]);
    expect(resolveQtyGiftProductId(r, 10, new Map(), { availableByProductId: avail, minUnits: 2 })).toBe(20);
  });
  it("barcha variantlarda yetarli emas — ro‘yxatdagi birinchi (fallback)", () => {
    const r = rule({ bonus_product_ids: [10, 20] });
    const avail = new Map<number, number>([
      [10, 0],
      [20, 0]
    ]);
    expect(resolveQtyGiftProductId(r, 10, new Map(), { availableByProductId: avail, minUnits: 3 })).toBe(10);
  });
});
