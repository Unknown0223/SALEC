/**
 * Lalaku spravochniklari — tenant.settings + jadval yozuvlari (idempotent).
 * Bo‘limlar ketma-ket konsolga chiqadi; `import-once.ts` bitta kirish nuqtasi.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  paymentMethodsFromUnknown,
  priceTypeEntriesFromUnknown,
  priceTypeKey,
  type PaymentMethodEntryDto,
  type PriceTypeEntryDto
} from "../../src/modules/tenant-settings/finance-refs";
import {
  defaultRegionTerritoryCode,
  defaultZoneTerritoryCode,
  mergeTerritoryBundle,
  normKey,
  normKeyTerritoryMatch,
  REGION_ZONE_ROWS,
  ZONE_ROOT_NAMES,
  type LalakuTerritoryNode
} from "../../../shared/territory-lalaku-seed";
import { territoryRegionPickerNames } from "../../src/modules/tenant-settings/tenant-settings.service";

export { ZONE_ROOT_NAMES, REGION_ZONE_ROWS, mergeTerritoryBundle } from "../../../shared/territory-lalaku-seed";

type TerritoryNode = LalakuTerritoryNode;

type ClientRefEntry = {
  id: string;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  color: string | null;
};

export const SALES_CHANNELS: { name: string; code: string }[] = [
  { name: "B.SALOONS", code: "BSALOONS" },
  { name: "HORECA", code: "HORECA" },
  { name: "MOD.TRADE", code: "MODTRADE" },
  { name: "TRAD TRADE", code: "TRADTRADE" },
  { name: "WHOLESALE", code: "WHOLESALE" }
];

export const CLIENT_FORMATS: { name: string; code: string }[] = [
  { name: "Drogery", code: "DROGERY" },
  { name: "OP.Markets", code: "OPMARKETS" },
  { name: "Others", code: "OTHERS" },
  { name: "Perfumery", code: "PERFUMERY" },
  { name: "Pharmacy", code: "PHARMACY" },
  { name: "Superettes", code: "SUPERETTES" },
  { name: "Supermarket", code: "SUPERMARKET" },
  { name: "To'yxona", code: "TOYXONA" }
];

export const CLIENT_CATEGORIES: { name: string; code: string }[] = [
  { name: "A", code: "A" },
  { name: "B", code: "B" },
  { name: "C", code: "C" },
  { name: "D", code: "D" }
];

export const CLIENT_TYPES: { name: string; code: string }[] = [
  { name: "FOOD", code: "FOOD" },
  { name: "FOOD-HPC", code: "FOODHPC" },
  { name: "HPC", code: "HPC" },
  { name: "SUV", code: "SUV" }
];

export const TRADE_DIRECTIONS: {
  name: string;
  code: string;
  sort_order: number;
  use_in_order_proposal: boolean;
}[] = [
  { name: "DIELUX", code: "DIELUX", sort_order: 0, use_in_order_proposal: false },
  { name: "GIGA", code: "GIGA", sort_order: 0, use_in_order_proposal: false },
  { name: "LALAKU", code: "LALAKU", sort_order: 0, use_in_order_proposal: false },
  { name: "MAMA", code: "MAMA", sort_order: 0, use_in_order_proposal: false },
  { name: "MARKET PLACE", code: "MARKETPLACE", sort_order: 0, use_in_order_proposal: false },
  { name: "MIX_JENS", code: "MIX_JENS", sort_order: 0, use_in_order_proposal: false },
  { name: "MONNO", code: "MONNO", sort_order: 0, use_in_order_proposal: false },
  { name: "REVEREM", code: "REVEREM", sort_order: 0, use_in_order_proposal: true },
  { name: "SOF", code: "SOF", sort_order: 0, use_in_order_proposal: false },
  { name: "UMUMIY", code: "UMUMIY", sort_order: 0, use_in_order_proposal: false }
];

/** Sozlamalar → Finans → «Цена» (sotish): to‘lov usuli + narx turi juftlari */
const LALAKU_FINANCE_PAYMENT_METHODS: PaymentMethodEntryDto[] = [
  {
    id: "lalaku-pay-naqd",
    name: "Naqd",
    code: "naqd",
    currency_code: "UZS",
    sort_order: 100,
    comment: null,
    color: null,
    active: true
  },
  {
    id: "lalaku-pay-terminal",
    name: "Terminal",
    code: "terminal",
    currency_code: "UZS",
    sort_order: 101,
    comment: null,
    color: null,
    active: true
  },
  {
    id: "lalaku-pay-perechis",
    name: "Perechis",
    code: "perechis",
    currency_code: "UZS",
    sort_order: 102,
    comment: null,
    color: null,
    active: true
  }
];

