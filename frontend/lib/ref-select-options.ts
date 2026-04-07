import { normKeyTerritoryMatch } from "@shared/territory-lalaku-seed";

/** API `ClientRefOptionDto` bilan mos */
export type RefSelectOption = { value: string; label: string };

/** Bir xil viloyat/zona nomi, turli `value` (kod vs to‘liq matn) — filtr ro‘yxatida takrorlarni yo‘qotish. */
export function dedupeRefSelectOptionsByTerritoryDisplayName(options: RefSelectOption[]): RefSelectOption[] {
  const byNk = new Map<string, RefSelectOption>();
  const codeLike = (v: string) => /^[A-Z0-9_]{2,24}$/.test(v.trim());
  const prefer = (a: RefSelectOption, b: RefSelectOption): RefSelectOption => {
    if (codeLike(a.value) && !codeLike(b.value)) return a;
    if (codeLike(b.value) && !codeLike(a.value)) return b;
    return a.value.length <= b.value.length ? a : b;
  };
  for (const o of options) {
    const v = o.value.trim();
    if (!v) continue;
    const lab = (o.label ?? o.value).trim() || v;
    const nk = normKeyTerritoryMatch(lab);
    const cur = byNk.get(nk);
    const row = { value: v, label: lab };
    byNk.set(nk, cur ? prefer(cur, row) : row);
  }
  return Array.from(byNk.values()).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

/** Joriy qiymat + serverdan kelgan `{ value, label }` + fallback qatorlar ro‘yxati. */
export function mergeRefSelectOptions(
  current: string,
  options: RefSelectOption[] | undefined,
  fallbackValues: string[] | undefined
): RefSelectOption[] {
  const map = new Map<string, string>();
  for (const o of options ?? []) {
    const v = o.value.trim();
    if (!v) continue;
    const lab = (o.label ?? o.value).trim() || v;
    map.set(v, lab);
  }
  for (const s of fallbackValues ?? []) {
    const t = s.trim();
    if (t && !map.has(t)) map.set(t, t);
  }
  const c = current.trim();
  if (c && !map.has(c)) map.set(c, c);
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export function optionsToValueLabelMap(options: RefSelectOption[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const o of options ?? []) {
    const v = o.value.trim();
    if (!v) continue;
    m[v] = (o.label ?? o.value).trim() || v;
  }
  return m;
}
