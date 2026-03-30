import { describe, expect, it } from "vitest";
import {
  mergeBonusStackPatch,
  parseBonusStackPolicy,
  resolveBonusSlotTakeCount
} from "../src/modules/orders/bonus-stack-policy";

describe("bonus-stack-policy", () => {
  it("defaults to all", () => {
    const p = parseBonusStackPolicy({});
    expect(p.mode).toBe("all");
    expect(resolveBonusSlotTakeCount(4, p)).toBe(4);
  });

  it("first_only takes one slot", () => {
    const p = parseBonusStackPolicy({ bonus_stack: { mode: "first_only" } });
    expect(resolveBonusSlotTakeCount(4, p)).toBe(1);
  });

  it("capped with max_units", () => {
    const p = parseBonusStackPolicy({ bonus_stack: { mode: "capped", max_units: 2 } });
    expect(resolveBonusSlotTakeCount(4, p)).toBe(2);
  });

  it("forbid_apply_all_eligible reduces when all would apply", () => {
    const p = parseBonusStackPolicy({
      bonus_stack: { mode: "capped", max_units: 4, forbid_apply_all_eligible: true }
    });
    expect(resolveBonusSlotTakeCount(4, p)).toBe(3);
  });

  it("forbid does not block single slot", () => {
    const p = parseBonusStackPolicy({
      bonus_stack: { mode: "capped", max_units: 10, forbid_apply_all_eligible: true }
    });
    expect(resolveBonusSlotTakeCount(1, p)).toBe(1);
  });

  it("mergeBonusStackPatch keeps unspecified fields", () => {
    const cur = parseBonusStackPolicy({
      bonus_stack: { mode: "capped", max_units: 3, forbid_apply_all_eligible: true }
    });
    const m = mergeBonusStackPatch(cur, { mode: "all" });
    expect(m.mode).toBe("all");
    expect(m.maxUnits).toBe(3);
    expect(m.forbidApplyAllEligible).toBe(true);
  });
});
