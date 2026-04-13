import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { invalidatePriceTypesCache } from "../../lib/redis-cache";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import {
  bonusPolicyToJson,
  mergeBonusStackPatch,
  parseBonusStackPolicy,
  type BonusStackJson,
  type BonusStackPolicy
} from "../orders/bonus-stack-policy";
import type {
  CurrencyEntryDto,
  PaymentMethodEntryDto,
  PriceTypeEntryDto
} from "./finance-refs";
import {
  defaultCurrencyCodeFromEntries,
  normalizeCurrencyDefaults,
  paymentTypeStorageKeysFromMethodEntries,
  priceTypeEntriesFromUnknown,
  resolveCurrencyEntries,
  resolvePaymentMethodEntries
} from "./finance-refs";
import {
  listActiveSalesChannelLabels,
  listActiveTradeDirectionLabels
} from "../sales-directions/sales-directions.service";
import {
  lalakuExpandRegionFilterTokens,
  normKeyTerritoryMatch
} from "../../../shared/territory-lalaku-seed";

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

export async function getTenantBonusStack(tenantId: number): Promise<BonusStackJson> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const policy = parseBonusStackPolicy(row?.settings);
  return bonusPolicyToJson(policy);
}

export async function updateTenantBonusStack(
  tenantId: number,
  patch: Partial<{
    mode: unknown;
    max_units: unknown;
    forbid_apply_all_eligible: unknown;
  }>,
  actorUserId: number | null = null
): Promise<{ policy: BonusStackPolicy; json: BonusStackJson }> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const current = parseBonusStackPolicy(row?.settings);
  const policy = mergeBonusStackPatch(current, patch);
  const nextSettings = {
    ...asRecord(row?.settings),
    bonus_stack: bonusPolicyToJson(policy)
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: nextSettings as Prisma.InputJsonValue }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.tenant_settings,
    entityId: tenantId,
    action: "patch.bonus_stack",
    payload: { patch, bonus_stack: bonusPolicyToJson(policy) }
  });

  return { policy, json: bonusPolicyToJson(policy) };
}

export type TerritoryNodeDto = {
  id: string;
  name: string;
  code?: string | null;
  comment?: string | null;
  sort_order?: number | null;
  active?: boolean;
  children: TerritoryNodeDto[];
};

export type UnitMeasureDto = {
  id: string;
  name: string;
  title?: string | null;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
};

export type ClientRefEntryDto = {
  id: string;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  color: string | null;
};

export type BranchDto = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
  territory?: string | null;
  city?: string | null;
  cashbox?: string | null;
  /** Filial uchun asosiy kassa (`cash_desks.id`) */
  cash_desk_id?: number | null;
  user_links?: {
    role: string;
    user_ids: number[];
  }[];
};

export type TenantProfileDto = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  feature_flags: Record<string, unknown>;
  references: {
    payment_types: string[];
    return_reasons: string[];
    regions: string[];
    /** Mijoz kartochkasi — spravochnikdan tanlanadigan qiymatlar */
    client_categories: string[];
    client_type_codes: string[];
    client_formats: string[];
    client_format_entries: ClientRefEntryDto[];
    client_type_entries: ClientRefEntryDto[];
    client_category_entries: ClientRefEntryDto[];
    sales_channels: string[];
    /** Spravochnik + JSON; agent «Направление торговли» uchun */
    trade_directions: string[];
    client_product_category_refs: string[];
    /** Manzil / logistika — mijoz kartasida tanlanadi, shu yerda yaratiladi */
    client_districts: string[];
    client_cities: string[];
    client_neighborhoods: string[];
    client_zones: string[];
    client_logistics_services: string[];
    territory_levels: string[];
    /** Ierarxik territoriya daraxti (asosiy manba) */
    territory_nodes: TerritoryNodeDto[];
    unit_measures: UnitMeasureDto[];
    branches: BranchDto[];
    /** Eski format — faqat migratsiya / orqaga moslik */
    territory_tree: { zone: string; region: string; cities: string[] }[];
    currency_entries: CurrencyEntryDto[];
    payment_method_entries: PaymentMethodEntryDto[];
    price_type_entries: PriceTypeEntryDto[];
    /** Sozlamalar → «Причины и категории» (jadval + tanlovlar) */
    request_type_entries: ClientRefEntryDto[];
    refusal_reason_entries: ClientRefEntryDto[];
    cancel_payment_reason_entries: ClientRefEntryDto[];
    order_note_entries: ClientRefEntryDto[];
    task_type_entries: ClientRefEntryDto[];
    photo_category_entries: ClientRefEntryDto[];
    finance_category_entries: ClientRefEntryDto[];
  };
};

