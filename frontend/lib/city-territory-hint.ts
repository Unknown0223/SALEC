import { normKeyTerritoryMatch } from "@shared/territory-lalaku-seed";

export type CityTerritoryHint = {
  region_stored: string | null;
  region_label: string | null;
  zone_stored: string | null;
  zone_label: string | null;
  district_stored: string | null;
  district_label: string | null;
};

export function pickCityTerritoryHint(
  hints: Record<string, CityTerritoryHint> | undefined,
  cityVal: string
): CityTerritoryHint | null {
  if (!hints) return null;
  const t = cityVal.trim();
  if (!t) return null;
  return (
    hints[t] ??
    hints[t.toUpperCase()] ??
    hints[normKeyTerritoryMatch(t)] ??
    null
  );
}
