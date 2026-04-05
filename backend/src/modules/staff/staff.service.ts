import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { createCashDeskUserLink } from "../cash-desks/cash-desks.service";
import { listActiveTradeDirectionLabels } from "../sales-directions/sales-directions.service";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";
import { territoryRegionPickerNames } from "../tenant-settings/tenant-settings.service";
import { listTenantAuditEvents } from "../audit-events/audit-events.service";

type StaffKind = "agent" | "expeditor" | "supervisor" | "operator";

/** Veb-panel xodimlari (`User.role`). Yangi veb-rol qo‘shilganda shu ro‘yxat va JWT/auth bilan moslang. */
export const WEB_PANEL_STAFF_ROLES = ["operator"] as const;

export type AgentEntitlements = {
  price_types?: string[];
  product_rules?: Array<{ category_id: number; all: boolean; product_ids?: number[] }>;
};

/** Zakazni dastavchikka avtomatik bog‘lash (UI «Условия привязки»). Bo‘sh massivlar = shart qo‘llanmaydi. */
export type ExpeditorAssignmentRules = {
  price_types?: string[];
  agent_ids?: number[];
  warehouse_ids?: number[];
  trade_directions?: string[];
  territories?: string[];
  /** 1 = dushanba … 7 = yakshanba (UI visit_weekdays bilan bir xil) */
  weekdays?: number[];
};

export type StaffRow = {
  id: number;
  kind: StaffKind;
  fio: string;
  product: string | null;
  agent_type: string | null;
  code: string | null;
  pinfl: string | null;
  consignment: boolean;
  apk_version: string | null;
  device_name: string | null;
  last_sync_at: string | null;
  phone: string | null;
  email: string | null;
  can_authorize: boolean;
  price_type: string | null;
  /** Bir nechta narx turi (ko‘rsatish) */
  price_types: string[];
  warehouse: string | null;
  trade_direction_id: number | null;
  trade_direction: string | null;
  branch: string | null;
  position: string | null;
  created_at: string;
  app_access: boolean;
  territory: string | null;
  login: string;
  is_active: boolean;
  max_sessions: number;
  active_session_count: number;
  kpi_color: string | null;
  agent_entitlements: AgentEntitlements;
  expeditor_assignment_rules: ExpeditorAssignmentRules;
  client_count: number;
  /** Agentning ustavi (User.id) */
  supervisor_user_id: number | null;
  supervisor_name: string | null;
  /** `role: supervisor` bo‘lgan foydalanuvchining ostidagi agentlar soni */
  supervisee_count: number;
  /** Supervisor ostidagi agentlar (faqat `kind === "supervisor"` da to‘ldiriladi) */
  supervisees: Array<{ id: number; fio: string; code: string | null }>;
  /** Jadval tahriri (F.I.Sh alohida maydonlar) */
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
};

export type CreateStaffInput = {
  first_name: string;
  last_name?: string | null;
  middle_name?: string | null;
  login: string;
  password: string;
  phone?: string | null;
  email?: string | null;
  product?: string | null;
  agent_type?: string | null;
  code?: string | null;
  pinfl?: string | null;
  consignment?: boolean;
  apk_version?: string | null;
  device_name?: string | null;
  can_authorize?: boolean;
  price_type?: string | null;
  agent_price_types?: string[];
  warehouse_id?: number | null;
  return_warehouse_id?: number | null;
  trade_direction_id?: number | null;
  trade_direction?: string | null;
  branch?: string | null;
  position?: string | null;
  app_access?: boolean;
  territory?: string | null;
  is_active?: boolean;
  max_sessions?: number;
  kpi_color?: string | null;
  agent_entitlements?: AgentEntitlements;
  /** Faqat `kind === "operator"`: yaratilganda kassaga bog‘lash */
  cash_desk_id?: number | null;
  cash_desk_link_role?: "cashier" | "manager" | "operator" | null;
};

export type ListStaffFilters = {
  branch?: string;
  trade_direction?: string;
  position?: string;
  /** To‘liq moslik (masalan «зона») */
  territory?: string;
  /** `territory` maydonida qator bo‘yicha qidiruv (область) */
  territory_oblast?: string;
  /** `territory` maydonida qator bo‘yicha qidiruv (город) */
  territory_city?: string;
  is_active?: boolean;
};

function kindRole(kind: StaffKind): string {
  if (kind === "agent") return "agent";
  if (kind === "supervisor") return "supervisor";
  if (kind === "operator") return "operator";
  return "expeditor";
}

function tradeDirectionDisplayFromRef(
  ref: { code: string | null; name: string } | null | undefined,
  legacy: string | null
): string | null {
  if (ref) {
    const v = (ref.code?.trim() || ref.name).trim();
    if (v) return v;
  }
  return legacy?.trim() || null;
}

async function applyTradeDirectionPatch(
  tenantId: number,
  input: { trade_direction_id?: number | null; trade_direction?: string | null },
  data: Prisma.UserUpdateInput
): Promise<void> {
  if (input.trade_direction_id !== undefined) {
    if (input.trade_direction_id === null) {
      data.trade_direction_row = { disconnect: true };
      data.trade_direction = null;
    } else {
      const row = await prisma.tradeDirection.findFirst({
        where: { id: input.trade_direction_id, tenant_id: tenantId }
      });
      if (!row) throw new Error("BAD_TRADE_DIRECTION");
      data.trade_direction = (row.code?.trim() || row.name).trim() || null;
      data.trade_direction_row = { connect: { id: row.id } };
    }
    return;
  }
  if (input.trade_direction !== undefined) {
    data.trade_direction_row = { disconnect: true };
    data.trade_direction = input.trade_direction?.trim() || null;
  }
}

async function tradeDirectionForCreate(
  tenantId: number,
  input: { trade_direction_id?: number | null; trade_direction?: string | null }
): Promise<{ label: string | null; connectId: number | null }> {
  if (input.trade_direction_id != null && input.trade_direction_id > 0) {
    const row = await prisma.tradeDirection.findFirst({
      where: { id: input.trade_direction_id, tenant_id: tenantId }
    });
    if (!row) throw new Error("BAD_TRADE_DIRECTION");
    return {
      label: (row.code?.trim() || row.name).trim() || null,
      connectId: row.id
    };
  }
  return { label: input.trade_direction?.trim() || null, connectId: null };
}

function toFio(u: { first_name: string | null; last_name: string | null; middle_name: string | null; name: string }) {
  const parts = [u.last_name, u.first_name, u.middle_name].filter((x) => x && x.trim().length > 0);
  return parts.length > 0 ? parts.join(" ") : u.name;
}

function parsePriceTypesJson(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

export function parseExpeditorAssignmentRules(v: unknown): ExpeditorAssignmentRules {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const price_types = parsePriceTypesJson(o.price_types);
  const agent_ids = Array.isArray(o.agent_ids)
    ? o.agent_ids
        .map((x) => (typeof x === "number" ? x : Number(x)))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const warehouse_ids = Array.isArray(o.warehouse_ids)
    ? o.warehouse_ids
        .map((x) => (typeof x === "number" ? x : Number(x)))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const trade_directions = Array.isArray(o.trade_directions)
    ? o.trade_directions
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((s) => s.trim())
    : [];
  const territories = Array.isArray(o.territories)
    ? o.territories
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((s) => s.trim())
    : [];
  const weekdays = Array.isArray(o.weekdays)
    ? o.weekdays
        .map((x) => (typeof x === "number" ? x : Number(x)))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    : [];
  return {
    price_types: price_types.length ? price_types : undefined,
    agent_ids: agent_ids.length ? agent_ids : undefined,
    warehouse_ids: warehouse_ids.length ? warehouse_ids : undefined,
    trade_directions: trade_directions.length ? trade_directions : undefined,
    territories: territories.length ? territories : undefined,
    weekdays: weekdays.length ? weekdays : undefined
  };
}

function parseEntitlements(v: unknown): AgentEntitlements {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const price_types = parsePriceTypesJson(o.price_types);
  const rawRules = o.product_rules;
  const product_rules: AgentEntitlements["product_rules"] = [];
  if (Array.isArray(rawRules)) {
    for (const r of rawRules) {
      if (r == null || typeof r !== "object" || Array.isArray(r)) continue;
      const row = r as Record<string, unknown>;
      const category_id = typeof row.category_id === "number" ? row.category_id : Number(row.category_id);
      if (!Number.isInteger(category_id) || category_id <= 0) continue;
      const all = row.all === true;
      const pids = Array.isArray(row.product_ids)
        ? row.product_ids.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)
        : [];
      product_rules.push({ category_id, all, product_ids: pids.length ? pids : undefined });
    }
  }
  return {
    price_types: price_types.length ? price_types : undefined,
    product_rules: product_rules.length ? product_rules : undefined
  };
}

