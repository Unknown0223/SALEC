/**
 * `GET .../settings/profile` → `references.*_entries` massivlarini Select uchun variantlarga aylantirish.
 * Backend `activeValuesFromClientRefEntries` bilan bir xil: kod bo‘lsa kod, aks holda nom saqlanadi.
 */

export type ProfileRefEntry = {
  id: string;
  name: string;
  code: string | null;
  active?: boolean;
};

export function parseProfileRefEntries(raw: unknown): ProfileRefEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileRefEntry[] = [];
  for (const x of raw) {
    if (x == null || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!id || !name) continue;
    const codeVal = typeof o.code === "string" ? o.code.trim().toUpperCase() : null;
    const active = typeof o.active === "boolean" ? o.active : true;
    out.push({
      id,
      name,
      code: codeVal && codeVal.length ? codeVal : null,
      active
    });
  }
  return out;
}

export function refEntryStoredValue(e: Pick<ProfileRefEntry, "name" | "code">): string {
  const c = e.code?.trim();
  if (c) return c;
  return e.name.trim();
}

/** Faqat aktiv yozuvlar, tartib: sort_order bo‘lsa, keyin nom. */
export function activeRefSelectOptions(raw: unknown): { value: string; label: string }[] {
  const rows = parseProfileRefEntries(raw).filter((r) => r.active !== false);
  return rows
    .map((r) => ({
      value: refEntryStoredValue(r),
      label: r.name
    }))
    .filter((o) => o.value.length > 0);
}

/** Jadvalda ko‘rsatish: saqlangan qiymat → tanlangan nom. */
export function refEntryLabelByStored(
  raw: unknown,
  stored: string
): string | undefined {
  const key = stored.trim();
  if (!key) return undefined;
  for (const r of parseProfileRefEntries(raw)) {
    if (refEntryStoredValue(r) === key) return r.name;
  }
  return undefined;
}
