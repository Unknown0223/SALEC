import { describe, expect, it } from "vitest";
import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { ruleSummary } from "./rule-summary";

function row(p: Partial<BonusRuleRow>): BonusRuleRow {
  return {
    id: 1,
    name: "n",
    type: "qty",
    buy_qty: null,
    free_qty: null,
    min_sum: null,
    discount_pct: null,
    priority: 0,
    is_active: true,
    valid_from: null,
    valid_to: null,
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
    ...p
  } as BonusRuleRow;
}

describe("ruleSummary", () => {
  it("qty + условия + календарный месяц", () => {
    const s = ruleSummary(
      row({
        type: "qty",
        sum_threshold_scope: "calendar_month",
        conditions: [
          {
            id: 1,
            min_qty: null,
            max_qty: null,
            step_qty: 6,
            bonus_qty: 1,
            max_bonus_qty: null,
            sort_order: 0
          }
        ]
      })
    );
    expect(s).toContain("кажд. 6→+1");
    expect(s).toContain("(мес.)");
  });

  it("sum + месяц", () => {
    expect(
      ruleSummary(
        row({
          type: "sum",
          min_sum: 1000,
          sum_threshold_scope: "calendar_month"
        })
      )
    ).toBe("мин. 1000 (мес.)");
  });

  it("скидка %", () => {
    expect(ruleSummary(row({ type: "discount", discount_pct: 15 }))).toBe("15%");
  });
});
