import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  paymentTypesFromMethodEntries,
  resolveCurrencyEntries,
  resolvePaymentMethodEntries,
  resolvePaymentMethodRefToLabel,
  type PaymentMethodEntryDto
} from "../tenant-settings/finance-refs";
import {
  loadDeliveryDebtByClient,
  mergeLedgerWithUnpaidDelivered
} from "../client-balances/client-balances.service";
import { ORDER_STATUSES_OUTSTANDING_RECEIVABLE } from "../orders/order-status";

export type ClientBalancePaymentTypeSummary = {
  label: string;
  amount: string;
};

export type ClientLedgerRow = {
  row_kind: "order" | "payment";
  sort_at: string;
  order_id: number | null;
  payment_id: number | null;
  order_number: string | null;
  type_label: string;
  debt_amount: string | null;
  payment_amount: string | null;
  payment_type: string | null;
  agent_name: string | null;
  expeditor_name: string | null;
  is_consignment: boolean | null;
  cash_desk_name: string | null;
  note: string | null;
  created_by_login: string | null;
  entry_kind: string | null;
  /** 1 — строка заказа/долга, 2 — оплата или расход (как в шаблоне Excel «Общий»). */
  type_code: 1 | 2;
  /** Код вида операции: 7 — заказ, 1 — оплата, 2 — расход клиента (шаблон «Подробно»). */
  operation_type_code: string;
  /** «Заказ» для заказов; для оплат пусто. */
  order_kind_label: string | null;
  /** Фиксированный текст для заказов (шаблон). */
  comment_primary: string | null;
  /** Примечание из документа (заказ/платёж). */
  comment_transaction: string | null;
  /** Кто создал / ответственный для отображения (как в шаблоне). */
  created_by_display: string | null;
  /** Нарастающий баланс после строки (только при ledger_detail=1). */
  balance_after: string | null;
  /**
   * Строка оплаты/расхода, привязанная к заказу: способ оплаты из заказа (как при оформлении).
   * Показывается в UI, если отличается от способа у самого платежа.
   */
  order_payment_method_label: string | null;
};

export type AgentBalanceCard = {
  agent_id: number | null;
  agent_name: string;
  agent_code: string | null;
  remaining_on_orders: string;
  payment_by_type: ClientBalancePaymentTypeSummary[];
  /** Суммы как в таблице «Общее»: долг и оплата (по строкам ведомости с теми же фильтрами даты/поиска/kind). */
  ledger_general_debt_total: string;
  ledger_general_payment_total: string;
};

export type ClientBalanceLedgerResponse = {
  client: {
    id: number;
    name: string;
    phone: string | null;
    client_code: string | null;
    territory_label: string | null;
    agent_id: number | null;
  };
  /** Сальдо в `client_balances` (платежи/расходы/корректировки; суммы заказов сюда не входят). */
  account_balance: string;
  /**
   * Как колонки «Оплата» и «Долг» в таблице ведомости: оплаты − долг для тех же фильтров
   * (дата, поиск, тип строк, агенты).
   */
  ledger_net_balance: string;
  summary_payment_by_type: ClientBalancePaymentTypeSummary[];
  agent_cards: AgentBalanceCard[];
  rows: ClientLedgerRow[];
  total: number;
  page: number;
  limit: number;
};

export type ClientLedgerQuery = {
  page: number;
  limit: number;
  date_from?: Date | null;
  date_to_end?: Date | null;
  search?: string | null;
  /** all | debt (заказы + расход) | payment */
  ledger_kind?: "all" | "debt" | "payment";
  /** Фильтр таблицы: только заказы/платежи этого агента (устарело, см. filter_agent_ids) */
  filter_agent_id?: number | null;
  /** Несколько агентов: строка попадает, если заказ/привязка платежа к любому из id */
  filter_agent_ids?: number[];
  /** Только строки без агента (agent_id IS NULL); можно вместе с filter_agent_ids */
  filter_no_agent?: boolean;
  /** Подробный режим: «Баланс (после)» и поля под Excel «Подробно». */
  ledger_detail?: boolean;
};

