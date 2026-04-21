import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../config/database";
import {
  buildClientWhere,
  buildOrderCreatedLocalDateClause,
  loadTenantPaymentRefs,
  sqlIntIdToNumber,
  type ClientBalanceListQuery
} from "../client-balances/client-balances.service";
import { resolvePaymentMethodRefToLabel } from "../tenant-settings/finance-refs";
import { ORDER_STATUSES_OUTSTANDING_RECEIVABLE } from "../orders/order-status";

const PAYMENT_NOT_PENDING = Prisma.sql`COALESCE(p.workflow_status, 'confirmed') <> 'pending_confirmation'`;

export type OrderDebtsListQuery = ClientBalanceListQuery & {
  /** Comma-separated warehouse ids — zakaz bo‘yicha filtr */
  warehouse_ids?: number[];
  /** Comma-separated client ids — `buildClientWhere` natijasiga kesish */
  explicit_client_ids?: number[];
  /** YYYY-MM-DD — birinchi отгрузка (delivering|delivered) log sanasi */
  shipment_date_from?: string;
  shipment_date_to?: string;
  /** Konsignatsiya muddati — `orders.consignment_due_date` */
  order_consignment_due_from?: string;
  order_consignment_due_to?: string;
  /** To‘lov usuli ref (zakazdagi `payment_method_ref` bo‘yicha qisman mos) */
  order_payment_ref?: string;
  /** Konsignatsiya zakazlari: all | consignment | regular */
  order_consignment?: "all" | "consignment" | "regular";
};

