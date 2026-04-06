/**
 * Hudud daraxti: 3 qavat (Zona → Oblast → Gorod) uchun kodlarni to‘ldirish va Excel bilan tekshiruv.
 */

import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { territoryRegionPickerNames } from "../../src/modules/tenant-settings/tenant-settings.service";
import {
  buildTerritoryForestWithRegionAndCityRows,
  canonicalRegionNameFromExcel,
  normalizeTerritoryLabel,
  type CityXlsxRow,
  type RegionXlsxRow
} from "./lalaku-reference-import";
import {
  defaultRegionTerritoryCode,
  defaultZoneTerritoryCode,
  normKey,
  normKeyTerritoryMatch,
  REGION_ZONE_ROWS,
  type LalakuTerritoryNode
} from "../../../shared/territory-lalaku-seed";

export const DEFAULT_TERRITORY_LEVELS = ["Zona", "Oblast", "Gorod"] as const;

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

/** Mavjud ildiz va viloyat tugunlarida `code` bo‘sh bo‘lsa — standart kod qo‘yiladi. */
export function backfillZoneAndRegionCodes(forest: LalakuTerritoryNode[]): void {
  for (const z of forest) {
    if (!z.code) {
      const c = defaultZoneTerritoryCode(z.name);
      if (c) z.code = c;
    }
    for (const r of z.children ?? []) {
      if (!r.code) {
        const c = defaultRegionTerritoryCode(r.name);
        if (c) r.code = c;
      }
    }
  }
}

/**
 * Exceldagi shahar kodlarini daraxtga yozadi (nom bo‘yicha moslash, takror qatorlarda oxirgisi g‘olib).
 */
export function overlayCityCodesFromRows(forest: LalakuTerritoryNode[], rows: CityXlsxRow[]): number {
  let patched = 0;
  const byReg = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const regionRaw = row.region?.trim() ?? "";
    const nameRaw = row.name?.trim() ?? "";
    const codeRaw = row.code?.trim() ?? "";
    if (!regionRaw || !nameRaw) continue;
    const rk = normKeyTerritoryMatch(canonicalRegionNameFromExcel(regionRaw));
    const cityDisplay = normalizeTerritoryLabel(nameRaw);
    const ck = normKeyTerritoryMatch(cityDisplay);
    const up = codeRaw.toUpperCase();
    if (!up || !/^[A-Z0-9_]+$/.test(up)) continue;
    const code = up.slice(0, 20);
    if (!byReg.has(rk)) byReg.set(rk, new Map());
    byReg.get(rk)!.set(ck, code);
  }
  for (const z of forest) {
    for (const r of z.children ?? []) {
      const rk = normKeyTerritoryMatch(r.name);
      const cmap = byReg.get(rk);
      if (!cmap) continue;
      for (const c of r.children ?? []) {
        const want = cmap.get(normKeyTerritoryMatch(c.name));
        if (want && (!c.code || normKey(c.code) !== normKey(want))) {
          c.code = want;
          patched++;
        }
      }
    }
  }
  return patched;
}

export type TerritorySyncVerifyReport = {
  territory_levels: readonly string[];
  zoneCount: number;
  zonesMissingCode: string[];
  regionCount: number;
  regionsMissingCode: string[];
  cityCount: number;
  citiesMissingCode: string[];
  excelRowsWithCode: number;
  excelMatchedCorrect: number;
  excelMismatch: { region: string; city: string; excelCode: string; treeCode: string | null }[];
  excelRegionNotInTree: string[];
  excelCityNotInTree: { region: string; city: string }[];
};

function findRegionNode(forest: LalakuTerritoryNode[], rKey: string): LalakuTerritoryNode | null {
  const target = normKeyTerritoryMatch(rKey);
  for (const z of forest) {
    const r = (z.children ?? []).find((c) => normKeyTerritoryMatch(c.name) === target);
    if (r) return r;
  }
  return null;
}