function stringArrayFromUnknown(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

function territoryTreeFromUnknown(v: unknown): { zone: string; region: string; cities: string[] }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const zone = typeof row.zone === "string" ? row.zone.trim() : "";
      const region = typeof row.region === "string" ? row.region.trim() : "";
      const cities = stringArrayFromUnknown(row.cities);
      if (!zone || !region) return null;
      return { zone, region, cities };
    })
    .filter((x): x is { zone: string; region: string; cities: string[] } => x != null);
}

function parseTerritoryNode(item: unknown): TerritoryNodeDto | null {
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
    ? rawChildren.map(parseTerritoryNode).filter((x): x is TerritoryNodeDto => x != null)
    : [];
  return { id, name, code, comment: comment || null, sort_order, active, children };
}

function territoryNodesFromUnknown(v: unknown): TerritoryNodeDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseTerritoryNode).filter((x): x is TerritoryNodeDto => x != null);
}

function parseUnitMeasure(item: unknown): UnitMeasureDto | null {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const codeRaw = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  const code = codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : null;
  const sort_order =
    typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  const active = typeof row.active === "boolean" ? row.active : true;
  return { id, name, title: title || null, code, sort_order, comment: comment || null, active };
}

function unitMeasuresFromUnknown(v: unknown): UnitMeasureDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseUnitMeasure).filter((x): x is UnitMeasureDto => x != null);
}

function simpleHash36(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function parseClientRefEntry(item: unknown): ClientRefEntryDto | null {
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
}

export function clientRefEntriesFromUnknown(v: unknown): ClientRefEntryDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseClientRefEntry).filter((x): x is ClientRefEntryDto => x != null);
}

function legacyStringsToClientRefEntries(strings: string[], prefix: string): ClientRefEntryDto[] {
  return strings.map((s, i) => ({
    id: `legacy-${prefix}-${i}-${simpleHash36(s)}`,
    name: s,
    code: null,
    sort_order: null,
    comment: null,
    active: true,
    color: null
  }));
}

function resolveClientRefEntries(
  ref: Record<string, unknown>,
  key: "client_format_entries" | "client_type_entries" | "client_category_entries",
  legacyStrings: string[],
  legacyPrefix: string
): ClientRefEntryDto[] {
  const parsed = clientRefEntriesFromUnknown(ref[key]);
  if (parsed.length > 0) return parsed;
  return legacyStringsToClientRefEntries(legacyStrings, legacyPrefix);
}

/** `return_reasons` qatorlari → `refusal_reason_entries` ga mos keladigan struktura. */
function resolveRefusalReasonEntries(ref: Record<string, unknown>): ClientRefEntryDto[] {
  const parsed = clientRefEntriesFromUnknown(ref.refusal_reason_entries);
  if (parsed.length > 0) return parsed;
  return legacyStringsToClientRefEntries(stringArrayFromUnknown(ref.return_reasons), "refusal");
}

type ClientRefEntryPatch = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
  color?: string | null;
};

type CurrencyEntryPatch = {
  id: string;
  name: string;
  code: string;
  sort_order?: number | null;
  active?: boolean;
  is_default?: boolean;
};

type PaymentMethodEntryPatch = {
  id: string;
  name: string;
  code?: string | null;
  currency_code: string;
  sort_order?: number | null;
  comment?: string | null;
  color?: string | null;
  active?: boolean;
};

type PriceTypeEntryPatch = {
  id: string;
  name: string;
  code?: string | null;
  payment_method_id: string;
  kind?: "sale" | "purchase";
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
  manual?: boolean;
  attached_clients_only?: boolean;
};

function toClientRefEntryDto(e: ClientRefEntryPatch): ClientRefEntryDto {
  return {
    id: e.id.trim(),
    name: e.name.trim(),
    code: e.code ?? null,
    sort_order: e.sort_order ?? null,
    comment: e.comment ?? null,
    active: e.active ?? true,
    color: e.color ?? null
  };
}

export function activeValuesFromClientRefEntries(entries: ClientRefEntryDto[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.active === false) continue;
    const v = (e.code && e.code.trim() !== "" ? e.code.trim() : e.name.trim()) || "";
    if (v) out.push(v);
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b, "uz"));
}

