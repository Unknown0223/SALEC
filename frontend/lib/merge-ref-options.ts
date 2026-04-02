/** Spravochnik ro‘yxati + joriy qiymatni birlashtirib, tartiblangan unikal ro‘yxat. */
export function mergeRefOptions(current: string, list: string[] | undefined): string[] {
  const s = new Set<string>();
  for (const x of list ?? []) {
    const t = x?.trim();
    if (t) s.add(t);
  }
  const c = current.trim();
  if (c) s.add(c);
  return Array.from(s).sort((a, b) => a.localeCompare(b, "uz"));
}