const LALAKU_FINANCE_PRICE_TYPES: PriceTypeEntryDto[] = [
  {
    id: "lalaku-pt-naqd-pul",
    name: "NAQD PUL",
    code: "NAQD_PUL",
    payment_method_id: "lalaku-pay-naqd",
    kind: "sale",
    sort_order: 100,
    comment: null,
    active: true,
    manual: false,
    attached_clients_only: false
  },
  {
    id: "lalaku-pt-terminal",
    name: "TERMINAL",
    code: "TERMINAL",
    payment_method_id: "lalaku-pay-terminal",
    kind: "sale",
    sort_order: 101,
    comment: null,
    active: true,
    manual: false,
    attached_clients_only: false
  },
  {
    id: "lalaku-pt-perechisleniye",
    name: "PERECHISLENIYE",
    code: "PERECHISLENIYE",
    payment_method_id: "lalaku-pay-perechis",
    kind: "sale",
    sort_order: 102,
    comment: null,
    active: true,
    manual: false,
    attached_clients_only: false
  }
];

function mergePaymentMethodEntries(
  existing: PaymentMethodEntryDto[],
  add: PaymentMethodEntryDto[]
): PaymentMethodEntryDto[] {
  const out = [...existing];
  const seenId = new Set(out.map((e) => e.id));
  const seenCode = new Set(
    out.map((e) => (e.code ? normKey(e.code) : "")).filter(Boolean)
  );
  const seenName = new Set(out.map((e) => normKey(e.name)));
  for (const row of add) {
    if (seenId.has(row.id)) continue;
    const ck = row.code ? normKey(row.code) : "";
    const nk = normKey(row.name);
    if ((ck && seenCode.has(ck)) || seenName.has(nk)) continue;
    seenId.add(row.id);
    if (ck) seenCode.add(ck);
    seenName.add(nk);
    out.push({ ...row });
  }
  return out;
}

function mergePriceTypeEntries(
  existing: PriceTypeEntryDto[],
  add: PriceTypeEntryDto[]
): PriceTypeEntryDto[] {
  const out = [...existing];
  const seenId = new Set(out.map((e) => e.id));
  const seenKey = new Set(out.map((e) => normKey(priceTypeKey(e))));
  for (const row of add) {
    if (seenId.has(row.id)) continue;
    const k = normKey(priceTypeKey(row));
    if (seenKey.has(k)) continue;
    seenId.add(row.id);
    seenKey.add(k);
    out.push({ ...row });
  }
  return out;
}

export const WAREHOUSE_NAMES = [
  "Andijon SKLAD",
  "Buxoro SKLAD",
  "Denov SKLAD",
  "Farg'ona SKLAD",
  "Guliston SKLAD",
  "Jidda sklad",
  "Jizzax SKLAD",
  "Kattaqo'rgon SKLAD",
  "Namangan SKLAD",
  "Navoiy SKLAD",
  "Nukus Sklad",
  "Olmaliq sklad",
  "Orikzor SKLAD",
  "Qarshi Sklad",
  "Qoqon SKLAD",
  "Samarqand SKLAD",
  "Sergeli sklad",
  "Shaxrisabz Sklad",
  "Shimkent SKLAD",
  "Termiz SKLAD",
  "Xorazm SKLAD",
  "Yunusobod SKLAD",
  "Zarafshon LLK"
] as const;

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

/** Excel / translit. variantlari → `REGION_ZONE_ROWS` dagi rasmiy nom */
const EXCEL_REGION_ALIAS_BY_KEY = new Map<string, string>();

