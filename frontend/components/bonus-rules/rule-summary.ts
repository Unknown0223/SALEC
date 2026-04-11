import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";

/** Ro‘yxat va eksport uchun qisqa matn (бонус / скидка). */
export function ruleSummary(r: BonusRuleRow): string {
  const qtyMonth = (r.sum_threshold_scope ?? "order") === "calendar_month" ? " (мес.)" : "";
  if (r.type === "qty" && r.conditions?.length) {
    return (
      r.conditions
        .map((c) => {
          const range =
            c.min_qty != null || c.max_qty != null
              ? `${c.min_qty ?? "—"}…${c.max_qty ?? "—"}: `
              : "";
          return `${range}кажд. ${c.step_qty}→+${c.bonus_qty}${c.max_bonus_qty != null ? ` (≤${c.max_bonus_qty})` : ""}`;
        })
        .join("; ") + qtyMonth
    );
  }
  if (r.type === "qty") {
    return `${r.buy_qty ?? "—"} + ${r.free_qty ?? "—"} бонус${qtyMonth}`;
  }
  if (r.type === "sum") {
    const scope = r.sum_threshold_scope ?? "order";
    const hint = scope === "calendar_month" ? " (мес.)" : "";
    return `мин. ${r.min_sum ?? "—"}${hint}`;
  }
  if (r.type === "discount") {
    return `${r.discount_pct ?? "—"}%`;
  }
  return r.type;
}
