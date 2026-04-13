import type { ClientBalanceTerritoryOptions } from "@/lib/client-balances-types";
import {
  dedupeRefSelectOptionsByTerritoryDisplayName,
  mergeRefSelectOptions,
  type RefSelectOption
} from "@/lib/ref-select-options";
import { collectActiveNamesAtDepth, type TerritoryNode } from "@/lib/territory-tree";

/** Mijoz kartochkasi / to‘lov filtri: maydonlar. */
export type ClientTerritoryFilterField = "zone" | "region" | "city" | "district" | "neighborhood";

const FIELD_ORDER: ClientTerritoryFilterField[] = ["zone", "region", "city", "district", "neighborhood"];

/** Hudud daraxtida qatlam (ildiz = 0) — `zone` bo‘sh bo‘lsa ham tanlov to‘ldiriladi. */
const TREE_DEPTH: Record<ClientTerritoryFilterField, number> = {
  zone: 0,
  region: 1,
  city: 2,
  district: 3,
  neighborhood: 4
};

export type TerritoryFilterLevelSpec = {
  field: ClientTerritoryFilterField;
  label: string;
  visIndex: 1 | 2 | 3 | 4 | 5;
};

/** GET /clients/references dan kerakli qismlar */
export type ClientRefsTerritoryBundle = {
  regions?: string[];
  cities?: string[];
  districts?: string[];
  zones?: string[];
  neighborhoods?: string[];
  region_options?: { value: string; label: string }[];
  city_options?: { value: string; label: string }[];
};

function mergeDistinct(base: string[] | undefined, ...extras: string[][]): string[] {
  const s = new Set<string>();
  for (const x of base ?? []) {
    const t = String(x).trim();
    if (t) s.add(t);
  }
  for (const arr of extras) {
    for (const x of arr) {
      const t = String(x).trim();
      if (t) s.add(t);
    }
  }
  return [...s];
}

function treeNamesAtField(nodes: TerritoryNode[] | undefined, field: ClientTerritoryFilterField): string[] {
  const d = TREE_DEPTH[field];
  return collectActiveNamesAtDepth(nodes ?? [], d);
}

function liveDistinct(field: ClientTerritoryFilterField, live: ClientBalanceTerritoryOptions | undefined): string[] {
  if (!live) return [];
  switch (field) {
    case "zone":
      return live.zones ?? [];
    case "region":
      return live.regions ?? [];
    case "city":
      return live.cities ?? [];
    case "district":
      return live.districts ?? [];
    case "neighborhood":
      return live.neighborhoods ?? [];
    default:
      return [];
  }
}

/**
 * `references.territory_levels` bo‘yicha sarlavha va maydon.
 * Sozlama bo‘lmasa — region / city / district, nomlar «Область / Город / Район».
 */
export function buildClientTerritoryFilterLevels(
  territoryLevelNames: string[] | undefined | null
): TerritoryFilterLevelSpec[] {
  const raw = (territoryLevelNames ?? []).map((s) => String(s).trim()).filter(Boolean);
  /* Rayon/shahar amalda ko‘p hollarda bir xil ma’no beradi — 3‑filtr rejimida 3‑qatlam: viloyat, shahar, zona */
  if (raw.length === 0) {
    return [
      { field: "region", label: "Область", visIndex: 1 },
      { field: "city", label: "Город", visIndex: 2 },
      { field: "zone", label: "Зона", visIndex: 3 }
    ];
  }
  const n = Math.min(raw.length, 5);
  return FIELD_ORDER.slice(0, n).map((field, i) => ({
    field,
    label: raw[i] || `Уровень ${i + 1}`,
    visIndex: (i + 1) as 1 | 2 | 3 | 4 | 5
  }));
}

/**
 * To‘lovlar filtri: kod o‘rniga `city_options` / `region_options` yorliqlari + daraxt + mijozlar distinct.
 */
export function buildPaymentTerritorySelectOptions(
  field: ClientTerritoryFilterField,
  refs: ClientRefsTerritoryBundle | undefined,
  live: ClientBalanceTerritoryOptions | undefined,
  territoryNodes: TerritoryNode[] | undefined,
  currentValue: string
): RefSelectOption[] {
  const tree = treeNamesAtField(territoryNodes, field);
  const liveVals = liveDistinct(field, live);

  let opts: RefSelectOption[];
  switch (field) {
    case "region": {
      const fallback = mergeDistinct(refs?.regions, tree, liveVals);
      opts = mergeRefSelectOptions(currentValue, refs?.region_options, fallback);
      return dedupeRefSelectOptionsByTerritoryDisplayName(opts);
    }
    case "city": {
      const fallback = mergeDistinct(refs?.cities, tree, liveVals);
      opts = mergeRefSelectOptions(currentValue, refs?.city_options, fallback);
      return dedupeRefSelectOptionsByTerritoryDisplayName(opts);
    }
    case "district": {
      const fallback = mergeDistinct(refs?.districts, tree, liveVals);
      opts = mergeRefSelectOptions(currentValue, undefined, fallback);
      return dedupeRefSelectOptionsByTerritoryDisplayName(opts);
    }
    case "zone": {
      const fallback = mergeDistinct(refs?.zones, tree, liveVals);
      opts = mergeRefSelectOptions(currentValue, undefined, fallback);
      return dedupeRefSelectOptionsByTerritoryDisplayName(opts);
    }
    case "neighborhood": {
      const fallback = mergeDistinct(refs?.neighborhoods, tree, liveVals);
      opts = mergeRefSelectOptions(currentValue, undefined, fallback);
      return dedupeRefSelectOptionsByTerritoryDisplayName(opts);
    }
    default:
      return [];
  }
}
