import { describe, expect, it } from "vitest";
import type { BonusRule, BonusRuleCondition } from "@prisma/client";
import { Prisma as PrismaClient } from "@prisma/client";
import { bonusRuleConditionSummary } from "../src/modules/bonus-rules/bonus-rules.service";
import type { BonusRuleRow } from "../src/modules/bonus-rules/bonus-rules.service";
import type { PaidLineDraft } from "../src/modules/orders/order-bonus-apply";
import {
  applyAutomaticDiscountToPaidLines,
  applyDiscountWithRule,
  findWinningDiscountRule,
  mergeBonusLineDrafts
} from "../src/modules/orders/order-bonus-apply";

function baseRule(over: Partial<BonusRuleRow>): BonusRuleRow {
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
    priority: 10,
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

function line(product_id: number, qty: string, price: string, total: string): PaidLineDraft {
  return {
    product_id,
    qty: new PrismaClient.Decimal(qty),
    price: new PrismaClient.Decimal(price),
    total: new PrismaClient.Decimal(total)
  };
}

describe("applyDiscountWithRule (скидка %)", () => {
  it("10% — одна строка: total и price пересчитаны", () => {
    const rule = baseRule({ type: "discount", discount_pct: 10 });
    const paid = [line(1, "2", "25000", "50000")];
    const { lines, total } = applyDiscountWithRule(rule, paid, new PrismaClient.Decimal("50000"));
    expect(total.toString()).toBe("45000");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.total.toString()).toBe("45000");
    expect(lines[0]!.price.toString()).toBe("22500");
  });

  it("10% — две строки: сумма строк = итогу заказа", () => {
    const rule = baseRule({ type: "discount", discount_pct: 10 });
    const paid = [line(1, "1", "40000", "40000"), line(2, "1", "60000", "60000")];
    const { lines, total } = applyDiscountWithRule(rule, paid, new PrismaClient.Decimal("100000"));
    expect(total.toString()).toBe("90000");
    const sumLines = lines.reduce((a, l) => a.add(l.total), new PrismaClient.Decimal(0));
    expect(sumLines.toString()).toBe("90000");
  });

  it("discount_pct null — без изменений", () => {
    const rule = baseRule({ type: "discount", discount_pct: null });
    const paid = [line(1, "1", "100", "100")];
    const { lines, total } = applyDiscountWithRule(rule, paid, new PrismaClient.Decimal("100"));
    expect(total.toString()).toBe("100");
    expect(lines[0]!.total.toString()).toBe("100");
  });

  it("0% — сумма та же", () => {
    const rule = baseRule({ type: "discount", discount_pct: 0 });
    const paid = [line(1, "1", "100", "100")];
    const { lines, total } = applyDiscountWithRule(rule, paid, new PrismaClient.Decimal("100"));
    expect(total.toString()).toBe("100");
    expect(lines[0]!.total.toString()).toBe("100");
  });
});

describe("findWinningDiscountRule", () => {
  const client = { id: 1, category: null as string | null };
  const productById = new Map<number, { id: number; category_id: number | null }>([
    [10, { id: 10, category_id: 1 }],
    [20, { id: 20, category_id: 2 }]
  ]);

  it("берёт первое в списке (priority desc уже снаружи)", () => {
    const high = baseRule({ id: 1, type: "discount", discount_pct: 15, priority: 100 });
    const low = baseRule({ id: 2, type: "discount", discount_pct: 5, priority: 1 });
    const w = findWinningDiscountRule([high, low], client, new Set([10]), productById, new Set());
    expect(w?.id).toBe(1);
    expect(w?.discount_pct).toBe(15);
  });

  it("правило с payment_type не участвует (нужен контекст заказа)", () => {
    const r = baseRule({
      id: 3,
      type: "discount",
      discount_pct: 20,
      payment_type: "cash"
    });
    const w = findWinningDiscountRule([r], client, new Set([10]), productById, new Set());
    expect(w).toBeNull();
  });

  it("once_per_client + уже применяли — пропуск", () => {
    const r = baseRule({ id: 7, type: "discount", discount_pct: 10, once_per_client: true });
    const w = findWinningDiscountRule([r], client, new Set([10]), productById, new Set([7]));
    expect(w).toBeNull();
  });

  it("selected_client_ids — чужой клиент не матчится", () => {
    const r = baseRule({
      id: 8,
      type: "discount",
      discount_pct: 10,
      target_all_clients: false,
      selected_client_ids: [99]
    });
    const w = findWinningDiscountRule([r], client, new Set([10]), productById, new Set());
    expect(w).toBeNull();
  });

  it("product_ids — нет пересечения с заказом", () => {
    const r = baseRule({ id: 9, type: "discount", discount_pct: 10, product_ids: [99] });
    const w = findWinningDiscountRule([r], client, new Set([10]), productById, new Set());
    expect(w).toBeNull();
  });

  it("scope_agent — чужой агент не матчится", () => {
    const r = baseRule({
      id: 12,
      type: "discount",
      discount_pct: 10,
      scope_agent_user_ids: [99]
    });
    const ag = { userId: 1, branch: null, trade_direction_id: null };
    const w = findWinningDiscountRule([r], client, new Set([10]), productById, new Set(), ag);
    expect(w).toBeNull();
  });

  it("once на первом — берётся второе правило", () => {
    const blocked = baseRule({ id: 10, type: "discount", discount_pct: 50, once_per_client: true });
    const fallback = baseRule({ id: 11, type: "discount", discount_pct: 5, once_per_client: false });
    const w = findWinningDiscountRule(
      [blocked, fallback],
      client,
      new Set([10]),
      productById,
      new Set([10])
    );
    expect(w?.id).toBe(11);
    expect(w?.discount_pct).toBe(5);
  });
});