function registerExcelRegionAliases(variants: string[], canonical: string) {
  for (const v of variants) {
    const key = normKey(v.replace(/[''`ʼ]/g, ""));
    if (!EXCEL_REGION_ALIAS_BY_KEY.has(key)) EXCEL_REGION_ALIAS_BY_KEY.set(key, canonical);
  }
}

for (const { region } of REGION_ZONE_ROWS) {
  registerExcelRegionAliases([region], region);
}
registerExcelRegionAliases(["FARG'ONA VILOYATI", "FERGANA VILOYATI"], "FARGONA VILOYATI");
registerExcelRegionAliases(["BUXHARO VILOYATI", "BUKHARA VILOYATI"], "BUXORO VILOYATI");
registerExcelRegionAliases(["NAVOI VILOYATI", "NAWOIY VILOYATI"], "NAVOIY VILOYATI");
registerExcelRegionAliases(["ANDIZHAN VILOYATI"], "ANDIJON VILOYATI");
registerExcelRegionAliases(
  [
    "KARAKALPAKSTAN",
    "QORAQUALPAQ RESPUBLIKASI",
    "QORAQALPOQ RESPUBLIKASI",
    "QORA QALPOQ RESPUBLIKASI",
    "RESPUBLICA KARAKALPAKSTAN"
  ],
  "QORAQALPOQISTON"
);
registerExcelRegionAliases(["TASHKENT VILOYATI", "TASHKENT OBLAST"], "TOSHKENT VILOYATI");
registerExcelRegionAliases(["TASHKENT SHAHAR", "TASHKENT CITY", "G.TOSHKENT"], "TOSHKENT SHAHAR");
registerExcelRegionAliases(["JIZZAH VILOYATI"], "JIZZAX VILOYATI");
registerExcelRegionAliases(["KASHKADARYA VILOYATI"], "QASHQADARYO VILOYATI");
registerExcelRegionAliases(["SURKHANDARYA VILOYATI"], "SURXANDARYO VILOYATI");
registerExcelRegionAliases(["SYRDARYA VILOYATI"], "SIRDARYO VILOYATI");
registerExcelRegionAliases(["SAMARKAND VILOYATI"], "SAMARQAND VILOYATI");
registerExcelRegionAliases(["KHOREZM VILOYATI", "HOREZM VILOYATI"], "XORAZM VILOYATI");

export function canonicalRegionNameFromExcel(regionRaw: string): string {
  const t = regionRaw.trim();
  if (!t) return t;
  const k = normKey(t.replace(/[''`ʼ]/g, ""));
  return EXCEL_REGION_ALIAS_BY_KEY.get(k) ?? t;
}

function slugId(prefix: string, key: string): string {
  const k = normKey(key).replace(/\s+/g, "-").replace(/[^A-Z0-9-]/gi, "");
  return `${prefix}-${k.slice(0, 48)}`;
}

function simpleHash36(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function warehouseCodeFromName(name: string): string {
  const base = normKey(name)
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 36);
  return base || `WH_${simpleHash36(name)}`.slice(0, 20);
}

function parseTerritoryNodes(v: unknown): TerritoryNode[] {
  if (!Array.isArray(v)) return [];
  const parseOne = (item: unknown): TerritoryNode | null => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return null;
    const codeRaw = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
    const code = codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : null;
    const comment = typeof row.comment === "string" ? row.comment.trim() : "";
    const sort_order =
      typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
    const active = typeof row.active === "boolean" ? row.active : true;
    const rawChildren = row.children;
    const children = Array.isArray(rawChildren)
      ? rawChildren.map(parseOne).filter((x): x is TerritoryNode => x != null)
      : [];
    return { id, name, code, comment: comment || null, sort_order, active, children };
  };
  return v.map(parseOne).filter((x): x is TerritoryNode => x != null);
}

/** Excel «Данные Город»: Имя, Код, Название региона */
export type CityXlsxRow = {
  order_num?: number | null;
  name: string;
  code: string;
  region: string;
};

export type MergeCitiesIntoTerritoryStats = {
  added: number;
  skipped_duplicate: number;
  skipped_bad_row: number;
  missing_regions: string[];
};

export function normalizeTerritoryLabel(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.toUpperCase() === t ? t : t.toUpperCase();
}

/** Faqat zona → viloyat qatlami (shahar nomi tasodifiy mos kelmasin). */
function findTerritoryRegionNodesByNameKey(forest: TerritoryNode[], canonicalRegion: string): TerritoryNode[] {
  const target = normKeyTerritoryMatch(canonicalRegion);
  const hits: TerritoryNode[] = [];
  for (const z of forest) {
    for (const r of z.children ?? []) {
      if (normKeyTerritoryMatch(r.name) === target) hits.push(r);
    }
  }
  return hits;
}