function mergePriceTypesForUser(
  agent_price_types: unknown,
  legacy: string | null
): string[] {
  const fromJson = parsePriceTypesJson(agent_price_types);
  if (fromJson.length > 0) return fromJson;
  const one = legacy?.trim();
  return one ? [one] : [];
}

export async function validateAgentEntitlements(
  tenantId: number,
  ent: AgentEntitlements | undefined | null
): Promise<void> {
  if (!ent || typeof ent !== "object") return;
  const rules = ent.product_rules;
  if (!rules?.length) return;
  const catIds = [...new Set(rules.map((r) => r.category_id))];
  const cats = await prisma.productCategory.findMany({
    where: { tenant_id: tenantId, id: { in: catIds } },
    select: { id: true }
  });
  if (cats.length !== catIds.length) {
    throw new Error("BAD_ENTITLEMENT_CATEGORY");
  }
  for (const r of rules) {
    if (r.all) continue;
    const pids = r.product_ids ?? [];
    if (!pids.length) {
      throw new Error("BAD_ENTITLEMENT_PRODUCT");
    }
    const prods = await prisma.product.findMany({
      where: { tenant_id: tenantId, id: { in: pids }, category_id: r.category_id },
      select: { id: true }
    });
    if (prods.length !== pids.length) {
      throw new Error("BAD_ENTITLEMENT_PRODUCT");
    }
  }
}

export async function validateExpeditorAssignmentRules(
  tenantId: number,
  rules: ExpeditorAssignmentRules | undefined | null
): Promise<void> {
  if (!rules || typeof rules !== "object") return;
  const aids = rules.agent_ids ?? [];
  if (aids.length) {
    const uniqueAids = [...new Set(aids)];
    const agents = await prisma.user.findMany({
      where: { tenant_id: tenantId, id: { in: uniqueAids }, role: "agent" },
      select: { id: true }
    });
    if (agents.length !== uniqueAids.length) {
      throw new Error("BAD_EXPEDITOR_RULE_AGENT");
    }
  }
  const wids = rules.warehouse_ids ?? [];
  if (wids.length) {
    const uniqueWids = [...new Set(wids)];
    const whs = await prisma.warehouse.findMany({
      where: { tenant_id: tenantId, id: { in: uniqueWids } },
      select: { id: true }
    });
    if (whs.length !== uniqueWids.length) {
      throw new Error("BAD_EXPEDITOR_RULE_WAREHOUSE");
    }
  }
}

export async function listAgentFilterOptions(tenantId: number): Promise<{
  branches: string[];
  trade_directions: string[];
  positions: string[];
}> {
  const [rows, dbTrade] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId, role: "agent" },
      select: { branch: true, trade_direction: true, position: true }
    }),
    listActiveTradeDirectionLabels(tenantId)
  ]);
  const branches = new Set<string>();
  const trade_directions = new Set<string>();
  const positions = new Set<string>();
  for (const r of rows) {
    if (r.branch?.trim()) branches.add(r.branch.trim());
    if (r.trade_direction?.trim()) trade_directions.add(r.trade_direction.trim());
    if (r.position?.trim()) positions.add(r.position.trim());
  }
  for (const v of dbTrade) trade_directions.add(v);
  const sort = (a: string, b: string) => a.localeCompare(b, "ru");
  return {
    branches: [...branches].sort(sort),
    trade_directions: [...trade_directions].sort(sort),
    positions: [...positions].sort(sort)
  };
}

export async function listSupervisorFilterOptions(tenantId: number): Promise<{ positions: string[] }> {
  const rows = await prisma.user.findMany({
    where: { tenant_id: tenantId, role: "supervisor" },
    select: { position: true }
  });
  const positions = new Set<string>();
  for (const r of rows) {
    if (r.position?.trim()) positions.add(r.position.trim());
  }
  const sort = (a: string, b: string) => a.localeCompare(b, "ru");
  return { positions: [...positions].sort(sort) };
}

function refStringListFromTenantSettings(settings: unknown, key: string): string[] {
  const ref = (settings as { references?: Record<string, unknown> } | null | undefined)?.references;
  const v = ref?.[key];
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((s) => s.trim());
}

/**
 * Ekspektor filtrlari va «Условия привязки → Территория» tanlovlari.
 * Avval faqat boshqa ekspektorlarning `User.territory` qatoridan yig‘ilgan — bo‘sh tenantlarda «Нет вариантов» chiqardi.
 * Endi tenant `references` (viloyat/shahar/tuman/zona/mahalla) va mijoz jadvalidagi noyob qiymatlar ham qo‘shiladi
 * (`expeditorRulesMatch` mijoz manzil matnida substring qidiradi).
 */
export async function listExpeditorFilterOptions(tenantId: number): Promise<{
  branches: string[];
  trade_directions: string[];
  positions: string[];
  territories: string[];
  /** Filtrlarda «область/город» uchun qisqa tokenlar (territory qatoridan ajratilgan) */
  territory_tokens: string[];
}> {
  const [rows, dbTrade, tenantRow, cr, cc, cd, cz, cn] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId, role: "expeditor" },
      select: { branch: true, trade_direction: true, position: true, territory: true }
    }),
    listActiveTradeDirectionLabels(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, region: { not: null } },
      distinct: ["region"],
      select: { region: true }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, city: { not: null } },
      distinct: ["city"],
      select: { city: true }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, district: { not: null } },
      distinct: ["district"],
      select: { district: true }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, zone: { not: null } },
      distinct: ["zone"],
      select: { zone: true }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, neighborhood: { not: null } },
      distinct: ["neighborhood"],
      select: { neighborhood: true }
    })
  ]);
  const branches = new Set<string>();
  const trade_directions = new Set<string>();
  const positions = new Set<string>();
  const territories = new Set<string>();
  const territory_tokens = new Set<string>();

  const pushTerritoryToken = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim();
    if (t.length < 2) return;
    territories.add(t);
    territory_tokens.add(t);
    for (const part of t.split(/[,;\n|]+/)) {
      const p = part.trim();
      if (p.length >= 2) territory_tokens.add(p);
    }
  };

  for (const r of rows) {
    if (r.branch?.trim()) branches.add(r.branch.trim());
    if (r.trade_direction?.trim()) trade_directions.add(r.trade_direction.trim());
    if (r.position?.trim()) positions.add(r.position.trim());
    if (r.territory?.trim()) {
      territories.add(r.territory.trim());
      for (const part of r.territory.split(/[,;\n|]+/)) {
        const t = part.trim();
        if (t.length >= 2) territory_tokens.add(t);
      }
    }
  }

  const st = tenantRow?.settings;
  const refObj = (st as { references?: Record<string, unknown> } | null | undefined)?.references;
  for (const s of territoryRegionPickerNames(refObj)) pushTerritoryToken(s);
  for (const s of refStringListFromTenantSettings(st, "client_cities")) pushTerritoryToken(s);
  for (const s of refStringListFromTenantSettings(st, "client_districts")) pushTerritoryToken(s);
  for (const s of refStringListFromTenantSettings(st, "client_zones")) pushTerritoryToken(s);
  for (const s of refStringListFromTenantSettings(st, "client_neighborhoods")) pushTerritoryToken(s);

  for (const r of cr) pushTerritoryToken(r.region);
  for (const r of cc) pushTerritoryToken(r.city);
  for (const r of cd) pushTerritoryToken(r.district);
  for (const r of cz) pushTerritoryToken(r.zone);
  for (const r of cn) pushTerritoryToken(r.neighborhood);

  for (const v of dbTrade) trade_directions.add(v);
  const sort = (a: string, b: string) => a.localeCompare(b, "ru");
  return {
    branches: [...branches].sort(sort),
    trade_directions: [...trade_directions].sort(sort),
    positions: [...positions].sort(sort),
    territories: [...territories].sort(sort),
    territory_tokens: [...territory_tokens].sort(sort)
  };
}