function parseBranch(item: unknown): BranchDto | null {
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
  const territory = typeof row.territory === "string" ? row.territory.trim() : "";
  const city = typeof row.city === "string" ? row.city.trim() : "";
  const cashbox = typeof row.cashbox === "string" ? row.cashbox.trim() : "";
  let cash_desk_id: number | null = null;
  const rawDesk = row.cash_desk_id;
  if (typeof rawDesk === "number" && Number.isInteger(rawDesk) && rawDesk > 0) {
    cash_desk_id = rawDesk;
  } else if (typeof rawDesk === "string" && /^\d+$/.test(rawDesk.trim())) {
    const n = Number.parseInt(rawDesk.trim(), 10);
    if (n > 0) cash_desk_id = n;
  }
  const user_links = Array.isArray(row.user_links)
    ? row.user_links
        .map((x) => {
          if (x == null || typeof x !== "object" || Array.isArray(x)) return null;
          const r = x as Record<string, unknown>;
          const role = typeof r.role === "string" ? r.role.trim() : "";
          if (!role) return null;
          const user_ids = Array.isArray(r.user_ids)
            ? r.user_ids.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
            : [];
          return { role, user_ids: Array.from(new Set(user_ids)) };
        })
        .filter((x): x is { role: string; user_ids: number[] } => x != null)
    : [];
  return {
    id,
    name,
    code,
    sort_order,
    comment: comment || null,
    active,
    territory: territory || null,
    city: city || null,
    cashbox: cashbox || null,
    cash_desk_id,
    user_links
  };
}

function branchesFromUnknown(v: unknown): BranchDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseBranch).filter((x): x is BranchDto => x != null);
}

async function assertBranchCashDeskAssignments(
  tenantId: number,
  branches: { cash_desk_id?: number | null }[]
): Promise<void> {
  const ids: number[] = [];
  for (const b of branches) {
    if (b.cash_desk_id != null && b.cash_desk_id > 0) ids.push(b.cash_desk_id);
  }
  if (!ids.length) return;
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) throw new Error("DUPLICATE_BRANCH_CASH_DESK");
  const n = await prisma.cashDesk.count({
    where: { tenant_id: tenantId, id: { in: [...uniq] } }
  });
  if (n !== uniq.size) throw new Error("INVALID_BRANCH_CASH_DESK");
}

/** Kassa qatorida filial nomini ko‘rsatish (profil JSON bo‘yicha). */
export async function mapCashDeskIdToBranchName(tenantId: number): Promise<Map<number, string>> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const branches = branchesFromUnknown((asRecord(row?.settings) as any).references?.branches);
  const m = new Map<number, string>();
  for (const b of branches) {
    const cid = b.cash_desk_id;
    if (typeof cid === "number" && cid > 0 && !m.has(cid)) m.set(cid, b.name);
  }
  return m;
}

function maxTerritoryDepth(nodes: TerritoryNodeDto[]): number {
  if (!nodes?.length) return 0;
  let m = 1;
  for (const n of nodes) {
    const ch = n.children ?? [];
    if (ch.length) m = Math.max(m, 1 + maxTerritoryDepth(ch));
  }
  return m;
}

function activeTerritoryNamesAtDepth(nodes: TerritoryNodeDto[], targetDepth: number): string[] {
  const out = new Set<string>();
  const walk = (list: TerritoryNodeDto[], d: number) => {
    for (const n of list) {
      if (n.active !== false && d === targetDepth) {
        const t = (n.name ?? "").trim();
        if (t) out.add(t);
      }
      const ch = n.children ?? [];
      if (ch.length) walk(ch, d + 1);
    }
  };
  walk(nodes, 0);
  return [...out].sort((a, b) => a.localeCompare(b, "ru"));
}

/**
 * Mijoz «Teritoriya», filial «Территория», `references.regions` — daraxtdan faqat viloyat qatlami.
 * 3+ daraja (masalan Zona→Oblast→Gorod) bo‘lsa ildizdagi zonalar ro‘yxatga kirmaydi.
 */
export function territoryRegionPickerNames(ref: Record<string, unknown> | undefined): string[] {
  if (ref == null) return [];
  const nodes = territoryNodesFromUnknown(ref.territory_nodes);
  if (nodes.length === 0) {
    return stringArrayFromUnknown(ref.regions);
  }
  const L = stringArrayFromUnknown(ref.territory_levels).length;
  const treeDepth = maxTerritoryDepth(nodes);
  let d = 0;
  if (L >= 3) d = 1;
  else if (L >= 1) d = 0;
  else if (treeDepth >= 3) d = 1;
  else d = 0;
  const picked = activeTerritoryNamesAtDepth(nodes, d);
  return picked.length > 0 ? picked : stringArrayFromUnknown(ref.regions);
}

/**
 * «Teritoriya» tanlovi: DB / importda saqlanadigan `stored` (kod yoki nom) va UI da ko‘rinadigan nom.
 * `territoryRegionPickerNames` bilan bir xil qatlam chuqirligi.
 */
