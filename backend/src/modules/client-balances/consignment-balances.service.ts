import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ORDER_STATUSES_OUTSTANDING_RECEIVABLE } from "../orders/order-status";
import {
  buildClientWhere,
  buildOrderCreatedLocalDateClause,
  buildSummaryNetMinusUnpaid,
  loadPaymentNetNormByClient,
  loadPaymentNetTotalsByTypeGlobally,
  loadTenantPaymentRefs,
  loadUnpaidOrderBalanceRawByPaymentRef,
  parseIsoDateEndUtc,
  paymentAmountsNetMinusUnpaid,
  processUnpaidPayRefRows,
  sqlIntIdToNumber,
  type ClientBalanceListQuery,
  type ClientBalancePaymentTypeSummary
} from "./client-balances.service";

const LARGE_CLIENT_IDS_CHUNK = 10000;
const BALANCE_PERF_LOG = process.env.BALANCE_PERF_LOG === "1";

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

const agentSelect = {
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

export type ConsignmentBalanceRow = {
  client_id: number;
  client_code: string | null;
  client_name: string;
  is_active: boolean;
  agent_name: string | null;
  agent_code: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  trade_direction: string | null;
  inn: string | null;
  phone: string | null;
  due_date: string | null;
  overdue_days: number | null;
  /** Yetkazilgan konsignatsiya zakazlari yig‘indisi (total_sum) */
  total_debt: string;
  /** Shu zakazlarga taqsimlangan to‘lovlar */
  total_paid: string;
  /** Qoldiq: -(to‘lanmagan qism) — manfiy = qarz (balanslar sahifasi bilan mos) */
  balance: string;
  /** Spravochnik bo‘yicha: kirim − konsignatsiya yopilmagan zakazlar (zakazning `payment_method_ref`) */
  payment_amounts: ClientBalancePaymentTypeSummary[];
};

export type ConsignmentBalanceListResponse = {
  data: ConsignmentBalanceRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    /** Jami to‘lanmagan konsignatsiya (manfiy) */
    total_debt: string;
    /** Birinchi ustun yoki «naqd» nomli ustun (eski KPI «Naqd» uchun) */
    cash_debt: string;
    /** «Балансы клиентов» dagi kabi: spravochnik ustunlari */
    payment_by_type: ClientBalancePaymentTypeSummary[];
  };
};

type ConsignmentDebtAgg = {
  gross: Prisma.Decimal;
  allocated: Prisma.Decimal;
  unpaid: Prisma.Decimal;
  lastDue: Date | null;
  firstDue: Date | null;
};

async function loadConsignmentDebtByClient(
  tenantId: number,
  clientIds: number[],
  orderDateFrom: string | null | undefined,
  orderDateTo: string | null | undefined
): Promise<Map<number, ConsignmentDebtAgg>> {
  const map = new Map<number, ConsignmentDebtAgg>();
  if (clientIds.length === 0) return map;

  const orderDateClause = buildOrderCreatedLocalDateClause(orderDateFrom, orderDateTo);

  const chunkSize = LARGE_CLIENT_IDS_CHUNK;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const rows = await prisma.$queryRaw<
      Array<{
        client_id: number;
        gross_sum: Prisma.Decimal;
        allocated_sum: Prisma.Decimal;
        unpaid: Prisma.Decimal;
        last_unpaid_due: Date | null;
        first_unpaid_due: Date | null;
      }>
    >`
      WITH cand AS (
        SELECT o.id, o.client_id, o.total_sum, o.consignment_due_date
        FROM orders o
        WHERE o.tenant_id = ${tenantId}
          AND o.order_type = 'order'
          AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
          AND (
            o.is_consignment = true
            OR EXISTS (
              SELECT 1 FROM users ag
              WHERE ag.id = o.agent_id AND ag.tenant_id = o.tenant_id AND ag.consignment = true
            )
          )
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
      ord AS (
        SELECT
          c.client_id,
          c.total_sum,
          COALESCE(a.allocated, 0)::decimal(15,2) AS allocated,
          c.consignment_due_date
        FROM cand c
        LEFT JOIN alloc a ON a.order_id = c.id
      ),
      agg AS (
        SELECT
          client_id,
          SUM(total_sum)::decimal(15,2) AS gross_sum,
          SUM(allocated)::decimal(15,2) AS allocated_sum,
          SUM(GREATEST(total_sum - allocated, 0))::decimal(15,2) AS unpaid,
          MAX(consignment_due_date) FILTER (WHERE (total_sum - allocated) > 0) AS last_unpaid_due,
          MIN(consignment_due_date) FILTER (WHERE (total_sum - allocated) > 0) AS first_unpaid_due
        FROM ord
        GROUP BY client_id
      )
      SELECT client_id, gross_sum, allocated_sum, unpaid, last_unpaid_due, first_unpaid_due
      FROM agg
      WHERE unpaid > 0
    `;
    for (const r of rows) {
      const cid = sqlIntIdToNumber(r.client_id);
      if (!Number.isFinite(cid)) continue;
      map.set(cid, {
        gross: r.gross_sum,
        allocated: r.allocated_sum,
        unpaid: r.unpaid,
        lastDue: r.last_unpaid_due,
        firstDue: r.first_unpaid_due
      });
    }
  }
  return map;
}

/**
 * Konsignatsiya belgili savdo zakazlari (`is_consignment` yoki konsignatsiya agenti), status **delivered** + taqsimlar.
 * Ro‘yxatda faqat to‘lanmagan qoldiq > 0 bo‘lgan mijozlar.
 */