export async function listStaff(
  tenantId: number,
  kind: StaffKind,
  filters?: ListStaffFilters
): Promise<StaffRow[]> {
  const role = kindRole(kind);
  const where: Prisma.UserWhereInput = { tenant_id: tenantId, role };
  if (filters?.is_active !== undefined) {
    where.is_active = filters.is_active;
  }
  if (filters?.branch?.trim()) {
    where.branch = { equals: filters.branch.trim(), mode: "insensitive" };
  }
  if (filters?.trade_direction?.trim()) {
    where.trade_direction = { equals: filters.trade_direction.trim(), mode: "insensitive" };
  }
  if (filters?.position?.trim()) {
    where.position = { equals: filters.position.trim(), mode: "insensitive" };
  }

  const territoryAnd: Prisma.UserWhereInput[] = [];
  if (filters?.territory?.trim()) {
    territoryAnd.push({ territory: { equals: filters.territory.trim(), mode: "insensitive" } });
  }
  if (filters?.territory_oblast?.trim()) {
    territoryAnd.push({ territory: { contains: filters.territory_oblast.trim(), mode: "insensitive" } });
  }
  if (filters?.territory_city?.trim()) {
    territoryAnd.push({ territory: { contains: filters.territory_city.trim(), mode: "insensitive" } });
  }
  if (territoryAnd.length > 0) {
    where.AND = territoryAnd;
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      warehouse: { select: { name: true } },
      return_warehouse: { select: { name: true } },
      supervisor: { select: { id: true, name: true } },
      trade_direction_row: { select: { id: true, name: true, code: true } }
    },
    orderBy: { created_at: "desc" }
  });

  const userIds = users.map((u) => u.id);
  const sessionCounts =
    userIds.length === 0
      ? []
      : await prisma.refreshToken.groupBy({
          by: ["user_id"],
          where: {
            user_id: { in: userIds },
            revoked_at: null,
            expires_at: { gt: new Date() }
          },
          _count: { _all: true }
        });
  const sessMap = new Map(sessionCounts.map((s) => [s.user_id, s._count._all]));

  const clientCounts = await prisma.client.groupBy({
    by: ["agent_id"],
    where: { tenant_id: tenantId, agent_id: { not: null }, merged_into_client_id: null },
    _count: { _all: true }
  });
  const countMap = new Map<number, number>();
  for (const row of clientCounts) {
    if (row.agent_id != null) countMap.set(row.agent_id, row._count._all);
  }

  let superviseeCountMap = new Map<number, number>();
  const superviseesBySupervisor = new Map<number, Array<{ id: number; fio: string; code: string | null }>>();
  if (kind === "supervisor") {
    const grouped = await prisma.user.groupBy({
      by: ["supervisor_user_id"],
      where: {
        tenant_id: tenantId,
        role: "agent",
        supervisor_user_id: { not: null }
      },
      _count: { _all: true }
    });
    for (const g of grouped) {
      if (g.supervisor_user_id != null) {
        superviseeCountMap.set(g.supervisor_user_id, g._count._all);
      }
    }

    const supIds = users.map((u) => u.id);
    if (supIds.length > 0) {
      const agents = await prisma.user.findMany({
        where: {
          tenant_id: tenantId,
          role: "agent",
          supervisor_user_id: { in: supIds }
        },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          middle_name: true,
          name: true,
          code: true,
          supervisor_user_id: true
        },
        orderBy: { id: "asc" }
      });
      for (const a of agents) {
        const sid = a.supervisor_user_id;
        if (sid == null) continue;
        const list = superviseesBySupervisor.get(sid) ?? [];
        list.push({ id: a.id, fio: toFio(a), code: a.code });
        superviseesBySupervisor.set(sid, list);
      }
    }
  }

  return users.map((u) => ({
    id: u.id,
    kind,
    fio: toFio(u),
    product: u.product,
    agent_type: u.agent_type,
    code: u.code,
    pinfl: u.pinfl,
    consignment: u.consignment,
    apk_version: u.apk_version,
    device_name: u.device_name,
    last_sync_at: u.last_sync_at ? u.last_sync_at.toISOString() : null,
    phone: u.phone,
    email: u.email ?? null,
    can_authorize: u.can_authorize,
    price_type: u.price_type,
    price_types: mergePriceTypesForUser(u.agent_price_types, u.price_type),
    warehouse: u.warehouse?.name ?? null,
    trade_direction_id: u.trade_direction_id ?? null,
    trade_direction: tradeDirectionDisplayFromRef(u.trade_direction_row, u.trade_direction),
    branch: u.branch,
    position: u.position,
    created_at: u.created_at.toISOString(),
    app_access: u.app_access,
    territory: u.territory,
    login: u.login,
    is_active: u.is_active,
    max_sessions: u.max_sessions ?? 2,
    active_session_count: sessMap.get(u.id) ?? 0,
    kpi_color: u.kpi_color ?? null,
    agent_entitlements: parseEntitlements(u.agent_entitlements),
    expeditor_assignment_rules: parseExpeditorAssignmentRules(
      (u as { expeditor_assignment_rules?: unknown }).expeditor_assignment_rules
    ),
    client_count: countMap.get(u.id) ?? 0,
    supervisor_user_id: u.supervisor_user_id,
    supervisor_name: u.supervisor?.name ?? null,
    supervisee_count: kind === "supervisor" ? superviseeCountMap.get(u.id) ?? 0 : 0,
    supervisees: kind === "supervisor" ? superviseesBySupervisor.get(u.id) ?? [] : [],
    first_name: u.first_name,
    last_name: u.last_name,
    middle_name: u.middle_name
  }));
}