export function territoryRegionStoredPairs(
  ref: Record<string, unknown> | undefined
): { stored: string; name: string }[] {
  if (ref == null) return [];
  const nodes = territoryNodesFromUnknown(ref.territory_nodes);
  if (nodes.length === 0) return [];
  const L = stringArrayFromUnknown(ref.territory_levels).length;
  const treeDepth = maxTerritoryDepth(nodes);
  let d = 0;
  if (L >= 3) d = 1;
  else if (L >= 1) d = 0;
  else if (treeDepth >= 3) d = 1;
  else d = 0;

  const byStored = new Map<string, string>();
  const walk = (list: TerritoryNodeDto[], depth: number) => {
    for (const n of list) {
      if (n.active !== false && depth === d) {
        const name = (n.name ?? "").trim();
        if (!name) continue;
        const codeRaw = (n.code ?? "").trim().toUpperCase();
        const stored =
          codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : name;
        if (!byStored.has(stored)) byStored.set(stored, name);
      }
      const ch = n.children ?? [];
      if (ch.length) walk(ch, depth + 1);
    }
  };
  walk(nodes, 0);
  return [...byStored.entries()].map(([stored, name]) => ({ stored, name }));
}

/**
 * Viloyat filtri qiymati (kod yoki nom) uchun `clients.region` ustunida qidiriladigan barcha sinonimlar:
 * Lalaku standartlari, `territory_nodes` juftlari, `references.regions` ro‘yxati.
 */
export function expandRegionFilterSynonyms(
  ref: Record<string, unknown> | undefined,
  regionFilter: string
): string[] {
  const rf = regionFilter.trim();
  if (!rf) return [];
  const out = new Set<string>();
  for (const x of lalakuExpandRegionFilterTokens(rf)) out.add(x);

  const rfNorm = normKeyTerritoryMatch(rf);
  for (const { stored, name } of territoryRegionStoredPairs(ref)) {
    const matches =
      stored === rf ||
      name === rf ||
      normKeyTerritoryMatch(stored) === rfNorm ||
      normKeyTerritoryMatch(name) === rfNorm;
    if (matches) {
      out.add(stored);
      out.add(name);
    }
  }

  for (const s of stringArrayFromUnknown(ref?.regions)) {
    if (s === rf || normKeyTerritoryMatch(s) === rfNorm) out.add(s);
  }

  return [...out].filter((x) => x.length > 0);
}

/** Filiallar «shahar» tanlovi — daraxtning shahar qatlami. */
export function territoryCityPickerNames(ref: Record<string, unknown> | undefined): string[] {
  if (ref == null) return [];
  const nodes = territoryNodesFromUnknown(ref.territory_nodes);
  if (nodes.length === 0) return [];
  const L = stringArrayFromUnknown(ref.territory_levels).length;
  const treeDepth = maxTerritoryDepth(nodes);
  let d = 1;
  if (L >= 3) d = 2;
  else if (L === 2) d = 1;
  else if (L === 1) d = 1;
  else if (treeDepth >= 3) d = 2;
  else if (treeDepth >= 2) d = 1;
  else d = 1;
  return activeTerritoryNamesAtDepth(nodes, d);
}

/**
 * Shahar qatlami uchun `stored` (DB / filtrda — kod bo‘lsa kod, aks holda nom) va ko‘rinish nomi.
 * Importda kod yoki nom bo‘yicha moslash, UI da `label` chiqarish uchun.
 */
export function territoryCityStoredPairs(
  ref: Record<string, unknown> | undefined
): { stored: string; name: string }[] {
  if (ref == null) return [];
  const nodes = territoryNodesFromUnknown(ref.territory_nodes);
  if (nodes.length === 0) return [];
  const L = stringArrayFromUnknown(ref.territory_levels).length;
  const treeDepth = maxTerritoryDepth(nodes);
  let d = 1;
  if (L >= 3) d = 2;
  else if (L === 2) d = 1;
  else if (L === 1) d = 1;
  else if (treeDepth >= 3) d = 2;
  else if (treeDepth >= 2) d = 1;
  else d = 1;

  const byStored = new Map<string, string>();
  const walk = (list: TerritoryNodeDto[], depth: number) => {
    for (const n of list) {
      if (n.active !== false && depth === d) {
        const name = (n.name ?? "").trim();
        if (!name) {
          /* skip */
        } else {
          const codeRaw = (n.code ?? "").trim().toUpperCase();
          const stored =
            codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : name;
          if (!byStored.has(stored)) byStored.set(stored, name);
        }
      }
      const ch = n.children ?? [];
      if (ch.length) walk(ch, depth + 1);
    }
  };
  walk(nodes, 0);
  return [...byStored.entries()].map(([stored, name]) => ({ stored, name }));
}

export type CityTerritoryHintDto = {
  region_stored: string | null;
  region_label: string | null;
  zone_stored: string | null;
  zone_label: string | null;
  /** 4+ qavatli daraxtda viloyat va shahar orasidagi qatlam (tuman / район). */
  district_stored: string | null;
  district_label: string | null;
};

