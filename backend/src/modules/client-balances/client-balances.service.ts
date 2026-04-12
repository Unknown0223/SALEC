import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  paymentTypesFromMethodEntries,
  resolveCurrencyEntries,
  resolvePaymentMethodEntries
} from "../tenant-settings/finance-refs";

export type ClientBalanceViewMode = "clients" | "agents" | "clients_delivery";

export type ClientBalanceListQuery = {
  view: ClientBalanceViewMode;
  page: number;
  limit: number;
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
  /** YYYY-MM-DD — balans harakatlari bo‘yicha shu sanagacha (UTC kun oxiri) yig‘indi */
  balance_as_of?: string;
  /** Konsignatsiya / litsenziya muddati (client.license_until) oralig‘i */
  consignment_due_from?: string;
  consignment_due_to?: string;
  /** Agent `User.branch` (filial) */
  agent_branch?: string;
  /** Mijozda shu turdagi kirim to‘lovi bo‘lganlar */
  agent_payment_type?: string;
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

function parseIsoDateEndUtc(iso: string): Date | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
}

function buildClientWhere(
  tenantId: number,
  q: ClientBalanceListQuery,
  opts?: { skipBalanceFilter?: boolean }
): Prisma.ClientWhereInput {
  const andParts: Prisma.ClientWhereInput[] = [
    { tenant_id: tenantId },
    { merged_into_client_id: null }
  ];

  const st = q.status?.trim();
  if (st === "active") andParts.push({ is_active: true });
  else if (st === "inactive") andParts.push({ is_active: false });

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

  const br = q.agent_branch?.trim();
  if (br) {
    andParts.push({ agent: { branch: br } });
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

  if (q.territory_region?.trim()) {
    andParts.push({ region: { contains: q.territory_region.trim(), mode: "insensitive" } });
  }
  if (q.territory_city?.trim()) {
    andParts.push({ city: { contains: q.territory_city.trim(), mode: "insensitive" } });
  }
  if (q.territory_district?.trim()) {
    andParts.push({ district: { contains: q.territory_district.trim(), mode: "insensitive" } });
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

/** client_id → (normPayTypeKey → net), как в KPI — по точному payment_type с нормализацией ключа */
async function loadPaymentNetNormByClient(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date | null
): Promise<Map<number, Map<string, Prisma.Decimal>>> {
  const map = new Map<number, Map<string, Prisma.Decimal>>();
  if (clientIds.length === 0) return map;

  const chunkSize = 3000;
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
        ${dateClause}
      GROUP BY p.client_id, p.payment_type
    `;
    for (const r of rows) {
      const nk = normPayTypeKey(r.payment_type ?? "");
      let inner = map.get(r.client_id);
      if (!inner) {
        inner = new Map();
        map.set(r.client_id, inner);
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

/** Sozlamalar → `payment_method_entries` yoki `payment_types` (faol usullar nomlari) */
async function loadTenantPaymentTypeLabels(tenantId: number): Promise<string[]> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const settings = row?.settings as Record<string, unknown> | null | undefined;
  const ref = settings?.references as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== "object") return [];
  const currency_entries = resolveCurrencyEntries(ref);
  const methods = resolvePaymentMethodEntries(ref, currency_entries);
  return paymentTypesFromMethodEntries(methods);
}

function normPayTypeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Filtrlangan mijozlar bo‘yicha `payment_type` bo‘linmasi (to‘liq matn, DB dagi kabi) */
async function loadPaymentNetTotalsByTypeGlobally(
  tenantId: number,
  clientIds: number[],
  asOfEnd: Date | null
): Promise<Map<string, Prisma.Decimal>> {
  const merged = new Map<string, Prisma.Decimal>();
  if (clientIds.length === 0) return merged;
  const chunkSize = 3000;
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
        ${dateClause}
      GROUP BY p.payment_type
    `;
    for (const r of rows) {
      const rawKey = (r.payment_type ?? "").trim();
      const cur = merged.get(rawKey) ?? new Prisma.Decimal(0);
      merged.set(rawKey, cur.add(r.net));
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
  const chunkSize = 3000;
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
      out.set(r.client_id, r.bal ?? new Prisma.Decimal(0));
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
  const chunkSize = 3000;
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
      if (r.lp) out.set(r.client_id, r.lp);
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
  const chunkSize = 2000;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<Array<{ client_id: number; lu: Date | null }>>`
      SELECT o.client_id,
        MAX(COALESCE(
          (SELECT MIN(sl.created_at) FROM order_status_logs sl
           WHERE sl.order_id = o.id AND sl.to_status = 'delivered'),
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
      if (r.lu) out.set(r.client_id, r.lu);
    }
  }
  return out;
}

type DeliveryDebtInfo = { debt: Prisma.Decimal; lastDel: Date | null; firstDel: Date | null };

async function loadDeliveryDebtByClient(
  tenantId: number,
  clientIds: number[]
): Promise<Map<number, DeliveryDebtInfo>> {
  const map = new Map<number, DeliveryDebtInfo>();
  if (clientIds.length === 0) return map;
  const chunkSize = 2000;
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
      WITH ord AS (
        SELECT
          o.client_id,
          o.total_sum,
          COALESCE(
            (SELECT MIN(sl.created_at) FROM order_status_logs sl
             WHERE sl.order_id = o.id AND sl.to_status = 'delivered'),
            o.updated_at
          ) AS delivered_at,
          COALESCE((
            SELECT SUM(pa.amount) FROM payment_allocations pa
            WHERE pa.tenant_id = o.tenant_id AND pa.order_id = o.id
          ), 0)::decimal(15,2) AS allocated
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status = 'delivered'
          AND o.client_id IN (${Prisma.join(chunk)})
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
      map.set(r.client_id, {
        debt: r.gross_unpaid,
        lastDel: r.last_unpaid_delivery,
        firstDel: r.first_unpaid_delivery
      });
    }
  }
  return map;
}

function mapClientRow(
  c: {
    id: number;
    name: string;
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
  deliveryOverride: DeliveryDebtInfo | null
): ClientBalanceRow {
  const ledgerBal = c.client_balances[0]?.balance ?? new Prisma.Decimal(0);
  const bal: Prisma.Decimal = deliveryOverride
    ? deliveryOverride.debt.neg()
    : (balanceOverride ?? ledgerBal);
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
    deliveryOverride?.lastDel != null ? deliveryOverride.lastDel : lastOrd;

  return {
    client_id: c.id,
    client_code: c.client_code,
    name: c.name,
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

export async function listClientBalanceTerritoryOptions(tenantId: number): Promise<ClientBalanceTerritoryOptions> {
  const [regions, cities, districts, branches] = await Promise.all([
    prisma.client.findMany({
      where: { tenant_id: tenantId, merged_into_client_id: null, region: { not: null } },
      select: { region: true },
      distinct: ["region"],
      orderBy: { region: "asc" }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, merged_into_client_id: null, city: { not: null } },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" }
    }),
    prisma.client.findMany({
      where: { tenant_id: tenantId, merged_into_client_id: null, district: { not: null } },
      select: { district: true },
      distinct: ["district"],
      orderBy: { district: "asc" }
    }),
    prisma.user.findMany({
      where: {
        tenant_id: tenantId,
        role: "agent",
        is_active: true,
        branch: { not: null },
        clients_as_agent: { some: { merged_into_client_id: null } }
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
    branches: branches.map((r) => r.branch!).filter((x) => x.trim() !== "")
  };
}

export async function listClientBalancesReport(
  tenantId: number,
  q: ClientBalanceListQuery
): Promise<ClientBalanceListResponse> {
  const page = Math.max(1, q.page);
  const maxL = q.allow_large_export ? 5000 : 200;
  const limit = Math.min(maxL, Math.max(1, q.limit));
  const asOfRaw = q.balance_as_of?.trim();
  const asOfEnd = asOfRaw ? parseIsoDateEndUtc(asOfRaw) : null;
  const skipBal = q.view === "clients_delivery";
  const where = buildClientWhere(tenantId, q, { skipBalanceFilter: skipBal });

  const allIds = await prisma.client.findMany({
    where,
    select: { id: true }
  });
  const ids = allIds.map((r) => r.id);

  if (q.view === "clients_delivery") {
    const debtMap = await loadDeliveryDebtByClient(tenantId, ids);
    let eligible = ids.filter((id) => debtMap.has(id));
    const bf = q.balance_filter?.trim();
    if (bf === "credit") {
      eligible = [];
    }
    eligible.sort((a, b) => {
      const da = debtMap.get(a)?.debt ?? new Prisma.Decimal(0);
      const db = debtMap.get(b)?.debt ?? new Prisma.Decimal(0);
      return db.cmp(da);
    });
    const total = eligible.length;
    const sliceIds = eligible.slice((page - 1) * limit, page * limit);

    let sumDebt = new Prisma.Decimal(0);
    for (const id of eligible) {
      sumDebt = sumDebt.add(debtMap.get(id)?.debt ?? new Prisma.Decimal(0));
    }
    const totalBalanceStr = sumDebt.neg().toString();

    const clients =
      sliceIds.length === 0
        ? []
        : await prisma.client.findMany({
            where: { id: { in: sliceIds } },
            select: {
              id: true,
              name: true,
              legal_name: true,
              client_code: true,
              inn: true,
              phone: true,
              license_until: true,
              agent: { select: agentInclude.select },
              client_balances: { take: 1, select: { balance: true } }
            }
          });
    const orderMap = new Map(clients.map((c) => [c.id, c]));
    const orderedClients = sliceIds.map((id) => orderMap.get(id)!).filter(Boolean);

    const sprDelivery = await loadTenantPaymentTypeLabels(tenantId);
    const pagePayNorm = await loadPaymentNetNormByClient(tenantId, sliceIds, asOfEnd);
    const lastPays = await loadLastPaymentByClient(tenantId, sliceIds, asOfEnd);
    const lastOrds = await loadLastDeliveryByClient(tenantId, sliceIds);

    const data: ClientBalanceRow[] = orderedClients.map((c) => {
      const d = debtMap.get(c.id)!;
      return mapClientRow(
        c,
        paymentAmountsForSpravochnik(sprDelivery, pagePayNorm.get(c.id)),
        lastPays.get(c.id),
        lastOrds.get(c.id),
        null,
        d
      );
    });

    const netDelivery = await loadPaymentNetTotalsByTypeGlobally(tenantId, eligible, asOfEnd);
    const paymentByTypeDelivery = buildSummaryPaymentByType(sprDelivery, netDelivery);

    return {
      view: "clients_delivery",
      data,
      total,
      page,
      limit,
      summary: { balance: totalBalanceStr, payment_by_type: paymentByTypeDelivery }
    };
  }

  const balAsOfMapAll = asOfEnd && ids.length > 0 ? await loadBalancesAsOf(tenantId, ids, asOfEnd) : null;

  let totalBalanceStr: string;
  if (balAsOfMapAll) {
    let s = new Prisma.Decimal(0);
    for (const id of ids) {
      s = s.add(balAsOfMapAll.get(id) ?? new Prisma.Decimal(0));
    }
    totalBalanceStr = s.toString();
  } else {
    const balAgg = await prisma.clientBalance.aggregate({
      where: { tenant_id: tenantId, client: where },
      _sum: { balance: true }
    });
    totalBalanceStr = (balAgg._sum.balance ?? new Prisma.Decimal(0)).toString();
  }

  const netGlobalByType = await loadPaymentNetTotalsByTypeGlobally(tenantId, ids, asOfEnd);
  const sprLabels = await loadTenantPaymentTypeLabels(tenantId);
  const summaryPaymentByType = buildSummaryPaymentByType(sprLabels, netGlobalByType);

  if (q.view === "agents") {
    const payNormByClient = await loadPaymentNetNormByClient(tenantId, ids, asOfEnd);
    const byAgent = new Map<
      number | null,
      {
        clients: number;
        balance: Prisma.Decimal;
        payAgg: Map<string, Prisma.Decimal>;
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
      const bal = balAsOfMapAll?.get(c.id) ?? ledger;
      const inner = payNormByClient.get(c.id);
      const cur = byAgent.get(aid) ?? {
        clients: 0,
        balance: new Prisma.Decimal(0),
        payAgg: new Map<string, Prisma.Decimal>(),
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
        payment_amounts: paymentAmountsForSpravochnik(sprLabels, v.payAgg)
      }))
      .sort((a, b) => new Prisma.Decimal(a.balance).cmp(new Prisma.Decimal(b.balance)));

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

  const total = await prisma.client.count({ where });
  const clients = await prisma.client.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      name: true,
      legal_name: true,
      client_code: true,
      inn: true,
      phone: true,
      license_until: true,
      agent: { select: agentInclude.select },
      client_balances: { take: 1, select: { balance: true } }
    }
  });

  const pageIds = clients.map((c) => c.id);
  const pagePayNorm = await loadPaymentNetNormByClient(tenantId, pageIds, asOfEnd);
  const lastPays = await loadLastPaymentByClient(tenantId, pageIds, asOfEnd);
  const lastOrds = await loadLastDeliveryByClient(tenantId, pageIds);
  const pageBalAsOf = asOfEnd && pageIds.length > 0 ? await loadBalancesAsOf(tenantId, pageIds, asOfEnd) : null;

  const data: ClientBalanceRow[] = clients.map((c) =>
    mapClientRow(
      c,
      paymentAmountsForSpravochnik(sprLabels, pagePayNorm.get(c.id)),
      lastPays.get(c.id),
      lastOrds.get(c.id),
      pageBalAsOf?.get(c.id) ?? null,
      null
    )
  );

  return {
    view: "clients",
    data,
    total,
    page,
    limit,
    summary: { balance: totalBalanceStr, payment_by_type: summaryPaymentByType }
  };
}