function regionChildExistsUnderOtherRootZone(
  forest: TerritoryNode[],
  zoneNode: TerritoryNode,
  rKey: string
): boolean {
  const target = normKeyTerritoryMatch(rKey);
  for (const z of forest) {
    if (z === zoneNode) continue;
    if (z.children?.some((c) => normKeyTerritoryMatch(c.name) === target)) return true;
  }
  return false;
}

/** Excel «Данные Регион»: viloyat nomi + zona (ildiz) */
export type RegionXlsxRow = {
  order_num?: number | null;
  region: string;
  zone: string;
};

export type MergeRegionsIntoTerritoryStats = {
  added_zones: number;
  added_regions: number;
  skipped_duplicate_region: number;
  skipped_region_exists_elsewhere: number;
  skipped_bad_row: number;
};

/**
 * Zona ildizlari ostiga viloyat tugunlarini qo‘shadi (`mergeTerritoryBundle` dan keyin chaqiring).
 * Bir xil nomli viloyat boshqa zona ostida bo‘lsa — takror qo‘shilmaydi (mavjudidan foydalaniladi).
 */
export function mergeExcelRegionsIntoTerritoryForest(
  forest: TerritoryNode[],
  rows: RegionXlsxRow[]
): MergeRegionsIntoTerritoryStats {
  let added_zones = 0;
  let added_regions = 0;
  let skipped_duplicate_region = 0;
  let skipped_region_exists_elsewhere = 0;
  let skipped_bad_row = 0;

  const topByKey = new Map<string, TerritoryNode>();
  for (const n of forest) {
    topByKey.set(normKey(n.name), n);
  }

  const ensureZone = (zoneRaw: string): TerritoryNode => {
    const zt = zoneRaw.trim();
    const key = normKey(zt);
    let z = topByKey.get(key);
    if (!z) {
      const display = zt.toUpperCase() === zt.trim() ? zt.trim() : zt.trim().toUpperCase();
      z = {
        id: slugId("z", key),
        name: display,
        code: defaultZoneTerritoryCode(display),
        comment: null,
        sort_order: null,
        active: true,
        children: []
      };
      topByKey.set(key, z);
      forest.push(z);
      added_zones++;
    }
    return z;
  };

  for (const row of rows) {
    const zoneRaw = row.zone?.trim() ?? "";
    const regionRaw = row.region?.trim() ?? "";
    if (!zoneRaw || !regionRaw) {
      skipped_bad_row++;
      continue;
    }

    const zoneNode = ensureZone(zoneRaw);
    const canonicalRegion = canonicalRegionNameFromExcel(regionRaw);
    const rKey = normKeyTerritoryMatch(canonicalRegion);

    const dupReg = zoneNode.children.find((c) => normKeyTerritoryMatch(c.name) === rKey);
    if (dupReg) {
      if (!dupReg.code) {
        const dc = defaultRegionTerritoryCode(dupReg.name);
        if (dc) dupReg.code = dc;
      }
      skipped_duplicate_region++;
      continue;
    }
    if (regionChildExistsUnderOtherRootZone(forest, zoneNode, rKey)) {
      skipped_region_exists_elsewhere++;
      continue;
    }

    const sort_order =
      typeof row.order_num === "number" && Number.isInteger(row.order_num) ? row.order_num : null;

    zoneNode.children.push({
      id: slugId("r", `${normKey(zoneNode.name)}-${normKey(canonicalRegion)}`),
      name: canonicalRegion,
      code: defaultRegionTerritoryCode(canonicalRegion),
      comment: null,
      sort_order,
      active: true,
      children: []
    });
    added_regions++;
  }

  for (const n of forest) {
    sortTerritoryChildrenWhenMixedSortOrder(n);
  }

  return {
    added_zones,
    added_regions,
    skipped_duplicate_region,
    skipped_region_exists_elsewhere,
    skipped_bad_row
  };
}

/**
 * Mavjud daraxt + Lalaku + Excel viloyatlari + Excel shaharlari (bir ketma-ketlik).
 */
export function buildTerritoryForestWithRegionAndCityRows(
  existingTerritoryNodesUnknown: unknown,
  regionRows: RegionXlsxRow[],
  cityRows: CityXlsxRow[]
): {
  forest: TerritoryNode[];
  regionStats: MergeRegionsIntoTerritoryStats;
  cityStats: MergeCitiesIntoTerritoryStats;
} {
  const prev = parseTerritoryNodes(existingTerritoryNodesUnknown);
  const forest = mergeTerritoryBundle(prev);
  const regionStats = mergeExcelRegionsIntoTerritoryForest(forest, regionRows);
  const cityStats = mergeCitiesIntoTerritoryForest(forest, cityRows);
  return { forest, regionStats, cityStats };
}