export async function listConsignmentBalancesReport(
  tenantId: number,
  q: ClientBalanceListQuery
): Promise<ConsignmentBalanceListResponse> {
  const perf = makePerfMarker(`consignment-balances t=${tenantId}`);
  const page = Math.max(1, q.page);
  const maxL = q.allow_large_export ? 5000 : 200;
  const limit = Math.min(maxL, Math.max(1, q.limit));

  const qConsign: ClientBalanceListQuery = {
    ...q,
    view: "clients",
    page,
    limit,
    allow_large_export: q.allow_large_export
  };

  const where = buildClientWhere(tenantId, qConsign, { skipBalanceFilter: true });

  const allClients = await prisma.client.findMany({
    where,
    select: { id: true }
  });
  const ids = allClients.map((c) => c.id);
  perf("ids-loaded", { ids: ids.length, page, limit });

  const odFrom = q.order_date_from?.trim() || null;
  const odTo = q.order_date_to?.trim() || null;

  const debtMap = await loadConsignmentDebtByClient(tenantId, ids, odFrom, odTo);
  perf("debt-map-loaded", { debtClients: debtMap.size });

  const eligible = ids.filter((id) => debtMap.has(id));

  eligible.sort((a, b) => {
    const da = debtMap.get(a)?.unpaid ?? new Prisma.Decimal(0);
    const db = debtMap.get(b)?.unpaid ?? new Prisma.Decimal(0);
    return db.cmp(da);
  });

  const total = eligible.length;
  const sliceIds = eligible.slice((page - 1) * limit, page * limit);

  let sumUnpaid = new Prisma.Decimal(0);
  for (const id of eligible) {
    sumUnpaid = sumUnpaid.add(debtMap.get(id)?.unpaid ?? new Prisma.Decimal(0));
  }
  const totalDebtNeg = sumUnpaid.neg().toString();

  const asOfRaw = q.balance_as_of?.trim();
  const asOfEnd = asOfRaw ? parseIsoDateEndUtc(asOfRaw) : null;

  const { labels: sprLabels, entries: pmEntries } = await loadTenantPaymentRefs(tenantId);
  const [rawUnpaid, netGlobal, pagePayNorm] = await Promise.all([
    loadUnpaidOrderBalanceRawByPaymentRef(tenantId, eligible, odFrom, odTo, {
      consignmentOnly: true
    }),
    loadPaymentNetTotalsByTypeGlobally(tenantId, eligible, asOfEnd, pmEntries),
    loadPaymentNetNormByClient(tenantId, sliceIds, asOfEnd, pmEntries)
  ]);
  perf("payment-sources-loaded", {
    eligible: eligible.length,
    sliceIds: sliceIds.length,
    payTypeCount: sprLabels.length,
    unpaidRows: rawUnpaid.length
  });

  const clients =
    sliceIds.length === 0
      ? []
      : await prisma.client.findMany({
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
            agent: { select: agentSelect.select }
          }
        });
  perf("page-clients-loaded", { clients: clients.length });

  const { byClient: unpaidByClientMethod, globalUnpaidNorm } = processUnpaidPayRefRows(
    rawUnpaid,
    pmEntries,
    sprLabels
  );
  const paymentByTypeSummary = buildSummaryNetMinusUnpaid(sprLabels, netGlobal, globalUnpaidNorm);
  const naqdKpi =
    paymentByTypeSummary.find((x) => /^\s*naqd\s*$/i.test(x.label.trim())) ?? paymentByTypeSummary[0];
  const cashDebtStr = naqdKpi?.amount ?? totalDebtNeg;

  const orderMap = new Map(clients.map((c) => [c.id, c]));
  const orderedClients = sliceIds.map((id) => orderMap.get(id)!).filter(Boolean);

  const data: ConsignmentBalanceRow[] = orderedClients.map((c) => {
    const d = debtMap.get(c.id)!;
    const ag = c.agent;
    const td =
      (ag?.trade_direction && String(ag.trade_direction).trim()) ||
      ag?.trade_direction_row?.name?.trim() ||
      null;

    const dueFromOrder = d.lastDue ?? d.firstDue;
    const dueIso = dueFromOrder?.toISOString() ?? c.license_until?.toISOString() ?? null;
    let overdueDays: number | null = null;
    const dueDate = dueFromOrder ?? c.license_until;
    if (dueDate) {
      const diff = Date.now() - dueDate.getTime();
      if (diff > 0) overdueDays = Math.floor(diff / 86400000);
    }

    const unpaid = d.unpaid;
    return {
      client_id: c.id,
      client_code: c.client_code,
      client_name: c.name,
      is_active: c.is_active,
      agent_name: ag?.name ?? null,
      agent_code: ag?.code ?? null,
      supervisor_name: ag?.supervisor?.name ?? null,
      company_name: c.legal_name,
      trade_direction: td,
      inn: c.inn,
      phone: c.phone,
      due_date: dueIso,
      overdue_days: overdueDays,
      total_debt: d.gross.toString(),
      total_paid: d.allocated.toString(),
      balance: unpaid.neg().toString(),
      payment_amounts: paymentAmountsNetMinusUnpaid(
        sprLabels,
        pagePayNorm.get(c.id),
        unpaidByClientMethod.get(c.id)
      )
    };
  });

  return {
    data,
    total,
    page,
    limit,
    summary: {
      total_debt: totalDebtNeg,
      cash_debt: cashDebtStr,
      payment_by_type: paymentByTypeSummary
    }
  };
}
