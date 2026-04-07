export const APP_THEME_IDS = [
  "classic",
  "soft-slate-blue-grey",
  "cool-cyan",
  "light-indigo",
  "fresh-teal-growth",
  "light-steel-blue",
  "muted-indigo",
  "professional-cyan",
  "powder-blue",
  "soft-sage",
  "ocean-teal",
  "light-aqua",
  "soft-sky-blue-grey",
  "professional-cyan-v2",
  "light-steel-blue-v2",
  "cool-cyan-v2",
  "fresh-teal-growth-v2"
] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];

export const APP_THEME_STORAGE_KEY = "salec-app-theme";

/** Yangi foydalanuvchilar uchun — ro‘yxatdagi 1-variant (Soft Slate Blue-Grey). */
export const DEFAULT_APP_THEME: AppThemeId = "soft-slate-blue-grey";

const set = new Set<string>(APP_THEME_IDS);

export const APP_THEME_ALIASES: Record<string, AppThemeId> = {
  "midnight-azure": "professional-cyan",
  "teal-surface": "fresh-teal-growth",
  "indigo-gradient": "light-indigo",
  "polar-blue": "soft-sky-blue-grey",
  "sage-soft": "soft-sage",
  "obsidian-cyan": "professional-cyan",
  "violet-depth": "muted-indigo"
};

export function isAppThemeId(value: string): value is AppThemeId {
  return set.has(value);
}

export function normalizeAppThemeId(raw: string | null | undefined): AppThemeId | null {
  if (!raw) return null;
  if (isAppThemeId(raw)) return raw;
  return APP_THEME_ALIASES[raw] ?? null;
}

export const appThemeLabelsRu: Record<AppThemeId, string> = {
  classic: "Классика (SALESDOC teal)",
  "soft-slate-blue-grey": "1. Soft Slate Blue-Grey",
  "cool-cyan": "2. Cool Cyan",
  "light-indigo": "3. Light Indigo",
  "fresh-teal-growth": "4. Fresh Teal Growth",
  "light-steel-blue": "5. Light Steel Blue",
  "muted-indigo": "6. Muted Indigo",
  "professional-cyan": "7. Professional Cyan",
  "powder-blue": "8. Powder Blue",
  "soft-sage": "9. Soft Sage",
  "ocean-teal": "10. Ocean Teal",
  "light-aqua": "11. Light Aqua",
  "soft-sky-blue-grey": "12. Soft Sky Blue-Grey",
  "professional-cyan-v2": "13. Professional Cyan (V2)",
  "light-steel-blue-v2": "14. Light Steel Blue (V2)",
  "cool-cyan-v2": "15. Cool Cyan (V2)",
  "fresh-teal-growth-v2": "16. Fresh Teal Growth (V2)"
};

/** Mini-previews: bg, accent, muted text */
export const appThemeSwatches: Record<AppThemeId, { bg: string; primary: string; muted: string }> = {
  classic: { bg: "#f4f6f8", primary: "#0d9488", muted: "#64748b" },
  "soft-slate-blue-grey": { bg: "#f8fafc", primary: "#64748b", muted: "#64748b" },
  "cool-cyan": { bg: "#f0f9ff", primary: "#06b67f", muted: "#0369a1" },
  "light-indigo": { bg: "#f0f4ff", primary: "#6366f1", muted: "#64748b" },
  "fresh-teal-growth": { bg: "#f0fdfa", primary: "#14b8a6", muted: "#0f766e" },
  "light-steel-blue": { bg: "#f1f5f9", primary: "#475569", muted: "#475569" },
  "muted-indigo": { bg: "#f5f3ff", primary: "#7c3aed", muted: "#64748b" },
  "professional-cyan": { bg: "#ecfeff", primary: "#06b67f", muted: "#0e7490" },
  "powder-blue": { bg: "#f0f9ff", primary: "#3b82f6", muted: "#0369a1" },
  "soft-sage": { bg: "#f1f5f0", primary: "#4ade80", muted: "#166534" },
  "ocean-teal": { bg: "#ecfdf5", primary: "#14b8a6", muted: "#0f766e" },
  "light-aqua": { bg: "#f0fdfa", primary: "#22d3ee", muted: "#0e7490" },
  "soft-sky-blue-grey": { bg: "#f8fafc", primary: "#60a5fa", muted: "#64748b" },
  "professional-cyan-v2": { bg: "#ecfeff", primary: "#06b67f", muted: "#0e7490" },
  "light-steel-blue-v2": { bg: "#f1f5f9", primary: "#475569", muted: "#475569" },
  "cool-cyan-v2": { bg: "#f0f9ff", primary: "#06b67f", muted: "#0369a1" },
  "fresh-teal-growth-v2": { bg: "#f0fdfa", primary: "#14b8a6", muted: "#0f766e" }
};