/**
 * `mergeTerritoryBundle` dan keyin: har bir qatorni tegishli viloyat (region) tugunining `children`iga qo‘shadi.
 * Bir xil viloyat/kod yoki viloyat/shahar nomi bo‘lsa takrorlamaydi.
 */
export function mergeCitiesIntoTerritoryForest(
  forest: TerritoryNode[],
  rows: CityXlsxRow[]
): MergeCitiesIntoTerritoryStats {
  const missingRegions = new Set<string>();
  let added = 0;
  let skipped_duplicate = 0;
  let skipped_bad_row = 0;

  for (const row of rows) {
    const regionRaw = row.region?.trim() ?? "";
    const nameRaw = row.name?.trim() ?? "";
    const codeRaw = row.code?.trim() ?? "";
    if (!regionRaw || !nameRaw) {
      skipped_bad_row++;
      continue;
    }

    const canonicalRegion = canonicalRegionNameFromExcel(regionRaw);
    const rKey = normKeyTerritoryMatch(canonicalRegion);
    const cityDisplay = normalizeTerritoryLabel(nameRaw);
    const cKey = normKeyTerritoryMatch(cityDisplay);

    let code: string | null = null;
    const up = codeRaw.toUpperCase();
    if (up && /^[A-Z0-9_]+$/.test(up)) code = up.slice(0, 20);

    const targets = findTerritoryRegionNodesByNameKey(forest, canonicalRegion);
    if (targets.length === 0) {
      missingRegions.add(regionRaw);
      skipped_bad_row++;
      continue;
    }
    const regionNode = targets[0];

    const matchChild = regionNode.children.find((ch) => {
      if (code && ch.code && normKey(ch.code) === normKey(code)) return true;
      return normKeyTerritoryMatch(ch.name) === cKey;
    });
    if (matchChild) {
      if (code && (!matchChild.code || normKey(matchChild.code) !== normKey(code))) {
        matchChild.code = code;
      }
      skipped_duplicate++;
      continue;
    }

    const idKey = code ? `${rKey}-${code}` : `${rKey}-${cKey}-${simpleHash36(cityDisplay)}`;
    const id = slugId("city", idKey);
    const sort_order =
      typeof row.order_num === "number" && Number.isInteger(row.order_num) ? row.order_num : null;

    regionNode.children.push({
      id,
      name: cityDisplay,
      code,
      comment: null,
      sort_order,
      active: true,
      children: []
    });
    added++;
  }

  for (const n of forest) {
    sortTerritoryChildrenWhenMixedSortOrder(n);
  }

  return {
    added,
    skipped_duplicate,
    skipped_bad_row,
    missing_regions: [...missingRegions].sort((a, b) => a.localeCompare(b, "uz"))
  };
}

/** Zona/viloyat tartibini saqlab, faqat kamida bitta `sort_order` bo‘lsa farzandlarni tartiblaydi. */
function sortTerritoryChildrenWhenMixedSortOrder(node: TerritoryNode): void {
  for (const c of node.children) sortTerritoryChildrenWhenMixedSortOrder(c);
  if (!node.children.length) return;
  const anyOrder = node.children.some((c) => c.sort_order != null);
  if (!anyOrder) return;
  node.children.sort((a, b) => {
    const ao = a.sort_order;
    const bo = b.sort_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return normKey(a.name).localeCompare(normKey(b.name), "uz");
  });
}

/**
 * Mavjud `territory_nodes` + Lalaku zona/viloyatlar + Excel shaharlari.
 */
export function buildTerritoryForestWithCitiesFromRows(
  existingTerritoryNodesUnknown: unknown,
  cityRows: CityXlsxRow[]
): {
  forest: TerritoryNode[];
  stats: MergeCitiesIntoTerritoryStats;
} {
  const prev = parseTerritoryNodes(existingTerritoryNodesUnknown);
  const forest = mergeTerritoryBundle(prev);
  const stats = mergeCitiesIntoTerritoryForest(forest, cityRows);
  return { forest, stats };
}

