/** O'qish oson: 46205000.12 → "46 205 000.12" (bo'shliq — mingliklar) */
export function formatGroupedDecimal(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(fractionDigits);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return frac != null ? `${grouped}.${frac}` : grouped;
}

export function formatGroupedInteger(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}