/** Daraxt va Excel bo‘yicha tekshiruv hisoboti. */
export function verifyTerritorySync(
  forest: LalakuTerritoryNode[],
  cityRows: CityXlsxRow[]
): TerritorySyncVerifyReport {
  const zonesMissingCode: string[] = [];
  const regionsMissingCode: string[] = [];
  const citiesMissingCode: string[] = [];
  let regionCount = 0;
  let cityCount = 0;

  for (const z of forest) {
    if (!z.code?.trim()) zonesMissingCode.push(z.name);
    for (const r of z.children ?? []) {
      regionCount++;
      if (!r.code?.trim()) regionsMissingCode.push(`${z.name} / ${r.name}`);
      for (const c of r.children ?? []) {
        cityCount++;
        const cr = (c.code ?? "").trim().toUpperCase();
        if (!cr || !/^[A-Z0-9_]+$/.test(cr)) citiesMissingCode.push(`${r.name} / ${c.name}`);
      }
    }
  }

  let excelRowsWithCode = 0;
  let excelMatchedCorrect = 0;
  const excelMismatch: TerritorySyncVerifyReport["excelMismatch"] = [];
  const excelRegionNotInTree = new Set<string>();
  const excelCityNotInTree: { region: string; city: string }[] = [];

  for (const row of cityRows) {
    const regionRaw = row.region?.trim() ?? "";
    const nameRaw = row.name?.trim() ?? "";
    const codeRaw = row.code?.trim() ?? "";
    if (!regionRaw || !nameRaw) continue;
    const up = codeRaw.toUpperCase();
    if (!up || !/^[A-Z0-9_]+$/.test(up)) continue;
    const excelCode = up.slice(0, 20);
    excelRowsWithCode++;

    const canonicalRegion = canonicalRegionNameFromExcel(regionRaw);
    const rKey = normKeyTerritoryMatch(canonicalRegion);
    const cityDisplay = normalizeTerritoryLabel(nameRaw);
    const cKey = normKeyTerritoryMatch(cityDisplay);

    const regNode = findRegionNode(forest, canonicalRegion);
    if (!regNode) {
      excelRegionNotInTree.add(regionRaw);
      continue;
    }
    const cityNode = (regNode.children ?? []).find((ch) => normKeyTerritoryMatch(ch.name) === cKey);
    if (!cityNode) {
      excelCityNotInTree.push({ region: canonicalRegion, city: cityDisplay });
      continue;
    }
    const tc = (cityNode.code ?? "").trim().toUpperCase();
    if (tc === excelCode) excelMatchedCorrect++;
    else excelMismatch.push({ region: canonicalRegion, city: cityDisplay, excelCode, treeCode: cityNode.code });
  }

  return {
    territory_levels: DEFAULT_TERRITORY_LEVELS,
    zoneCount: forest.length,
    zonesMissingCode,
    regionCount,
    regionsMissingCode,
    cityCount,
    citiesMissingCode,
    excelRowsWithCode,
    excelMatchedCorrect,
    excelMismatch,
    excelRegionNotInTree: [...excelRegionNotInTree].sort((a, b) => a.localeCompare(b, "uz")),
    excelCityNotInTree
  };
}

export function printTerritoryVerifyReport(rep: TerritorySyncVerifyReport): void {
  console.log("\n=== Tekshiruv (3 qavat + kodlar) ===");
  console.log(`  territory_levels (maqsad): ${rep.territory_levels.join(" → ")}`);
  console.log(`  Zonalar: ${rep.zoneCount} | kodsiz: ${rep.zonesMissingCode.length}`);
  if (rep.zonesMissingCode.length) console.log("    ", rep.zonesMissingCode.join(", "));
  console.log(`  Viloyatlar: ${rep.regionCount} | kodsiz: ${rep.regionsMissingCode.length}`);
  if (rep.regionsMissingCode.length) {
    const head = rep.regionsMissingCode.slice(0, 20).join("; ");
    console.log("    ", rep.regionsMissingCode.length > 20 ? `${head}; …` : head);
  }
  console.log(`  Shaharlar: ${rep.cityCount} | kod yoki format yo‘q: ${rep.citiesMissingCode.length}`);
  if (rep.citiesMissingCode.length && rep.citiesMissingCode.length <= 30) {
    console.log("    ", rep.citiesMissingCode.join("; "));
  } else if (rep.citiesMissingCode.length) {
    console.log("    (birinchi 25)", rep.citiesMissingCode.slice(0, 25).join("; "));
  }
  console.log(`  Excel (kodli qatorlar): ${rep.excelRowsWithCode}`);
  console.log(`  Excel ↔ daraxt mos (kod): ${rep.excelMatchedCorrect} / ${rep.excelRowsWithCode}`);
  if (rep.excelMismatch.length) {
    console.warn(`  ⚠ Kod mos kelmaydi (${rep.excelMismatch.length}):`, rep.excelMismatch.slice(0, 15));
  }
  if (rep.excelRegionNotInTree.length) {
    console.warn("  ⚠ Exceldagi viloyat daraxtda yo‘q:", rep.excelRegionNotInTree.join(", "));
  }
  if (rep.excelCityNotInTree.length) {
    console.warn(`  ⚠ Exceldagi shahar daraxtda yo‘q (${rep.excelCityNotInTree.length} ta)`);
    console.warn(rep.excelCityNotInTree.slice(0, 20));
  }
  const ok =
    rep.zonesMissingCode.length === 0 &&
    rep.regionsMissingCode.length === 0 &&
    rep.citiesMissingCode.length === 0 &&
    rep.excelMismatch.length === 0 &&
    rep.excelRegionNotInTree.length === 0 &&
    rep.excelCityNotInTree.length === 0 &&
    rep.excelMatchedCorrect === rep.excelRowsWithCode;
  console.log(ok ? "\n✓ Barcha tekshiruvlar o‘tdi.\n" : "\n→ Yuqoridagi ogohlantirishlarni tekshiring.\n");
}

