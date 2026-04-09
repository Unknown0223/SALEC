/**
 * Excel/CRM dagi ombor qatori → bazadagi Warehouse.id.
 * Aniq mos (normalizatsiya), ixtiyoriy JSON alias, so‘ng bitta nozik «includes» (faqat yagona mos kelganda).
 */
import * as fs from "node:fs";

export type WarehouseRow = { id: number; name: string };

export function normalizeWarehouseLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2019\u2018'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kalit: normalizatsiya qilingan Excel fragmenti; qiymat: bazadagi ombor nomi (qanday yozilgan bo‘lsa). */
export function loadWarehouseAliasesFile(filePath: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(filePath)) return m;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (typeof k !== "string" || typeof v !== "string" || !v.trim()) continue;
    m.set(normalizeWarehouseLabel(k), v.trim());
  }
  return m;
}

function segmentsFromLabel(raw: string): string[] {
  const t = raw.trim();
  const parts = t.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

function applyAlias(fragment: string, aliases: Map<string, string>): string {
  const mapped = aliases.get(normalizeWarehouseLabel(fragment));
  return mapped ?? fragment;
}

const FUZZY_MIN_LEN = 8;

/**
 * rawLabel — butun qator yoki vergul bilan bir nechta ombor; avval aniq, keyin bitta «includes».
 */
export function resolveWarehouseIdFromList(
  rawLabel: string | null,
  whList: WarehouseRow[],
  aliases: Map<string, string>
): number | null {
  if (!rawLabel?.trim()) return null;

  const norm = normalizeWarehouseLabel;
  const byNormId = new Map<string, number>();
  for (const w of whList) {
    byNormId.set(norm(w.name), w.id);
  }

  const segs = segmentsFromLabel(rawLabel);
  for (const rawSeg of segs) {
    const seg = applyAlias(rawSeg, aliases);
    const id = byNormId.get(norm(seg));
    if (id != null) return id;
  }

  for (const rawSeg of segs) {
    const seg = applyAlias(rawSeg, aliases);
    const k = norm(seg);
    if (k.length < FUZZY_MIN_LEN) continue;
    const hits = whList.filter((w) => {
      const wn = norm(w.name);
      return wn.includes(k) || k.includes(wn);
    });
    if (hits.length === 1) return hits[0].id;
  }

  return null;
}
