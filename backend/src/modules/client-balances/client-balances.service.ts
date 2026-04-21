import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ORDER_STATUSES_OUTSTANDING_RECEIVABLE } from "../orders/order-status";
import {
  paymentTypesFromMethodEntries,
  resolveCurrencyEntries,
  resolvePaymentMethodEntries,
  resolvePaymentMethodRefToLabel,
  type PaymentMethodEntryDto
} from "../tenant-settings/finance-refs";

export type ClientBalanceViewMode = "clients" | "agents" | "clients_delivery";

export type ClientBalanceListQuery = {
  view: ClientBalanceViewMode;
  page: number;
  limit: number;
  /** Jadval sort ustuni (masalan `balance`, `pay:Naqd`) */
  sort_by?: string;
  /** Sort yo‘nalishi */
  sort_dir?: "asc" | "desc";
  /** Excel / to‘liq eksport — limit yuqori chegarasi */
  allow_large_export?: boolean;
  search?: string;
  agent_id?: number;
  expeditor_user_id?: number;
  supervisor_user_id?: number;
  trade_direction?: string;
  category?: string;
  /** all | active | inactive */
  status?: string;
  /** all | debt | credit */
  balance_filter?: string;
  /** all | regular | consignment — agent.consignment */
  agent_consignment?: string;
  territory_region?: string;
  territory_city?: string;
  territory_district?: string;
  territory_zone?: string;
  territory_neighborhood?: string;
  /** YYYY-MM-DD — balans harakatlari bo‘yicha shu sanagacha (UTC kun oxiri) yig‘indi */
  balance_as_of?: string;
  /** Konsignatsiya / litsenziya muddati (client.license_until) oralig‘i */
  consignment_due_from?: string;
  consignment_due_to?: string;
  /** Agent `User.branch` (filial) */
  agent_branch?: string;
  /** Bir nechta filial (konsignatsiya hisoboti) */
  agent_branches?: string[];
  /** Mijozda shu turdagi kirim to‘lovi bo‘lganlar */
  agent_payment_type?: string;
  /** Konsignatsiya zakazlari: `orders.created_at` oralig‘i (YYYY-MM-DD) */
  order_date_from?: string;
  order_date_to?: string;
  /** «По доставке»: bitta zakaz ID bo‘yicha filtr */
  delivery_order_id?: number;
};

/** KPI и колонки таблицы: способ оплаты из справочника тенанта → сумма по payment_type */
export type ClientBalancePaymentTypeSummary = {
  label: string;
  amount: string;
};

export type ClientBalanceRow = {
  client_id: number;
  client_code: string | null;
  name: string;
  is_active: boolean;
  legal_name: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  agent_tags: string[];
  supervisor_name: string | null;
  trade_direction: string | null;
  inn: string | null;
  phone: string | null;
  license_until: string | null;
  days_overdue: number | null;
  last_order_at: string | null;
  last_payment_at: string | null;
  days_since_payment: number | null;
  balance: string;
  /** Столбцы как в KPI: только справочник «способы оплаты» тенанта, тот же порядок что summary.payment_by_type */
  payment_amounts: ClientBalancePaymentTypeSummary[];
  /** «По доставке»: bir qator = bitta zakaz */
  delivery_order_id?: number | null;
  delivery_order_number?: string | null;
  /** `delivery_order_id` bilan bir xil (JSON/klientlar uchun qo‘shimcha kalit) */
  order_id?: number | null;
};

export type AgentBalanceRow = {
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  clients_count: number;
  balance: string;
  payment_amounts: ClientBalancePaymentTypeSummary[];
};

export type ClientBalanceListResponse = {
  view: ClientBalanceViewMode;
  data: ClientBalanceRow[] | AgentBalanceRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    balance: string;
    payment_by_type: ClientBalancePaymentTypeSummary[];
  };
};

export type ClientBalanceTerritoryOptions = {
  regions: string[];
  cities: string[];
  districts: string[];
  zones: string[];
  neighborhoods: string[];
  branches: string[];
};

function parseIsoDateStartUtc(iso: string): Date | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

export function parseIsoDateEndUtc(iso: string): Date | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
}

/** `orders.created_at` — kalendari `Asia/Tashkent` bo‘yicha (konsignatsiya / «дата заказа» filtri). */
const ORDER_CREATED_UTC_OFFSET_HOURS = 5; // Asia/Tashkent (UTC+5)
const LARGE_CLIENT_IDS_CHUNK = 10000;
const BALANCE_PERF_LOG = process.env.BALANCE_PERF_LOG === "1";

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function localDateStartToUtc(ymd: string): Date | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  const ms = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0, 0) - ORDER_CREATED_UTC_OFFSET_HOURS * 3600 * 1000;
  return new Date(ms);
}

function localDateEndToUtc(ymd: string): Date | null {
  const start = localDateStartToUtc(ymd);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 3600 * 1000 - 1);
}

function makePerfMarker(scope: string) {
  const startedAt = Date.now();
  let last = startedAt;
  return (stage: string, meta?: Record<string, unknown>) => {
    if (!BALANCE_PERF_LOG) return;
    const now = Date.now();
    const deltaMs = now - last;
    last = now;
    const totalMs = now - startedAt;
    console.info(
      `[perf][${scope}] ${stage} | +${deltaMs}ms (total ${totalMs}ms)${
        meta ? ` | ${JSON.stringify(meta)}` : ""
      }`
    );
  };
}

export function buildOrderCreatedLocalDateClause(
  orderDateFrom: string | null | undefined,
  orderDateTo: string | null | undefined
): Prisma.Sql {
  const from = orderDateFrom?.trim();
  const to = orderDateTo?.trim();
  const fromUtc = from ? localDateStartToUtc(from) : null;
  const toUtc = to ? localDateEndToUtc(to) : null;
  if (!fromUtc && !toUtc) return Prisma.empty;
  if (fromUtc && toUtc) {
    return Prisma.sql`AND o.created_at >= ${fromUtc} AND o.created_at <= ${toUtc}`;
  }
  if (fromUtc) {
    return Prisma.sql`AND o.created_at >= ${fromUtc}`;
  }
  return Prisma.sql`AND o.created_at <= ${toUtc}`;
}

export function buildClientWhere(
  tenantId: number,
  q: ClientBalanceListQuery,
  opts?: { skipBalanceFilter?: boolean; skipTerritoryFilters?: boolean }
): Prisma.ClientWhereInput {
  const andParts: Prisma.ClientWhereInput[] = [
    { tenant_id: tenantId },
    { merged_into_client_id: null }
  ];

  const st = q.status?.trim();
  if (st === "active") andParts.push({ is_active: true });
  else if (st === "inactive") {
    andParts.push({ is_active: false });
    andParts.push({
      OR: [
        { client_balances: { some: { balance: { lt: 0 } } } },
        { client_balances: { some: { balance: { gt: 0 } } } }
      ]
    });
  }

  if (q.agent_id != null && q.agent_id > 0) {
    andParts.push({ agent_id: q.agent_id });
  }

  if (q.expeditor_user_id != null && q.expeditor_user_id > 0) {
    const ex = q.expeditor_user_id;
    andParts.push({
      OR: [
        { orders: { some: { expeditor_user_id: ex } } },
        { payments: { some: { expeditor_user_id: ex } } }
      ]
    });
  }

  if (q.supervisor_user_id != null && q.supervisor_user_id > 0) {
    andParts.push({ agent: { supervisor_user_id: q.supervisor_user_id } });
  }

  const td = q.trade_direction?.trim();
  if (td) {
    andParts.push({
      agent: {
        OR: [
          { trade_direction: { contains: td, mode: "insensitive" } },
          { trade_direction_row: { name: { contains: td, mode: "insensitive" } } }
        ]
      }
    });
  }

  const cat = q.category?.trim();
  if (cat) {
    andParts.push({ category: { contains: cat, mode: "insensitive" } });
  }

  const ac = q.agent_consignment?.trim();
  if (ac === "consignment") andParts.push({ agent: { consignment: true } });
  else if (ac === "regular") andParts.push({ agent: { consignment: false } });

  const brs = q.agent_branches?.filter((b) => b.trim() !== "") ?? [];
  if (brs.length > 0) {
    andParts.push({ agent: { branch: { in: brs } } });
  } else {
    const br = q.agent_branch?.trim();
    if (br) {
      andParts.push({ agent: { branch: br } });
    }
  }

  const cFrom = q.consignment_due_from?.trim() ? parseIsoDateStartUtc(q.consignment_due_from) : null;
  const cTo = q.consignment_due_to?.trim() ? parseIsoDateEndUtc(q.consignment_due_to) : null;
  if (cFrom && cTo) {
    andParts.push({ license_until: { gte: cFrom, lte: cTo } });
  } else if (cFrom) {
    andParts.push({ license_until: { gte: cFrom } });
  } else if (cTo) {
    andParts.push({ license_until: { lte: cTo } });
  }

  if (!opts?.skipTerritoryFilters) {
    if (q.territory_region?.trim()) {
      andParts.push({ region: { contains: q.territory_region.trim(), mode: "insensitive" } });
    }
    if (q.territory_city?.trim()) {
      andParts.push({ city: { contains: q.territory_city.trim(), mode: "insensitive" } });
    }
    if (q.territory_district?.trim()) {
      andParts.push({ district: { contains: q.territory_district.trim(), mode: "insensitive" } });
    }
    if (q.territory_zone?.trim()) {
      andParts.push({ zone: { contains: q.territory_zone.trim(), mode: "insensitive" } });
    }
    if (q.territory_neighborhood?.trim()) {
      andParts.push({ neighborhood: { contains: q.territory_neighborhood.trim(), mode: "insensitive" } });
    }
  }

  const pt = q.agent_payment_type?.trim();
  if (pt) {
    andParts.push({
      payments: { some: { entry_kind: "payment", payment_type: pt } }
    });
  }

  if (!opts?.skipBalanceFilter) {
    const bf = q.balance_filter?.trim();
    if (bf === "debt") {
      andParts.push({ client_balances: { some: { balance: { lt: 0 } } } });
    } else if (bf === "credit") {
      andParts.push({ client_balances: { some: { balance: { gt: 0 } } } });
    }
  }

  const s = q.search?.trim();
  if (s) {
    andParts.push({
      OR: [
        { name: { contains: s, mode: "insensitive" } },
        { phone: { contains: s, mode: "insensitive" } },
        { client_code: { contains: s, mode: "insensitive" } },
        { inn: { contains: s, mode: "insensitive" } }
      ]
    });
  }

  return { AND: andParts };
}