function parseClientRefEntries(v: unknown): ClientRefEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item): ClientRefEntry | null => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name) return null;
      const codeRaw = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
      const code = codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : null;
      const sort_order =
        typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
      const comment = typeof row.comment === "string" ? row.comment.trim() : "";
      const active = typeof row.active === "boolean" ? row.active : true;
      const colorRaw = typeof row.color === "string" ? row.color.trim() : "";
      const color = colorRaw ? colorRaw.slice(0, 32) : null;
      return { id, name, code, sort_order, comment: comment || null, active, color };
    })
    .filter((x): x is ClientRefEntry => x != null);
}

function activeValuesFromClientRefEntries(entries: ClientRefEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.active === false) continue;
    const v = (e.code && e.code.trim() !== "" ? e.code.trim() : e.name.trim()) || "";
    if (v) out.push(v);
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b, "uz"));
}

function mergeStringList(existing: string[], add: string[]): string[] {
  const s = new Set<string>();
  for (const x of existing) {
    const t = x.trim();
    if (t) s.add(t);
  }
  for (const x of add) {
    const t = x.trim();
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "uz"));
}

function mergeClientRefByCodeOrName(
  existing: ClientRefEntry[],
  defs: { name: string; code: string }[],
  idPrefix: string
): ClientRefEntry[] {
  const out = [...existing];
  const seenCode = new Set(
    out.map((e) => (e.code ? normKey(e.code) : "")).filter(Boolean)
  );
  const seenName = new Set(out.map((e) => normKey(e.name)));

  let i = 0;
  for (const d of defs) {
    const ck = normKey(d.code);
    const nk = normKey(d.name);
    if (seenCode.has(ck) || seenName.has(nk)) continue;
    seenCode.add(ck);
    seenName.add(nk);
    out.push({
      id: `${idPrefix}-${ck}-${simpleHash36(d.name)}`,
      name: d.name,
      code: d.code,
      sort_order: i++,
      comment: null,
      active: true,
      color: null
    });
  }
  return out;
}

async function ensureSalesChannels(prisma: PrismaClient, tenantId: number, dry: boolean) {
  console.log("\n── [1/5] Savdo kanallari → `sales_channel_refs` ──");
  for (let i = 0; i < SALES_CHANNELS.length; i++) {
    const { name, code } = SALES_CHANNELS[i];
    const existing = await prisma.salesChannelRef.findFirst({
      where: { tenant_id: tenantId, code }
    });
    if (existing) {
      console.log(`= mavjud ${code}`);
      continue;
    }
    if (dry) {
      console.log(`[dry] ${code} — ${name}`);
      continue;
    }
    await prisma.salesChannelRef.create({
      data: {
        tenant_id: tenantId,
        name,
        code,
        sort_order: i,
        is_active: true
      }
    });
    console.log(`+ ${code}`);
  }
}

async function ensureTradeDirections(prisma: PrismaClient, tenantId: number, dry: boolean) {
  console.log("\n── [2/5] Savdo yo‘nalishlari → `trade_directions` ──");
  for (const row of TRADE_DIRECTIONS) {
    const existing = await prisma.tradeDirection.findFirst({
      where: { tenant_id: tenantId, code: row.code }
    });
    if (existing) {
      if (
        existing.use_in_order_proposal !== row.use_in_order_proposal ||
        existing.name !== row.name
      ) {
        if (!dry) {
          await prisma.tradeDirection.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              use_in_order_proposal: row.use_in_order_proposal,
              sort_order: row.sort_order
            }
          });
          console.log(`~ ${row.code} (yangilandi)`);
        }
      } else {
        console.log(`= mavjud ${row.code}`);
      }
      continue;
    }
    if (dry) {
      console.log(`[dry] ${row.code} — ${row.name}`);
      continue;
    }
    await prisma.tradeDirection.create({
      data: {
        tenant_id: tenantId,
        name: row.name,
        code: row.code,
        sort_order: row.sort_order,
        is_active: true,
        use_in_order_proposal: row.use_in_order_proposal
      }
    });
    console.log(`+ ${row.code}`);
  }
}

async function ensureWarehouses(prisma: PrismaClient, tenantId: number, dry: boolean) {
  console.log("\n── [3/5] Omborlar → `warehouses` ──");
  for (const name of WAREHOUSE_NAMES) {
    const found = await prisma.warehouse.findFirst({
      where: { tenant_id: tenantId, name }
    });
    if (found) {
      console.log(`= mavjud ${name}`);
      continue;
    }
    const code = warehouseCodeFromName(name);
    if (dry) {
      console.log(`[dry] ${name} (${code})`);
      continue;
    }
    await prisma.warehouse.create({
      data: {
        tenant_id: tenantId,
        name,
        type: "branch",
        code,
        stock_purpose: "sales",
        is_active: true
      }
    });
    console.log(`+ ${name}`);
  }
}

