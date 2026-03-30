/**
 * `tenants.settings` → bonus qo‘llash strategiyasi.
 * Batafsil: docs/BONUS_STACKING_PLAN.md
 */

export type BonusStackMode = "all" | "first_only" | "capped";

export type BonusStackPolicy = {
  mode: BonusStackMode;
  /** `capped` uchun; `null` = cheksiz (faqat forbid bilan cheklanadi) */
  maxUnits: number | null;
  /** true: mos slotlar soni N>1 bo‘lsa, hech qachon barcha N tasini bir vaqtda bermaymiz */
  forbidApplyAllEligible: boolean;
};

const DEFAULT_POLICY: BonusStackPolicy = {
  mode: "all",
  maxUnits: null,
  forbidApplyAllEligible: false
};

export function parseBonusStackPolicy(settings: unknown): BonusStackPolicy {
  if (settings == null || typeof settings !== "object") {
    return { ...DEFAULT_POLICY };
  }
  const root = settings as Record<string, unknown>;
  const raw = root.bonus_stack;
  if (raw == null || typeof raw !== "object") {
    return { ...DEFAULT_POLICY };
  }
  const b = raw as Record<string, unknown>;

  const modeRaw = b.mode;
  const mode: BonusStackMode =
    modeRaw === "first_only" || modeRaw === "capped" ? modeRaw : "all";

  let maxUnits: number | null = null;
  if (typeof b.max_units === "number" && Number.isFinite(b.max_units) && b.max_units >= 1) {
    maxUnits = Math.floor(b.max_units);
  }

  const forbidApplyAllEligible = Boolean(b.forbid_apply_all_eligible);

  return { mode, maxUnits, forbidApplyAllEligible };
}

/**
 * `n` ta mos kelgan bonus slotidan nechtasini qo‘llash kerak.
 */
/** API / `settings` JSON bilan mos (snake_case). */
export type BonusStackJson = {
  mode: BonusStackMode;
  max_units: number | null;
  forbid_apply_all_eligible: boolean;
};

export function bonusPolicyToJson(p: BonusStackPolicy): BonusStackJson {
  return {
    mode: p.mode,
    max_units: p.maxUnits,
    forbid_apply_all_eligible: p.forbidApplyAllEligible
  };
}

/** PATCH body: qisman yangilash mumkin. */
export function mergeBonusStackPatch(
  current: BonusStackPolicy,
  patch: Partial<{
    mode: unknown;
    max_units: unknown;
    forbid_apply_all_eligible: unknown;
  }>
): BonusStackPolicy {
  let mode = current.mode;
  if (patch.mode === "all" || patch.mode === "first_only" || patch.mode === "capped") {
    mode = patch.mode;
  }

  let maxUnits = current.maxUnits;
  if ("max_units" in patch) {
    if (patch.max_units === null || patch.max_units === undefined) {
      maxUnits = null;
    } else if (typeof patch.max_units === "number" && Number.isFinite(patch.max_units) && patch.max_units >= 1) {
      maxUnits = Math.floor(patch.max_units);
    }
  }

  let forbid = current.forbidApplyAllEligible;
  if (typeof patch.forbid_apply_all_eligible === "boolean") {
    forbid = patch.forbid_apply_all_eligible;
  }

  return { mode, maxUnits, forbidApplyAllEligible: forbid };
}

export function resolveBonusSlotTakeCount(n: number, policy: BonusStackPolicy): number {
  if (n <= 0) return 0;
  if (policy.mode === "all") {
    return n;
  }
  if (policy.mode === "first_only") {
    return 1;
  }

  let cap = policy.maxUnits ?? n;
  cap = Math.min(cap, n);
  if (policy.forbidApplyAllEligible && n > 1 && cap >= n) {
    cap = n - 1;
  }
  return Math.max(0, cap);
}
