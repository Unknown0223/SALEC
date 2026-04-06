import type { CityTerritoryHint } from "@/lib/city-territory-hint";

/** Jadvalda kod o‘rniga nom chiqarish: `value` (DB) → `label`. */
export type ClientRefDisplayMaps = {
  category?: Record<string, string>;
  clientType?: Record<string, string>;
  clientFormat?: Record<string, string>;
  salesChannel?: Record<string, string>;
  city?: Record<string, string>;
  region?: Record<string, string>;
  district?: Record<string, string>;
  zone?: Record<string, string>;
  /** DB da viloyat/zona bo‘sh bo‘lsa, shahar bo‘yicha hudud daraxtidan ko‘rsatish */
  cityTerritoryHints?: Record<string, CityTerritoryHint>;
};
