import { describe, expect, it } from "vitest";
import {
  computeQtyBonus,
  computeQtyBonusForRuleRow,
  pickMatchingCondition,
  type BonusConditionRow,
  type BonusRuleRow
} from "../src/modules/bonus-rules/bonus-rules.service";

describe("bonus qty preview helpers", () => {
  const base: BonusConditionRow = {
    id: 1,
    min_qty: null,
    max_qty: null,
    step_qty: 6,
    bonus_qty: 1,
    max_bonus_qty: null,
    sort_order: 0
  };

  describe("computeQtyBonus", () => {
    it("in_blocks: har blokda qayta hisob", () => {
      expect(computeQtyBonus(12, base, true)).toBe(2);
      expect(computeQtyBonus(13, base, true)).toBe(2);
      expect(computeQtyBonus(5, base, true)).toBe(0);
    });

    it("in_blocks: max_bonus_qty cheklovi", () => {
      expect(
        computeQtyBonus(100, { ...base, max_bonus_qty: 3 }, true)
      ).toBe(3);
    });

    it("in_blocks false: bir marta bonus", () => {
      expect(computeQtyBonus(6, base, false)).toBe(1);
      expect(computeQtyBonus(100, base, false)).toBe(1);
      expect(computeQtyBonus(5, base, false)).toBe(0);
    });
  });

  describe("pickMatchingCondition", () => {
    const tiers: BonusConditionRow[] = [
      {
        id: 10,
        min_qty: 1,
        max_qty: 5,
        step_qty: 1,
        bonus_qty: 0,
        max_bonus_qty: null,
        sort_order: 0
      },
      {
        id: 11,
        min_qty: 6,
        max_qty: null,
        step_qty: 6,
        bonus_qty: 1,
        max_bonus_qty: null,
        sort_order: 1
      }
    ];

    it("birinchi mos oralig‘dagi qatorni tanlaydi", () => {
      expect(pickMatchingCondition(tiers, 3)?.id).toBe(10);
      expect(pickMatchingCondition(tiers, 12)?.id).toBe(11);
    });

    it("hech biri mos kelmasa null", () => {
      const narrow: BonusConditionRow[] = [
        { ...tiers[0], min_qty: 10, max_qty: 20, sort_order: 0 }
      ];
      expect(pickMatchingCondition(narrow, 3)).toBeNull();
    });
  });

  it("computeQtyBonusForRuleRow: buy_qty/free_qty sintetik shart", () => {
    const rule = {
      type: "qty",
      buy_qty: 6,
      free_qty: 1,
      conditions: [],
      in_blocks: true
    } as unknown as BonusRuleRow;
    expect(computeQtyBonusForRuleRow(rule, 12)).toBe(2);
    expect(computeQtyBonusForRuleRow(rule, 5)).toBe(0);
  });
});