/** Kassir / tizim tasdiqlamagan kirimlar qarzni yopgan hisoblanmaydi (`workflow_status`). */
const PAYMENT_COUNTS_FOR_RECEIVABLE_NET = Prisma.sql`AND COALESCE(p.workflow_status, 'confirmed') <> 'pending_confirmation'`;

const agentInclude = {
  select: {
    id: true,
    name: true,
    code: true,
    consignment: true,
    trade_direction: true,
    supervisor_user_id: true,
    supervisor: { select: { name: true } },
    trade_direction_row: { select: { name: true } }
  }
} as const;

/**
 * client_id → (normPayTypeKey → net).
 * `client_payments.payment_type` saqlanishi kod (masalan `cash`) yoki nom bo‘lishi mumkin;
 * spravochnik ustunlari esa `payment_method_entries[].name` — ikkalasini ham katalog nomiga map qilamiz.
 */
export async function loadPaymentNetNormByClient(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date | null,
  entries: PaymentMethodEntryDto[]
): Promise<Map<number, Map<string, Prisma.Decimal>>> {
  const map = new Map<number, Map<string, Prisma.Decimal>>();
  if (clientIds.length === 0) return map;

  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const dateClause = asOfEnd
      ? Prisma.sql`AND COALESCE(p.paid_at, p.created_at) <= ${asOfEnd}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<
      Array<{ client_id: number; payment_type: string; net: Prisma.Decimal }>
    >`
      SELECT p.client_id, p.payment_type,
        SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount
                 WHEN p.entry_kind = 'client_expense' THEN -p.amount
                 ELSE 0 END)::decimal(15,2) AS net
      FROM client_payments p
      WHERE p.tenant_id = ${tenantId}
        AND p.client_id IN (${Prisma.join(chunk)})
        AND p.deleted_at IS NULL
        ${PAYMENT_COUNTS_FOR_RECEIVABLE_NET}
        ${dateClause}
      GROUP BY p.client_id, p.payment_type
    `;
    for (const r of rows) {
      const cid = sqlIntIdToNumber(r.client_id);
      if (!Number.isFinite(cid)) continue;
      const resolved =
        resolvePaymentMethodRefToLabel(r.payment_type, entries) ?? (r.payment_type ?? "").trim();
      const nk = normPayTypeKey(resolved);
      let inner = map.get(cid);
      if (!inner) {
        inner = new Map();
        map.set(cid, inner);
      }
      const cur = inner.get(nk) ?? new Prisma.Decimal(0);
      inner.set(nk, cur.add(r.net));
    }
  }
  return map;
}

function paymentAmountsForSpravochnik(
  sprLabels: string[],
  netNorm: Map<string, Prisma.Decimal> | undefined
): ClientBalancePaymentTypeSummary[] {
  if (sprLabels.length === 0) return [];
  const m = netNorm ?? new Map<string, Prisma.Decimal>();
  return sprLabels.map((l) => {
    const nk = normPayTypeKey(l);
    const amt = m.get(nk) ?? new Prisma.Decimal(0);
    return { label: l.trim(), amount: amt.toString() };
  });
}

/** Sozlamalar → to‘lov usullari (nomlar + katalog `payment_method_ref` bilan moslash uchun). */
export async function loadTenantPaymentRefs(tenantId: number): Promise<{
  labels: string[];
  entries: PaymentMethodEntryDto[];
}> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const settings = row?.settings as Record<string, unknown> | null | undefined;
  const ref = settings?.references as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== "object") {
    return { labels: [], entries: [] };
  }
  const currency_entries = resolveCurrencyEntries(ref);
  const methods = resolvePaymentMethodEntries(ref, currency_entries);
  return {
    labels: paymentTypesFromMethodEntries(methods),
    entries: methods
  };
}

async function loadTenantPaymentTypeLabels(tenantId: number): Promise<string[]> {
  const { labels } = await loadTenantPaymentRefs(tenantId);
  return labels;
}

/**
 * Yetkazilgan, yopilmagan zakazlar: `orders.payment_method_ref` bo‘yicha qoldiq (mijoz bo‘yicha).
 * `consignmentOnly` — konsignatsiya filtri (konsignatsiya hisoboti).
 */
export async function loadUnpaidOrderBalanceRawByPaymentRef(
  tenantId: number,
  clientIds: number[],
  orderDateFrom: string | null | undefined,
  orderDateTo: string | null | undefined,
  opts?: { consignmentOnly?: boolean }
): Promise<Array<{ client_id: number; pref_raw: string | null; sum_unpaid: Prisma.Decimal }>> {
  if (clientIds.length === 0) return [];
  const orderDateClause = buildOrderCreatedLocalDateClause(orderDateFrom ?? null, orderDateTo ?? null);
  const consignmentClause =
    opts?.consignmentOnly === true
      ? Prisma.sql`AND (
          o.is_consignment = true
          OR EXISTS (
            SELECT 1 FROM users ag
            WHERE ag.id = o.agent_id AND ag.tenant_id = o.tenant_id AND ag.consignment = true
          )
        )`
      : Prisma.empty;

  const out: Array<{ client_id: number; pref_raw: string | null; sum_unpaid: Prisma.Decimal }> = [];
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<
      Array<{
        client_id: number;
        pref_raw: string | null;
        sum_unpaid: Prisma.Decimal;
      }>
    >`
      WITH cand AS (
        SELECT o.id, o.client_id, o.total_sum, o.payment_method_ref
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
          AND o.client_id IN (${Prisma.join(chunk)})
          ${orderDateClause}
          ${consignmentClause}
      ),
      alloc AS (
        SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS allocated
        FROM payment_allocations pa
        WHERE pa.tenant_id = ${tenantId}
          AND pa.order_id IN (SELECT id FROM cand)
        GROUP BY pa.order_id
      ),
      joined AS (
        SELECT
          c.client_id,
          NULLIF(TRIM(COALESCE(c.payment_method_ref, '')), '') AS pref_raw,
          GREATEST(c.total_sum - COALESCE(a.allocated, 0), 0)::decimal(15,2) AS unpaid
        FROM cand c
        LEFT JOIN alloc a ON a.order_id = c.id
      )
      SELECT client_id, pref_raw,
        SUM(unpaid)::decimal(15,2) AS sum_unpaid
      FROM joined
      WHERE unpaid > 0
      GROUP BY client_id, pref_raw
    `;
    out.push(...rows);
  }
  return out;
}

/** Agent bo‘yicha yopilmagan yetkazilgan zakazlar (filtrlangan mijozlar orasida). */
async function loadUnpaidOrderBalanceRawByAgentPaymentRef(
  tenantId: number,
  clientIds: number[],
  orderDateFrom: string | null | undefined,
  orderDateTo: string | null | undefined
): Promise<Array<{ agent_id: number | null; pref_raw: string | null; sum_unpaid: Prisma.Decimal }>> {
  if (clientIds.length === 0) return [];
  const orderDateClause = buildOrderCreatedLocalDateClause(orderDateFrom ?? null, orderDateTo ?? null);
  const out: Array<{ agent_id: number | null; pref_raw: string | null; sum_unpaid: Prisma.Decimal }> = [];
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<
      Array<{
        agent_id: number | null;
        pref_raw: string | null;
        sum_unpaid: Prisma.Decimal;
      }>
    >`
      WITH cand AS (
        SELECT o.id, o.agent_id, o.total_sum, o.payment_method_ref
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
          AND o.client_id IN (${Prisma.join(chunk)})
          ${orderDateClause}
      ),
      alloc AS (
        SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS allocated
        FROM payment_allocations pa
        WHERE pa.tenant_id = ${tenantId}
          AND pa.order_id IN (SELECT id FROM cand)
        GROUP BY pa.order_id
      ),
      joined AS (
        SELECT
          c.agent_id,
          NULLIF(TRIM(COALESCE(c.payment_method_ref, '')), '') AS pref_raw,
          GREATEST(c.total_sum - COALESCE(a.allocated, 0), 0)::decimal(15,2) AS unpaid
        FROM cand c
        LEFT JOIN alloc a ON a.order_id = c.id
      )
      SELECT agent_id, pref_raw,
        SUM(unpaid)::decimal(15,2) AS sum_unpaid
      FROM joined
      WHERE unpaid > 0
      GROUP BY agent_id, pref_raw
    `;
    out.push(...rows);
  }
  return out;
}

export function processUnpaidPayRefRows(
  rows: Array<{ client_id: number; pref_raw: string | null; sum_unpaid: Prisma.Decimal }>,
  entries: PaymentMethodEntryDto[],
  sprLabels: string[]
): {
  byClient: Map<number, Map<string, Prisma.Decimal>>;
  globalUnpaidNorm: Map<string, Prisma.Decimal>;
} {
  const firstNk = sprLabels.length > 0 ? normPayTypeKey(sprLabels[0]) : "";
  const byClient = new Map<number, Map<string, Prisma.Decimal>>();
  const globalUnpaidNorm = new Map<string, Prisma.Decimal>();

  const bump = (m: Map<string, Prisma.Decimal>, nk: string, v: Prisma.Decimal) => {
    m.set(nk, (m.get(nk) ?? new Prisma.Decimal(0)).add(v));
  };

  for (const r of rows) {
    if (sprLabels.length === 0) continue;
    const cid = sqlIntIdToNumber(r.client_id);
    if (!Number.isFinite(cid)) continue;
    const label = resolvePaymentMethodRefToLabel(r.pref_raw, entries);
    const rawNk = label ? normPayTypeKey(label) : firstNk;
    if (!label && !firstNk) continue;
    const nk = sprNormKeyForBuckets(rawNk, sprLabels);

    let inner = byClient.get(cid);
    if (!inner) {
      inner = new Map();
      byClient.set(cid, inner);
    }
    bump(inner, nk, r.sum_unpaid);
    bump(globalUnpaidNorm, nk, r.sum_unpaid);
  }
  return { byClient, globalUnpaidNorm };
}

function processUnpaidAgentPayRefRows(
  rows: Array<{ agent_id: number | null; pref_raw: string | null; sum_unpaid: Prisma.Decimal }>,
  entries: PaymentMethodEntryDto[],
  sprLabels: string[]
): Map<number | null, Map<string, Prisma.Decimal>> {
  const firstNk = sprLabels.length > 0 ? normPayTypeKey(sprLabels[0]) : "";
  const byAgent = new Map<number | null, Map<string, Prisma.Decimal>>();
  const bump = (m: Map<string, Prisma.Decimal>, nk: string, v: Prisma.Decimal) => {
    m.set(nk, (m.get(nk) ?? new Prisma.Decimal(0)).add(v));
  };
  for (const r of rows) {
    if (sprLabels.length === 0) continue;
    const label = resolvePaymentMethodRefToLabel(r.pref_raw, entries);
    const rawNk = label ? normPayTypeKey(label) : firstNk;
    if (!label && !firstNk) continue;
    const nk = sprNormKeyForBuckets(rawNk, sprLabels);
    const aid =
      r.agent_id == null ? null : (() => {
        const n = sqlIntIdToNumber(r.agent_id);
        return Number.isFinite(n) ? n : null;
      })();
    let inner = byAgent.get(aid);
    if (!inner) {
      inner = new Map();
      byAgent.set(aid, inner);
    }
    bump(inner, nk, r.sum_unpaid);
  }
  return byAgent;
}

/** Kirim (`client_payments`) − yopilmagan zakazlar bo‘yicha shu usulga «tushadigan» qarz. */
export function paymentAmountsNetMinusUnpaid(
  sprLabels: string[],
  netNorm: Map<string, Prisma.Decimal> | undefined,
  unpaidNorm: Map<string, Prisma.Decimal> | undefined
): ClientBalancePaymentTypeSummary[] {
  if (sprLabels.length === 0) return [];
  const net = foldPaymentBucketMap(sprLabels, netNorm);
  const u = foldPaymentBucketMap(sprLabels, unpaidNorm);
  return sprLabels.map((l) => {
    const nk = normPayTypeKey(l);
    const a = net.get(nk) ?? new Prisma.Decimal(0);
    const b = u.get(nk) ?? new Prisma.Decimal(0);
    return { label: l.trim(), amount: a.sub(b).toString() };
  });
}

export function buildSummaryNetMinusUnpaid(
  sprLabels: string[],
  netByExactType: Map<string, Prisma.Decimal>,
  unpaidGlobalNorm: Map<string, Prisma.Decimal>
): ClientBalancePaymentTypeSummary[] {
  const netNorm = new Map<string, Prisma.Decimal>();
  for (const [k, v] of netByExactType) {
    const nk = normPayTypeKey(k);
    netNorm.set(nk, (netNorm.get(nk) ?? new Prisma.Decimal(0)).add(v));
  }
  return paymentAmountsNetMinusUnpaid(sprLabels, netNorm, unpaidGlobalNorm);
}

/** «По доставке»: bitta zakaz — qarzni faqat zakazning to‘lov usuli ustunida (manfiy). */
function paymentAmountsForOrderDebtByMethod(
  sprLabels: string[],
  entries: PaymentMethodEntryDto[],
  paymentRefRaw: string | null | undefined,
  orderUnpaid: Prisma.Decimal
): ClientBalancePaymentTypeSummary[] {
  if (sprLabels.length === 0) return [];
  const label = resolvePaymentMethodRefToLabel(paymentRefRaw, entries);
  let rawNk = label ? normPayTypeKey(label) : "";
  if (!rawNk) rawNk = normPayTypeKey(sprLabels[0]);
  const targetNk = sprNormKeyForBuckets(rawNk, sprLabels);
  return sprLabels.map((l) => {
    const nk = normPayTypeKey(l);
    const amt = nk === targetNk ? orderUnpaid.neg() : new Prisma.Decimal(0);
    return { label: l.trim(), amount: amt.toString() };
  });
}

function normPayTypeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function readSortDir(q: ClientBalanceListQuery): 1 | -1 {
  return q.sort_dir === "desc" ? -1 : 1;
}

function moneySortValueFromPaymentAmounts(
  amounts: ClientBalancePaymentTypeSummary[] | undefined,
  sortBy: string,
  sprLabels: string[]
): number {
  if (!sortBy.startsWith("pay:")) return 0;
  if (!amounts || amounts.length === 0) return 0;
  const wanted = normPayTypeKey(sortBy.slice(4));
  const idxByLabel = sprLabels.findIndex((x) => normPayTypeKey(x) === wanted);
  if (idxByLabel >= 0 && idxByLabel < amounts.length) {
    const v = Number(amounts[idxByLabel]?.amount ?? "0");
    return Number.isFinite(v) ? v : 0;
  }
  const hit = amounts.find((x) => normPayTypeKey(x.label) === wanted);
  const v = Number(hit?.amount ?? "0");
  return Number.isFinite(v) ? v : 0;
}

function compareNumForSort(a: number, b: number, dir: 1 | -1): number {
  return (a - b) * dir;
}

/**
 * `$queryRaw` / `pg` ba'zan INTEGER ustunini `bigint` qaytaradi; `Map<number, …>` kaliti bilan
 * Prisma `c.id` (`number`) mos kelmasa — qator bo‘yicha yig‘indilar yo‘qoladi, svodka esa global mapda qoladi.
 */
export function sqlIntIdToNumber(raw: unknown): number {
  if (raw == null) return NaN;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/** Spravochnik ustunlaridan biriga tushmasa — birinchi ustunga (legacy / notanish ref). */
function sprNormKeyForBuckets(nk: string, sprLabels: string[]): string {
  if (sprLabels.length === 0) return nk;
  const firstNk = normPayTypeKey(sprLabels[0]);
  const t = nk.trim() ? normPayTypeKey(nk) : firstNk;
  const ok = sprLabels.some((l) => normPayTypeKey(l) === t);
  return ok ? t : firstNk;
}

function foldPaymentBucketMap(
  sprLabels: string[],
  src: Map<string, Prisma.Decimal> | undefined
): Map<string, Prisma.Decimal> {
  if (sprLabels.length === 0) return src ?? new Map();
  const out = new Map<string, Prisma.Decimal>();
  const m = src ?? new Map();
  for (const [k, v] of m) {
    const dest = sprNormKeyForBuckets(k, sprLabels);
    out.set(dest, (out.get(dest) ?? new Prisma.Decimal(0)).add(v));
  }
  return out;
}

/**
 * Filtrlangan mijozlar bo‘yicha `payment_type` bo‘yicha yig‘indi.
 * Kalitlar — katalogdagi ko‘rinadigan nom (`payment_method_entries[].name`), kod/id bilan moslashadi.
 */
export async function loadPaymentNetTotalsByTypeGlobally(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date | null,
  entries: PaymentMethodEntryDto[]
): Promise<Map<string, Prisma.Decimal>> {
  const merged = new Map<string, Prisma.Decimal>();
  if (clientIds.length === 0) return merged;
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const dateClause = asOfEnd
      ? Prisma.sql`AND COALESCE(p.paid_at, p.created_at) <= ${asOfEnd}`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ payment_type: string; net: Prisma.Decimal }>>`
      SELECT p.payment_type,
        SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount
                 WHEN p.entry_kind = 'client_expense' THEN -p.amount
                 ELSE 0 END)::decimal(15,2) AS net
      FROM client_payments p
      WHERE p.tenant_id = ${tenantId}
        AND p.client_id IN (${Prisma.join(chunk)})
        AND p.deleted_at IS NULL
        ${PAYMENT_COUNTS_FOR_RECEIVABLE_NET}
        ${dateClause}
      GROUP BY p.payment_type
    `;
    for (const r of rows) {
      const rawKey = (r.payment_type ?? "").trim();
      const catalogKey = resolvePaymentMethodRefToLabel(r.payment_type, entries) ?? rawKey;
      const cur = merged.get(catalogKey) ?? new Prisma.Decimal(0);
      merged.set(catalogKey, cur.add(r.net));
    }
  }
  return merged;
}

function buildSummaryPaymentByType(
  spravochnikLabels: string[],
  netByExactType: Map<string, Prisma.Decimal>
): ClientBalancePaymentTypeSummary[] {
  const netNorm = new Map<string, Prisma.Decimal>();
  for (const [k, v] of netByExactType) {
    const nk = normPayTypeKey(k);
    const prev = netNorm.get(nk) ?? new Prisma.Decimal(0);
    netNorm.set(nk, prev.add(v));
  }

  /** Только справочник тенанта: без автодобавления типов из оплат (лишние карточки не нужны). */
  if (spravochnikLabels.length === 0) {
    return [];
  }

  const out: ClientBalancePaymentTypeSummary[] = [];
  for (const l of spravochnikLabels) {
    const nk = normPayTypeKey(l);
    const amt = netNorm.get(nk) ?? new Prisma.Decimal(0);
    out.push({ label: l.trim(), amount: amt.toString() });
  }
  return out;
}

async function loadBalancesAsOf(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date
): Promise<Map<number, Prisma.Decimal>> {
  const out = new Map<number, Prisma.Decimal>();
  if (clientIds.length === 0) return out;
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<Array<{ client_id: number; bal: Prisma.Decimal | null }>>`
      SELECT cb.client_id,
        COALESCE(SUM(cbm.delta), 0)::decimal(15,2) AS bal
      FROM client_balances cb
      LEFT JOIN client_balance_movements cbm
        ON cbm.client_balance_id = cb.id AND cbm.created_at <= ${asOfEnd}
      WHERE cb.tenant_id = ${tenantId}
        AND cb.client_id IN (${Prisma.join(chunk)})
      GROUP BY cb.client_id
    `;
    for (const r of rows) {
      const cid = sqlIntIdToNumber(r.client_id);
      if (!Number.isFinite(cid)) continue;
      out.set(cid, r.bal ?? new Prisma.Decimal(0));
    }
  }
  return out;
}

async function loadLastPaymentByClient(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date | null
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  if (clientIds.length === 0) return out;
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const dateClause = asOfEnd
      ? Prisma.sql`AND COALESCE(paid_at, created_at) <= ${asOfEnd}`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ client_id: number; lp: Date | null }>>`
      SELECT client_id,
        MAX(COALESCE(paid_at, created_at)) AS lp
      FROM client_payments
      WHERE tenant_id = ${tenantId}
        AND entry_kind = 'payment'
        AND deleted_at IS NULL
        AND client_id IN (${Prisma.join(chunk)})
        ${dateClause}
      GROUP BY client_id
    `;
    for (const r of rows) {
      if (r.lp) {
        const cid = sqlIntIdToNumber(r.client_id);
        if (Number.isFinite(cid)) out.set(cid, r.lp);
      }
    }
  }
  return out;
}

async function loadLastDeliveryByClient(
  tenantId: number,
  clientIds: number[]
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  if (clientIds.length === 0) return out;
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<Array<{ client_id: number; lu: Date | null }>>`
      SELECT o.client_id,
        MAX(COALESCE(
          (SELECT MIN(sl.created_at) FROM order_status_logs sl
           WHERE sl.order_id = o.id AND sl.to_status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})),
          o.updated_at
        )) AS lu
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.status <> 'cancelled'
        AND o.order_type = 'order'
        AND o.client_id IN (${Prisma.join(chunk)})
      GROUP BY o.client_id
    `;
    for (const r of rows) {
      if (r.lu) {
        const cid = sqlIntIdToNumber(r.client_id);
        if (Number.isFinite(cid)) out.set(cid, r.lu);
      }
    }
  }
  return out;
}

export type DeliveryDebtInfo = { debt: Prisma.Decimal; lastDel: Date | null; firstDel: Date | null };

/** Yetkazilgan savdo zakazlari bo‘yicha to‘lanmagan qoldiq (mijoz bo‘yicha). */
export async function loadDeliveryDebtByClient(
  tenantId: number,
  clientIds: number[],
  orderDateFrom?: string | null,
  orderDateTo?: string | null
): Promise<Map<number, DeliveryDebtInfo>> {
  const map = new Map<number, DeliveryDebtInfo>();
  if (clientIds.length === 0) return map;
  const orderDateClause = buildOrderCreatedLocalDateClause(orderDateFrom ?? null, orderDateTo ?? null);
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<
      Array<{
        client_id: number;
        gross_unpaid: Prisma.Decimal;
        last_unpaid_delivery: Date | null;
        first_unpaid_delivery: Date | null;
      }>
    >`
      WITH cand AS (
        SELECT o.id, o.client_id, o.total_sum, o.updated_at
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
          AND o.client_id IN (${Prisma.join(chunk)})
          ${orderDateClause}
      ),
      alloc AS (
        SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS allocated
        FROM payment_allocations pa
        WHERE pa.tenant_id = ${tenantId}
          AND pa.order_id IN (SELECT id FROM cand)
        GROUP BY pa.order_id
      ),
      delivered AS (
        SELECT sl.order_id, MIN(sl.created_at) AS delivered_at
        FROM order_status_logs sl
        WHERE sl.order_id IN (SELECT id FROM cand)
          AND sl.to_status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
        GROUP BY sl.order_id
      ),
      ord AS (
        SELECT
          c.client_id,
          c.total_sum,
          COALESCE(d.delivered_at, c.updated_at) AS delivered_at,
          COALESCE(a.allocated, 0)::decimal(15,2) AS allocated
        FROM cand c
        LEFT JOIN alloc a ON a.order_id = c.id
        LEFT JOIN delivered d ON d.order_id = c.id
      ),
      agg AS (
        SELECT
          client_id,
          SUM(GREATEST(total_sum - allocated, 0))::decimal(15,2) AS gross_unpaid,
          MAX(delivered_at) FILTER (WHERE (total_sum - allocated) > 0) AS last_unpaid_delivery,
          MIN(delivered_at) FILTER (WHERE (total_sum - allocated) > 0) AS first_unpaid_delivery
        FROM ord
        GROUP BY client_id
      )
      SELECT client_id, gross_unpaid, last_unpaid_delivery, first_unpaid_delivery
      FROM agg
      WHERE gross_unpaid > 0
    `;
    for (const r of rows) {
      const cid = sqlIntIdToNumber(r.client_id);
      if (!Number.isFinite(cid)) continue;
      map.set(cid, {
        debt: r.gross_unpaid,
        lastDel: r.last_unpaid_delivery,
        firstDel: r.first_unpaid_delivery
      });
    }
  }
  return map;
}

/** Yetkazilgan zakazlar bo‘yicha to‘lanmagan va ledger — eng “yomon” balans (minimal qiymat). */
export function mergeLedgerWithUnpaidDelivered(
  ledger: Prisma.Decimal,
  unpaidDelivered: DeliveryDebtInfo | undefined
): Prisma.Decimal {
  if (!unpaidDelivered || unpaidDelivered.debt.lte(0)) return ledger;
  const fromOrders = unpaidDelivered.debt.neg();
  return fromOrders.cmp(ledger) < 0 ? fromOrders : ledger;
}

type UnpaidDeliveredOrderRow = {
  order_id: number;
  order_number: string;
  client_id: number;
  unpaid: Prisma.Decimal;
  delivered_at: Date | null;
  payment_method_ref: string | null;
};

/** «По доставке»: har bir qator — bitta yetkazilgan, to‘lanmagan zakaz. */
async function loadUnpaidDeliveredOrderDebtRows(
  tenantId: number,
  clientIds: number[],
  orderDateFrom: string | null,
  orderDateTo: string | null,
  filterOrderId: number | null
): Promise<UnpaidDeliveredOrderRow[]> {
  if (clientIds.length === 0) return [];
  const orderDateClause = buildOrderCreatedLocalDateClause(orderDateFrom, orderDateTo);
  const orderIdClause =
    filterOrderId != null && filterOrderId > 0 ? Prisma.sql`AND o.id = ${filterOrderId}` : Prisma.empty;
  const out: UnpaidDeliveredOrderRow[] = [];
  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<
      Array<{
        order_id: number;
        order_number: string;
        client_id: number;
        unpaid: Prisma.Decimal;
        delivered_at: Date | null;
        payment_method_ref: string | null;
      }>
    >`
      WITH cand AS (
        SELECT o.id, o.number, o.client_id, o.total_sum, o.updated_at, o.payment_method_ref
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
          AND o.client_id IN (${Prisma.join(chunk)})
          ${orderDateClause}
          ${orderIdClause}
      ),
      alloc AS (
        SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS sum_amt
        FROM payment_allocations pa
        WHERE pa.tenant_id = ${tenantId}
          AND pa.order_id IN (SELECT id FROM cand)
        GROUP BY pa.order_id
      ),
      delivered AS (
        SELECT sl.order_id, MIN(sl.created_at) AS delivered_at
        FROM order_status_logs sl
        WHERE sl.order_id IN (SELECT id FROM cand)
          AND sl.to_status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
        GROUP BY sl.order_id
      )
      SELECT
        c.id AS order_id,
        c.number AS order_number,
        c.client_id,
        GREATEST(c.total_sum - COALESCE(a.sum_amt, 0), 0)::decimal(15,2) AS unpaid,
        COALESCE(d.delivered_at, c.updated_at) AS delivered_at,
        c.payment_method_ref
      FROM cand c
      LEFT JOIN alloc a ON a.order_id = c.id
      LEFT JOIN delivered d ON d.order_id = c.id
    `;
    for (const r of rows) {
      if (r.unpaid.gt(0)) {
        const cid = sqlIntIdToNumber(r.client_id);
        const oid = sqlIntIdToNumber(r.order_id);
        if (!Number.isFinite(cid) || !Number.isFinite(oid)) continue;
        out.push({
          order_id: oid,
          order_number: r.order_number,
          client_id: cid,
          unpaid: r.unpaid,
          delivered_at: r.delivered_at,
          payment_method_ref: r.payment_method_ref
        });
      }
    }
  }
  out.sort((a, b) => {
    const c = b.unpaid.cmp(a.unpaid);
    return c !== 0 ? c : b.order_id - a.order_id;
  });
  return out;
}

function mapClientRow(
  c: {
    id: number;
    name: string;
    is_active: boolean;
    legal_name: string | null;
    client_code: string | null;
    inn: string | null;
    phone: string | null;
    license_until: Date | null;
    agent: Prisma.UserGetPayload<{ select: (typeof agentInclude)["select"] }> | null;
    client_balances: { balance: Prisma.Decimal }[];
  },
  paymentAmounts: ClientBalancePaymentTypeSummary[],
  lastPay: Date | undefined,
  lastOrd: Date | undefined,
  balanceOverride: Prisma.Decimal | null,
  deliveryOverride: DeliveryDebtInfo | null,
  /** «По клиентам»: yetkazilgan, lekin zakaz bo‘yicha to‘lanmagan — balans ustiga */
  unpaidDeliveredBlend?: DeliveryDebtInfo | null
): ClientBalanceRow {
  const ledgerBal = c.client_balances[0]?.balance ?? new Prisma.Decimal(0);
  let bal: Prisma.Decimal;
  if (deliveryOverride) {
    bal = deliveryOverride.debt.neg();
  } else {
    const base = balanceOverride ?? ledgerBal;
    bal = mergeLedgerWithUnpaidDelivered(base, unpaidDeliveredBlend ?? undefined);
  }
  const balStr = bal.toString();

  const ag = c.agent;
  const td =
    (ag?.trade_direction && String(ag.trade_direction).trim()) ||
    ag?.trade_direction_row?.name?.trim() ||
    null;

  let daysOver: number | null = null;
  if (deliveryOverride) {
    if (deliveryOverride.firstDel) {
      daysOver = Math.floor((Date.now() - deliveryOverride.firstDel.getTime()) / 86400000);
    }
  } else if (
    unpaidDeliveredBlend &&
    unpaidDeliveredBlend.debt.gt(0) &&
    unpaidDeliveredBlend.firstDel
  ) {
    daysOver = Math.floor((Date.now() - unpaidDeliveredBlend.firstDel.getTime()) / 86400000);
  } else if (c.license_until) {
    const diff = Date.now() - c.license_until.getTime();
    if (diff > 0) daysOver = Math.floor(diff / 86400000);
  }

  let daysSincePay: number | null = null;
  if (lastPay) {
    daysSincePay = Math.floor((Date.now() - lastPay.getTime()) / 86400000);
  }

  const tags: string[] = [];
  if (ag?.name) tags.push(ag.code ? `${ag.name} (${ag.code})` : ag.name);

  const lastOrdOut =
    deliveryOverride?.lastDel != null
      ? deliveryOverride.lastDel
      : unpaidDeliveredBlend && unpaidDeliveredBlend.debt.gt(0) && unpaidDeliveredBlend.lastDel != null
        ? unpaidDeliveredBlend.lastDel
        : lastOrd;

  return {
    client_id: c.id,
    client_code: c.client_code,
    name: c.name,
    is_active: c.is_active,
    legal_name: c.legal_name,
    agent_id: ag?.id ?? null,
    agent_name: ag?.name ?? null,
    agent_code: ag?.code ?? null,
    agent_tags: tags,
    supervisor_name: ag?.supervisor?.name ?? null,
    trade_direction: td,
    inn: c.inn,
    phone: c.phone,
    license_until: c.license_until?.toISOString() ?? null,
    days_overdue: daysOver,
    last_order_at: lastOrdOut?.toISOString() ?? null,
    last_payment_at: lastPay?.toISOString() ?? null,
    days_since_payment: daysSincePay,
    balance: balStr,
    payment_amounts: paymentAmounts
  };
}

function mapDeliveryOrderRow(
  c: {
    id: number;
    name: string;
    is_active: boolean;
    legal_name: string | null;
    client_code: string | null;
    inn: string | null;
    phone: string | null;
    license_until: Date | null;
    agent: Prisma.UserGetPayload<{ select: (typeof agentInclude)["select"] }> | null;
    client_balances: { balance: Prisma.Decimal }[];
  },
  od: UnpaidDeliveredOrderRow,
  sprLabels: string[],
  paymentMethodEntries: PaymentMethodEntryDto[],
  lastPay: Date | undefined
): ClientBalanceRow {
  const ag = c.agent;
  const td =
    (ag?.trade_direction && String(ag.trade_direction).trim()) ||
    ag?.trade_direction_row?.name?.trim() ||
    null;
  const tags: string[] = [];
  if (ag?.name) tags.push(ag.code ? `${ag.name} (${ag.code})` : ag.name);

  let daysOver: number | null = null;
  if (od.delivered_at) {
    daysOver = Math.floor((Date.now() - od.delivered_at.getTime()) / 86400000);
  }
  let daysSincePay: number | null = null;
  if (lastPay) {
    daysSincePay = Math.floor((Date.now() - lastPay.getTime()) / 86400000);
  }

  return {
    client_id: c.id,
    client_code: c.client_code,
    name: c.name,
    is_active: c.is_active,
    legal_name: c.legal_name,
    agent_id: ag?.id ?? null,
    agent_name: ag?.name ?? null,
    agent_code: ag?.code ?? null,
    agent_tags: tags,
    supervisor_name: ag?.supervisor?.name ?? null,
    trade_direction: td,
    inn: c.inn,
    phone: c.phone,
    license_until: c.license_until?.toISOString() ?? null,
    days_overdue: daysOver,
    last_order_at: od.delivered_at?.toISOString() ?? null,
    last_payment_at: lastPay?.toISOString() ?? null,
    days_since_payment: daysSincePay,
    balance: od.unpaid.neg().toString(),
    payment_amounts: paymentAmountsForOrderDebtByMethod(
      sprLabels,
      paymentMethodEntries,
      od.payment_method_ref,
      od.unpaid
    ),
    delivery_order_id: od.order_id,
    delivery_order_number: od.order_number,
    order_id: od.order_id
  };
}

export async function listClientBalanceTerritoryOptions(
  tenantId: number,
  scope?: ClientBalanceListQuery
): Promise<ClientBalanceTerritoryOptions> {
  const clientScopeWhere: Prisma.ClientWhereInput = scope
    ? buildClientWhere(tenantId, scope, { skipBalanceFilter: true, skipTerritoryFilters: true })
    : { tenant_id: tenantId, merged_into_client_id: null };

  const withField = (field: Prisma.ClientWhereInput): Prisma.ClientWhereInput => ({
    AND: [clientScopeWhere, field]
  });

  const [regions, cities, districts, zones, neighborhoods, branches] = await Promise.all([
    prisma.client.findMany({
      where: withField({ region: { not: null } }),
      select: { region: true },
      distinct: ["region"],
      orderBy: { region: "asc" }
    }),
    prisma.client.findMany({
      where: withField({ city: { not: null } }),
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" }
    }),
    prisma.client.findMany({
      where: withField({ district: { not: null } }),
      select: { district: true },
      distinct: ["district"],
      orderBy: { district: "asc" }
    }),
    prisma.client.findMany({
      where: withField({ zone: { not: null } }),
      select: { zone: true },
      distinct: ["zone"],
      orderBy: { zone: "asc" }
    }),
    prisma.client.findMany({
      where: withField({ neighborhood: { not: null } }),
      select: { neighborhood: true },
      distinct: ["neighborhood"],
      orderBy: { neighborhood: "asc" }
    }),
    prisma.user.findMany({
      where: {
        tenant_id: tenantId,
        role: "agent",
        is_active: true,
        branch: { not: null },
        clients_as_agent: { some: clientScopeWhere }
      },
      select: { branch: true },
      distinct: ["branch"],
      orderBy: { branch: "asc" }
    })
  ]);

  return {
    regions: regions.map((r) => r.region!).filter((x) => x.trim() !== ""),
    cities: cities.map((r) => r.city!).filter((x) => x.trim() !== ""),
    districts: districts.map((r) => r.district!).filter((x) => x.trim() !== ""),
    zones: zones.map((r) => r.zone!).filter((x) => x.trim() !== ""),
    neighborhoods: neighborhoods.map((r) => r.neighborhood!).filter((x) => x.trim() !== ""),
    branches: branches.map((r) => r.branch!).filter((x) => x.trim() !== "")
  };
}

export async function listClientBalancesReport(
  tenantId: number,
  q: ClientBalanceListQuery
): Promise<ClientBalanceListResponse> {
  const perf = makePerfMarker(`client-balances t=${tenantId} view=${q.view}`);
  const page = Math.max(1, q.page);
  const maxL = q.allow_large_export ? 5000 : 200;
  const limit = Math.min(maxL, Math.max(1, q.limit));
  const asOfRaw = q.balance_as_of?.trim();
  const asOfEnd = asOfRaw ? parseIsoDateEndUtc(asOfRaw) : null;
  const odFrom = q.order_date_from?.trim() || null;
  const odTo = q.order_date_to?.trim() || null;
  const skipBal = q.view === "clients_delivery";
  const where = buildClientWhere(tenantId, q, { skipBalanceFilter: skipBal });
  perf("where-ready", { page, limit, hasSearch: Boolean(q.search?.trim()) });

  if (q.view === "clients_delivery") {
    const idRows = await prisma.client.findMany({ where, select: { id: true } });
    const ids = idRows.map((r) => r.id);
    perf("delivery.ids-loaded", { ids: ids.length });
    const filterOid =
      q.delivery_order_id != null && q.delivery_order_id > 0 ? q.delivery_order_id : null;
    let orderRows = await loadUnpaidDeliveredOrderDebtRows(tenantId, ids, odFrom, odTo, filterOid);
    perf("delivery.orders-loaded", { orderRows: orderRows.length, filterOrderId: filterOid });
    const bf = q.balance_filter?.trim();
    if (bf === "credit") {
      orderRows = [];
    }
    const paymentRefs = await loadTenantPaymentRefs(tenantId);
    const sprDelivery = paymentRefs.labels;
    const pmEntriesDelivery = paymentRefs.entries;
    const sortBy = q.sort_by?.trim() ?? "";
    const sortDir = readSortDir(q);
    if (sortBy === "balance") {
      orderRows.sort((a, b) => compareNumForSort(Number(a.unpaid.neg().toString()), Number(b.unpaid.neg().toString()), sortDir));
    } else if (sortBy.startsWith("pay:")) {
      const wanted = normPayTypeKey(sortBy.slice(4));
      const firstNk = sprDelivery.length > 0 ? normPayTypeKey(sprDelivery[0]) : "";
      orderRows.sort((a, b) => {
        const aLabel = resolvePaymentMethodRefToLabel(a.payment_method_ref, pmEntriesDelivery);
        const bLabel = resolvePaymentMethodRefToLabel(b.payment_method_ref, pmEntriesDelivery);
        const aNk = aLabel ? normPayTypeKey(aLabel) : firstNk;
        const bNk = bLabel ? normPayTypeKey(bLabel) : firstNk;
        const aVal = aNk === wanted ? Number(a.unpaid.neg().toString()) : 0;
        const bVal = bNk === wanted ? Number(b.unpaid.neg().toString()) : 0;
        return compareNumForSort(aVal, bVal, sortDir);
      });
    }
    const total = orderRows.length;
    const pageSlice = orderRows.slice((page - 1) * limit, page * limit);
    const sliceClientIds = [...new Set(pageSlice.map((r) => r.client_id))];

    let sumUnpaid = new Prisma.Decimal(0);
    for (const r of orderRows) {
      sumUnpaid = sumUnpaid.add(r.unpaid);
    }
    const totalBalanceStr = sumUnpaid.neg().toString();

    const distinctClientIdsForSummary = [...new Set(orderRows.map((r) => r.client_id))];

    const [[clients, lastPays], netTotalsMap, rawUnpaidSummary] = await Promise.all([
      Promise.all([
        (async () => {
          if (sliceClientIds.length === 0) return [];
          return prisma.client.findMany({
            where: { id: { in: sliceClientIds } },
            select: {
              id: true,
              name: true,
              is_active: true,
              legal_name: true,
              client_code: true,
              inn: true,
              phone: true,
              license_until: true,
              agent: { select: agentInclude.select },
              client_balances: { take: 1, select: { balance: true } }
            }
          });
        })(),
        loadLastPaymentByClient(tenantId, sliceClientIds, asOfEnd)
      ]),
      loadPaymentNetTotalsByTypeGlobally(tenantId, distinctClientIdsForSummary, asOfEnd, pmEntriesDelivery),
      loadUnpaidOrderBalanceRawByPaymentRef(tenantId, distinctClientIdsForSummary, odFrom, odTo)
    ]);
    perf("delivery.summary-built", {
      pageSlice: pageSlice.length,
      distinctClients: distinctClientIdsForSummary.length
    });
    const { globalUnpaidNorm: globalUnpaidDelivery } = processUnpaidPayRefRows(
      rawUnpaidSummary,
      pmEntriesDelivery,
      sprDelivery
    );
    const paymentByTypeDelivery = buildSummaryNetMinusUnpaid(
      sprDelivery,
      netTotalsMap,
      globalUnpaidDelivery
    );
    const clientById = new Map(clients.map((c) => [c.id, c]));

    const data: ClientBalanceRow[] = [];
    for (const od of pageSlice) {
      const c = clientById.get(od.client_id);
      if (!c) continue;
      data.push(
        mapDeliveryOrderRow(c, od, sprDelivery, pmEntriesDelivery, lastPays.get(od.client_id))
      );
    }

    return {
      view: "clients_delivery",
      data,
      total,
      page,
      limit,
      summary: { balance: totalBalanceStr, payment_by_type: paymentByTypeDelivery }
    };
  }

  const bfEarly = q.balance_filter?.trim() ?? "";
  if (q.view === "clients" && (bfEarly === "debt" || bfEarly === "credit")) {
    const whereBase = buildClientWhere(tenantId, q, { skipBalanceFilter: true });
    const allMinimal = await prisma.client.findMany({
      where: whereBase,
      select: {
        id: true,
        name: true,
        client_balances: { take: 1, select: { balance: true } }
      },
      orderBy: { name: "asc" }
    });
    const baseIds = allMinimal.map((c) => c.id);
    perf("clients-balance-filter.base-loaded", { baseIds: baseIds.length, filter: bfEarly });
    const [deliveryMap, balAsOfAll] = await Promise.all([
      loadDeliveryDebtByClient(tenantId, baseIds, odFrom, odTo),
      asOfEnd && baseIds.length > 0 ? loadBalancesAsOf(tenantId, baseIds, asOfEnd) : Promise.resolve(null)
    ]);
    perf("clients-balance-filter.derived-loaded", { deliveryMap: deliveryMap.size });

    const ledgerOf = (row: (typeof allMinimal)[number]) =>
      balAsOfAll?.get(row.id) ?? row.client_balances[0]?.balance ?? new Prisma.Decimal(0);

    const eligible = allMinimal.filter((row) => {
      const l = ledgerOf(row);
      const unpaid = deliveryMap.get(row.id)?.debt ?? new Prisma.Decimal(0);
      if (bfEarly === "debt") return l.lt(0) || unpaid.gt(0);
      return l.gt(0) && unpaid.lte(0);
    });

    let sumMerged = new Prisma.Decimal(0);
    for (const row of eligible) {
      const l = ledgerOf(row);
      sumMerged = sumMerged.add(mergeLedgerWithUnpaidDelivered(l, deliveryMap.get(row.id)));
    }
    const totalBalanceStr = sumMerged.toString();

    const eligibleIds = eligible.map((r) => r.id);
    const { labels: sprLabels, entries: pmEntries } = await loadTenantPaymentRefs(tenantId);
    const [netGlobalByType, rawUnpaidEligible] = await Promise.all([
      loadPaymentNetTotalsByTypeGlobally(tenantId, eligibleIds, asOfEnd, pmEntries),
      loadUnpaidOrderBalanceRawByPaymentRef(tenantId, eligibleIds, odFrom, odTo)
    ]);
    const { byClient: unpaidByMethod, globalUnpaidNorm } = processUnpaidPayRefRows(
      rawUnpaidEligible,
      pmEntries,
      sprLabels
    );
    const summaryPaymentByType = buildSummaryNetMinusUnpaid(sprLabels, netGlobalByType, globalUnpaidNorm);

    const sortBy = q.sort_by?.trim() ?? "";
    const sortDir = readSortDir(q);
    let orderedEligible = eligible;
    if (sortBy === "balance") {
      orderedEligible = [...eligible].sort((a, b) => {
        const aBal = Number(
          mergeLedgerWithUnpaidDelivered(ledgerOf(a), deliveryMap.get(a.id)).toString()
        );
        const bBal = Number(
          mergeLedgerWithUnpaidDelivered(ledgerOf(b), deliveryMap.get(b.id)).toString()
        );
        return compareNumForSort(aBal, bBal, sortDir);
      });
    } else if (sortBy.startsWith("pay:")) {
      const payNormAll = await loadPaymentNetNormByClient(tenantId, eligibleIds, asOfEnd, pmEntries);
      orderedEligible = [...eligible].sort((a, b) => {
        const aAmounts = paymentAmountsNetMinusUnpaid(
          sprLabels,
          payNormAll.get(a.id),
          unpaidByMethod.get(a.id)
        );
        const bAmounts = paymentAmountsNetMinusUnpaid(
          sprLabels,
          payNormAll.get(b.id),
          unpaidByMethod.get(b.id)
        );
        const aVal = moneySortValueFromPaymentAmounts(aAmounts, sortBy, sprLabels);
        const bVal = moneySortValueFromPaymentAmounts(bAmounts, sortBy, sprLabels);
        return compareNumForSort(aVal, bVal, sortDir);
      });
    }

    const total = orderedEligible.length;
    const sliceRows = orderedEligible.slice((page - 1) * limit, page * limit);
    const sliceIds = sliceRows.map((r) => r.id);

    const [clients, pagePayNorm, lastPays, lastOrds, pageBalAsOf] = await Promise.all([
      (async () => {
        if (sliceIds.length === 0) return [];
        return prisma.client.findMany({
          where: { id: { in: sliceIds } },
          select: {
            id: true,
            name: true,
            is_active: true,
            legal_name: true,
            client_code: true,
            inn: true,
            phone: true,
            license_until: true,
            agent: { select: agentInclude.select },
            client_balances: { take: 1, select: { balance: true } }
          }
        });
      })(),
      loadPaymentNetNormByClient(tenantId, sliceIds, asOfEnd, pmEntries),
      loadLastPaymentByClient(tenantId, sliceIds, asOfEnd),
      loadLastDeliveryByClient(tenantId, sliceIds),
      asOfEnd && sliceIds.length > 0 ? loadBalancesAsOf(tenantId, sliceIds, asOfEnd) : Promise.resolve(null)
    ]);
    const orderMap = new Map(clients.map((c) => [c.id, c]));
    const orderedClients = sliceIds.map((id) => orderMap.get(id)!).filter(Boolean);

    const data: ClientBalanceRow[] = orderedClients.map((c) => {
      const blend = deliveryMap.get(c.id);
      const blendPass = blend && blend.debt.gt(0) ? blend : null;
      return mapClientRow(
        c,
        paymentAmountsNetMinusUnpaid(sprLabels, pagePayNorm.get(c.id), unpaidByMethod.get(c.id)),
        lastPays.get(c.id),
        lastOrds.get(c.id),
        pageBalAsOf?.get(c.id) ?? null,
        null,
        blendPass
      );
    });

    return {
      view: "clients",
      data,
      total,
      page,
      limit,
      summary: { balance: totalBalanceStr, payment_by_type: summaryPaymentByType }
    };
  }

  const allClientsLedger = await prisma.client.findMany({
    where,
    select: { id: true, client_balances: { take: 1, select: { balance: true } } }
  });
  const ids = allClientsLedger.map((c) => c.id);
  perf("clients-all.ids-loaded", { ids: ids.length });
  const [balAsOfMapAll, deliveryMapForSummary] = await Promise.all([
    asOfEnd && ids.length > 0 ? loadBalancesAsOf(tenantId, ids, asOfEnd) : Promise.resolve(null),
    loadDeliveryDebtByClient(tenantId, ids, odFrom, odTo)
  ]);
  perf("clients-all.summary-sources-loaded", {
    asOfCount: balAsOfMapAll?.size ?? 0,
    deliveryMap: deliveryMapForSummary.size
  });
  let sumMergedTotal = new Prisma.Decimal(0);
  for (const c of allClientsLedger) {
    const ledger = balAsOfMapAll?.get(c.id) ?? c.client_balances[0]?.balance ?? new Prisma.Decimal(0);
    const d = deliveryMapForSummary.get(c.id);
    const blendPass = d && d.debt.gt(0) ? d : null;
    sumMergedTotal = sumMergedTotal.add(mergeLedgerWithUnpaidDelivered(ledger, blendPass ?? undefined));
  }
  const totalBalanceStr = sumMergedTotal.toString();

  const { labels: sprLabels, entries: pmEntries } = await loadTenantPaymentRefs(tenantId);
  const [netGlobalByType, rawUnpaidAll] = await Promise.all([
    loadPaymentNetTotalsByTypeGlobally(tenantId, ids, asOfEnd, pmEntries),
    loadUnpaidOrderBalanceRawByPaymentRef(tenantId, ids, odFrom, odTo)
  ]);
  perf("clients-all.payment-sources-loaded", {
    payTypeCount: sprLabels.length,
    unpaidRows: rawUnpaidAll.length
  });
  const { byClient: unpaidByClientMethod, globalUnpaidNorm } = processUnpaidPayRefRows(
    rawUnpaidAll,
    pmEntries,
    sprLabels
  );
  const summaryPaymentByType = buildSummaryNetMinusUnpaid(sprLabels, netGlobalByType, globalUnpaidNorm);

  if (q.view === "agents") {
    const payNormByClient = await loadPaymentNetNormByClient(tenantId, ids, asOfEnd, pmEntries);
    perf("agents.aggregates-loaded", {
      ids: ids.length,
      payNormClients: payNormByClient.size
    });
    const byAgent = new Map<
      number | null,
      {
        clients: number;
        balance: Prisma.Decimal;
        payAgg: Map<string, Prisma.Decimal>;
        unpaidAgg: Map<string, Prisma.Decimal>;
        name: string | null;
        code: string | null;
      }
    >();
    const clientsForAgg = await prisma.client.findMany({
      where,
      select: {
        id: true,
        agent_id: true,
        client_balances: { select: { balance: true } },
        agent: { select: { id: true, name: true, code: true } }
      }
    });
    for (const c of clientsForAgg) {
      const aid = c.agent_id ?? null;
      const ledger = c.client_balances[0]?.balance ?? new Prisma.Decimal(0);
      const base = balAsOfMapAll?.get(c.id) ?? ledger;
      const del = deliveryMapForSummary.get(c.id);
      const blendPass = del && del.debt.gt(0) ? del : null;
      /** «По клиентам» qatori bilan bir xil: ledger + yetkazilgan, yopilmagan zakazlar qarzi. */
      const bal = mergeLedgerWithUnpaidDelivered(base, blendPass ?? undefined);
      const inner = payNormByClient.get(c.id);
      const cur = byAgent.get(aid) ?? {
        clients: 0,
        balance: new Prisma.Decimal(0),
        payAgg: new Map<string, Prisma.Decimal>(),
        unpaidAgg: new Map<string, Prisma.Decimal>(),
        name: c.agent?.name ?? null,
        code: c.agent?.code ?? null
      };
      cur.clients += 1;
      cur.balance = cur.balance.add(bal);
      if (inner) {
        for (const [nk, v] of inner) {
          cur.payAgg.set(nk, (cur.payAgg.get(nk) ?? new Prisma.Decimal(0)).add(v));
        }
      }
      const uClient = unpaidByClientMethod.get(c.id);
      if (uClient) {
        for (const [nk, v] of uClient) {
          cur.unpaidAgg.set(nk, (cur.unpaidAgg.get(nk) ?? new Prisma.Decimal(0)).add(v));
        }
      }
      if (c.agent?.name) {
        cur.name = c.agent.name;
        cur.code = c.agent.code ?? null;
      }
      byAgent.set(aid, cur);
    }
    const agentRows: AgentBalanceRow[] = Array.from(byAgent.entries())
      .map(([agent_id, v]) => ({
        agent_id,
        agent_name: v.name,
        agent_code: v.code,
        clients_count: v.clients,
        balance: v.balance.toString(),
        payment_amounts: paymentAmountsNetMinusUnpaid(sprLabels, v.payAgg, v.unpaidAgg)
      }));

    const sortBy = q.sort_by?.trim() ?? "";
    const sortDir = readSortDir(q);
    if (sortBy === "balance") {
      agentRows.sort((a, b) =>
        compareNumForSort(Number(a.balance), Number(b.balance), sortDir)
      );
    } else if (sortBy.startsWith("pay:")) {
      agentRows.sort((a, b) =>
        compareNumForSort(
          moneySortValueFromPaymentAmounts(a.payment_amounts, sortBy, sprLabels),
          moneySortValueFromPaymentAmounts(b.payment_amounts, sortBy, sprLabels),
          sortDir
        )
      );
    } else {
      agentRows.sort((a, b) => new Prisma.Decimal(a.balance).cmp(new Prisma.Decimal(b.balance)));
    }

    const total = agentRows.length;
    const slice = agentRows.slice((page - 1) * limit, page * limit);
    return {
      view: "agents",
      data: slice,
      total,
      page,
      limit,
      summary: { balance: totalBalanceStr, payment_by_type: summaryPaymentByType }
    };
  }

  const sortBy = q.sort_by?.trim() ?? "";
  const sortDir = readSortDir(q);
  let sortedIds = ids;
  const ledgerById = new Map(
    allClientsLedger.map((x) => [x.id, x.client_balances[0]?.balance ?? new Prisma.Decimal(0)])
  );
  if (q.view === "clients" && (sortBy === "balance" || sortBy.startsWith("pay:"))) {
    if (sortBy === "balance") {
      sortedIds = [...ids].sort((a, b) => {
        const aLedger = balAsOfMapAll?.get(a) ?? ledgerById.get(a) ?? new Prisma.Decimal(0);
        const bLedger = balAsOfMapAll?.get(b) ?? ledgerById.get(b) ?? new Prisma.Decimal(0);
        const aBal = Number(
          mergeLedgerWithUnpaidDelivered(aLedger, deliveryMapForSummary.get(a)).toString()
        );
        const bBal = Number(
          mergeLedgerWithUnpaidDelivered(bLedger, deliveryMapForSummary.get(b)).toString()
        );
        return compareNumForSort(aBal, bBal, sortDir);
      });
    } else {
      const payNormAll = await loadPaymentNetNormByClient(tenantId, ids, asOfEnd, pmEntries);
      sortedIds = [...ids].sort((a, b) => {
        const aAmounts = paymentAmountsNetMinusUnpaid(
          sprLabels,
          payNormAll.get(a),
          unpaidByClientMethod.get(a)
        );
        const bAmounts = paymentAmountsNetMinusUnpaid(
          sprLabels,
          payNormAll.get(b),
          unpaidByClientMethod.get(b)
        );
        const aVal = moneySortValueFromPaymentAmounts(aAmounts, sortBy, sprLabels);
        const bVal = moneySortValueFromPaymentAmounts(bAmounts, sortBy, sprLabels);
        return compareNumForSort(aVal, bVal, sortDir);
      });
    }
  }

  const total = ids.length;
  const pageIds = sortedIds.slice((page - 1) * limit, page * limit);
  const clients =
    pageIds.length === 0
      ? []
      : await prisma.client.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            name: true,
            is_active: true,
            legal_name: true,
            client_code: true,
            inn: true,
            phone: true,
            license_until: true,
            agent: { select: agentInclude.select },
            client_balances: { take: 1, select: { balance: true } }
          }
        });

  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const orderedClients = pageIds.map((id) => clientsById.get(id)!).filter(Boolean);
  const deliveryMapPage =
    q.view === "clients" && pageIds.length > 0 ? deliveryMapForSummary : new Map<number, DeliveryDebtInfo>();
  const [pagePayNorm, lastPays, lastOrds, pageBalAsOf] = await Promise.all([
    loadPaymentNetNormByClient(tenantId, pageIds, asOfEnd, pmEntries),
    loadLastPaymentByClient(tenantId, pageIds, asOfEnd),
    loadLastDeliveryByClient(tenantId, pageIds),
    asOfEnd && pageIds.length > 0 ? loadBalancesAsOf(tenantId, pageIds, asOfEnd) : Promise.resolve(null)
  ]);
  perf("clients-page.loaded", {
    pageIds: pageIds.length,
    total,
    page
  });

  const data: ClientBalanceRow[] = orderedClients.map((c) => {
    const b = deliveryMapPage.get(c.id);
    const blend = b && b.debt.gt(0) ? b : null;
    return mapClientRow(
      c,
      paymentAmountsNetMinusUnpaid(sprLabels, pagePayNorm.get(c.id), unpaidByClientMethod.get(c.id)),
      lastPays.get(c.id),
      lastOrds.get(c.id),
      pageBalAsOf?.get(c.id) ?? null,
      null,
      blend
    );
  });

  return {
    view: "clients",
    data,
    total,
    page,
    limit,
    summary: { balance: totalBalanceStr, payment_by_type: summaryPaymentByType }
  };
}