export type LalakuReferenceOptions = {
  tenantId: number;
  tenantSlug: string;
  dry: boolean;
};

/**
 * Bitta tenant uchun: zona/viloyat + mijoz formatlari (settings), kanallar, yo‘nalishlar, omborlar.
 */
export async function runLalakuReferenceImport(
  prisma: PrismaClient,
  opts: LalakuReferenceOptions
): Promise<void> {
  const { tenantId, tenantSlug, dry } = opts;

  console.log(
    "\n── (Tayyorlanmoqda) Zona/viloyat daraxti + mijoz format/kategoriya/turlar — jadval yozuvlaridan keyin `settings` ga yoziladi ──"
  );

  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const st = asRecord(row?.settings);
  const ref = asRecord(st.references);

  const prevNodes = parseTerritoryNodes(ref.territory_nodes);
  const mergedNodes = mergeTerritoryBundle(prevNodes);
  const mergedRegionsFlat = territoryRegionPickerNames({
    ...ref,
    territory_nodes: mergedNodes as unknown
  } as Record<string, unknown>);

  const prevZones = Array.isArray(ref.client_zones)
    ? ref.client_zones.filter((x): x is string => typeof x === "string")
    : [];
  const mergedZones = mergeStringList(prevZones, [...ZONE_ROOT_NAMES]);

  const fmtEntries = mergeClientRefByCodeOrName(
    parseClientRefEntries(ref.client_format_entries),
    CLIENT_FORMATS,
    "fmt"
  );
  const catEntries = mergeClientRefByCodeOrName(
    parseClientRefEntries(ref.client_category_entries),
    CLIENT_CATEGORIES,
    "cat"
  );
  const typEntries = mergeClientRefByCodeOrName(
    parseClientRefEntries(ref.client_type_entries),
    CLIENT_TYPES,
    "typ"
  );

  const prevPaymentMethods = paymentMethodsFromUnknown(ref.payment_method_entries);
  const mergedPaymentMethods = mergePaymentMethodEntries(
    prevPaymentMethods,
    LALAKU_FINANCE_PAYMENT_METHODS
  );
  const prevPriceTypes = priceTypeEntriesFromUnknown(ref.price_type_entries);
  const mergedPriceTypes = mergePriceTypeEntries(prevPriceTypes, LALAKU_FINANCE_PRICE_TYPES);

  const nextRef = {
    ...ref,
    territory_nodes: mergedNodes,
    regions: mergedRegionsFlat,
    client_zones: mergedZones,
    client_format_entries: fmtEntries,
    client_formats: activeValuesFromClientRefEntries(fmtEntries),
    client_category_entries: catEntries,
    client_categories: activeValuesFromClientRefEntries(catEntries),
    client_type_entries: typEntries,
    client_type_codes: activeValuesFromClientRefEntries(typEntries),
    payment_method_entries: mergedPaymentMethods,
    price_type_entries: mergedPriceTypes
  };

  await ensureSalesChannels(prisma, tenantId, dry);
  await ensureTradeDirections(prisma, tenantId, dry);
  await ensureWarehouses(prisma, tenantId, dry);

  console.log("\n── [4/5] Territoriya + mijoz spravochniklari → `tenant.settings.references` ──");
  if (dry) {
    console.log("[dry] settings.references yozilmaydi.");
  } else {
    const nextSettings = { ...st, references: nextRef };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: nextSettings as Prisma.InputJsonValue }
    });
    console.log("✓ settings.references (territory_nodes, client_zones, format/kategoriya/turlar).");
  }

  console.log("\n── [5/5] Narx turlari + to‘lov usullari (NAQD PUL, TERMINAL, PERECHISLENIYE) ──");
  if (dry) {
    console.log("[dry] yuqoridagi bitta `tenant.update` ichida allaqachon rejalashtirilgan.");
  } else {
    console.log(
      "✓ payment_method_entries + price_type_entries (sotish) — mavjud bo‘lsa takrorlanmaydi."
    );
  }

  console.log("\n✓ Barcha spravochnik bo‘limlari tugadi (tenant: " + tenantSlug + ").");
}
