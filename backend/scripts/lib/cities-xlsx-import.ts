/**
 * Excel «Данные Город» → tenant.settings.references.territory_nodes (viloyat → shaharlar).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  buildTerritoryForestWithCitiesFromRows,
  type CityXlsxRow,
  type MergeCitiesIntoTerritoryStats
} from "./lalaku-reference-import";
import { territoryRegionPickerNames } from "../../src/modules/tenant-settings/tenant-settings.service";

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

export function parseCityRowsFromXlsx(filePath: string): CityXlsxRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fayl topilmadi: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sn = wb.SheetNames[0];
  if (!sn) throw new Error("Varaq topilmadi");
  const sh = wb.Sheets[sn];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sh, { header: 1, defval: "" });
  const out: CityXlsxRow[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length < 4) continue;

    const h0 = String(row[0] ?? "").trim().toLowerCase();
    const h1 = String(row[1] ?? "").trim().toLowerCase();
    if (h0 === "#" && (h1 === "имя" || h1 === "ism" || h1 === "name")) continue;

    const numRaw = row[0];
    const order_num =
      typeof numRaw === "number" && Number.isInteger(numRaw)
        ? numRaw
        : typeof numRaw === "string" && /^\d+$/.test(numRaw.trim())
          ? parseInt(numRaw.trim(), 10)
          : null;

    const name = String(row[1] ?? "").trim();
    const code = String(row[2] ?? "").trim();
    const region = String(row[3] ?? "").trim();

    if (!name || !region) continue;

    const c0 = row[0];
    if (
      typeof c0 === "string" &&
      c0.trim() !== "" &&
      h0 !== "#" &&
      !/^\d+$/.test(c0.trim()) &&
      order_num == null
    ) {
      continue;
    }

    out.push({ order_num, name, code, region });
  }
  return out;
}

export type ResolveCityXlsxResult =
  | { ok: true; path: string }
  | { ok: false; reason: "missing_env_file" | "not_found"; detail?: string };

/**
 * 1) `CITY_XLSX_PATH` — majburiy yo‘l (bo‘lsa lekin fayl yo‘q → xato).
 * 2) Aks holda: `scripts/data/*.xlsx`, keyin Downloads dagi standart nom.
 */
export function resolveCityXlsxPath(cwdBackend: string): ResolveCityXlsxResult {
  const env = (process.env.CITY_XLSX_PATH || "").trim();
  if (env) {
    const abs = path.isAbsolute(env) ? env : path.join(cwdBackend, env);
    if (fs.existsSync(abs)) return { ok: true, path: abs };
    return { ok: false, reason: "missing_env_file", detail: abs };
  }

  const candidates = [
    path.join(cwdBackend, "scripts", "data", "Данные Город.xlsx"),
    path.join(cwdBackend, "scripts", "data", "Данные Город (1).xlsx"),
    path.join(cwdBackend, "scripts", "data", "gorod.xlsx"),
    path.join(process.env.USERPROFILE || "", "Downloads", "Данные Город (1).xlsx"),
    path.join(process.env.USERPROFILE || "", "Downloads", "Данные Город.xlsx")
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return { ok: true, path: p };
  }
  return { ok: false, reason: "not_found" };
}

export type RunCitiesXlsxImportOpts = {
  prisma: PrismaClient;
  tenantId: number;
  tenantSlug: string;
  xlsxPath: string;
  dry: boolean;
  /** Productionda yozish: true */
  allowProdWrite: boolean;
};

export type RunCitiesXlsxImportResult = {
  stats: MergeCitiesIntoTerritoryStats;
  rowCount: number;
  written: boolean;
};

export async function runCitiesXlsxImport(opts: RunCitiesXlsxImportOpts): Promise<RunCitiesXlsxImportResult> {
  const { prisma, tenantId, tenantSlug, xlsxPath, dry, allowProdWrite } = opts;

  if (process.env.NODE_ENV === "production" && !dry && !allowProdWrite) {
    throw new Error(
      "Productionda shaharlar importi: ALLOW_PROD_REF_IMPORT=true yoki ALLOW_PROD_CITIES_IMPORT=true"
    );
  }

  const cityRows = parseCityRowsFromXlsx(xlsxPath);
  if (cityRows.length === 0) {
    throw new Error("Excel dan yaroqli qator yo‘q (Имя + Название региона majburiy).");
  }

  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const st = asRecord(row?.settings);
  const ref = asRecord(st.references);

  const { forest, stats } = buildTerritoryForestWithCitiesFromRows(ref.territory_nodes, cityRows);
  const regions = territoryRegionPickerNames({
    ...ref,
    territory_nodes: forest as unknown
  } as Record<string, unknown>);

  console.log(`  → Tenant: ${tenantSlug} (id=${tenantId})`);
  console.log(`  → Fayl: ${xlsxPath}`);
  console.log(`  → Yaroqli qatorlar: ${cityRows.length}`);
  console.log(
    `  → +${stats.added} yangi shahar | takror: ${stats.skipped_duplicate} | skip: ${stats.skipped_bad_row}`
  );
  if (stats.missing_regions.length) {
    console.warn("  → Viloyat topilmadi:", stats.missing_regions.join(", "));
  }

  if (dry) {
    console.log("  → [dry] DB ga yozilmadi.");
    return { stats, rowCount: cityRows.length, written: false };
  }

  const nextRef = { ...ref, territory_nodes: forest, regions };
  const nextSettings = { ...st, references: nextRef };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: nextSettings as Prisma.InputJsonValue }
  });
  console.log("  → ✓ territory_nodes + regions yangilandi.");
  return { stats, rowCount: cityRows.length, written: true };
}
