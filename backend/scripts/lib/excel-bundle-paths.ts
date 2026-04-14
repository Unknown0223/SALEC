/**
 * import-excel-bundle va import-once: papkadan eng mos .xlsx ni tanlash.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const MIN_XLSX_BYTES = 512;

export function statSafe(filePath: string): { mtimeMs: number; size: number } {
  try {
    const st = fs.statSync(filePath);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return { mtimeMs: 0, size: 0 };
  }
}

/**
 * `dir` ichidan kalit so‘z bo‘yicha .xlsx.
 * Bir nechta mos kelganda: hajmi ≥ MIN bo‘lganlar orasidan eng yangi, so‘ng eng katta.
 */
export function findInDir(dir: string, keywords: string[]): string | null {
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((f) => /\.xlsx$/i.test(f));
  const paths = names.map((f) => path.join(dir, f));

  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const matches = paths.filter((p) => path.basename(p).toLowerCase().includes(k));
    if (matches.length === 0) continue;

    const bigEnough = matches.filter((p) => statSafe(p).size >= MIN_XLSX_BYTES);
    const pool = bigEnough.length > 0 ? bigEnough : matches;

    pool.sort((a, b) => {
      const sa = statSafe(a);
      const sb = statSafe(b);
      if (sb.mtimeMs !== sa.mtimeMs) return sb.mtimeMs - sa.mtimeMs;
      return sb.size - sa.size;
    });
    return pool[0] ?? null;
  }
  return null;
}

export function resolveBackendPath(p: string | undefined, cwdBackend: string): string | null {
  if (!p?.trim()) return null;
  const t = p.trim();
  if (path.isAbsolute(t)) return t;
  return path.join(cwdBackend, t);
}