function territoryNodeStoredValue(n: TerritoryNodeDto): string {
  const name = (n.name ?? "").trim();
  if (!name) return "";
  const codeRaw = (n.code ?? "").trim().toUpperCase();
  return codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : name;
}

/**
 * Hudud daraxtidan shahar (kod yoki nom) bo‘yicha viloyat va (3+ qavatda) zona ildizini chiqaradi.
 */
export function buildCityTerritoryHints(
  ref: Record<string, unknown> | undefined
): Record<string, CityTerritoryHintDto> {
  const out: Record<string, CityTerritoryHintDto> = {};
  if (ref == null) return out;
  const nodes = territoryNodesFromUnknown(ref.territory_nodes);
  if (nodes.length === 0) return out;

  const L = stringArrayFromUnknown(ref.territory_levels).length;
  const treeDepth = maxTerritoryDepth(nodes);

  let cityD = 1;
  if (L >= 3) cityD = 2;
  else if (L === 2) cityD = 1;
  else if (L === 1) cityD = 1;
  else if (treeDepth >= 3) cityD = 2;
  else if (treeDepth >= 2) cityD = 1;
  else cityD = 1;

  let regionD = 0;
  if (L >= 3) regionD = 1;
  else if (L >= 1) regionD = 0;
  else if (treeDepth >= 3) regionD = 1;
  else regionD = 0;

  const addHintKeys = (hint: CityTerritoryHintDto, stored: string, displayName: string) => {
    const keys = new Set<string>();
    const push = (k: string) => {
      const t = k.trim();
      if (!t) return;
      keys.add(t);
      keys.add(t.toUpperCase());
      const nk = normKeyTerritoryMatch(t);
      if (nk) keys.add(nk);
    };
    push(stored);
    push(displayName);
    for (const k of keys) {
      if (!(k in out)) out[k] = hint;
    }
  };

  const walk = (list: TerritoryNodeDto[], depth: number, ancestors: TerritoryNodeDto[]) => {
    for (const n of list) {
      if (n.active === false) continue;
      const chain = [...ancestors, n];
      const ch = n.children ?? [];

      if (depth === cityD) {
        const displayName = (n.name ?? "").trim();
        if (displayName) {
          const stored = territoryNodeStoredValue(n);
          const regionNode = chain[regionD];
          const zoneNode = regionD >= 1 ? chain[0] : null;

          let region_stored: string | null = null;
          let region_label: string | null = null;
          if (regionNode && regionNode !== n) {
            region_stored = territoryNodeStoredValue(regionNode) || null;
            region_label = (regionNode.name ?? "").trim() || null;
          }

          let zone_stored: string | null = null;
          let zone_label: string | null = null;
          if (regionD >= 1 && zoneNode) {
            zone_stored = territoryNodeStoredValue(zoneNode) || null;
            zone_label = (zoneNode.name ?? "").trim() || null;
          }

          let district_stored: string | null = null;
          let district_label: string | null = null;
          if (cityD >= regionD + 2) {
            const dNode = chain[cityD - 1];
            if (dNode && dNode !== n && dNode !== regionNode) {
              district_stored = territoryNodeStoredValue(dNode) || null;
              district_label = (dNode.name ?? "").trim() || null;
            }
          }

          const hint: CityTerritoryHintDto = {
            region_stored,
            region_label,
            zone_stored,
            zone_label,
            district_stored,
            district_label
          };
          addHintKeys(hint, stored, displayName);
        }
      }

      if (ch.length) walk(ch, depth + 1, chain);
    }
  };

  walk(nodes, 0, []);
  return out;
}

function legacyRowsToNodes(rows: { zone: string; region: string; cities: string[] }[]): TerritoryNodeDto[] {
  return rows.map((r, i) => ({
    id: `legacy-z-${i}`,
    name: r.zone,
    code: null,
    comment: null,
    sort_order: null,
    active: true,
    children: [
      {
        id: `legacy-z-${i}-r`,
        name: r.region,
        code: null,
        comment: null,
        sort_order: null,
        active: true,
        children: r.cities.map((c, j) => ({
          id: `legacy-z-${i}-c-${j}`,
          name: c,
          code: null,
          comment: null,
          sort_order: null,
          active: true,
          children: []
        }))
      }
    ]
  }));
}

export async function getTenantDefaultCurrencyCode(tenantId: number): Promise<string> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const st = asRecord(row?.settings);
  const refInner = asRecord(st.references);
  return defaultCurrencyCodeFromEntries(resolveCurrencyEntries(refInner));
}