export async function patchAgentSupervisor(
  tenantId: number,
  agentUserId: number,
  supervisorUserId: number | null,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const agent = await prisma.user.findFirst({
    where: { id: agentUserId, tenant_id: tenantId, role: "agent" }
  });
  if (!agent) {
    throw new Error("NOT_FOUND");
  }

  if (supervisorUserId != null) {
    if (supervisorUserId === agentUserId) {
      throw new Error("SELF_SUPERVISOR");
    }
    const sup = await prisma.user.findFirst({
      where: { id: supervisorUserId, tenant_id: tenantId, is_active: true, role: "supervisor" }
    });
    if (!sup) {
      throw new Error("BAD_SUPERVISOR");
    }
  }

  await prisma.user.update({
    where: { id: agentUserId },
    data: {
      supervisor:
        supervisorUserId == null ? { disconnect: true } : { connect: { id: supervisorUserId } }
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: agentUserId,
    action: "patch.supervisor",
    payload: { supervisor_user_id: supervisorUserId }
  });

  const rows = await listStaff(tenantId, "agent");
  const row = rows.find((x) => x.id === agentUserId);
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  return row;
}

export async function createStaff(
  tenantId: number,
  kind: StaffKind,
  input: CreateStaffInput,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("BAD_LOGIN");
  if (input.password.length < 6) throw new Error("BAD_PASSWORD");
  const firstName = input.first_name.trim();
  if (!firstName) throw new Error("BAD_FIRST_NAME");

  const exists = await prisma.user.findFirst({ where: { tenant_id: tenantId, login } });
  if (exists) throw new Error("LOGIN_EXISTS");

  /** Veb-operator: mobil maydonlarsiz, asosan panel */
  if (kind === "operator") {
    const passwordHashOp = await bcrypt.hash(input.password, 10);
    const ms =
      input.max_sessions != null && Number.isInteger(input.max_sessions) && input.max_sessions >= 1
        ? input.max_sessions
        : 4;
    const displayName = [input.last_name, input.first_name, input.middle_name]
      .filter((x) => x && String(x).trim().length > 0)
      .join(" ")
      .trim();
    const createdOp = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        name: displayName || firstName,
        first_name: firstName,
        last_name: input.last_name?.trim() || null,
        middle_name: input.middle_name?.trim() || null,
        login,
        password_hash: passwordHashOp,
        role: "operator",
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        can_authorize: input.can_authorize ?? true,
        is_active: input.is_active ?? true,
        app_access: input.app_access ?? false,
        max_sessions: ms,
        product: null,
        agent_type: null,
        code: input.code?.trim().slice(0, 24) || null,
        pinfl: input.pinfl?.trim().slice(0, 24) || null,
        consignment: false,
        apk_version: null,
        device_name: null,
        price_type: null,
        agent_price_types: [],
        agent_entitlements: {},
        warehouse_id: null,
        return_warehouse_id: null,
        trade_direction: null,
        branch: input.branch?.trim().slice(0, 128) || null,
        position: input.position?.trim().slice(0, 128) || null,
        territory: null,
        kpi_color: null,
        supervisor_user_id: null
      }
    });

    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.user,
      entityId: createdOp.id,
      action: "create",
      payload: {
        role: "operator",
        login: createdOp.login,
        password_set: true
      }
    });

    const deskId = input.cash_desk_id;
    const deskLinkRole = input.cash_desk_link_role;
    if (deskId != null && deskLinkRole) {
      await createCashDeskUserLink(tenantId, deskId, createdOp.id, deskLinkRole);
    }

    const rowsOp = await listStaff(tenantId, "operator");
    const rowOp = rowsOp.find((x) => x.id === createdOp.id);
    if (!rowOp) throw new Error("NOT_FOUND");
    return rowOp;
  }

  if (input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({ where: { id: input.warehouse_id, tenant_id: tenantId } });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }
  if (input.return_warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.return_warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_RETURN_WAREHOUSE");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const priceTypesArr = [...new Set((input.agent_price_types ?? []).map((s) => s.trim()).filter(Boolean))];
  const legacyPrice = input.price_type?.trim() || null;
  const ent = input.agent_entitlements ?? {};
  await validateAgentEntitlements(tenantId, ent);
  const entPriceTypes = ent.price_types?.length
    ? [...new Set(ent.price_types.map((s) => s.trim()).filter(Boolean))]
    : [];
  const agentPriceTypesStored =
    entPriceTypes.length > 0
      ? entPriceTypes
      : priceTypesArr.length > 0
        ? priceTypesArr
        : legacyPrice
          ? [legacyPrice]
          : [];

  const tdRes = await tradeDirectionForCreate(tenantId, input);

  const created = await prisma.user.create({
    data: {
      tenant_id: tenantId,
      name: [input.last_name, input.first_name, input.middle_name].filter(Boolean).join(" ").trim() || firstName,
      first_name: firstName,
      last_name: input.last_name?.trim() || null,
      middle_name: input.middle_name?.trim() || null,
      login,
      password_hash: passwordHash,
      role: kindRole(kind),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      product: input.product?.trim() || null,
      agent_type: input.agent_type?.trim() || null,
      code: input.code?.trim() || null,
      pinfl: input.pinfl?.trim() || null,
      consignment: input.consignment ?? false,
      apk_version: input.apk_version?.trim() || null,
      device_name: input.device_name?.trim() || null,
      can_authorize: input.can_authorize ?? true,
      price_type: legacyPrice,
      agent_price_types: agentPriceTypesStored,
      agent_entitlements: ent as Prisma.InputJsonValue,
      max_sessions: input.max_sessions != null && input.max_sessions >= 1 ? input.max_sessions : 2,
      kpi_color: input.kpi_color?.trim().slice(0, 16) || null,
      warehouse_id: input.warehouse_id ?? null,
      return_warehouse_id: input.return_warehouse_id ?? null,
      trade_direction: tdRes.label,
      branch: input.branch?.trim() || null,
      position: input.position?.trim() || null,
      app_access: input.app_access ?? true,
      territory: input.territory?.trim() || null,
      is_active: input.is_active ?? true
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: created.id,
    action: "create",
    payload: {
      role: kindRole(kind),
      login: created.login,
      password_set: true
    }
  });

  const rows = await listStaff(tenantId, kind);
  const row = rows.find((x) => x.id === created.id);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export type SessionRowDto = {
  id: number;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export async function getStaffRow(tenantId: number, kind: StaffKind, id: number): Promise<StaffRow | null> {
  const rows = await listStaff(tenantId, kind);
  return rows.find((r) => r.id === id) ?? null;
}

export type PatchAgentInput = {
  first_name?: string;
  last_name?: string | null;
  middle_name?: string | null;
  phone?: string | null;
  email?: string | null;
  product?: string | null;
  agent_type?: string | null;
  code?: string | null;
  pinfl?: string | null;
  consignment?: boolean;
  apk_version?: string | null;
  device_name?: string | null;
  can_authorize?: boolean;
  price_type?: string | null;
  agent_price_types?: string[];
  warehouse_id?: number | null;
  return_warehouse_id?: number | null;
  trade_direction_id?: number | null;
  trade_direction?: string | null;
  branch?: string | null;
  position?: string | null;
  app_access?: boolean;
  territory?: string | null;
  is_active?: boolean;
  password?: string;
  max_sessions?: number;
  kpi_color?: string | null;
  agent_entitlements?: AgentEntitlements;
  supervisor_user_id?: number | null;
};

export async function patchAgent(
  tenantId: number,
  agentId: number,
  input: PatchAgentInput,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const existing = await prisma.user.findFirst({
    where: { id: agentId, tenant_id: tenantId, role: "agent" }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  if (input.warehouse_id !== undefined && input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({ where: { id: input.warehouse_id, tenant_id: tenantId } });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }
  if (input.return_warehouse_id !== undefined && input.return_warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.return_warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_RETURN_WAREHOUSE");
  }

  if (input.supervisor_user_id !== undefined) {
    const sid = input.supervisor_user_id;
    if (sid != null) {
      if (sid === agentId) throw new Error("SELF_SUPERVISOR");
      const sup = await prisma.user.findFirst({
        where: { id: sid, tenant_id: tenantId, is_active: true, role: "supervisor" }
      });
      if (!sup) throw new Error("BAD_SUPERVISOR");
    }
  }

  if (input.agent_entitlements !== undefined) {
    await validateAgentEntitlements(tenantId, input.agent_entitlements);
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.first_name !== undefined) data.first_name = input.first_name.trim();
  if (input.last_name !== undefined) data.last_name = input.last_name?.trim() || null;
  if (input.middle_name !== undefined) data.middle_name = input.middle_name?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.product !== undefined) data.product = input.product?.trim() || null;
  if (input.agent_type !== undefined) data.agent_type = input.agent_type?.trim() || null;
  if (input.code !== undefined) data.code = input.code?.trim() || null;
  if (input.pinfl !== undefined) data.pinfl = input.pinfl?.trim() || null;
  if (input.consignment !== undefined) data.consignment = input.consignment;
  if (input.apk_version !== undefined) data.apk_version = input.apk_version?.trim() || null;
  if (input.device_name !== undefined) data.device_name = input.device_name?.trim() || null;
  if (input.can_authorize !== undefined) data.can_authorize = input.can_authorize;
  if (input.price_type !== undefined) data.price_type = input.price_type?.trim() || null;
  if (input.agent_price_types !== undefined) {
    const arr = [...new Set(input.agent_price_types.map((s) => s.trim()).filter(Boolean))];
    data.agent_price_types = arr;
  } else if (input.price_type !== undefined) {
    const single = input.price_type?.trim() || null;
    data.agent_price_types = single ? [single] : [];
  }
  if (input.warehouse_id !== undefined) {
    data.warehouse =
      input.warehouse_id == null ? { disconnect: true } : { connect: { id: input.warehouse_id } };
  }
  if (input.return_warehouse_id !== undefined) {
    data.return_warehouse =
      input.return_warehouse_id == null
        ? { disconnect: true }
        : { connect: { id: input.return_warehouse_id } };
  }
  if (input.trade_direction_id !== undefined || input.trade_direction !== undefined) {
    await applyTradeDirectionPatch(tenantId, input, data);
  }
  if (input.branch !== undefined) data.branch = input.branch?.trim() || null;
  if (input.position !== undefined) data.position = input.position?.trim() || null;
  if (input.app_access !== undefined) data.app_access = input.app_access;
  if (input.territory !== undefined) data.territory = input.territory?.trim() || null;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.max_sessions !== undefined) {
    const n = input.max_sessions;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("BAD_MAX_SESSIONS");
    data.max_sessions = n;
  }
  if (input.kpi_color !== undefined) data.kpi_color = input.kpi_color?.trim().slice(0, 16) || null;
  if (input.agent_entitlements !== undefined) {
    data.agent_entitlements = input.agent_entitlements as Prisma.InputJsonValue;
    const pt = input.agent_entitlements.price_types;
    if (pt !== undefined) {
      data.agent_price_types = [...new Set(pt.map((s) => s.trim()).filter(Boolean))];
    }
  }
  if (input.supervisor_user_id !== undefined) {
    data.supervisor =
      input.supervisor_user_id == null
        ? { disconnect: true }
        : { connect: { id: input.supervisor_user_id } };
  }
  if (input.password !== undefined && input.password.trim().length > 0) {
    if (input.password.length < 6) throw new Error("BAD_PASSWORD");
    data.password_hash = await bcrypt.hash(input.password, 10);
  }

  if (Object.keys(data).length > 0) {
    if (input.first_name !== undefined || input.last_name !== undefined || input.middle_name !== undefined) {
      const first = input.first_name !== undefined ? input.first_name.trim() : existing.first_name ?? "";
      const last = input.last_name !== undefined ? input.last_name?.trim() || null : existing.last_name;
      const mid = input.middle_name !== undefined ? input.middle_name?.trim() || null : existing.middle_name;
      data.name = [last, first, mid].filter((x) => x && String(x).trim().length > 0).join(" ").trim() || existing.name;
    }

    await prisma.user.update({
      where: { id: agentId },
      data
    });

    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.user,
      entityId: agentId,
      action: "patch.agent",
      payload: { keys: Object.keys(data).filter((k) => k !== "password_hash") }
    });
  }

  const rows = await listStaff(tenantId, "agent");
  const row = rows.find((x) => x.id === agentId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export type PatchSupervisorInput = Omit<PatchAgentInput, "agent_entitlements" | "supervisor_user_id"> & {
  /** Bu supervisor ostidagi agentlar ro‘yxati (to‘liq almashtirish). */
  supervisee_agent_ids?: number[];
};

async function syncAgentsToSupervisor(
  tx: Prisma.TransactionClient,
  tenantId: number,
  supervisorId: number,
  agentIds: number[]
): Promise<void> {
  const unique = [...new Set(agentIds.filter((id) => Number.isInteger(id) && id > 0))];
  await tx.user.updateMany({
    where: { tenant_id: tenantId, role: "agent", supervisor_user_id: supervisorId },
    data: { supervisor_user_id: null }
  });
  if (unique.length === 0) return;
  const agents = await tx.user.findMany({
    where: { id: { in: unique }, tenant_id: tenantId, role: "agent" },
    select: { id: true }
  });
  if (agents.length !== unique.length) {
    throw new Error("BAD_SUPERVISEE_AGENT");
  }
  await tx.user.updateMany({
    where: { id: { in: unique }, tenant_id: tenantId, role: "agent" },
    data: { supervisor_user_id: supervisorId }
  });
}

export async function patchSupervisor(
  tenantId: number,
  supervisorId: number,
  input: PatchSupervisorInput,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const existing = await prisma.user.findFirst({
    where: { id: supervisorId, tenant_id: tenantId, role: "supervisor" }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  if (input.warehouse_id !== undefined && input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({ where: { id: input.warehouse_id, tenant_id: tenantId } });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }
  if (input.return_warehouse_id !== undefined && input.return_warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.return_warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_RETURN_WAREHOUSE");
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.first_name !== undefined) data.first_name = input.first_name.trim();
  if (input.last_name !== undefined) data.last_name = input.last_name?.trim() || null;
  if (input.middle_name !== undefined) data.middle_name = input.middle_name?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.product !== undefined) data.product = input.product?.trim() || null;
  if (input.agent_type !== undefined) data.agent_type = input.agent_type?.trim() || null;
  if (input.code !== undefined) data.code = input.code?.trim() || null;
  if (input.pinfl !== undefined) data.pinfl = input.pinfl?.trim() || null;
  if (input.consignment !== undefined) data.consignment = input.consignment;
  if (input.apk_version !== undefined) data.apk_version = input.apk_version?.trim() || null;
  if (input.device_name !== undefined) data.device_name = input.device_name?.trim() || null;
  if (input.can_authorize !== undefined) data.can_authorize = input.can_authorize;
  if (input.price_type !== undefined) data.price_type = input.price_type?.trim() || null;
  if (input.agent_price_types !== undefined) {
    const arr = [...new Set(input.agent_price_types.map((s) => s.trim()).filter(Boolean))];
    data.agent_price_types = arr;
  } else if (input.price_type !== undefined) {
    const single = input.price_type?.trim() || null;
    data.agent_price_types = single ? [single] : [];
  }
  if (input.warehouse_id !== undefined) {
    data.warehouse =
      input.warehouse_id == null ? { disconnect: true } : { connect: { id: input.warehouse_id } };
  }
  if (input.return_warehouse_id !== undefined) {
    data.return_warehouse =
      input.return_warehouse_id == null
        ? { disconnect: true }
        : { connect: { id: input.return_warehouse_id } };
  }
  if (input.trade_direction_id !== undefined || input.trade_direction !== undefined) {
    await applyTradeDirectionPatch(tenantId, input, data);
  }
  if (input.branch !== undefined) data.branch = input.branch?.trim() || null;
  if (input.position !== undefined) data.position = input.position?.trim() || null;
  if (input.app_access !== undefined) data.app_access = input.app_access;
  if (input.territory !== undefined) data.territory = input.territory?.trim() || null;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.max_sessions !== undefined) {
    const n = input.max_sessions;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("BAD_MAX_SESSIONS");
    data.max_sessions = n;
  }
  if (input.kpi_color !== undefined) data.kpi_color = input.kpi_color?.trim().slice(0, 16) || null;
  if (input.password !== undefined && input.password.trim().length > 0) {
    if (input.password.length < 6) throw new Error("BAD_PASSWORD");
    data.password_hash = await bcrypt.hash(input.password, 10);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      if (input.first_name !== undefined || input.last_name !== undefined || input.middle_name !== undefined) {
        const first = input.first_name !== undefined ? input.first_name.trim() : existing.first_name ?? "";
        const last = input.last_name !== undefined ? input.last_name?.trim() || null : existing.last_name;
        const mid = input.middle_name !== undefined ? input.middle_name?.trim() || null : existing.middle_name;
        data.name = [last, first, mid].filter((x) => x && String(x).trim().length > 0).join(" ").trim() || existing.name;
      }
      await tx.user.update({
        where: { id: supervisorId },
        data
      });
    }
    if (input.supervisee_agent_ids !== undefined) {
      await syncAgentsToSupervisor(tx, tenantId, supervisorId, input.supervisee_agent_ids);
    }
  });

  if (Object.keys(data).length > 0) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.user,
      entityId: supervisorId,
      action: "patch.supervisor",
      payload: { keys: Object.keys(data).filter((k) => k !== "password_hash") }
    });
  }

  const rows = await listStaff(tenantId, "supervisor");
  const row = rows.find((x) => x.id === supervisorId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export type PatchOperatorInput = {
  first_name?: string;
  last_name?: string | null;
  middle_name?: string | null;
  phone?: string | null;
  email?: string | null;
  code?: string | null;
  pinfl?: string | null;
  branch?: string | null;
  position?: string | null;
  can_authorize?: boolean;
  is_active?: boolean;
  app_access?: boolean;
  max_sessions?: number;
  password?: string;
};

export async function patchOperator(
  tenantId: number,
  operatorId: number,
  input: PatchOperatorInput,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const existing = await prisma.user.findFirst({
    where: { id: operatorId, tenant_id: tenantId, role: "operator" }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.first_name !== undefined) data.first_name = input.first_name.trim();
  if (input.last_name !== undefined) data.last_name = input.last_name?.trim() || null;
  if (input.middle_name !== undefined) data.middle_name = input.middle_name?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.code !== undefined) data.code = input.code?.trim().slice(0, 24) || null;
  if (input.pinfl !== undefined) data.pinfl = input.pinfl?.trim().slice(0, 24) || null;
  if (input.branch !== undefined) data.branch = input.branch?.trim().slice(0, 128) || null;
  if (input.position !== undefined) data.position = input.position?.trim().slice(0, 128) || null;
  if (input.can_authorize !== undefined) data.can_authorize = input.can_authorize;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.app_access !== undefined) data.app_access = input.app_access;
  if (input.max_sessions !== undefined) {
    const n = input.max_sessions;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("BAD_MAX_SESSIONS");
    data.max_sessions = n;
  }
  if (input.password !== undefined && input.password.trim().length > 0) {
    if (input.password.length < 6) throw new Error("BAD_PASSWORD");
    data.password_hash = await bcrypt.hash(input.password, 10);
  }

  if (Object.keys(data).length > 0) {
    if (input.first_name !== undefined || input.last_name !== undefined || input.middle_name !== undefined) {
      const first =
        input.first_name !== undefined ? input.first_name.trim() : existing.first_name ?? "";
      const last = input.last_name !== undefined ? input.last_name?.trim() || null : existing.last_name;
      const mid =
        input.middle_name !== undefined ? input.middle_name?.trim() || null : existing.middle_name;
      data.name =
        [last, first, mid].filter((x) => x && String(x).trim().length > 0).join(" ").trim() ||
        existing.name;
    }

    await prisma.user.update({
      where: { id: operatorId },
      data
    });

    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.user,
      entityId: operatorId,
      action: "patch.operator",
      payload: { keys: Object.keys(data).filter((k) => k !== "password_hash") }
    });
  }

  const rows = await listStaff(tenantId, "operator");
  const row = rows.find((x) => x.id === operatorId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export async function listStaffSessions(
  tenantId: number,
  userId: number,
  role: "agent" | "expeditor" | "supervisor" | "operator"
): Promise<SessionRowDto[]> {
  const u = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId, role }
  });
  if (!u) throw new Error("NOT_FOUND");
  const rows = await prisma.refreshToken.findMany({
    where: {
      user_id: userId,
      tenant_id: tenantId,
      revoked_at: null,
      expires_at: { gt: new Date() }
    },
    orderBy: { created_at: "desc" }
  });
  return rows.map((r) => ({
    id: r.id,
    device_name: r.device_name,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    created_at: r.created_at.toISOString()
  }));
}

