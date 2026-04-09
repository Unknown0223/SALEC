/**
 * TanStack Query `staleTime` (ms).
 * Global default: `components/providers.tsx` (queries.staleTime).
 * Bu yerda modul / tur bo‘yicha ustunlik — kamroq tarmoq, tezroq UI.
 */
export const STALE = {
  /** Spravochnik: omborlar, agentlar, narx turlari, kategoriyalar … */
  reference: 6 * 60 * 1000,
  /** Tenant profil, UI prefs, kompaniya */
  profile: 3 * 60 * 1000,
  /** Ro‘yxatlar (paginatsiya) */
  list: 75 * 1000,
  /** Hisobot / agregat endpointlar */
  report: 2 * 60 * 1000,
  /** Bitta hujjat / kartochka */
  detail: 45 * 1000,
  /** Tez yangilanadigan: bildirishnomalar, sessiya */
  live: 20 * 1000
} as const;