function resolveLedgerAgentFilter(q: ClientLedgerQuery): { agentIds: number[]; includeNoAgent: boolean } {
  const fromArr = (q.filter_agent_ids ?? []).filter((x) => Number.isFinite(x) && x > 0);
  let agentIds = [...new Set(fromArr)];
  const leg = q.filter_agent_id;
  if (agentIds.length === 0 && leg != null && leg > 0) agentIds = [leg];
  return { agentIds, includeNoAgent: Boolean(q.filter_no_agent) };
}

function buildLedgerAgentSqlClauses(
  agentIds: number[],
  includeNoAgent: boolean
): { orderAgentClause: Prisma.Sql; payAgentClause: Prisma.Sql } {
  const ids = [...new Set(agentIds.filter((x) => x > 0))];
  const hasIds = ids.length > 0;
  const fn = includeNoAgent;

  if (!hasIds && !fn) {
    return { orderAgentClause: Prisma.empty, payAgentClause: Prisma.empty };
  }

  if (!hasIds && fn) {
    return {
      orderAgentClause: Prisma.sql`AND o.agent_id IS NULL`,
      payAgentClause: Prisma.sql`AND COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) IS NULL`
    };
  }

  const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}`));

  if (hasIds && !fn) {
    return {
      orderAgentClause: Prisma.sql`AND o.agent_id IN (${idList})`,
      payAgentClause: Prisma.sql`AND COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) IN (${idList})`
    };
  }

  return {
    orderAgentClause: Prisma.sql`AND (o.agent_id IS NULL OR o.agent_id IN (${idList}))`,
    payAgentClause: Prisma.sql`AND (
      COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) IS NULL
      OR COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) IN (${idList})
    )`
  };
}

function normPayTypeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function loadTenantLedgerPaymentContext(tenantId: number): Promise<{
  sprLabels: string[];
  paymentMethodEntries: PaymentMethodEntryDto[];
}> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const settings = row?.settings as Record<string, unknown> | null | undefined;
  const ref = settings?.references as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== "object") {
    return { sprLabels: [], paymentMethodEntries: [] };
  }
  const currency_entries = resolveCurrencyEntries(ref);
  const paymentMethodEntries = resolvePaymentMethodEntries(ref, currency_entries);
  return {
    sprLabels: paymentTypesFromMethodEntries(paymentMethodEntries),
    paymentMethodEntries
  };
}

function paymentAmountsForSpravochnik(
  sprLabels: string[],
  netNorm: Map<string, Prisma.Decimal>
): ClientBalancePaymentTypeSummary[] {
  if (sprLabels.length === 0) return [];
  return sprLabels.map((l) => {
    const nk = normPayTypeKey(l);
    const amt = netNorm.get(nk) ?? new Prisma.Decimal(0);
    return { label: l.trim(), amount: amt.toString() };
  });
}

function buildNetNormFromRows(
  rows: Array<{ payment_type: string; net: Prisma.Decimal }>,
  entries: PaymentMethodEntryDto[]
): Map<string, Prisma.Decimal> {
  const netNorm = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const resolved =
      resolvePaymentMethodRefToLabel(r.payment_type, entries) ?? (r.payment_type ?? "").trim();
    const nk = normPayTypeKey(resolved);
    const prev = netNorm.get(nk) ?? new Prisma.Decimal(0);
    netNorm.set(nk, prev.add(r.net));
  }
  return netNorm;
}

function territoryLabel(c: {
  region: string | null;
  city: string | null;
  district: string | null;
}): string | null {
  const parts = [c.region, c.city, c.district].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type UnionRaw = {
  row_kind: string;
  sort_at: Date;
  order_id: number | null;
  payment_id: number | null;
  order_number: string | null;
  debt_amount: Prisma.Decimal | null;
  payment_amount: Prisma.Decimal | null;
  payment_type: string | null;
  is_consignment: boolean | null;
  agent_name: string | null;
  expeditor_name: string | null;
  cash_desk_name: string | null;
  note: string | null;
  created_by_login: string | null;
  entry_kind: string | null;
  balance_after?: Prisma.Decimal | null;
  /** Сырой `orders.payment_method_ref` для строки платежа (если есть заказ). */
  order_payment_method_ref: string | null;
};

function mapUnionToLedgerRow(r: UnionRaw): ClientLedgerRow {
  const rk = r.row_kind === "order" ? "order" : "payment";
  let type_label: string;
  if (rk === "order") {
    type_label = `Заказ (${r.order_number ?? r.order_id})`;
  } else if (String(r.entry_kind ?? "") === "client_expense") {
    type_label = `Расход (${r.payment_id})`;
  } else {
    type_label = `Оплата (${r.payment_id})`;
  }

  const type_code: 1 | 2 = rk === "order" ? 1 : 2;
  let operation_type_code = "1";
  if (rk === "order") {
    operation_type_code = "7";
  } else if (String(r.entry_kind ?? "") === "client_expense") {
    operation_type_code = "2";
  }

  const order_kind_label = rk === "order" ? "Заказ" : null;
  const comment_primary =
    rk === "order" ? "Удержание долга по заказу" : rk === "payment" && String(r.entry_kind) === "client_expense" ? "Расход клиента" : null;
  const comment_transaction = (r.note ?? "").trim() || null;

  const created_by_display =
    rk === "payment"
      ? (r.created_by_login?.trim() || null)
      : (r.created_by_login?.trim() || r.expeditor_name?.trim() || r.agent_name?.trim() || null);

  return {
    row_kind: rk,
    sort_at: r.sort_at.toISOString(),
    order_id: r.order_id,
    payment_id: r.payment_id,
    order_number: r.order_number,
    type_label,
    debt_amount: r.debt_amount != null ? r.debt_amount.toString() : null,
    payment_amount: r.payment_amount != null ? r.payment_amount.toString() : null,
    payment_type: r.payment_type,
    agent_name: r.agent_name,
    expeditor_name: r.expeditor_name,
    is_consignment: r.is_consignment,
    cash_desk_name: r.cash_desk_name,
    note: r.note,
    created_by_login: r.created_by_login,
    entry_kind: r.entry_kind,
    type_code,
    operation_type_code,
    order_kind_label,
    comment_primary,
    comment_transaction,
    created_by_display,
    balance_after: r.balance_after != null ? r.balance_after.toString() : null,
    order_payment_method_label: null
  };
}

export async function getClientBalanceLedger(
  tenantId: number,
  clientId: number,
  q: ClientLedgerQuery
): Promise<ClientBalanceLedgerResponse> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null },
    select: {
      id: true,
      name: true,
      phone: true,
      client_code: true,
      region: true,
      city: true,
      district: true,
      agent_id: true
    }
  });
  if (!client) {
    throw new Error("NOT_FOUND");
  }

  const { sprLabels, paymentMethodEntries } = await loadTenantLedgerPaymentContext(tenantId);

  const [balRow, deliveryMap] = await Promise.all([
    prisma.clientBalance.findUnique({
      where: { tenant_id_client_id: { tenant_id: tenantId, client_id: clientId } },
      select: { balance: true }
    }),
    loadDeliveryDebtByClient(tenantId, [clientId])
  ]);
  const ledgerDec = balRow?.balance ?? new Prisma.Decimal(0);
  const account_balance = mergeLedgerWithUnpaidDelivered(
    ledgerDec,
    deliveryMap.get(clientId)
  ).toString();

  const excluded = ["cancelled", "returned"] as const;

  /** Faqat yetkazilgan savdo zakazlari — to‘lanmagan qoldiq (taqsimlar bilan). */
  const remainingByAgent = await prisma.$queryRaw<
    Array<{ agent_id: number | null; agent_name: string | null; agent_code: string | null; remaining: Prisma.Decimal }>
  >`
    SELECT o.agent_id,
      ag.name AS agent_name,
      ag.code AS agent_code,
      SUM(GREATEST(o.total_sum - COALESCE(al.sum_amt, 0), 0))::decimal(15,2) AS remaining
    FROM orders o
    LEFT JOIN (
      SELECT pa.order_id, SUM(pa.amount)::decimal(15,2) AS sum_amt
      FROM payment_allocations pa
      WHERE pa.tenant_id = ${tenantId}
      GROUP BY pa.order_id
    ) al ON al.order_id = o.id
    LEFT JOIN users ag ON ag.id = o.agent_id
    WHERE o.tenant_id = ${tenantId}
      AND o.client_id = ${clientId}
      AND o.status IN (${Prisma.join([...ORDER_STATUSES_OUTSTANDING_RECEIVABLE])})
      AND o.order_type = 'order'
      AND GREATEST(o.total_sum - COALESCE(al.sum_amt, 0), 0) > 0
    GROUP BY o.agent_id, ag.name, ag.code
    ORDER BY ag.name ASC NULLS LAST
  `;

  /**
   * Kartochkalar «Способ оплаты» bo‘linmasi jadvaldagi to‘lov qatori bilan bir xil agentga bog‘lanadi:
   * COALESCE(zakaz.agent_id, mijoz.agent_id) — payment_allocations emas (aks holda jadval bilan ziddiyat).
   */
  const payNetByLedgerAgent = await prisma.$queryRaw<
    Array<{ agent_id: number | null; payment_type: string; net: Prisma.Decimal }>
  >`
    SELECT COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) AS agent_id,
      p.payment_type,
      SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount
               WHEN p.entry_kind = 'client_expense' THEN -p.amount
               ELSE 0 END)::decimal(15,2) AS net
    FROM client_payments p
    JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
    LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
    WHERE p.tenant_id = ${tenantId}
      AND p.client_id = ${clientId}
      AND p.deleted_at IS NULL
    GROUP BY COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id), p.payment_type
  `;

  const agentPayMap = new Map<number | null, Map<string, Prisma.Decimal>>();
  for (const r of payNetByLedgerAgent) {
    const aid = r.agent_id ?? null;
    let inner = agentPayMap.get(aid);
    if (!inner) {
      inner = new Map();
      agentPayMap.set(aid, inner);
    }
    const resolved =
      resolvePaymentMethodRefToLabel(r.payment_type, paymentMethodEntries) ?? (r.payment_type ?? "").trim();
    const nk = normPayTypeKey(resolved);
    const cur = inner.get(nk) ?? new Prisma.Decimal(0);
    inner.set(nk, cur.add(r.net));
  }

  /** Все агенты, которые встречаются в ведомости (заказы + платежи), чтобы карточки совпадали с таблицей. */
  const ledgerAgentKeys = await prisma.$queryRaw<
    Array<{ agent_id: number | null; agent_name: string | null; agent_code: string | null }>
  >`
    WITH src AS (
      SELECT o.agent_id AS agent_id, ag.name AS agent_name, ag.code AS agent_code
      FROM orders o
      LEFT JOIN users ag ON ag.id = o.agent_id
      WHERE o.tenant_id = ${tenantId}
        AND o.client_id = ${clientId}
        AND o.status NOT IN (${Prisma.join(excluded)})
        AND o.order_type = 'order'
      UNION ALL
      SELECT COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) AS agent_id,
        COALESCE(lag.name, oag.name, cag.name) AS agent_name,
        COALESCE(lag.code, oag.code, cag.code) AS agent_code
      FROM client_payments p
      JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
      LEFT JOIN users lag ON lag.id = p.ledger_agent_id
      LEFT JOIN users oag ON oag.id = ord.agent_id
      LEFT JOIN users cag ON cag.id = c.agent_id
      WHERE p.client_id = ${clientId}
        AND p.tenant_id = ${tenantId}
        AND p.deleted_at IS NULL
    )
    SELECT agent_id,
      MAX(NULLIF(TRIM(agent_name), '')) AS agent_name,
      MAX(agent_code) AS agent_code
    FROM src
    GROUP BY agent_id
  `;

  const cardByAgentKey = new Map<string, AgentBalanceCard>();

  const agentKey = (id: number | null) => (id == null ? "null" : String(id));

  for (const row of remainingByAgent) {
    const aid = row.agent_id ?? null;
    const netForAgent = agentPayMap.get(aid) ?? new Map();
    cardByAgentKey.set(agentKey(row.agent_id), {
      agent_id: row.agent_id,
      agent_name: row.agent_name?.trim() || "Без агента",
      agent_code: row.agent_code ?? null,
      remaining_on_orders: row.remaining.toString(),
      payment_by_type: paymentAmountsForSpravochnik(sprLabels, netForAgent),
      ledger_general_debt_total: "0",
      ledger_general_payment_total: "0"
    });
  }

  for (const row of ledgerAgentKeys) {
    const k = agentKey(row.agent_id);
    if (cardByAgentKey.has(k)) continue;
    const aid = row.agent_id ?? null;
    const netForAgent = agentPayMap.get(aid) ?? new Map();
    cardByAgentKey.set(k, {
      agent_id: row.agent_id,
      agent_name: row.agent_name?.trim() || "Без агента",
      agent_code: row.agent_code ?? null,
      remaining_on_orders: "0",
      payment_by_type: paymentAmountsForSpravochnik(sprLabels, netForAgent),
      ledger_general_debt_total: "0",
      ledger_general_payment_total: "0"
    });
  }

  const agent_cards: AgentBalanceCard[] = Array.from(cardByAgentKey.values()).sort((a, b) => {
    const an = a.agent_name.trim() || "";
    const bn = b.agent_name.trim() || "";
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    return an.localeCompare(bn, "ru", { sensitivity: "base" });
  });

  const page = Math.max(1, q.page);
  const maxLimit = q.ledger_detail ? 5000 : 100;
  const limit = Math.min(maxLimit, Math.max(1, q.limit));
  const offset = (page - 1) * limit;
  const includeLedgerDetail = Boolean(q.ledger_detail);
  const rankedCte = includeLedgerDetail
    ? Prisma.sql`,
  ranked AS (
    SELECT b.*,
      SUM(COALESCE(b.debt_amount,0) + COALESCE(b.payment_amount,0)) OVER (
        ORDER BY b.sort_at ASC, b.order_id ASC NULLS LAST, b.payment_id ASC NULLS LAST
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::decimal(15,2) AS balance_after
    FROM base b
  )`
    : Prisma.empty;
  const fromTable = includeLedgerDetail ? Prisma.raw("ranked") : Prisma.raw("base");

  const df = q.date_from ?? null;
  const dt = q.date_to_end ?? null;
  const searchRaw = (q.search ?? "").trim();
  const searchSafe = searchRaw.replace(/[%_\\]/g, "").trim();
  const searchPat = searchSafe.length > 0 ? `%${searchSafe}%` : null;

  const orderDateClause =
    df && dt
      ? Prisma.sql`AND o.created_at >= ${df} AND o.created_at <= ${dt}`
      : df
        ? Prisma.sql`AND o.created_at >= ${df}`
        : dt
          ? Prisma.sql`AND o.created_at <= ${dt}`
          : Prisma.empty;

  const payDateClause =
    df && dt
      ? Prisma.sql`AND COALESCE(p.paid_at, p.created_at) >= ${df} AND COALESCE(p.paid_at, p.created_at) <= ${dt}`
      : df
        ? Prisma.sql`AND COALESCE(p.paid_at, p.created_at) >= ${df}`
        : dt
          ? Prisma.sql`AND COALESCE(p.paid_at, p.created_at) <= ${dt}`
          : Prisma.empty;

  const orderSearchClause =
    searchPat != null
      ? Prisma.sql`AND (
          o.number ILIKE ${searchPat}
          OR CAST(o.id AS TEXT) ILIKE ${searchPat}
        )`
      : Prisma.empty;

  const paySearchClause =
    searchPat != null
      ? Prisma.sql`AND (
          CAST(p.id AS TEXT) ILIKE ${searchPat}
          OR COALESCE(p.note, '') ILIKE ${searchPat}
          OR COALESCE(p.payment_type, '') ILIKE ${searchPat}
        )`
      : Prisma.empty;

  const kind = q.ledger_kind ?? "all";
  const kindWhere =
    kind === "debt"
      ? Prisma.sql`WHERE (u.row_kind = 'order' OR (u.row_kind = 'payment' AND u.entry_kind = 'client_expense'))`
      : kind === "payment"
        ? Prisma.sql`WHERE u.row_kind = 'payment' AND u.entry_kind = 'payment'`
        : Prisma.empty;

  const { agentIds: ledgerAgentIds, includeNoAgent: ledgerIncludeNoAgent } = resolveLedgerAgentFilter(q);
  const { orderAgentClause, payAgentClause } = buildLedgerAgentSqlClauses(ledgerAgentIds, ledgerIncludeNoAgent);

  const payKindClauseForTypeBreakdown =
    kind === "payment"
      ? Prisma.sql`AND p.entry_kind = 'payment'`
      : kind === "debt"
        ? Prisma.sql`AND p.entry_kind = 'client_expense'`
        : Prisma.empty;

  const payNetRowsFiltered = await prisma.$queryRaw<Array<{ payment_type: string; net: Prisma.Decimal }>>`
    SELECT p.payment_type,
      SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount
               WHEN p.entry_kind = 'client_expense' THEN -p.amount
               ELSE 0 END)::decimal(15,2) AS net
    FROM client_payments p
    JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
    LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
    WHERE p.tenant_id = ${tenantId}
      AND p.client_id = ${clientId}
      AND p.deleted_at IS NULL
      ${payDateClause}
      ${paySearchClause}
      ${payAgentClause}
      ${payKindClauseForTypeBreakdown}
    GROUP BY p.payment_type
  `;
  const summary_payment_by_type = paymentAmountsForSpravochnik(
    sprLabels,
    buildNetNormFromRows(payNetRowsFiltered, paymentMethodEntries)
  );

  const agentTotalsSqlBody = (orderAgent: Prisma.Sql, payAgent: Prisma.Sql) => Prisma.sql`
    SELECT
      u.ledger_agent_id,
      SUM(
        CASE
          WHEN u.debt_amount IS NOT NULL AND u.debt_amount <> 0 THEN ABS(u.debt_amount)
          ELSE 0::decimal(15,2)
        END
      )::decimal(15,2) AS gen_debt,
      SUM(
        CASE
          WHEN u.payment_amount IS NOT NULL AND u.payment_amount > 0 THEN u.payment_amount
          ELSE 0::decimal(15,2)
        END
      )::decimal(15,2) AS gen_pay
    FROM (
      SELECT
        o.agent_id AS ledger_agent_id,
        'order'::text AS row_kind,
        'order'::text AS entry_kind,
        (-(o.total_sum))::decimal(15,2) AS debt_amount,
        NULL::decimal(15,2) AS payment_amount
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.client_id = ${clientId}
        AND o.status NOT IN (${Prisma.join(excluded)})
        AND o.order_type = 'order'
        ${orderDateClause}
        ${orderSearchClause}
        ${orderAgent}

      UNION ALL

      SELECT
        COALESCE(p.ledger_agent_id, ord.agent_id, c.agent_id) AS ledger_agent_id,
        'payment'::text AS row_kind,
        p.entry_kind AS entry_kind,
        CASE WHEN p.entry_kind = 'client_expense' THEN p.amount ELSE NULL END AS debt_amount,
        CASE WHEN p.entry_kind = 'payment' THEN p.amount ELSE NULL END AS payment_amount
      FROM client_payments p
      JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
      WHERE p.tenant_id = ${tenantId}
        AND p.client_id = ${clientId}
        AND p.deleted_at IS NULL
        ${payDateClause}
        ${paySearchClause}
        ${payAgent}
    ) u
    ${kindWhere}
    GROUP BY u.ledger_agent_id
  `;

  /** Итоги по агентам с фильтром по агенту — как у строк таблицы и net balance. */
  const agentGeneralTotals = await prisma.$queryRaw<
    Array<{ ledger_agent_id: number | null; gen_debt: Prisma.Decimal; gen_pay: Prisma.Decimal }>
  >(agentTotalsSqlBody(orderAgentClause, payAgentClause));

  /** Карточки агентов: суммы без фильтра по агенту (дата/поиск/kind сохраняются), иначе невыбранные агенты показывают 0. */
  const agentGeneralTotalsForCards = await prisma.$queryRaw<
    Array<{ ledger_agent_id: number | null; gen_debt: Prisma.Decimal; gen_pay: Prisma.Decimal }>
  >(agentTotalsSqlBody(Prisma.empty, Prisma.empty));

  let ledgerNetSum = new Prisma.Decimal(0);
  for (const r of agentGeneralTotals) {
    ledgerNetSum = ledgerNetSum.add(r.gen_pay.sub(r.gen_debt));
  }
  const ledger_net_balance = ledgerNetSum.toString();

  const ledgerTotalsByAgentKey = new Map<string, { gen_debt: Prisma.Decimal; gen_pay: Prisma.Decimal }>();
  for (const r of agentGeneralTotalsForCards) {
    const k = r.ledger_agent_id == null ? "null" : String(r.ledger_agent_id);
    ledgerTotalsByAgentKey.set(k, { gen_debt: r.gen_debt, gen_pay: r.gen_pay });
  }

  const agent_cards_with_ledger_totals: AgentBalanceCard[] = agent_cards.map((c) => {
    const k = c.agent_id == null ? "null" : String(c.agent_id);
    const t = ledgerTotalsByAgentKey.get(k);
    return {
      ...c,
      ledger_general_debt_total: t?.gen_debt.toString() ?? "0",
      ledger_general_payment_total: t?.gen_pay.toString() ?? "0"
    };
  });

  const [countRow] = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*)::bigint AS cnt FROM (
      SELECT 'order'::text AS row_kind, 'order'::text AS entry_kind
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.client_id = ${clientId}
        AND o.status NOT IN (${Prisma.join(excluded)})
        AND o.order_type = 'order'
        ${orderDateClause}
        ${orderSearchClause}
        ${orderAgentClause}
      UNION ALL
      SELECT 'payment'::text AS row_kind, p.entry_kind
      FROM client_payments p
      JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
      WHERE p.tenant_id = ${tenantId}
        AND p.client_id = ${clientId}
        AND p.deleted_at IS NULL
        ${payDateClause}
        ${paySearchClause}
        ${payAgentClause}
    ) u
    ${kindWhere}
  `;
  const total = Number(countRow?.cnt ?? 0n);

  const unionRows = await prisma.$queryRaw<UnionRaw[]>`
    WITH base AS (
      SELECT * FROM (
        SELECT
          'order'::text AS row_kind,
          o.created_at AS sort_at,
          o.id AS order_id,
          NULL::int AS payment_id,
          o.number AS order_number,
          (-(o.total_sum))::decimal(15,2) AS debt_amount,
          NULL::decimal(15,2) AS payment_amount,
          NULLIF(TRIM(o.payment_method_ref), '')::text AS payment_type,
          (o.is_consignment OR COALESCE(ag.consignment, false)) AS is_consignment,
          ag.name AS agent_name,
          ex.name AS expeditor_name,
          NULL::text AS cash_desk_name,
          o.comment AS note,
          COALESCE(
            (
              SELECT COALESCE(NULLIF(TRIM(cu.name), ''), cu.login)::text
              FROM order_change_logs ocl
              JOIN users cu ON cu.id = ocl.user_id
              WHERE ocl.order_id = o.id AND ocl.user_id IS NOT NULL
              ORDER BY ocl.created_at ASC NULLS LAST, ocl.id ASC
              LIMIT 1
            ),
            (
              SELECT COALESCE(NULLIF(TRIM(su.name), ''), su.login)::text
              FROM order_status_logs osl
              JOIN users su ON su.id = osl.user_id
              WHERE osl.order_id = o.id AND osl.user_id IS NOT NULL
              ORDER BY osl.created_at ASC NULLS LAST, osl.id ASC
              LIMIT 1
            )
          ) AS created_by_login,
          'order'::text AS entry_kind,
          NULL::text AS order_payment_method_ref
        FROM orders o
        LEFT JOIN users ag ON ag.id = o.agent_id
        LEFT JOIN users ex ON ex.id = o.expeditor_user_id
        WHERE o.tenant_id = ${tenantId}
          AND o.client_id = ${clientId}
          AND o.status NOT IN (${Prisma.join(excluded)})
          AND o.order_type = 'order'
          ${orderDateClause}
          ${orderSearchClause}
          ${orderAgentClause}

        UNION ALL

        SELECT
          'payment'::text AS row_kind,
          COALESCE(p.paid_at, p.created_at) AS sort_at,
          p.order_id AS order_id,
          p.id AS payment_id,
          NULL::text AS order_number,
          CASE WHEN p.entry_kind = 'client_expense' THEN p.amount ELSE NULL END AS debt_amount,
          CASE WHEN p.entry_kind = 'payment' THEN p.amount ELSE NULL END AS payment_amount,
          p.payment_type,
          CASE
            WHEN ord.id IS NOT NULL THEN (ord.is_consignment OR COALESCE(oag.consignment, false))
            ELSE NULL
          END AS is_consignment,
          COALESCE(lag.name, oag.name, cag.name) AS agent_name,
          pex.name AS expeditor_name,
          cd.name AS cash_desk_name,
          p.note,
          COALESCE(NULLIF(TRIM(u.name), ''), u.login)::text AS created_by_login,
          p.entry_kind,
          NULLIF(TRIM(ord.payment_method_ref), '')::text AS order_payment_method_ref
        FROM client_payments p
        JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
        LEFT JOIN orders ord ON ord.id = p.order_id AND ord.tenant_id = ${tenantId}
        LEFT JOIN users lag ON lag.id = p.ledger_agent_id
        LEFT JOIN users oag ON oag.id = ord.agent_id
        LEFT JOIN users cag ON cag.id = c.agent_id
        LEFT JOIN users pex ON pex.id = p.expeditor_user_id
        LEFT JOIN cash_desks cd ON cd.id = p.cash_desk_id
        LEFT JOIN users u ON u.id = p.created_by_user_id
        WHERE p.tenant_id = ${tenantId}
          AND p.client_id = ${clientId}
          AND p.deleted_at IS NULL
          ${payDateClause}
          ${paySearchClause}
          ${payAgentClause}
      ) u
      ${kindWhere}
    )
    ${rankedCte}
    SELECT * FROM ${fromTable}
    ORDER BY sort_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = unionRows.map((raw) => {
    const row = mapUnionToLedgerRow(raw);
    const pt = row.payment_type?.trim() ?? "";
    const resolvedPt = pt ? resolvePaymentMethodRefToLabel(pt, paymentMethodEntries) : null;

    let order_payment_method_label: string | null = null;
    if (row.row_kind === "payment") {
      const orf = raw.order_payment_method_ref?.trim() ?? "";
      if (orf) {
        order_payment_method_label = resolvePaymentMethodRefToLabel(orf, paymentMethodEntries);
      }
    }

    return {
      ...row,
      payment_type: resolvedPt,
      order_payment_method_label
    };
  });

  return {
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      client_code: client.client_code,
      territory_label: territoryLabel(client),
      agent_id: client.agent_id ?? null
    },
    account_balance,
    ledger_net_balance,
    summary_payment_by_type,
    agent_cards: agent_cards_with_ledger_totals,
    rows,
    total,
    page,
    limit
  };
}