export async function listAgentSessions(tenantId: number, agentId: number): Promise<SessionRowDto[]> {
  return listStaffSessions(tenantId, agentId, "agent");
}

export async function revokeStaffSessions(
  tenantId: number,
  userId: number,
  role: "agent" | "expeditor" | "supervisor" | "operator",
  mode: { tokenIds?: number[]; all?: boolean },
  actorUserId: number | null = null
): Promise<void> {
  const u = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId, role }
  });
  if (!u) throw new Error("NOT_FOUND");

  const baseWhere: Prisma.RefreshTokenWhereInput = {
    user_id: userId,
    tenant_id: tenantId,
    revoked_at: null
  };

  if (mode.all) {
    await prisma.refreshToken.updateMany({
      where: baseWhere,
      data: { revoked_at: new Date() }
    });
  } else if (mode.tokenIds?.length) {
    await prisma.refreshToken.updateMany({
      where: {
        ...baseWhere,
        id: { in: mode.tokenIds }
      },
      data: { revoked_at: new Date() }
    });
  } else {
    throw new Error("EMPTY_REVOKE");
  }

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: userId,
    action: "sessions.revoke",
    payload: { all: Boolean(mode.all), count: mode.tokenIds?.length ?? 0, role }
  });
}

export async function revokeAgentSessions(
  tenantId: number,
  agentId: number,
  mode: { tokenIds?: number[]; all?: boolean },
  actorUserId: number | null = null
): Promise<void> {
  await revokeStaffSessions(tenantId, agentId, "agent", mode, actorUserId);
}

function asTenantSettingsRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

const WEB_STAFF_PRESET_MAX = 50;

/** `tenant_audit_events.entity_type` — bitta lavozim shabloni tarixini filtrlash uchun */
export const WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY = "web_staff_position_preset";

export type WebStaffPositionPresetDto = {
  id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by_user_id: number | null;
  deactivated_at: string | null;
  deactivated_by_user_id: number | null;
};

export type WebStaffPositionPresetAdminDto = WebStaffPositionPresetDto & {
  created_by_label: string | null;
  deactivated_by_label: string | null;
  /** `User.position` shu shablon `label` bilan mos (trim) keladigan veb-panel xodimlari soni */
  linked_operator_count: number;
};

function parseIsoDateString(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function parseOptionalUserId(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return null;
  return v;
}

function parsePresetObject(o: Record<string, unknown>, fallbackOrder: number): WebStaffPositionPresetDto | null {
  const id = typeof o.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.id) ? o.id : null;
  const label = typeof o.label === "string" ? o.label.trim().slice(0, 128) : "";
  if (!id || !label) return null;
  const is_active = o.is_active !== false;
  const sort_order =
    typeof o.sort_order === "number" && Number.isFinite(o.sort_order) ? Math.floor(o.sort_order) : fallbackOrder;
  const created_at = parseIsoDateString(o.created_at) ?? "";
  return {
    id,
    label,
    is_active,
    sort_order,
    created_at,
    created_by_user_id: parseOptionalUserId(o.created_by_user_id),
    deactivated_at: parseIsoDateString(o.deactivated_at),
    deactivated_by_user_id: parseOptionalUserId(o.deactivated_by_user_id)
  };
}

function presetsFromStringArray(arr: string[]): WebStaffPositionPresetDto[] {
  const labels = [...new Set(arr.map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 128)))].slice(
    0,
    WEB_STAFF_PRESET_MAX
  );
  const now = new Date().toISOString();
  return labels.map((label, i) => ({
    id: randomUUID(),
    label,
    is_active: true,
    sort_order: i,
    created_at: now,
    created_by_user_id: null,
    deactivated_at: null,
    deactivated_by_user_id: null
  }));
}

function ensureCreatedAtOnPresets(presets: WebStaffPositionPresetDto[]): {
  presets: WebStaffPositionPresetDto[];
  changed: boolean;
} {
  const now = new Date().toISOString();
  let changed = false;
  const next = presets.map((p) => {
    const ca = typeof p.created_at === "string" ? p.created_at.trim() : "";
    if (ca && parseIsoDateString(ca)) return p;
    changed = true;
    return { ...p, created_at: now, created_by_user_id: p.created_by_user_id ?? null };
  });
  return { presets: next, changed };
}

