export type ClientRefEntry = {
  id: string;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  color: string | null;
};

export function legacyStringsToEntries(strings: string[], prefix: string): ClientRefEntry[] {
  return strings.map((s, i) => ({
    id: `legacy-${prefix}-${i}-${hashStable(s)}`,
    name: s,
    code: null,
    sort_order: null,
    comment: null,
    active: true,
    color: null
  }));
}

function hashStable(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function sortClientRefEntries(rows: ClientRefEntry[]): ClientRefEntry[] {
  return [...rows].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || "").toLocaleLowerCase().localeCompare((b.name || "").toLocaleLowerCase());
  });
}