/** Vedoma / zakaz kartasi: `payment_method_ref` → nom (barcha yozuvlar, jumladan nofaol). */
export async function loadPaymentMethodEntriesForResolve(tenantId: number): Promise<PaymentMethodEntryDto[]> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const st = asRecord(row?.settings);
  const ref = asRecord(st.references);
  const currency_entries = resolveCurrencyEntries(ref);
  return resolvePaymentMethodEntries(ref, currency_entries);
}

export async function getTenantProfile(tenantId: number): Promise<TenantProfileDto> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, phone: true, address: true, logo_url: true, settings: true }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const st = asRecord(row.settings);
  const ff = asRecord(st.feature_flags);
  const ref = asRecord(st.references);
  let territory_nodes = territoryNodesFromUnknown(ref.territory_nodes);
  const territory_tree = territoryTreeFromUnknown(ref.territory_tree);
  if (territory_nodes.length === 0 && territory_tree.length > 0) {
    territory_nodes = legacyRowsToNodes(territory_tree);
  }
  const client_formats = stringArrayFromUnknown(ref.client_formats);
  const client_type_codes = stringArrayFromUnknown(ref.client_type_codes);
  const client_categories = stringArrayFromUnknown(ref.client_categories);
  const currency_entries = resolveCurrencyEntries(ref);
  const payment_method_entries = resolvePaymentMethodEntries(ref, currency_entries);
  const price_type_entries = priceTypeEntriesFromUnknown(ref.price_type_entries);

  const refusal_reason_entries = resolveRefusalReasonEntries(ref);

  const [dbSalesLabels, dbTradeLabels] = await Promise.all([
    listActiveSalesChannelLabels(tenantId),
    listActiveTradeDirectionLabels(tenantId)
  ]);
  const salesFromSettings = stringArrayFromUnknown(ref.sales_channels);
  const tradeFromSettings = stringArrayFromUnknown(ref.trade_directions);
  const mergeStrLists = (a: string[], b: string[]): string[] => {
    const s = new Set<string>();
    for (const x of a) {
      const t = x.trim();
      if (t) s.add(t);
    }
    for (const x of b) {
      const t = x.trim();
      if (t) s.add(t);
    }
    return [...s].sort((x, y) => x.localeCompare(y, "ru"));
  };

  return {
    name: row.name,
    phone: row.phone,
    address: row.address,
    logo_url: row.logo_url,
    feature_flags: ff,
    references: {
      payment_types:
        payment_method_entries.length > 0
          ? paymentTypeStorageKeysFromMethodEntries(payment_method_entries)
          : stringArrayFromUnknown(ref.payment_types),
      return_reasons: activeValuesFromClientRefEntries(refusal_reason_entries),
      regions:
        territory_nodes.length > 0
          ? territoryRegionPickerNames({ ...ref, territory_nodes } as Record<string, unknown>)
          : stringArrayFromUnknown(ref.regions),
      client_categories,
      client_type_codes,
      client_formats,
      client_format_entries: resolveClientRefEntries(ref, "client_format_entries", client_formats, "fmt"),
      client_type_entries: resolveClientRefEntries(ref, "client_type_entries", client_type_codes, "typ"),
      client_category_entries: resolveClientRefEntries(ref, "client_category_entries", client_categories, "cat"),
      sales_channels: mergeStrLists(salesFromSettings, dbSalesLabels),
      trade_directions: mergeStrLists(tradeFromSettings, dbTradeLabels),
      client_product_category_refs: stringArrayFromUnknown(ref.client_product_category_refs),
      client_districts: stringArrayFromUnknown(ref.client_districts),
      client_cities: stringArrayFromUnknown(ref.client_cities),
      client_neighborhoods: stringArrayFromUnknown(ref.client_neighborhoods),
      client_zones: stringArrayFromUnknown(ref.client_zones),
      client_logistics_services: stringArrayFromUnknown(ref.client_logistics_services),
      territory_levels: stringArrayFromUnknown(ref.territory_levels),
      territory_nodes,
      unit_measures: unitMeasuresFromUnknown(ref.unit_measures),
      branches: branchesFromUnknown(ref.branches),
      territory_tree,
      currency_entries,
      payment_method_entries,
      price_type_entries,
      refusal_reason_entries,
      request_type_entries: clientRefEntriesFromUnknown(ref.request_type_entries),
      cancel_payment_reason_entries: clientRefEntriesFromUnknown(ref.cancel_payment_reason_entries),
      order_note_entries: clientRefEntriesFromUnknown(ref.order_note_entries),
      task_type_entries: clientRefEntriesFromUnknown(ref.task_type_entries),
      photo_category_entries: clientRefEntriesFromUnknown(ref.photo_category_entries),
      finance_category_entries: clientRefEntriesFromUnknown(ref.finance_category_entries)
    }
  };
}