async function enrichPresetsWithUserLabels(
  tenantId: number,
  presets: WebStaffPositionPresetDto[]
): Promise<WebStaffPositionPresetAdminDto[]> {
  const ids = new Set<number>();
  for (const p of presets) {
    if (p.created_by_user_id != null) ids.add(p.created_by_user_id);
    if (p.deactivated_by_user_id != null) ids.add(p.deactivated_by_user_id);
  }
  const [actorUsers, panelStaffPositions] = await Promise.all([
    ids.size > 0
      ? prisma.user.findMany({
          where: { tenant_id: tenantId, id: { in: [...ids] } },
          select: { id: true, name: true, login: true }
        })
      : Promise.resolve([] as { id: number; name: string; login: string }[]),
    prisma.user.findMany({
      where: { tenant_id: tenantId, role: { in: [...WEB_PANEL_STAFF_ROLES] } },
      select: { position: true }
    })
  ]);

  const labelById = new Map<number, string>();
  for (const u of actorUsers) {
    const n = u.name?.trim();
    labelById.set(u.id, n && n.length > 0 ? n : u.login);
  }

  const operatorCountByPositionLabel = new Map<string, number>();
  for (const row of panelStaffPositions) {
    const t = row.position?.trim() ?? "";
    if (!t) continue;
    operatorCountByPositionLabel.set(t, (operatorCountByPositionLabel.get(t) ?? 0) + 1);
  }

  return presets.map((p) => ({
    ...p,
    created_by_label:
      p.created_by_user_id != null
        ? (labelById.get(p.created_by_user_id) ?? `ID ${p.created_by_user_id}`)
        : null,
    deactivated_by_label:
      p.deactivated_by_user_id != null
        ? (labelById.get(p.deactivated_by_user_id) ?? `ID ${p.deactivated_by_user_id}`)
        : null,
    linked_operator_count: operatorCountByPositionLabel.get(p.label) ?? 0
  }));
}

/** JSON: string[] (eski) yoki obyekt massivi */
function parsePresetsArray(raw: unknown): { presets: WebStaffPositionPresetDto[]; needsMigrate: boolean } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { presets: [], needsMigrate: false };
  }
  if (typeof raw[0] === "string") {
    return { presets: presetsFromStringArray(raw as string[]), needsMigrate: true };
  }
  const out: WebStaffPositionPresetDto[] = [];
  raw.forEach((item, i) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) return;
    const p = parsePresetObject(item as Record<string, unknown>, i);
    if (p) out.push(p);
  });
  return { presets: out.slice(0, WEB_STAFF_PRESET_MAX), needsMigrate: false };
}

async function persistWebStaffPositionPresets(
  tenantId: number,
  presets: WebStaffPositionPresetDto[],
  actorUserId: number | null,
  action: string
): Promise<void> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  if (!row) throw new Error("NOT_FOUND");

  const nextSettings = {
    ...asTenantSettingsRecord(row.settings),
    web_staff_position_presets: presets.map((p) => ({
      id: p.id,
      label: p.label,
      is_active: p.is_active,
      sort_order: p.sort_order,
      created_at: p.created_at,
      created_by_user_id: p.created_by_user_id,
      deactivated_at: p.deactivated_at,
      deactivated_by_user_id: p.deactivated_by_user_id
    }))
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
    action,
    payload: { count: presets.length }
  });
}

async function resolveWebStaffPresetsFromSettings(tenantId: number, settings: unknown): Promise<WebStaffPositionPresetDto[]> {
  const { presets: parsed, needsMigrate } = parsePresetsArray(asTenantSettingsRecord(settings).web_staff_position_presets);
  const { presets: withCreated, changed: needCreated } = ensureCreatedAtOnPresets(parsed);
  let presets = withCreated;
  if (needsMigrate) {
    await persistWebStaffPositionPresets(tenantId, presets, null, "migrate.web_staff_position_presets");
  } else if (needCreated) {
    await persistWebStaffPositionPresets(tenantId, presets, null, "hydrate.web_staff_position_preset_timestamps");
  }
  return presets.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "ru"));
}

async function loadWebStaffPositionPresets(tenantId: number): Promise<WebStaffPositionPresetDto[]> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  if (!row) throw new Error("NOT_FOUND");

  return resolveWebStaffPresetsFromSettings(tenantId, row.settings);
}

function activePresetLabels(presets: WebStaffPositionPresetDto[]): string[] {
  return [...new Set(presets.filter((p) => p.is_active).map((p) => p.label))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
}

export async function listWebPanelStaffFilterOptions(tenantId: number): Promise<{
  branches: string[];
  positions: string[];
  /** Tenant bo‘yicha saqlangan lavozim nomlari (shablonlar) */
  position_presets: string[];
}> {
  const [rows, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenant_id: tenantId, role: { in: [...WEB_PANEL_STAFF_ROLES] } },
      select: { branch: true, position: true }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true }
    })
  ]);
  const presetRows =
    tenant != null
      ? await resolveWebStaffPresetsFromSettings(tenant.id, tenant.settings)
      : [];
  const presetLabelActive = activePresetLabels(presetRows);
  const branches = new Set<string>();
  const positions = new Set<string>();
  for (const p of presetLabelActive) positions.add(p);
  for (const r of rows) {
    if (r.branch?.trim()) branches.add(r.branch.trim());
    if (r.position?.trim()) positions.add(r.position.trim());
  }
  const sort = (a: string, b: string) => a.localeCompare(b, "ru");
  const positionsArr = [...positions].sort(sort);
  return {
    branches: [...branches].sort(sort),
    positions: positionsArr,
    /** Faqat faol shablonlar nomi (formalar / filtr datalist) */
    position_presets: presetLabelActive
  };
}

export async function listWebStaffPositionPresetsAdmin(tenantId: number): Promise<WebStaffPositionPresetAdminDto[]> {
  const presets = await loadWebStaffPositionPresets(tenantId);
  return enrichPresetsWithUserLabels(tenantId, presets);
}

export async function listWebStaffPositionPresetHistory(tenantId: number, presetId: string) {
  const id = presetId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("BAD_PRESET_ID");
  }
  return listTenantAuditEvents(tenantId, {
    entity_type: WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY,
    entity_id: id,
    page: 1,
    limit: 200
  });
}

export async function createWebStaffPositionPreset(
  tenantId: number,
  label: string,
  actorUserId: number | null = null
): Promise<WebStaffPositionPresetAdminDto> {
  const trimmed = label.trim().slice(0, 128);
  if (!trimmed) throw new Error("BAD_LABEL");

  const presets = await loadWebStaffPositionPresets(tenantId);
  if (presets.length >= WEB_STAFF_PRESET_MAX) throw new Error("PRESET_LIMIT");

  const maxOrder = presets.reduce((m, p) => Math.max(m, p.sort_order), -1);
  const now = new Date().toISOString();
  const uid = actorUserId != null && Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const created: WebStaffPositionPresetDto = {
    id: randomUUID(),
    label: trimmed,
    is_active: true,
    sort_order: maxOrder + 1,
    created_at: now,
    created_by_user_id: uid,
    deactivated_at: null,
    deactivated_by_user_id: null
  };
  const next = [...presets, created].sort((a, b) => a.sort_order - b.sort_order);
  await persistWebStaffPositionPresets(tenantId, next, actorUserId, "create.web_staff_position_preset");

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY,
    entityId: created.id,
    action: "create",
    payload: { label: created.label }
  });

  const [enriched] = await enrichPresetsWithUserLabels(tenantId, [created]);
  if (!enriched) throw new Error("NOT_FOUND");
  return enriched;
}