function parseOptPositiveInt(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseCommaInts(raw: string | undefined): number[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** URL query → `OrderDebtsListQuery` (client-balances bilan mos parametrlar). */
export function parseOrderDebtsListQuery(q: Record<string, string | undefined>): OrderDebtsListQuery {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const allowLarge = q.large_export === "1" || q.large_export === "true";
  const maxL = allowLarge ? 5000 : 200;
  const limit = Math.min(maxL, Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50));

  const oc = q.order_consignment?.trim();
  const order_consignment: OrderDebtsListQuery["order_consignment"] =
    oc === "consignment" ? "consignment" : oc === "regular" ? "regular" : "all";

  return {
    view: "clients",
    page,
    limit,
    allow_large_export: allowLarge,
    ...(q.search?.trim() ? { search: q.search.trim() } : {}),
    ...(parseOptPositiveInt(q.agent_id) !== undefined ? { agent_id: parseOptPositiveInt(q.agent_id) } : {}),
    ...(parseOptPositiveInt(q.expeditor_user_id) !== undefined
      ? { expeditor_user_id: parseOptPositiveInt(q.expeditor_user_id) }
      : {}),
    ...(parseOptPositiveInt(q.supervisor_user_id) !== undefined
      ? { supervisor_user_id: parseOptPositiveInt(q.supervisor_user_id) }
      : {}),
    ...(q.trade_direction?.trim() ? { trade_direction: q.trade_direction.trim() } : {}),
    ...(q.category?.trim() ? { category: q.category.trim() } : {}),
    ...(q.status?.trim() ? { status: q.status.trim() } : {}),
    ...(q.agent_consignment?.trim() ? { agent_consignment: q.agent_consignment.trim() } : {}),
    ...(q.territory_region?.trim() ? { territory_region: q.territory_region.trim() } : {}),
    ...(q.territory_city?.trim() ? { territory_city: q.territory_city.trim() } : {}),
    ...(q.territory_district?.trim() ? { territory_district: q.territory_district.trim() } : {}),
    ...(q.territory_zone?.trim() ? { territory_zone: q.territory_zone.trim() } : {}),
    ...(q.territory_neighborhood?.trim()
      ? { territory_neighborhood: q.territory_neighborhood.trim() }
      : {}),
    ...(q.agent_branch?.trim() ? { agent_branch: q.agent_branch.trim() } : {}),
    ...(q.agent_payment_type?.trim() ? { agent_payment_type: q.agent_payment_type.trim() } : {}),
    ...(q.branch_ids?.trim()
      ? {
          agent_branches: q.branch_ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        }
      : {}),
    ...(q.order_date_from?.trim() ? { order_date_from: q.order_date_from.trim() } : {}),
    ...(q.order_date_to?.trim() ? { order_date_to: q.order_date_to.trim() } : {}),
    ...(q.sort_by?.trim() ? { sort_by: q.sort_by.trim() } : {}),
    ...(q.sort_dir === "desc" ? { sort_dir: "desc" as const } : q.sort_dir === "asc" ? { sort_dir: "asc" as const } : {}),
    warehouse_ids: parseCommaInts(q.warehouse_ids),
    explicit_client_ids: parseCommaInts(q.client_ids),
    ...(q.shipment_date_from?.trim() ? { shipment_date_from: q.shipment_date_from.trim() } : {}),
    ...(q.shipment_date_to?.trim() ? { shipment_date_to: q.shipment_date_to.trim() } : {}),
    ...(q.order_consignment_due_from?.trim()
      ? { order_consignment_due_from: q.order_consignment_due_from.trim() }
      : {}),
    ...(q.order_consignment_due_to?.trim()
      ? { order_consignment_due_to: q.order_consignment_due_to.trim() }
      : {}),
    ...(q.order_payment_ref?.trim() ? { order_payment_ref: q.order_payment_ref.trim() } : {}),
    order_consignment
  };
}

function orderConsignmentModeSql(mode: OrderDebtsListQuery["order_consignment"]): Prisma.Sql {
  if (mode === "consignment") {
    return Prisma.sql`AND (
      o.is_consignment = true
      OR EXISTS (
        SELECT 1 FROM users ag
        WHERE ag.id = o.agent_id AND ag.tenant_id = o.tenant_id AND ag.consignment = true
      )
    )`;
  }
  if (mode === "regular") {
    return Prisma.sql`AND NOT (
      o.is_consignment = true
      OR EXISTS (
        SELECT 1 FROM users ag
        WHERE ag.id = o.agent_id AND ag.tenant_id = o.tenant_id AND ag.consignment = true
      )
    )`;
  }
  return Prisma.empty;
}

function shipmentDateClause(from?: string, to?: string): Prisma.Sql {
  const f = from?.trim();
  const t = to?.trim();
  if (!f && !t) return Prisma.empty;
  const fUtc = f ? new Date(`${f}T00:00:00.000Z`) : null;
  const tUtc = t ? new Date(`${t}T23:59:59.999Z`) : null;
  if (fUtc && Number.isNaN(fUtc.getTime())) return Prisma.empty;
  if (tUtc && Number.isNaN(tUtc.getTime())) return Prisma.empty;
  if (fUtc && tUtc) {
    return Prisma.sql`AND ship.shipped_at IS NOT NULL AND ship.shipped_at >= ${fUtc} AND ship.shipped_at <= ${tUtc}`;
  }
  if (fUtc) {
    return Prisma.sql`AND ship.shipped_at IS NOT NULL AND ship.shipped_at >= ${fUtc}`;
  }
  if (tUtc) {
    return Prisma.sql`AND ship.shipped_at IS NOT NULL AND ship.shipped_at <= ${tUtc}`;
  }
  return Prisma.empty;
}

function orderConsignmentDueClause(from?: string, to?: string): Prisma.Sql {
  const f = from?.trim();
  const t = to?.trim();
  if (!f && !t) return Prisma.empty;
  const fUtc = f ? new Date(`${f}T00:00:00.000Z`) : null;
  const tUtc = t ? new Date(`${t}T23:59:59.999Z`) : null;
  if (fUtc && Number.isNaN(fUtc.getTime())) return Prisma.empty;
  if (tUtc && Number.isNaN(tUtc.getTime())) return Prisma.empty;
  if (fUtc && tUtc) {
    return Prisma.sql`AND o.consignment_due_date IS NOT NULL AND o.consignment_due_date >= ${fUtc} AND o.consignment_due_date <= ${tUtc}`;
  }
  if (fUtc) {
    return Prisma.sql`AND o.consignment_due_date IS NOT NULL AND o.consignment_due_date >= ${fUtc}`;
  }
  if (tUtc) {
    return Prisma.sql`AND o.consignment_due_date IS NOT NULL AND o.consignment_due_date <= ${tUtc}`;
  }
  return Prisma.empty;
}

function tableSearchClause(search: string | undefined): Prisma.Sql {
  const s = search?.trim();
  if (!s) return Prisma.empty;
  const pat = `%${s.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  return Prisma.sql`AND (
    c.name ILIKE ${pat}
    OR COALESCE(c.phone, '') ILIKE ${pat}
    OR o.number ILIKE ${pat}
  )`;
}

function warehouseClause(ids: number[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty;
  return Prisma.sql`AND o.warehouse_id IN (${Prisma.join(ids)})`;
}

function expeditorOrderClause(expeditorUserId: number | undefined): Prisma.Sql {
  if (expeditorUserId == null || expeditorUserId <= 0) return Prisma.empty;
  return Prisma.sql`AND o.expeditor_user_id = ${expeditorUserId}`;
}

function orderPaymentRefClause(ref: string | undefined): Prisma.Sql {
  const r = ref?.trim();
  if (!r) return Prisma.empty;
  const pat = `%${r.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  return Prisma.sql`AND COALESCE(o.payment_method_ref, '') ILIKE ${pat}`;
}

export type OrderDebtRow = {
  order_id: number;
  order_number: string;
  /** `orders.status` — hisobotda asosan `delivered` */
  order_status: string;
  client_id: number;
  client_name: string;
  /** Hozircha tenant valyutasi bilan mos: SQL da `UZS` */
  currency: string;
  address: string | null;
  landmark: string | null;
  phone: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_code: string | null;
  expeditor_user_id: number | null;
  expeditor_name: string | null;
  expeditor_code: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  total_sum: string;
  /** Zakazga taqsimlangan to‘lovlar (payment_allocations), `total_sum` dan oshmasin */
  allocated_sum: string;
  payment_method_label: string | null;
  /** Birinchi `delivering|delivered` log sanasi */
  shipped_at: string | null;
  consignment_due_date: string | null;
  remainder: string;
  /** Mijoz bo‘yicha kassadan taqsimlanmagan pul (barcha zakazlar uchun bir xil client_id qatorida) */
  unallocated: string;
  /** `client_balances.balance` */
  client_balance: string;
};

export type OrderDebtsListResponse = {
  data: OrderDebtRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total_remainder: string; currency: string };
};

type RawOrderDebtRow = {
  order_id: unknown;
  order_number: string;
  order_status: string;
  client_id: unknown;
  client_name: string;
  currency: string;
  address: string | null;
  landmark: string | null;
  phone: string | null;
  agent_id: unknown;
  agent_name: string | null;
  agent_code: string | null;
  expeditor_user_id: unknown;
  expeditor_name: string | null;
  expeditor_code: string | null;
  warehouse_id: unknown;
  warehouse_name: string | null;
  total_sum: Prisma.Decimal;
  allocated_sum: Prisma.Decimal;
  payment_method_ref: string | null;
  shipped_at: Date | null;
  consignment_due_date: Date | null;
  remainder: Prisma.Decimal;
  client_balance: Prisma.Decimal;
};

function readSort(q: OrderDebtsListQuery): { col: string; dir: 1 | -1 } {
  const col = q.sort_by?.trim() || "remainder";
  const dir: 1 | -1 = q.sort_dir === "asc" ? 1 : -1;
  const allowed = new Set([
    "remainder",
    "shipped_at",
    "total_sum",
    "order_number",
    "client_name",
    "currency",
    "address",
    "landmark",
    "phone",
    "agent_name",
    "expeditor_name",
    "warehouse_name",
    "payment_method_ref",
    "consignment_due_date",
    "allocated_sum",
    "client_balance"
  ]);
  return { col: allowed.has(col) ? col : "remainder", dir };
}

/** `SELECT * FROM base WHERE …` dan keyin — `base` ustun nomlari. */
function orderBySql(sort: { col: string; dir: 1 | -1 }): Prisma.Sql {
  const d = sort.dir === 1 ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  switch (sort.col) {
    case "shipped_at":
      return Prisma.sql`ORDER BY shipped_at ${d} NULLS LAST, order_id DESC`;
    case "consignment_due_date":
      return Prisma.sql`ORDER BY consignment_due_date ${d} NULLS LAST, order_id DESC`;
    case "total_sum":
      return Prisma.sql`ORDER BY total_sum ${d}, order_id DESC`;
    case "allocated_sum":
      return Prisma.sql`ORDER BY allocated_sum ${d}, order_id DESC`;
    case "remainder":
      return Prisma.sql`ORDER BY remainder ${d}, order_id DESC`;
    case "client_balance":
      return Prisma.sql`ORDER BY client_balance ${d}, order_id DESC`;
    case "order_number":
      return Prisma.sql`ORDER BY order_number ${d}, order_id DESC`;
    case "client_name":
      return Prisma.sql`ORDER BY client_name ${d} NULLS LAST, order_id DESC`;
    case "currency":
      return Prisma.sql`ORDER BY currency ${d}, order_id DESC`;
    case "address":
      return Prisma.sql`ORDER BY address ${d} NULLS LAST, order_id DESC`;
    case "landmark":
      return Prisma.sql`ORDER BY landmark ${d} NULLS LAST, order_id DESC`;
    case "phone":
      return Prisma.sql`ORDER BY phone ${d} NULLS LAST, order_id DESC`;
    case "agent_name":
      return Prisma.sql`ORDER BY agent_name ${d} NULLS LAST, order_id DESC`;
    case "expeditor_name":
      return Prisma.sql`ORDER BY expeditor_name ${d} NULLS LAST, order_id DESC`;
    case "warehouse_name":
      return Prisma.sql`ORDER BY warehouse_name ${d} NULLS LAST, order_id DESC`;
    case "payment_method_ref":
      return Prisma.sql`ORDER BY COALESCE(payment_method_ref, '') ${d}, order_id DESC`;
    default:
      return Prisma.sql`ORDER BY remainder ${d}, order_id DESC`;
  }
}

async function loadUnallocatedByClient(
  tenantId: number,
  clientIds: number[]
): Promise<Map<number, Prisma.Decimal>> {
  const out = new Map<number, Prisma.Decimal>();
  if (clientIds.length === 0) return out;
  const chunk = 5000;
  for (let i = 0; i < clientIds.length; i += chunk) {
    const part = clientIds.slice(i, i + chunk);
    const rows = await prisma.$queryRaw<Array<{ client_id: unknown; unallocated: Prisma.Decimal }>>`
      WITH pay AS (
        SELECT p.client_id,
          SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount ELSE 0 END)::decimal(15,2) AS pay_sum
        FROM client_payments p
        WHERE p.tenant_id = ${tenantId}
          AND p.client_id IN (${Prisma.join(part)})
          AND p.deleted_at IS NULL
          AND ${PAYMENT_NOT_PENDING}
        GROUP BY p.client_id
      ),
      alc AS (
        SELECT p.client_id,
          SUM(pa.amount)::decimal(15,2) AS alloc_sum
        FROM payment_allocations pa
        INNER JOIN client_payments p ON p.id = pa.payment_id AND p.tenant_id = pa.tenant_id
        WHERE pa.tenant_id = ${tenantId}
          AND p.client_id IN (${Prisma.join(part)})
          AND p.deleted_at IS NULL
          AND ${PAYMENT_NOT_PENDING}
        GROUP BY p.client_id
      )
      SELECT pay.client_id,
        (COALESCE(pay.pay_sum, 0) - COALESCE(alc.alloc_sum, 0))::decimal(15,2) AS unallocated
      FROM pay
      LEFT JOIN alc ON alc.client_id = pay.client_id
    `;
    for (const r of rows) {
      const cid = sqlIntIdToNumber(r.client_id);
      if (!Number.isFinite(cid)) continue;
      out.set(cid, r.unallocated ?? new Prisma.Decimal(0));
    }
  }
  return out;
}

export async function listOrderDebtsReport(
  tenantId: number,
  rawQ: Record<string, string | undefined>
): Promise<OrderDebtsListResponse> {
  const q = parseOrderDebtsListQuery(rawQ);
  const page = q.page;
  const limit = q.limit;
  const offset = (page - 1) * limit;

  const forClients: ClientBalanceListQuery = {
    ...q,
    search: undefined,
    view: "clients",
    page: 1,
    limit: 1
  };
  const clientWhere = buildClientWhere(tenantId, forClients, { skipBalanceFilter: true });
  const idRows = await prisma.client.findMany({ where: clientWhere, select: { id: true } });
  let clientIds = idRows.map((r) => r.id);
  if (q.explicit_client_ids && q.explicit_client_ids.length > 0) {
    const allow = new Set(q.explicit_client_ids);
    clientIds = clientIds.filter((id) => allow.has(id));
  }
  if (clientIds.length === 0) {
    return {
      data: [],
      total: 0,
      page,
      limit,
      summary: { total_remainder: "0", currency: "UZS" }
    };
  }

  const orderDateClause = buildOrderCreatedLocalDateClause(q.order_date_from ?? null, q.order_date_to ?? null);
  const shipClause = shipmentDateClause(q.shipment_date_from, q.shipment_date_to);
  const consDueClause = orderConsignmentDueClause(q.order_consignment_due_from, q.order_consignment_due_to);
  const consModeSql = orderConsignmentModeSql(q.order_consignment);
  const whClause = warehouseClause(q.warehouse_ids ?? []);
  const exClause = expeditorOrderClause(q.expeditor_user_id);
  const payRefClause = orderPaymentRefClause(q.order_payment_ref);
  const searchClause = tableSearchClause(q.search);
  const sortSql = orderBySql(readSort(q));

  const receivable = [...ORDER_STATUSES_OUTSTANDING_RECEIVABLE] as string[];

  const countRows = await prisma.$queryRaw<[{ total: bigint; sum_remainder: Prisma.Decimal }]>`
    WITH alloc AS (
      SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS sum_amt
      FROM payment_allocations pa
      WHERE pa.tenant_id = ${tenantId}
      GROUP BY pa.order_id
    ),
    ship AS (
      SELECT sl.order_id, MIN(sl.created_at) AS shipped_at
      FROM order_status_logs sl
      INNER JOIN orders ox ON ox.id = sl.order_id AND ox.tenant_id = ${tenantId}
      WHERE sl.to_status IN ('delivering', 'delivered')
      GROUP BY sl.order_id
    ),
    base AS (
      SELECT
        o.id,
        o.client_id,
        GREATEST(o.total_sum - COALESCE(a.sum_amt, 0), 0)::decimal(15,2) AS remainder,
        ship.shipped_at
      FROM orders o
      INNER JOIN clients c ON c.id = o.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN alloc a ON a.order_id = o.id
      LEFT JOIN ship ON ship.order_id = o.id
      WHERE o.tenant_id = ${tenantId}
        AND o.order_type = 'order'
        AND o.status IN (${Prisma.join(receivable)})
        AND o.client_id IN (${Prisma.join(clientIds)})
        ${orderDateClause}
        ${whClause}
        ${exClause}
        ${consModeSql}
        ${consDueClause}
        ${payRefClause}
        ${searchClause}
        ${shipClause}
    )
    SELECT
      COUNT(*)::bigint AS total,
      COALESCE(SUM(remainder), 0)::decimal(15,2) AS sum_remainder
    FROM base
    WHERE remainder > 0
  `;

  const total = Number(countRows[0]?.total ?? 0n);
  const sumAllRemainder = (countRows[0]?.sum_remainder ?? new Prisma.Decimal(0)).toString();

  const dataRows = await prisma.$queryRaw<RawOrderDebtRow[]>`
    WITH alloc AS (
      SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS sum_amt
      FROM payment_allocations pa
      WHERE pa.tenant_id = ${tenantId}
      GROUP BY pa.order_id
    ),
    ship AS (
      SELECT sl.order_id, MIN(sl.created_at) AS shipped_at
      FROM order_status_logs sl
      INNER JOIN orders ox ON ox.id = sl.order_id AND ox.tenant_id = ${tenantId}
      WHERE sl.to_status IN ('delivering', 'delivered')
      GROUP BY sl.order_id
    ),
    base AS (
      SELECT
        o.id AS order_id,
        o.number AS order_number,
        o.status AS order_status,
        o.client_id,
        c.name AS client_name,
        'UZS'::text AS currency,
        c.address,
        c.landmark,
        c.phone,
        o.agent_id,
        ag.name AS agent_name,
        ag.code AS agent_code,
        o.expeditor_user_id,
        ex.name AS expeditor_name,
        ex.code AS expeditor_code,
        o.warehouse_id,
        w.name AS warehouse_name,
        o.total_sum,
        LEAST(COALESCE(a.sum_amt, 0), o.total_sum)::decimal(15,2) AS allocated_sum,
        o.payment_method_ref,
        ship.shipped_at AS shipped_at,
        o.consignment_due_date,
        GREATEST(o.total_sum - COALESCE(a.sum_amt, 0), 0)::decimal(15,2) AS remainder,
        COALESCE(cb.balance, 0)::decimal(15,2) AS client_balance
      FROM orders o
      INNER JOIN clients c ON c.id = o.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN users ag ON ag.id = o.agent_id
      LEFT JOIN users ex ON ex.id = o.expeditor_user_id
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
      LEFT JOIN client_balances cb ON cb.client_id = c.id AND cb.tenant_id = ${tenantId}
      LEFT JOIN alloc a ON a.order_id = o.id
      LEFT JOIN ship ON ship.order_id = o.id
      WHERE o.tenant_id = ${tenantId}
        AND o.order_type = 'order'
        AND o.status IN (${Prisma.join(receivable)})
        AND o.client_id IN (${Prisma.join(clientIds)})
        ${orderDateClause}
        ${whClause}
        ${exClause}
        ${consModeSql}
        ${consDueClause}
        ${payRefClause}
        ${searchClause}
        ${shipClause}
    )
    SELECT * FROM base
    WHERE remainder > 0
    ${sortSql}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const sliceClientIds = [...new Set(dataRows.map((r) => sqlIntIdToNumber(r.client_id)).filter(Number.isFinite))];
  const { entries: pmEntries } = await loadTenantPaymentRefs(tenantId);
  const unallocMap = await loadUnallocatedByClient(tenantId, sliceClientIds);

  const data: OrderDebtRow[] = dataRows.map((r) => {
    const oid = sqlIntIdToNumber(r.order_id);
    const cid = sqlIntIdToNumber(r.client_id);
    const rem = r.remainder ?? new Prisma.Decimal(0);
    const unallocated = unallocMap.get(cid) ?? new Prisma.Decimal(0);
    return {
      order_id: oid,
      order_number: r.order_number,
      order_status: r.order_status ?? "",
      client_id: cid,
      client_name: r.client_name,
      currency: r.currency,
      address: r.address,
      landmark: r.landmark,
      phone: r.phone,
      agent_id: r.agent_id != null ? sqlIntIdToNumber(r.agent_id) : null,
      agent_name: r.agent_name,
      agent_code: r.agent_code?.trim() || null,
      expeditor_user_id: r.expeditor_user_id != null ? sqlIntIdToNumber(r.expeditor_user_id) : null,
      expeditor_name: r.expeditor_name,
      expeditor_code: r.expeditor_code?.trim() || null,
      warehouse_id: r.warehouse_id != null ? sqlIntIdToNumber(r.warehouse_id) : null,
      warehouse_name: r.warehouse_name,
      total_sum: r.total_sum.toString(),
      allocated_sum: (r.allocated_sum ?? new Prisma.Decimal(0)).toString(),
      payment_method_label: resolvePaymentMethodRefToLabel(r.payment_method_ref, pmEntries),
      shipped_at: r.shipped_at?.toISOString() ?? null,
      consignment_due_date: r.consignment_due_date?.toISOString() ?? null,
      remainder: rem.toString(),
      unallocated: unallocated.toString(),
      client_balance: (r.client_balance ?? new Prisma.Decimal(0)).toString()
    };
  });

  return {
    data,
    total,
    page,
    limit,
    summary: { total_remainder: sumAllRemainder, currency: "UZS" }
  };
}

export async function exportOrderDebtsXlsx(
  tenantId: number,
  rawQ: Record<string, string | undefined>
): Promise<{ buffer: Buffer; truncated: boolean; total: number }> {
  const cap = Math.min(10000, Math.max(1, Number.parseInt(rawQ.export_limit ?? "5000", 10) || 5000));
  const q = { ...rawQ, page: "1", limit: String(cap), large_export: "1" };
  const batch = await listOrderDebtsReport(tenantId, q);
  const truncated = batch.total > cap;
  const staffLabel = (name: string | null | undefined, code: string | null | undefined): string => {
    const n = (name ?? "").trim();
    const c = (code ?? "").trim();
    if (!n && !c) return "";
    if (!c) return n;
    if (!n) return c;
    return `${n} (${c})`;
  };
  const headers = [
    "Заказ ID",
    "Номер",
    "Статус заказа",
    "Клиент",
    "Валюта",
    "Адрес",
    "Ориентир",
    "Телефон",
    "Агент",
    "Экспедитор",
    "Склад",
    "Сумма заказа",
    "Оплачено по заказу",
    "Способ оплаты",
    "Дата отгрузки",
    "Срок консигнации",
    "Остаток по заказу",
    "Нераспр. по клиенту",
    "Баланс клиента"
  ];
  const rows: (string | number)[][] = batch.data.map((r) => [
    r.order_id,
    r.order_number,
    r.order_status,
    r.client_name,
    r.currency,
    r.address ?? "",
    r.landmark ?? "",
    r.phone ?? "",
    staffLabel(r.agent_name, r.agent_code),
    staffLabel(r.expeditor_name, r.expeditor_code),
    r.warehouse_name ?? "",
    Number.parseFloat(r.total_sum) || 0,
    Number.parseFloat(r.allocated_sum) || 0,
    r.payment_method_label ?? "",
    r.shipped_at ? new Date(r.shipped_at).toLocaleDateString("ru-RU") : "",
    r.consignment_due_date ? new Date(r.consignment_due_date).toLocaleDateString("ru-RU") : "",
    Number.parseFloat(r.remainder) || 0,
    Number.parseFloat(r.unallocated) || 0,
    Number.parseFloat(r.client_balance) || 0
  ]);
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(() => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Debts");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, truncated, total: batch.total };
}