describe("applyAutomaticDiscountToPaidLines", () => {
  it("применяет первое подходящее правило", () => {
    const client = { id: 1, category: null as string | null };
    const productById = new Map([[5, { id: 5, category_id: null }]]);
    const rules = [
      baseRule({ id: 1, type: "discount", discount_pct: 10, priority: 10 }),
      baseRule({ id: 2, type: "discount", discount_pct: 50, priority: 1 })
    ];
    const paid = [line(5, "1", "1000", "1000")];
    const { total } = applyAutomaticDiscountToPaidLines(
      paid,
      new PrismaClient.Decimal("1000"),
      rules,
      client,
      new Set([5]),
      productById,
      new Set()
    );
    expect(total.toString()).toBe("900");
  });

  it("нет правил — total без изменений", () => {
    const client = { id: 1, category: null as string | null };
    const productById = new Map([[5, { id: 5, category_id: null }]]);
    const paid = [line(5, "1", "100", "100")];
    const { total } = applyAutomaticDiscountToPaidLines(
      paid,
      new PrismaClient.Decimal("100"),
      [],
      client,
      new Set([5]),
      productById,
      new Set()
    );
    expect(total.toString()).toBe("100");
  });
});

describe("mergeBonusLineDrafts", () => {
  it("склеивает одинаковый product_id по qty", () => {
    const drafts = [
      {
        product_id: 1,
        qty: new PrismaClient.Decimal("2"),
        price: new PrismaClient.Decimal("100"),
        total: new PrismaClient.Decimal("200"),
        is_bonus: true as const
      },
      {
        product_id: 1,
        qty: new PrismaClient.Decimal("3"),
        price: new PrismaClient.Decimal("100"),
        total: new PrismaClient.Decimal("300"),
        is_bonus: true as const
      }
    ];
    const out = mergeBonusLineDrafts(drafts);
    expect(out).toHaveLength(1);
    expect(out[0]!.product_id).toBe(1);
    expect(out[0]!.qty.toString()).toBe("5");
    expect(out[0]!.total.toString()).toBe("500");
  });

  it("разные product_id — две строки", () => {
    const drafts = [
      {
        product_id: 1,
        qty: new PrismaClient.Decimal("1"),
        price: new PrismaClient.Decimal("10"),
        total: new PrismaClient.Decimal("10"),
        is_bonus: true as const
      },
      {
        product_id: 2,
        qty: new PrismaClient.Decimal("1"),
        price: new PrismaClient.Decimal("20"),
        total: new PrismaClient.Decimal("20"),
        is_bonus: true as const
      }
    ];
    const out = mergeBonusLineDrafts(drafts);
    expect(out).toHaveLength(2);
  });
});

describe("bonusRuleConditionSummary (бонус + скидка, отображение)", () => {
  function asRule(p: Partial<BonusRule> & { conditions?: BonusRuleCondition[] }) {
    return p as BonusRule & { conditions: BonusRuleCondition[] };
  }

  it("qty с условиями + календарный месяц", () => {
    const r = asRule({
      type: "qty",
      sum_threshold_scope: "calendar_month",
      buy_qty: 6,
      free_qty: 1,
      conditions: [
        {
          id: 1,
          bonus_rule_id: 1,
          min_qty: null,
          max_qty: null,
          step_qty: new PrismaClient.Decimal(6),
          bonus_qty: new PrismaClient.Decimal(1),
          max_bonus_qty: null,
          sort_order: 0
        }
      ]
    });
    expect(bonusRuleConditionSummary(r)).toContain("кажд. 6→+1");
    expect(bonusRuleConditionSummary(r)).toContain("(мес.)");
  });

  it("qty buy/free + месяц", () => {
    const r = asRule({
      type: "qty",
      sum_threshold_scope: "calendar_month",
      buy_qty: 6,
      free_qty: 1,
      conditions: []
    });
    expect(bonusRuleConditionSummary(r)).toBe("6 + 1 бонус (мес.)");
  });

  it("sum + месяц", () => {
    const r = asRule({
      type: "sum",
      sum_threshold_scope: "calendar_month",
      min_sum: new PrismaClient.Decimal(5000),
      conditions: []
    });
    expect(bonusRuleConditionSummary(r)).toContain("мин.");
    expect(bonusRuleConditionSummary(r)).toContain("(мес.)");
  });

  it("discount %", () => {
    const r = asRule({
      type: "discount",
      discount_pct: new PrismaClient.Decimal(12.5),
      conditions: []
    });
    expect(bonusRuleConditionSummary(r)).toContain("12.5%");
  });
});