/** Lalaku viloyatlari ichidan «Данные Город»da umuman qator yo‘q bo‘lganlar (masalan SAMARQAND). */
export function listRegionsMissingFromCityExcel(cityRows: CityXlsxRow[]): string[] {
  const keys = new Set<string>();
  for (const row of cityRows) {
    const raw = row.region?.trim() ?? "";
    if (!raw) continue;
    keys.add(normKeyTerritoryMatch(canonicalRegionNameFromExcel(raw)));
  }
  const missing: string[] = [];
  for (const { region } of REGION_ZONE_ROWS) {
    if (!keys.has(normKeyTerritoryMatch(region))) missing.push(region);
  }
  return missing;
}

export type RunTerritoryFullSyncOpts = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  regionXlsxPath: string;
  cityXlsxPath: string;
  regionRows: RegionXlsxRow[];
  cityRows: CityXlsxRow[];
  dry: boolean;
  allowProdWrite: boolean;
};

export async function runTerritoryFullSync(opts: RunTerritoryFullSyncOpts): Promise<{
  written: boolean;
  verify: TerritorySyncVerifyReport;
}> {
  const { prisma, tenantId, tenantSlug, dry, allowProdWrite, regionRows, cityRows } = opts;

  if (process.env.NODE_ENV === "production" && !dry && !allowProdWrite) {
    throw new Error(
      "Productionda yozish: ALLOW_PROD_TERRITORY_EXCEL=true yoki ALLOW_PROD_CITIES_IMPORT=true yoki ALLOW_PROD_REF_IMPORT=true"
    );
  }

  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const st = asRecord(row?.settings);
  const ref = asRecord(st.references);

  const { forest, regionStats, cityStats } = buildTerritoryForestWithRegionAndCityRows(
    ref.territory_nodes,
    regionRows,
    cityRows
  );

  backfillZoneAndRegionCodes(forest);
  const cityPatched = overlayCityCodesFromRows(forest, cityRows);
  const verify = verifyTerritorySync(forest, cityRows);

  console.log(`\n=== Hudud to‘liq sinxron (${tenantSlug}, id=${tenantId}) ===`);
  console.log(`  Регион: ${opts.regionXlsxPath} (${regionRows.length} qator)`);
  console.log(
    `    +viloyat: ${regionStats.added_regions} | +zona: ${regionStats.added_zones} | takror: ${regionStats.skipped_duplicate_region}`
  );
  console.log(`  Город: ${opts.cityXlsxPath} (${cityRows.length} qator)`);
  console.log(
    `    +shahar: ${cityStats.added} | takror: ${cityStats.skipped_duplicate} | shahar kodlari yangilandi (overlay): ${cityPatched}`
  );
  if (cityStats.missing_regions.length) {
    console.warn("  Viloyat topilmadi (shahar qatorlari):", cityStats.missing_regions.join(", "));
  }

  const regionsNoCitySheet = listRegionsMissingFromCityExcel(cityRows);
  if (regionsNoCitySheet.length) {
    console.warn(
      "  ⚠ «Данные Город» faylida bu viloyatlar yo‘q — ularga shaharlar import qilinmaydi:",
      regionsNoCitySheet.join(", ")
    );
    console.warn(
      "     Samarqand va boshqalar uchun Excelga «Название региона» ustuniga to‘liq nom (masalan SAMARQAND VILOYATI) bilan qatorlar qo‘shing."
    );
  }

  printTerritoryVerifyReport(verify);

  if (dry) {
    console.log("[dry] DB ga yozilmadi.");
    return { written: false, verify };
  }

  const nextRef = {
    ...ref,
    territory_nodes: forest,
    territory_levels: [...DEFAULT_TERRITORY_LEVELS],
    regions: territoryRegionPickerNames({
      ...ref,
      territory_nodes: forest as unknown,
      territory_levels: [...DEFAULT_TERRITORY_LEVELS]
    } as Record<string, unknown>)
  };
  const nextSettings = { ...st, references: nextRef };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: nextSettings as Prisma.InputJsonValue }
  });
  console.log("✓ territory_nodes + territory_levels + regions saqlandi.");
  return { written: true, verify };
}
