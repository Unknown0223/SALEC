import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";

const STORAGE_KEY = "salec:bonus-rule-clone-v1";

export type BonusRuleCloneTarget = "bonus" | "discount";

/** Yangi qoida sifatida ochish uchun: manba qatoridan to‘ldirilgan qoidalar. */
export function buildClonePrefill(rule: BonusRuleRow): BonusRuleRow {
  return {
    ...rule,
    id: 0,
    name: `${rule.name} (копия)`
  };
}

export function writeBonusRuleCloneDraft(target: BonusRuleCloneTarget, rule: BonusRuleRow): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target, rule: buildClonePrefill(rule) })
    );
  } catch {
    /* quota / private mode */
  }
}

/** Faqat `target` mos kelganda o‘qiydi va kalitni olib tashlaydi. */
export function readBonusRuleCloneDraft(target: BonusRuleCloneTarget): BonusRuleRow | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { target?: string; rule?: BonusRuleRow };
    if (parsed.target !== target || !parsed.rule || typeof parsed.rule !== "object") {
      return null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return parsed.rule;
  } catch {
    return null;
  }
}