export async function patchTenantProfile(
  tenantId: number,
  patch: Partial<{
    name: string;
    phone: string | null;
    address: string | null;
    logo_url: string | null;
    feature_flags: Record<string, unknown>;
    references: {
      payment_types?: string[];
      return_reasons?: string[];
      regions?: string[];
      client_categories?: string[];
      client_type_codes?: string[];
      client_formats?: string[];
      sales_channels?: string[];
      client_product_category_refs?: string[];
      client_districts?: string[];
      client_cities?: string[];
      client_neighborhoods?: string[];
      client_zones?: string[];
      client_logistics_services?: string[];
      territory_levels?: string[];
      territory_nodes?: TerritoryNodeDto[];
      unit_measures?: UnitMeasureDto[];
      branches?: BranchDto[];
      client_format_entries?: ClientRefEntryPatch[];
      client_type_entries?: ClientRefEntryPatch[];
      client_category_entries?: ClientRefEntryPatch[];
      territory_tree?: { zone: string; region: string; cities: string[] }[];
      currency_entries?: CurrencyEntryPatch[];
      payment_method_entries?: PaymentMethodEntryPatch[];
      price_type_entries?: PriceTypeEntryPatch[];
      request_type_entries?: ClientRefEntryPatch[];
      refusal_reason_entries?: ClientRefEntryPatch[];
      cancel_payment_reason_entries?: ClientRefEntryPatch[];
      order_note_entries?: ClientRefEntryPatch[];
      task_type_entries?: ClientRefEntryPatch[];
      photo_category_entries?: ClientRefEntryPatch[];
      finance_category_entries?: ClientRefEntryPatch[];
    };
  }>,
  actorUserId: number | null = null
): Promise<TenantProfileDto> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, phone: true, address: true, logo_url: true, settings: true }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const data: Prisma.TenantUpdateInput = {};
  if (patch.name !== undefined) {
    data.name = patch.name.trim();
  }
  if (patch.phone !== undefined) {
    data.phone = patch.phone?.trim() || null;
  }
  if (patch.address !== undefined) {
    data.address = patch.address?.trim() || null;
  }
  if (patch.logo_url !== undefined) {
    data.logo_url = patch.logo_url?.trim() || null;
  }

  if (patch.feature_flags != null || patch.references != null) {
    const nextSettings = { ...asRecord(row.settings) };
    if (patch.feature_flags != null) {
      nextSettings.feature_flags = {
        ...asRecord(nextSettings.feature_flags),
        ...patch.feature_flags
      };
    }
    if (patch.references != null) {
      const prevRef = asRecord(nextSettings.references);
      const merged = { ...prevRef };
      if (patch.references.payment_types != null) {
        merged.payment_types = patch.references.payment_types;
      }
      if (patch.references.return_reasons != null) {
        merged.return_reasons = patch.references.return_reasons;
      }
      if (patch.references.regions != null) {
        merged.regions = patch.references.regions;
      }
      if (patch.references.client_categories != null) {
        merged.client_categories = patch.references.client_categories;
      }
      if (patch.references.client_type_codes != null) {
        merged.client_type_codes = patch.references.client_type_codes;
      }
      if (patch.references.client_formats != null) {
        merged.client_formats = patch.references.client_formats;
      }
      if (patch.references.sales_channels != null) {
        merged.sales_channels = patch.references.sales_channels;
      }
      if (patch.references.client_product_category_refs != null) {
        merged.client_product_category_refs = patch.references.client_product_category_refs;
      }
      if (patch.references.client_districts != null) {
        merged.client_districts = patch.references.client_districts;
      }
      if (patch.references.client_cities != null) {
        merged.client_cities = patch.references.client_cities;
      }
      if (patch.references.client_neighborhoods != null) {
        merged.client_neighborhoods = patch.references.client_neighborhoods;
      }
      if (patch.references.client_zones != null) {
        merged.client_zones = patch.references.client_zones;
      }
      if (patch.references.client_logistics_services != null) {
        merged.client_logistics_services = patch.references.client_logistics_services;
      }
      if (patch.references.territory_levels != null) {
        merged.territory_levels = patch.references.territory_levels;
        const nodesRaw = merged.territory_nodes;
        if (nodesRaw != null && Array.isArray(nodesRaw) && nodesRaw.length > 0) {
          merged.regions = territoryRegionPickerNames(merged as Record<string, unknown>);
        }
      }
      if (patch.references.territory_nodes != null) {
        merged.territory_nodes = patch.references.territory_nodes;
        merged.regions = territoryRegionPickerNames(merged as Record<string, unknown>);
      }
      if (patch.references.unit_measures != null) {
        merged.unit_measures = patch.references.unit_measures;
      }
      if (patch.references.branches != null) {
        await assertBranchCashDeskAssignments(tenantId, patch.references.branches);
        merged.branches = patch.references.branches;
      }
      if (patch.references.client_format_entries != null) {
        const norm = patch.references.client_format_entries.map(toClientRefEntryDto);
        merged.client_format_entries = norm;
        merged.client_formats = activeValuesFromClientRefEntries(norm);
      }
      if (patch.references.client_type_entries != null) {
        const norm = patch.references.client_type_entries.map(toClientRefEntryDto);
        merged.client_type_entries = norm;
        merged.client_type_codes = activeValuesFromClientRefEntries(norm);
      }
      if (patch.references.client_category_entries != null) {
        const norm = patch.references.client_category_entries.map(toClientRefEntryDto);
        merged.client_category_entries = norm;
        merged.client_categories = activeValuesFromClientRefEntries(norm);
      }
      if (patch.references.request_type_entries != null) {
        merged.request_type_entries = patch.references.request_type_entries.map(toClientRefEntryDto);
      }
      if (patch.references.refusal_reason_entries != null) {
        const norm = patch.references.refusal_reason_entries.map(toClientRefEntryDto);
        merged.refusal_reason_entries = norm;
        merged.return_reasons = activeValuesFromClientRefEntries(norm);
      }
      if (patch.references.cancel_payment_reason_entries != null) {
        merged.cancel_payment_reason_entries =
          patch.references.cancel_payment_reason_entries.map(toClientRefEntryDto);
      }
      if (patch.references.order_note_entries != null) {
        merged.order_note_entries = patch.references.order_note_entries.map(toClientRefEntryDto);
      }
      if (patch.references.task_type_entries != null) {
        merged.task_type_entries = patch.references.task_type_entries.map(toClientRefEntryDto);
      }
      if (patch.references.photo_category_entries != null) {
        merged.photo_category_entries = patch.references.photo_category_entries.map(toClientRefEntryDto);
      }
      if (patch.references.finance_category_entries != null) {
        merged.finance_category_entries = patch.references.finance_category_entries.map(toClientRefEntryDto);
      }
      if (patch.references.territory_tree != null) {
        merged.territory_tree = patch.references.territory_tree;
      }
      if (patch.references.currency_entries != null) {
        const asDto: CurrencyEntryDto[] = patch.references.currency_entries.map((e) => ({
          id: e.id.trim(),
          name: e.name.trim(),
          code: e.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20),
          sort_order: e.sort_order ?? null,
          active: e.active ?? true,
          is_default: e.is_default ?? false
        }));
        merged.currency_entries = normalizeCurrencyDefaults(asDto);
      }
      if (patch.references.payment_method_entries != null) {
        const cur = resolveCurrencyEntries(merged);
        const asDto: PaymentMethodEntryDto[] = patch.references.payment_method_entries.map((e) => {
          const codeRaw = e.code?.trim().toLowerCase() ?? "";
          const code = codeRaw && /^[a-z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 30) : null;
          const cc =
            e.currency_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) ||
            defaultCurrencyCodeFromEntries(cur);
          return {
            id: e.id.trim(),
            name: e.name.trim(),
            code,
            currency_code: cc,
            sort_order: e.sort_order ?? null,
            comment: e.comment?.trim() || null,
            color: e.color?.trim().slice(0, 32) || null,
            active: e.active ?? true
          };
        });
        merged.payment_method_entries = asDto;
        merged.payment_types = paymentTypeStorageKeysFromMethodEntries(asDto);
      }
      if (patch.references.price_type_entries != null) {
        merged.price_type_entries = patch.references.price_type_entries.map((e) => ({
          id: e.id.trim(),
          name: e.name.trim(),
          code: e.code?.trim()
            ? e.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20) || null
            : null,
          payment_method_id: e.payment_method_id.trim(),
          kind: e.kind === "purchase" ? "purchase" : "sale",
          sort_order: e.sort_order ?? null,
          comment: e.comment?.trim() || null,
          active: e.active ?? true,
          manual: e.manual ?? false,
          attached_clients_only: e.attached_clients_only ?? false
        }));
      }
      nextSettings.references = merged;
    }
    data.settings = nextSettings as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length > 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data
    });
    const refPatch = patch.references;
    const referencesKeys =
      refPatch != null && typeof refPatch === "object"
        ? Object.keys(refPatch).filter((k) => (refPatch as Record<string, unknown>)[k] !== undefined)
        : undefined;

    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.tenant_settings,
      entityId: tenantId,
      action: "patch.profile",
      payload: {
        changed_keys: Object.keys(patch),
        ...(referencesKeys?.length ? { references_keys: referencesKeys } : {})
      }
    });
    if (patch.references?.price_type_entries != null) {
      void invalidatePriceTypesCache(tenantId);
    }
  }

  return getTenantProfile(tenantId);
}