export async function patchWebStaffPositionPreset(
  tenantId: number,
  presetId: string,
  input: { label?: string; is_active?: boolean },
  actorUserId: number | null = null
): Promise<WebStaffPositionPresetAdminDto> {
  const id = presetId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("BAD_PRESET_ID");
  }

  const presets = await loadWebStaffPositionPresets(tenantId);
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("NOT_FOUND");

  const cur = presets[idx]!;
  let label = cur.label;
  if (input.label !== undefined) {
    const t = input.label.trim().slice(0, 128);
    if (!t) throw new Error("BAD_LABEL");
    label = t;
  }
  const is_active = input.is_active !== undefined ? input.is_active : cur.is_active;

  const uid = actorUserId != null && Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
  let deactivated_at = cur.deactivated_at;
  let deactivated_by_user_id = cur.deactivated_by_user_id;
  if (is_active) {
    deactivated_at = null;
    deactivated_by_user_id = null;
  } else if (!cur.is_active) {
    /* no-op */
  } else {
    const now = new Date().toISOString();
    deactivated_at = now;
    deactivated_by_user_id = uid;
  }

  const updated: WebStaffPositionPresetDto = {
    ...cur,
    label,
    is_active,
    deactivated_at,
    deactivated_by_user_id
  };
  const next = [...presets];
  next[idx] = updated;
  await persistWebStaffPositionPresets(tenantId, next, actorUserId, "patch.web_staff_position_preset");

  if (input.label !== undefined && label !== cur.label) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY,
      entityId: id,
      action: "patch.label",
      payload: { from: cur.label, to: label }
    });
  }
  if (input.is_active === true && cur.is_active === false) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY,
      entityId: id,
      action: "reactivate",
      payload: { label }
    });
  }
  if (input.is_active === false && cur.is_active === true) {
    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: WEB_STAFF_POSITION_PRESET_AUDIT_ENTITY,
      entityId: id,
      action: "deactivate",
      payload: { label }
    });
  }

  const [enriched] = await enrichPresetsWithUserLabels(tenantId, [updated]);
  if (!enriched) throw new Error("NOT_FOUND");
  return enriched;
}

export async function bulkRevokeWebPanelStaffSessions(
  tenantId: number,
  userIds: number[],
  actorUserId: number | null = null
): Promise<void> {
  const uniq = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!uniq.length) throw new Error("EMPTY_IDS");

  const users = await prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      id: { in: uniq },
      role: { in: [...WEB_PANEL_STAFF_ROLES] }
    },
    select: { id: true }
  });
  if (users.length !== uniq.length) throw new Error("BAD_USER_IDS");

  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: {
      tenant_id: tenantId,
      user_id: { in: uniq },
      revoked_at: null
    },
    data: { revoked_at: now }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: "web_panel_bulk",
    action: "sessions.bulk_revoke",
    payload: { user_ids: uniq }
  });
}

export async function bulkPatchWebPanelStaffMaxSessions(
  tenantId: number,
  updates: { user_id: number; max_sessions: number }[],
  actorUserId: number | null = null
): Promise<void> {
  if (!updates.length) throw new Error("EMPTY_IDS");
  if (updates.length > 200) throw new Error("TOO_MANY_UPDATES");

  const byUser = new Map<number, number>();
  for (const u of updates) {
    if (!Number.isInteger(u.user_id) || u.user_id <= 0) throw new Error("BAD_USER_IDS");
    const n = u.max_sessions;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("BAD_MAX_SESSIONS");
    byUser.set(u.user_id, n);
  }
  const ids = [...byUser.keys()];

  const found = await prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      id: { in: ids },
      role: { in: [...WEB_PANEL_STAFF_ROLES] }
    },
    select: { id: true }
  });
  if (found.length !== ids.length) throw new Error("BAD_USER_IDS");

  await prisma.$transaction(
    ids.map((uid) =>
      prisma.user.update({
        where: { id: uid },
        data: { max_sessions: byUser.get(uid)! }
      })
    )
  );

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.user,
    entityId: "web_panel_bulk",
    action: "patch.operator_max_sessions_bulk",
    payload: { count: updates.length }
  });
}

export type PatchExpeditorInput = Omit<PatchAgentInput, "supervisor_user_id" | "agent_entitlements"> & {
  expeditor_assignment_rules?: ExpeditorAssignmentRules;
};

export async function patchExpeditor(
  tenantId: number,
  expeditorId: number,
  input: PatchExpeditorInput,
  actorUserId: number | null = null
): Promise<StaffRow> {
  const existing = await prisma.user.findFirst({
    where: { id: expeditorId, tenant_id: tenantId, role: "expeditor" }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  if (input.warehouse_id !== undefined && input.warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({ where: { id: input.warehouse_id, tenant_id: tenantId } });
    if (!wh) throw new Error("BAD_WAREHOUSE");
  }
  if (input.return_warehouse_id !== undefined && input.return_warehouse_id != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: input.return_warehouse_id, tenant_id: tenantId }
    });
    if (!wh) throw new Error("BAD_RETURN_WAREHOUSE");
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.first_name !== undefined) data.first_name = input.first_name.trim();
  if (input.last_name !== undefined) data.last_name = input.last_name?.trim() || null;
  if (input.middle_name !== undefined) data.middle_name = input.middle_name?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.product !== undefined) data.product = input.product?.trim() || null;
  if (input.agent_type !== undefined) data.agent_type = input.agent_type?.trim() || null;
  if (input.code !== undefined) data.code = input.code?.trim() || null;
  if (input.pinfl !== undefined) data.pinfl = input.pinfl?.trim() || null;
  if (input.consignment !== undefined) data.consignment = input.consignment;
  if (input.apk_version !== undefined) data.apk_version = input.apk_version?.trim() || null;
  if (input.device_name !== undefined) data.device_name = input.device_name?.trim() || null;
  if (input.can_authorize !== undefined) data.can_authorize = input.can_authorize;
  if (input.price_type !== undefined) data.price_type = input.price_type?.trim() || null;
  if (input.agent_price_types !== undefined) {
    const arr = [...new Set(input.agent_price_types.map((s) => s.trim()).filter(Boolean))];
    data.agent_price_types = arr;
  } else if (input.price_type !== undefined) {
    const single = input.price_type?.trim() || null;
    data.agent_price_types = single ? [single] : [];
  }
  if (input.warehouse_id !== undefined) {
    data.warehouse =
      input.warehouse_id == null ? { disconnect: true } : { connect: { id: input.warehouse_id } };
  }
  if (input.return_warehouse_id !== undefined) {
    data.return_warehouse =
      input.return_warehouse_id == null
        ? { disconnect: true }
        : { connect: { id: input.return_warehouse_id } };
  }
  if (input.trade_direction_id !== undefined || input.trade_direction !== undefined) {
    await applyTradeDirectionPatch(tenantId, input, data);
  }
  if (input.branch !== undefined) data.branch = input.branch?.trim() || null;
  if (input.position !== undefined) data.position = input.position?.trim() || null;
  if (input.app_access !== undefined) data.app_access = input.app_access;
  if (input.territory !== undefined) data.territory = input.territory?.trim() || null;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.max_sessions !== undefined) {
    const n = input.max_sessions;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("BAD_MAX_SESSIONS");
    data.max_sessions = n;
  }
  if (input.kpi_color !== undefined) data.kpi_color = input.kpi_color?.trim().slice(0, 16) || null;
  if (input.password !== undefined && input.password.trim().length > 0) {
    if (input.password.length < 6) throw new Error("BAD_PASSWORD");
    data.password_hash = await bcrypt.hash(input.password, 10);
  }

  if (input.expeditor_assignment_rules !== undefined) {
    await validateExpeditorAssignmentRules(tenantId, input.expeditor_assignment_rules);
    data.expeditor_assignment_rules = input.expeditor_assignment_rules as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length > 0) {
    if (input.first_name !== undefined || input.last_name !== undefined || input.middle_name !== undefined) {
      const first = input.first_name !== undefined ? input.first_name.trim() : existing.first_name ?? "";
      const last = input.last_name !== undefined ? input.last_name?.trim() || null : existing.last_name;
      const mid = input.middle_name !== undefined ? input.middle_name?.trim() || null : existing.middle_name;
      data.name = [last, first, mid].filter((x) => x && String(x).trim().length > 0).join(" ").trim() || existing.name;
    }

    await prisma.user.update({
      where: { id: expeditorId },
      data
    });

    await appendTenantAuditEvent({
      tenantId,
      actorUserId,
      entityType: AuditEntityType.user,
      entityId: expeditorId,
      action: "patch.expeditor",
      payload: { keys: Object.keys(data).filter((k) => k !== "password_hash") }
    });
  }

  const rows = await listStaff(tenantId, "expeditor");
  const row = rows.find((x) => x.id === expeditorId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
