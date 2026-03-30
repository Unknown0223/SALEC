import { describe, expect, it } from "vitest";
import type { BonusRuleRow } from "../src/modules/bonus-rules/bonus-rules.service";
import {
  ruleMatchesClient,
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
    conditions: [],
    ...over
  };
}

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
