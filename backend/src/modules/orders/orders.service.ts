import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getErrorCode } from "../../lib/app-error";
import { prisma } from "../../config/database";
import { emitOrderUpdated } from "../../lib/order-event-bus";
import { invalidateDashboard, invalidateStock } from "../../lib/redis-cache";
import { enqueueOrderStatusNotifyJob } from "../jobs/jobs.service";
import { getProductPrice } from "../products/product-prices.service";
import { parseBonusStackPolicy } from "./bonus-stack-policy";
import {
  fetchClientUsedAutoBonusRuleIds,
  fetchClientUsedAutoBonusRuleIdsExcludingOrder,
  resolveOrderBonusesForCreate,
  type OrderAgentBonusContext
} from "./order-bonus-apply";
import {
  ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE,
  statusContributesToDeliveredReceivableDebt,
  normalizeOrderType,
  canTransitionOrderStatus,
  getAllowedNextStatuses,
  isBackwardTransition,
  isOperatorLateStageCancelForbidden,
  isValidOrderStatus
} from "./order-status";
import { resolveAutoExpeditorUserId } from "./expeditor-auto-assign";
import {
  computeAgentConsignmentOutstanding,
  parseYearMonth,
  utcMonthStart
} from "../consignment/consignment.service";
import {
  buildNakladnoyXlsx,
  type NakladnoyBuildOptions,
  type NakladnoyLine,
  type NakladnoyOrderPayload,
  DEFAULT_NAKLADNOY_BUILD_OPTIONS
} from "./order-nakladnoy-xlsx";
import { buildNakladnoyPdf } from "./order-nakladnoy-pdf";
import {
  loadDeliveryDebtByClient,
  mergeLedgerWithUnpaidDelivered
} from "../client-balances/client-balances.service";
import { resolvePaymentMethodRefToLabel } from "../tenant-settings/finance-refs";
import { loadPaymentMethodEntriesForResolve } from "../tenant-settings/tenant-settings.service";
import { prepareExchangeOrderLines } from "./exchange-order-create";

export type OrderLineInput = { product_id: number; qty: number };

export type BonusGiftOverrideInput = {
  bonus_rule_id: number;
  bonus_product_id: number;
};

export type CreateOrderInput = {
  client_id: number;
  /** Majburiy — qaysi ombordan jo’natiladi */
  warehouse_id: number;
  agent_id?: number | null;
  /** Savdo zakazida majburiy: to‘lov usuli (spravochnik) */
  payment_method_ref?: string | null;
  /** `null` — avto tanlov yo’q; `undefined` — avtobog’lash */
  expeditor_user_id?: number | null;
  /** Bo’sh bo’lsa `retail` */
  price_type?: string | null;
  /** Hujjat tipi: order | return | exchange | partial_return | return_by_order */
  order_type?: string | null;
  apply_bonus?: boolean;
  /** Qty bonus: `bonus_product_ids` ro‘yxatidan tanlov (faqat qoida ro‘yxatida bor mahsulotlar) */
  bonus_gift_overrides?: BonusGiftOverrideInput[];
  comment?: string | null;
  /** Sozlamalar → request_type_entries (kod yoki nom, max 128) */
  request_type_ref?: string | null;
  /** Konsignatsiya zakazi — agent limiti tekshiriladi */
  is_consignment?: boolean;
  /** ISO sana (ixtiyoriy) */
  consignment_due_date?: string | null;
  items: OrderLineInput[];
  /** `order_type=exchange` uchun majburiy (minus/plus alohida) */
  source_order_ids?: number[];
  minus_lines?: Array<{ order_id: number; product_id: number; qty: number }>;
  plus_lines?: Array<{ product_id: number; qty: number }>;
  reason_ref?: string | null;
};

export type UpdateOrderLinesInput = {
  items: OrderLineInput[];
  warehouse_id?: number | null;
  agent_id?: number | null;
  /** Savdo zakazida saqlangan to‘lov usulini yangilash (ixtiyoriy) */
  payment_method_ref?: string | null;
  apply_bonus?: boolean;
  bonus_gift_overrides?: BonusGiftOverrideInput[];
};

export type OrderItemRow = {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  price: string;
  total: string;
  is_bonus: boolean;
  /** `exchange` zakazlarida */
  exchange_line_kind?: string | null;
};

export type OrderListRow = {
  id: number;
  number: string;
  order_type: string | null;
  client_id: number;
  client_name: string;
  client_legal_name: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  agent_name: string | null;
  agent_code: string | null;
  expeditors: string | null;
  expeditor_id: number | null;
  expeditor_display: string | null;
  region: string | null;
  city: string | null;
  zone: string | null;
  consignment: boolean | null;
  /** Zakaz konsignatsiyasi (order.is_consignment). */
  is_consignment: boolean;
  day: string | null;
  created_by: string | null;
  created_by_role: string | null;
  expected_ship_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  status: string;
  qty: string;
  total_sum: string;
  /** Bonus mahsulotlar bo‘yicha jami dona (ro‘yxat «Bonus» ustuni) */
  bonus_qty: string;
  /** Foizli chegirma summasi */
  discount_sum: string;
  /** Bonus mahsulotlarning narxlangan qiymati (ichki hisob) */
  bonus_sum: string;
  balance: string | null;
  debt: string | null;
  price_type: string | null;
  comment: string | null;
  /** «Причины заявок» tanlovi */
  request_type_ref: string | null;
  created_at: string;
  /** Joriy foydalanuvchi roli uchun ruxsat etilgan keyingi holatlar (jadvalda tez o‘zgartirish). */
  allowed_next_statuses: string[];
};

export type OrderStatusLogRow = {
  id: number;
  from_status: string;
  to_status: string;
  user_login: string | null;
  created_at: string;
};

export type OrderChangeLogRow = {
  id: number;
  action: string;
  payload: unknown;
  user_login: string | null;
  created_at: string;
};

export type BonusGiftSwapOptionRow = {
  bonus_rule_id: number;
  rule_name: string;
  allowed_product_ids: number[];
  chosen_product_id: number;
  products: Array<{ id: number; name: string; sku: string }>;
};

export type OrderDetailRow = OrderListRow & {
  agent_id: number | null;
  warehouse_name: string | null;
  agent_display: string | null;
  /** Savdo zakazida tanlangan to‘lov usuli */
  payment_method_ref: string | null;
  /** Spravochnik bo‘yicha o‘qiladigan nom (vedoma «Способ оплаты» bilan bir xil) */
  payment_method_label: string | null;
  is_consignment: boolean;
  consignment_due_date: string | null;
  apply_bonus: boolean;
  items: OrderItemRow[];
  allowed_next_statuses: string[];
  status_logs: OrderStatusLogRow[];
  change_logs: OrderChangeLogRow[];
  /** Saqlangan qty bonus sovg‘a tanlovlari (rule_id string kalit) */
  bonus_gift_selections?: Record<string, number>;
  /** UI: bir nechta sovg‘a varianti bo‘lgan qo‘llangan qty qoidalar */
  bonus_gift_swap_options?: BonusGiftSwapOptionRow[];
  /** Faqat yaratish javobida (ixtiyoriy) */
  client_finance?: {
    account_balance: string;
    credit_limit: string;
    outstanding: string;
    headroom: string;
  };
};

export type UpdateOrderMetaInput = {
  warehouse_id?: number | null;
  agent_id?: number | null;
  /** Qo‘lda biriktirish yoki `null` — avto tanlovni bekor qilish */
  expeditor_user_id?: number | null;
  comment?: string | null;
  payment_method_ref?: string | null;
};

const orderDetailInclude: Prisma.OrderInclude = {
  client: { select: { name: true } },
  warehouse: { select: { id: true, name: true } },
  agent: { select: { id: true, login: true, name: true, code: true, consignment: true } },
  expeditor_user: { select: { id: true, login: true, name: true, code: true } },
  items: {
    orderBy: { id: "asc" },
    include: { product: { select: { sku: true, name: true } } }
  },
  /** So‘nggi yozuvlar (UI da eski → yangi tartibda). */
  status_logs: {
    orderBy: { created_at: "desc" },
    take: 100,
    include: { user: { select: { login: true } } }
  },
  change_logs: {
    orderBy: { created_at: "desc" },
    take: 100,
    include: { user: { select: { login: true } } }
  }
};

/** `orderDetailInclude` bilan yuklangan zakaz. */
export type OrderDetailLoaded = {
  id: number;
  number: string;
  client_id: number;
  warehouse_id: number | null;
  agent_id: number | null;
  expeditor_user_id: number | null;
  status: string;
  total_sum: Prisma.Decimal;
  bonus_sum: Prisma.Decimal;
  discount_sum: Prisma.Decimal;
  applied_auto_bonus_rule_ids: number[];
  bonus_gift_selections?: Prisma.JsonValue | null;
  comment: string | null;
  request_type_ref: string | null;
  order_type: string;
  is_consignment: boolean;
  consignment_due_date: Date | null;
  payment_method_ref: string | null;
  created_at: Date;
  client: { name: string };
  warehouse: { id: number; name: string } | null;
  agent: { id: number; login: string; name: string; code: string | null; consignment: boolean } | null;
  expeditor_user: { id: number; login: string; name: string; code: string | null } | null;
  items: Array<{
    id: number;
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    is_bonus: boolean;
    exchange_line_kind: string | null;
    product: { sku: string; name: string };
  }>;
  status_logs: Array<{
    id: number;
    from_status: string;
    to_status: string;
    created_at: Date;
    user: { login: string } | null;
  }>;
  change_logs: Array<{
    id: number;
    action: string;
    payload: Prisma.JsonValue;
    created_at: Date;
    user: { login: string } | null;
  }>;
};

function roundOrderMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function parseBonusGiftSelectionsJson(json: Prisma.JsonValue | null | undefined): Map<number, number> {
  const m = new Map<number, number>();
  if (json == null || typeof json !== "object" || Array.isArray(json)) return m;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    const rid = Number.parseInt(k, 10);
    const pid = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(rid) && rid > 0 && Number.isFinite(pid) && pid > 0) m.set(rid, pid);
  }
  return m;
}

function bonusGiftMapToJson(map: Map<number, number>): Prisma.InputJsonValue {
  const o: Record<string, number> = {};
  for (const [k, v] of map) o[String(k)] = v;
  return o;
}

async function validateBonusGiftOverrides(
  tenantId: number,
  rows: BonusGiftOverrideInput[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const row of rows) {
    const rule = await prisma.bonusRule.findFirst({
      where: {
        id: row.bonus_rule_id,
        tenant_id: tenantId,
        type: "qty",
        is_manual: false,
        is_active: true
      },
      select: { id: true, bonus_product_ids: true }
    });
    if (!rule) {
      throw new Error("BAD_BONUS_GIFT_OVERRIDE");
    }
    const ids = rule.bonus_product_ids;
    if (ids.length === 0 || !ids.includes(row.bonus_product_id)) {
      throw new Error("BAD_BONUS_GIFT_OVERRIDE");
    }
    map.set(row.bonus_rule_id, row.bonus_product_id);
  }
  return map;
}

async function buildBonusGiftSwapOptions(
  tenantId: number,
  appliedRuleIds: number[],
  selections: Map<number, number>
): Promise<BonusGiftSwapOptionRow[]> {
  const out: BonusGiftSwapOptionRow[] = [];
  if (!appliedRuleIds.length) return out;
  const rules = await prisma.bonusRule.findMany({
    where: { tenant_id: tenantId, id: { in: appliedRuleIds }, type: "qty" },
    select: { id: true, name: true, bonus_product_ids: true }
  });
  const productIdSet = new Set<number>();
  for (const r of rules) {
    if (r.bonus_product_ids.length < 2) continue;
    for (const pid of r.bonus_product_ids) productIdSet.add(pid);
  }
  if (productIdSet.size === 0) return out;
  const products = await prisma.product.findMany({
    where: { id: { in: [...productIdSet] }, tenant_id: tenantId },
    select: { id: true, name: true, sku: true }
  });
  const pmap = new Map(products.map((p) => [p.id, p]));
  for (const r of rules) {
    if (r.bonus_product_ids.length < 2) continue;
    const chosen = selections.get(r.id) ?? r.bonus_product_ids[0]!;
    out.push({
      bonus_rule_id: r.id,
      rule_name: r.name,
      allowed_product_ids: [...r.bonus_product_ids],
      chosen_product_id: chosen,
      products: r.bonus_product_ids.map((id) => {
        const p = pmap.get(id);
        return { id, name: p?.name ?? `#${id}`, sku: p?.sku ?? "" };
      })
    });
  }
  return out;
}

function sumBonusQty(
  items: ReadonlyArray<{ qty: Prisma.Decimal; is_bonus: boolean }>
): string {
  return items
    .filter((i) => i.is_bonus)
    .reduce((acc, i) => acc.add(i.qty), new Prisma.Decimal(0))
    .toString();
}

function allowedNextForRole(status: string, viewerRole: string | undefined): string[] {
  if (status === "cancelled" && viewerRole !== "admin") {
    return [];
  }
  if (viewerRole === "operator") {
    return getAllowedNextStatuses(status, { omitBackward: true }).filter(
      (s) => !isOperatorLateStageCancelForbidden(status, s)
    );
  }
  return getAllowedNextStatuses(status);
}

function toDetailRow(o: OrderDetailLoaded, viewerRole?: string): OrderDetailRow {
  const agentDisplay = o.agent ? `${o.agent.login} (${o.agent.name})` : null;
  const exp = o.expeditor_user;
  const expeditorDisplay = exp ? `${exp.login} (${exp.name})` : null;
  return {
    id: o.id,
    number: o.number,
    order_type: o.order_type ?? "order",
    client_id: o.client_id,
    client_name: o.client.name,
    client_legal_name: null,
    warehouse_id: o.warehouse_id,
    warehouse_name: o.warehouse?.name ?? null,
    agent_name: o.agent?.name ?? null,
    agent_code: o.agent?.code ?? null,
    expeditors: expeditorDisplay,
    expeditor_id: o.expeditor_user_id,
    expeditor_display: expeditorDisplay,
    region: null,
    city: null,
    zone: null,
    consignment: o.agent?.consignment ?? null,
    day: null,
    created_by: null,
    created_by_role: null,
    expected_ship_date: null,
    shipped_at: null,
    delivered_at: null,
    qty: (o.order_type === "exchange"
      ? o.items.filter((i) => !i.is_bonus && i.exchange_line_kind === "plus")
      : o.items.filter((i) => !i.is_bonus)
    )
      .reduce((acc, i) => acc.add(i.qty), new Prisma.Decimal(0))
      .toString(),
    agent_id: o.agent_id,
    agent_display: agentDisplay,
    payment_method_ref: o.payment_method_ref?.trim() || null,
    payment_method_label: null,
    is_consignment: o.is_consignment ?? false,
    consignment_due_date: o.consignment_due_date ? o.consignment_due_date.toISOString() : null,
    apply_bonus: o.applied_auto_bonus_rule_ids.length > 0,
    status: o.status,
    total_sum: o.total_sum.toString(),
    bonus_qty: sumBonusQty(o.items),
    discount_sum: o.discount_sum.toString(),
    bonus_sum: o.bonus_sum.toString(),
    balance: null,
    debt: null,
    price_type: null,
    comment: o.comment ?? null,
    request_type_ref: o.request_type_ref ?? null,
    created_at: o.created_at.toISOString(),
    items: mapItems(o.items),
    allowed_next_statuses: allowedNextForRole(o.status, viewerRole),
    status_logs: [...o.status_logs].reverse().map((l) => ({
      id: l.id,
      from_status: l.from_status,
      to_status: l.to_status,
      user_login: l.user?.login ?? null,
      created_at: l.created_at.toISOString()
    })),
    change_logs: [...o.change_logs].reverse().map((l) => ({
      id: l.id,
      action: l.action,
      payload: l.payload,
      user_login: l.user?.login ?? null,
      created_at: l.created_at.toISOString()
    }))
  };
}

function mapItems(
  items: Array<{
    id: number;
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    is_bonus: boolean;
    exchange_line_kind?: string | null;
    product: { sku: string; name: string };
  }>
): OrderItemRow[] {
  return items.map((i) => ({
    id: i.id,
    product_id: i.product_id,
    sku: i.product.sku,
    name: i.product.name,
    qty: i.qty.toString(),
    price: i.price.toString(),
    total: i.total.toString(),
    is_bonus: i.is_bonus,
    exchange_line_kind: i.exchange_line_kind ?? null
  }));
}

async function enrichOrderDetailRow(
  tenantId: number,
  o: OrderDetailLoaded,
  viewerRole?: string
): Promise<OrderDetailRow> {
  const base = toDetailRow(o, viewerRole);
  const pmEntries = await loadPaymentMethodEntriesForResolve(tenantId);
  const payment_method_label = resolvePaymentMethodRefToLabel(base.payment_method_ref, pmEntries);
  const sel = parseBonusGiftSelectionsJson(o.bonus_gift_selections ?? null);
  const swap = await buildBonusGiftSwapOptions(tenantId, o.applied_auto_bonus_rule_ids, sel);
  const bonus_gift_selections: Record<string, number> = {};
  for (const [k, v] of sel) bonus_gift_selections[String(k)] = v;
  const fin = await loadOrdersFinanceEnrichment(tenantId, [
    {
      id: o.id,
      client_id: o.client_id,
      order_type: o.order_type ?? "order",
      status: o.status,
      total_sum: o.total_sum
    }
  ]);
  const x = fin.get(o.id);
  return {
    ...base,
    payment_method_label,
    bonus_gift_selections,
    bonus_gift_swap_options: swap,
    shipped_at: x?.shipped_at ?? base.shipped_at,
    delivered_at: x?.delivered_at ?? base.delivered_at,
    debt: x?.debt ?? base.debt,
    balance: x?.balance ?? base.balance
  };
}

export async function createOrder(
  tenantId: number,
  input: CreateOrderInput,
  viewerRole?: string
): Promise<OrderDetailRow> {
  const orderTypeEarly = normalizeOrderType(input.order_type);
  if (orderTypeEarly !== "exchange" && !input.items.length) {
    throw new Error("EMPTY_ITEMS");
  }
  if (orderTypeEarly === "exchange") {
    if (
      !input.source_order_ids?.length ||
      !input.minus_lines?.length ||
      !input.plus_lines?.length
    ) {
      throw new Error("EXCHANGE_PAYLOAD_REQUIRED");
    }
  }

  const client = await prisma.client.findFirst({
    where: {
      id: input.client_id,
      tenant_id: tenantId,
      merged_into_client_id: null,
      is_active: true
    },
    select: {
      id: true,
      category: true,
      sales_channel: true,
      product_category_ref: true,
      region: true,
      city: true,
      district: true,
      zone: true,
      neighborhood: true,
      address: true,
      credit_limit: true
    }
  });
  if (!client) {
    throw new Error("BAD_CLIENT");
  }

  const wh = await prisma.warehouse.findFirst({
    where: { id: input.warehouse_id, tenant_id: tenantId }
  });
  if (!wh) {
    throw new Error("BAD_WAREHOUSE");
  }

  let orderAgentForBonus: OrderAgentBonusContext | null = null;
  if (input.agent_id != null) {
    const u = await prisma.user.findFirst({
      where: { id: input.agent_id, tenant_id: tenantId, is_active: true },
      select: { id: true, branch: true, trade_direction_id: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
    orderAgentForBonus = {
      userId: u.id,
      branch: u.branch,
      trade_direction_id: u.trade_direction_id
    };
  }

  const priceType = (input.price_type ?? "").trim() || "retail";

  type LineDraft = {
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    exchange_line_kind?: "minus" | "plus";
  };

  const lineData: LineDraft[] = [];
  let totalSum = new Prisma.Decimal(0);
  const qtyByProduct = new Map<number, number>();
  const productById = new Map<number, { id: number; category_id: number | null }>();
  const orderedProductIds = new Set<number>();

  let exchangeMetaJson: Prisma.InputJsonValue | undefined;

  if (orderTypeEarly === "exchange") {
    const ex = await prepareExchangeOrderLines(
      tenantId,
      input.client_id,
      input.warehouse_id,
      input.agent_id ?? null,
      priceType,
      {
        source_order_ids: input.source_order_ids!,
        minus_lines: input.minus_lines!,
        plus_lines: input.plus_lines!,
        reason_ref: input.reason_ref
      }
    );
    const plusRows = await prisma.product.findMany({
      where: { id: { in: ex.plusProductIds }, tenant_id: tenantId, is_active: true }
    });
    const minusRows = await prisma.product.findMany({
      where: { id: { in: ex.minusProductIds }, tenant_id: tenantId }
    });
    if (plusRows.length !== ex.plusProductIds.length || minusRows.length !== ex.minusProductIds.length) {
      throw new Error("BAD_PRODUCT");
    }
    const pmap = new Map<number, (typeof plusRows)[number]>();
    for (const p of [...plusRows, ...minusRows]) pmap.set(p.id, p);
    for (const l of ex.lines) {
      const row = pmap.get(l.product_id);
      if (!row) throw new Error("BAD_PRODUCT");
      lineData.push({
        product_id: l.product_id,
        qty: l.qty,
        price: l.price,
        total: l.total,
        exchange_line_kind: l.exchange_line_kind
      });
      productById.set(row.id, { id: row.id, category_id: row.category_id });
      if (l.exchange_line_kind === "plus") {
        qtyByProduct.set(l.product_id, (qtyByProduct.get(l.product_id) ?? 0) + Number(l.qty));
        orderedProductIds.add(l.product_id);
      }
    }
    totalSum = ex.paidTotal;
    exchangeMetaJson = ex.exchangeMeta as unknown as Prisma.InputJsonValue;
  } else {
    // ✅ BATCH validation — dublikat mahsulotlar tekshirish
    const orderProductIds = new Set(input.items.map((i) => i.product_id));
    if (orderProductIds.size !== input.items.length) {
      throw new Error("DUPLICATE_PRODUCT");
    }
    for (const it of input.items) {
      if (!Number.isFinite(it.qty) || it.qty <= 0) {
        throw new Error("BAD_QTY");
      }
    }
    const productIds = [...orderProductIds];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenant_id: tenantId, is_active: true }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const it of input.items) {
      const product = productMap.get(it.product_id);
      if (!product) {
        throw new Error("BAD_PRODUCT");
      }
      const priceStr = await getProductPrice(tenantId, it.product_id, priceType);
      if (priceStr == null) {
        const e = new Error("NO_PRICE") as Error & { product_id: number; price_type: string };
        e.product_id = it.product_id;
        e.price_type = priceType;
        throw e;
      }
      const price = new Prisma.Decimal(priceStr);
      const qty = new Prisma.Decimal(it.qty);
      const lineTotal = qty.mul(price);
      totalSum = totalSum.add(lineTotal);
      lineData.push({ product_id: it.product_id, qty, price, total: lineTotal });
      productById.set(product.id, { id: product.id, category_id: product.category_id });
      qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + it.qty);
      orderedProductIds.add(it.product_id);
    }
  }

  /** Vaqtincha noyob raqam; tranzaksiya ichida `String(id)` ga almashtiriladi (qisqa, № bilan mos). */
  const tempOrderNumber = `__${tenantId}_${Date.now()}_${randomBytes(5).toString("hex")}`;

  const orderType = orderTypeEarly;
  /** Vozvrat s polki (yoki qo‘lda «возврат») — sotuv emas: klientdan omborga, logistika zanjiri «new…delivered» shart emas. */
  const isInboundShelfReturn = orderType === "return" || orderType === "return_by_order";

  if (orderType === "order") {
    if (input.agent_id == null || !Number.isFinite(input.agent_id) || input.agent_id < 1) {
      throw new Error("ORDER_REQUIRES_AGENT");
    }
    const pm = (input.payment_method_ref ?? "").trim();
    if (!pm) {
      throw new Error("ORDER_REQUIRES_PAYMENT_METHOD");
    }
  }
  if (orderType === "exchange") {
    if (input.agent_id == null || !Number.isFinite(input.agent_id) || input.agent_id < 1) {
      throw new Error("EXCHANGE_REQUIRES_AGENT");
    }
  }

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const stackPolicy = parseBonusStackPolicy(tenantRow?.settings);

  const validatedGiftOverrides =
    input.bonus_gift_overrides?.length ?
      await validateBonusGiftOverrides(tenantId, input.bonus_gift_overrides)
    : new Map<number, number>();

  const order = await prisma.$transaction(async (tx) => {
    const applyBonus =
      isInboundShelfReturn || orderType === "exchange" ? false : (input.apply_bonus ?? true);
    let paidAfterDisc = lineData;
    let paidTotal = totalSum;
    let bonusDrafts: Array<{
      product_id: number;
      qty: Prisma.Decimal;
      price: Prisma.Decimal;
      total: Prisma.Decimal;
    }> = [];
    let appliedAutoBonusRuleIds: number[] = [];
    if (applyBonus) {
      const usedRuleIds = await fetchClientUsedAutoBonusRuleIds(tx, tenantId, client.id);
      const resolved = await resolveOrderBonusesForCreate(
        tx,
        tenantId,
        { id: client.id, category: client.category },
        lineData,
        totalSum,
        totalSum,
        qtyByProduct,
        productById,
        orderedProductIds,
        stackPolicy,
        usedRuleIds,
        validatedGiftOverrides,
        input.warehouse_id,
        { referenceAt: new Date() },
        orderAgentForBonus
      );
      paidAfterDisc = resolved.lines;
      paidTotal = resolved.total;
      bonusDrafts = resolved.bonusDrafts;
      appliedAutoBonusRuleIds = resolved.appliedAutoBonusRuleIds;
    }

    let bonusSum = new Prisma.Decimal(0);
    const bonusCreates = bonusDrafts.map((b) => {
      bonusSum = bonusSum.add(b.total);
      return {
        product_id: b.product_id,
        qty: b.qty,
        price: b.price,
        total: b.total,
        is_bonus: true as const
      };
    });

    const rawDisc = totalSum.sub(paidTotal);
    const discountSum =
      applyBonus && rawDisc.gt(0) ? roundOrderMoney(rawDisc) : new Prisma.Decimal(0);

    const creditLimit = client.credit_limit;
    if (!isInboundShelfReturn && orderType !== "exchange" && creditLimit.gt(0)) {
      const balRow = await tx.clientBalance.findUnique({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: client.id } },
        select: { balance: true }
      });
      const accountBalance = balRow?.balance ?? new Prisma.Decimal(0);
      const headroom = creditLimit.add(accountBalance);
      const agg = await tx.order.aggregate({
        where: {
          tenant_id: tenantId,
          client_id: client.id,
          status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
        },
        _sum: { total_sum: true }
      });
      const outstanding = agg._sum.total_sum ?? new Prisma.Decimal(0);
      const projected = outstanding.add(paidTotal);
      if (projected.gt(headroom)) {
        const err = new Error("CREDIT_LIMIT_EXCEEDED") as Error & {
          credit_limit: string;
          outstanding: string;
          order_total: string;
        };
        err.credit_limit = headroom.toString();
        err.outstanding = outstanding.toString();
        err.order_total = paidTotal.toString();
        throw err;
      }
    }

    const isConsignmentOrder =
      !isInboundShelfReturn && orderType !== "exchange" && (input.is_consignment ?? false);
    let consignmentDueDate: Date | null = null;
    if (isConsignmentOrder && input.consignment_due_date?.trim()) {
      const d = new Date(input.consignment_due_date.trim());
      if (Number.isNaN(d.getTime())) {
        throw new Error("BAD_CONSIGNMENT_DUE_DATE");
      }
      consignmentDueDate = d;
    }

    if (isConsignmentOrder) {
      if (input.agent_id == null || input.agent_id <= 0) {
        throw new Error("CONSIGNMENT_REQUIRES_AGENT");
      }
      const ag = await tx.user.findFirst({
        where: {
          id: input.agent_id,
          tenant_id: tenantId,
          role: "agent",
          is_active: true
        },
        select: {
          consignment: true,
          consignment_limit_amount: true,
          consignment_ignore_previous_months_debt: true
        }
      });
      if (!ag) {
        throw new Error("BAD_AGENT");
      }
      if (!ag.consignment) {
        throw new Error("CONSIGNMENT_AGENT_DISABLED");
      }
      const lim = ag.consignment_limit_amount;
      if (lim != null) {
        const { year, month } = parseYearMonth(undefined);
        const monthStartsAt = utcMonthStart(year, month);
        const ignorePrev =
          lim != null && ag.consignment_ignore_previous_months_debt === true;
        const outstanding = await computeAgentConsignmentOutstanding(tx, tenantId, input.agent_id, {
          ignorePreviousMonthsDebt: ignorePrev,
          monthStartsAt
        });
        const projected = outstanding.add(paidTotal);
        if (projected.gt(lim)) {
          const err = new Error("CONSIGNMENT_LIMIT_EXCEEDED") as Error & {
            consignment_limit?: string;
            outstanding?: string;
            order_total?: string;
          };
          err.consignment_limit = lim.toString();
          err.outstanding = outstanding.toString();
          err.order_total = paidTotal.toString();
          throw err;
        }
      }
    }

    const whId = input.warehouse_id;
    const needByProduct = new Map<number, Prisma.Decimal>();
    const addNeed = (productId: number, q: Prisma.Decimal) => {
      const cur = needByProduct.get(productId) ?? new Prisma.Decimal(0);
      needByProduct.set(productId, cur.add(q));
    };
    if (!isInboundShelfReturn) {
      for (const l of paidAfterDisc) {
        if (l.exchange_line_kind === "minus") continue;
        addNeed(l.product_id, l.qty);
      }
      for (const b of bonusCreates) {
        addNeed(b.product_id, b.qty);
      }
      // ✅ BATCH: bitta so'rov bilan barcha stocklarni olish (N+1 fix)
      const stockProductIds = [...needByProduct.keys()];
      const stockRows = await tx.stock.findMany({
        where: { tenant_id: tenantId, warehouse_id: whId, product_id: { in: stockProductIds } },
        select: { product_id: true, qty: true, reserved_qty: true }
      });
      const stockMap = new Map(stockRows.map(s => [s.product_id, s]));

      for (const [productId, needQty] of needByProduct) {
        const row = stockMap.get(productId);
        const qty = row?.qty ?? new Prisma.Decimal(0);
        const reserved = row?.reserved_qty ?? new Prisma.Decimal(0);
        const available = qty.sub(reserved);
        if (available.lt(needQty)) {
          const err = new Error("INSUFFICIENT_STOCK") as Error & {
            product_id: number;
            available: string;
            requested: string;
          };
          err.product_id = productId;
          err.available = available.toString();
          err.requested = needQty.toString();
          throw err;
        }
      }

      // ✅ Rezervatsiya: zakaz yaratilganda reserved_qty oshirish
      for (const [productId, reserveQty] of needByProduct) {
        await tx.stock.upsert({
          where: {
            tenant_id_warehouse_id_product_id: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: productId
            }
          },
          create: {
            tenant_id: tenantId,
            warehouse_id: whId,
            product_id: productId,
            reserved_qty: reserveQty
          },
          update: {
            reserved_qty: { increment: reserveQty }
          }
        });
      }
    }

    let expeditorUserId: number | null;
    if (input.expeditor_user_id !== undefined && input.expeditor_user_id !== null) {
      const ex = await tx.user.findFirst({
        where: {
          id: input.expeditor_user_id,
          tenant_id: tenantId,
          role: "expeditor",
          is_active: true
        },
        select: { id: true }
      });
      if (!ex) {
        throw new Error("BAD_EXPEDITOR");
      }
      expeditorUserId = ex.id;
    } else if (input.expeditor_user_id === null) {
      expeditorUserId = null;
    } else {
      expeditorUserId = await resolveAutoExpeditorUserId(tx, tenantId, {
        client: {
          category: client.category,
          sales_channel: client.sales_channel,
          product_category_ref: client.product_category_ref,
          region: client.region,
          city: client.city,
          district: client.district,
          zone: client.zone,
          neighborhood: client.neighborhood,
          address: client.address
        },
        orderAgentId: input.agent_id ?? null,
        warehouseId: input.warehouse_id ?? null,
        orderPriceTypes: [priceType],
        at: new Date()
      });
    }

    const commentTrim =
      input.comment === undefined || input.comment === null
        ? null
        : input.comment.trim() || null;

    const requestTypeRefTrim =
      input.request_type_ref === undefined || input.request_type_ref === null
        ? null
        : input.request_type_ref.trim().slice(0, 128) || null;

    const statusForType =
      orderType === "order"
        ? "new"
        : orderType === "return" || orderType === "return_by_order"
          ? "returned"
          : "new";

    const created = await tx.order.create({
      data: {
        tenant_id: tenantId,
        number: tempOrderNumber,
        client_id: input.client_id,
        warehouse_id: input.warehouse_id,
        agent_id: input.agent_id ?? null,
        expeditor_user_id: expeditorUserId,
        order_type: orderType,
        status: statusForType,
        total_sum: paidTotal,
        bonus_sum: bonusSum,
        discount_sum: discountSum,
        applied_auto_bonus_rule_ids: appliedAutoBonusRuleIds,
        bonus_gift_selections: bonusGiftMapToJson(new Map(validatedGiftOverrides)),
        comment: commentTrim,
        request_type_ref: requestTypeRefTrim,
        is_consignment: isConsignmentOrder,
        consignment_due_date: isConsignmentOrder ? consignmentDueDate : null,
        payment_method_ref:
          orderType === "order"
            ? (input.payment_method_ref ?? "").trim().slice(0, 64) || null
            : null,
        ...(orderType === "exchange" && exchangeMetaJson != null
          ? { exchange_meta: exchangeMetaJson }
          : {}),
        items: {
          create: [
            ...paidAfterDisc.map((l) => ({
              product_id: l.product_id,
              qty: l.qty,
              price: l.price,
              total: l.total,
              is_bonus: false,
              exchange_line_kind: l.exchange_line_kind ?? null
            })),
            ...bonusCreates
          ]
        }
      },
      include: orderDetailInclude
    });

    if (isInboundShelfReturn) {
      const inboundByProduct = new Map<number, Prisma.Decimal>();
      const addIn = (productId: number, q: Prisma.Decimal) => {
        const cur = inboundByProduct.get(productId) ?? new Prisma.Decimal(0);
        inboundByProduct.set(productId, cur.add(q));
      };
      for (const l of paidAfterDisc) {
        addIn(l.product_id, l.qty);
      }
      for (const b of bonusCreates) {
        addIn(b.product_id, b.qty);
      }
      for (const [productId, dq] of inboundByProduct) {
        if (!dq.gt(0)) continue;
        await tx.stock.upsert({
          where: {
            tenant_id_warehouse_id_product_id: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: productId
            }
          },
          create: {
            tenant_id: tenantId,
            warehouse_id: whId,
            product_id: productId,
            qty: dq
          },
          update: { qty: { increment: dq } }
        });
      }
    } else if (orderType === "exchange") {
      const inboundByProduct = new Map<number, Prisma.Decimal>();
      const addInEx = (productId: number, q: Prisma.Decimal) => {
        const cur = inboundByProduct.get(productId) ?? new Prisma.Decimal(0);
        inboundByProduct.set(productId, cur.add(q));
      };
      for (const l of paidAfterDisc) {
        if (l.exchange_line_kind === "minus") addInEx(l.product_id, l.qty);
      }
      for (const [productId, dq] of inboundByProduct) {
        if (!dq.gt(0)) continue;
        await tx.stock.upsert({
          where: {
            tenant_id_warehouse_id_product_id: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: productId
            }
          },
          create: {
            tenant_id: tenantId,
            warehouse_id: whId,
            product_id: productId,
            qty: dq
          },
          update: { qty: { increment: dq } }
        });
      }
    }

    return tx.order.update({
      where: { id: created.id },
      data: { number: String(created.id) },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, order.id);
  void invalidateDashboard(tenantId);
  void invalidateStock(tenantId, input.warehouse_id);
  const detail = await enrichOrderDetailRow(tenantId, order as unknown as OrderDetailLoaded, viewerRole);

  // Finance — post-commit hisoblash (yangi zakaz kiritilgan joriy holatni qaytarish)
  const balRow = await prisma.clientBalance.findUnique({
    where: { tenant_id_client_id: { tenant_id: tenantId, client_id: client.id } },
    select: { balance: true }
  });
  const accountBalance = balRow?.balance ?? new Prisma.Decimal(0);
  const creditLimit = client.credit_limit;
  const headroom = creditLimit.add(accountBalance);
  const agg = await prisma.order.aggregate({
    where: {
      tenant_id: tenantId,
      client_id: client.id,
      status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
    },
    _sum: { total_sum: true }
  });
  const outstanding = agg._sum.total_sum ?? new Prisma.Decimal(0);

  return {
    ...detail,
    price_type: priceType,
    client_finance: {
      account_balance: accountBalance.toString(),
      credit_limit: creditLimit.toString(),
      outstanding: outstanding.toString(),
      headroom: headroom.toString()
    }
  };
}

const ORDER_LINES_EDITABLE_STATUSES = new Set(["new", "confirmed"]);

/**
 * To‘lov qatorlarini almashtiradi, bonuslarni qayta hisoblaydi (`new` / `confirmed` holatda).
 */
export async function updateOrderLines(
  tenantId: number,
  orderId: number,
  input: UpdateOrderLinesInput,
  viewerRole?: string,
  actorUserId?: number | null
): Promise<OrderDetailRow> {
  if (!input.items.length) {
    throw new Error("EMPTY_ITEMS");
  }

  const existing = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }
  if (!ORDER_LINES_EDITABLE_STATUSES.has(existing.status)) {
    throw new Error("ORDER_NOT_EDITABLE");
  }

  if (viewerRole === "operator") {
    throw new Error("FORBIDDEN_OPERATOR_ORDER_LINES_EDIT");
  }

  const prevPaidItems = await prisma.orderItem.findMany({
    where: { order_id: orderId, is_bonus: false },
    orderBy: { id: "asc" },
    select: { product_id: true, qty: true }
  });

  const logUserId =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  const client = await prisma.client.findFirst({
    where: {
      id: existing.client_id,
      tenant_id: tenantId,
      merged_into_client_id: null,
      is_active: true
    }
  });
  if (!client) {
    throw new Error("BAD_CLIENT");
  }

  const priorSelections = parseBonusGiftSelectionsJson(
    (existing as { bonus_gift_selections?: Prisma.JsonValue | null }).bonus_gift_selections ?? null
  );
  const bodyGiftOverrides =
    input.bonus_gift_overrides?.length ?
      await validateBonusGiftOverrides(tenantId, input.bonus_gift_overrides)
    : new Map<number, number>();
  const giftSelectionMap = new Map(priorSelections);
  for (const [k, v] of bodyGiftOverrides) giftSelectionMap.set(k, v);

  const warehouseId =
    input.warehouse_id !== undefined ? input.warehouse_id : existing.warehouse_id;
  const agentId = input.agent_id !== undefined ? input.agent_id : existing.agent_id;

  const existingOrderType = normalizeOrderType(existing.order_type ?? "order");
  const existingPm =
    (existing as { payment_method_ref?: string | null }).payment_method_ref?.trim() || null;
  const mergedPaymentMethodRef =
    input.payment_method_ref !== undefined
      ? input.payment_method_ref === null
        ? null
        : input.payment_method_ref.trim().slice(0, 64) || null
      : existingPm;

  if (existingOrderType === "order") {
    if (warehouseId == null || warehouseId < 1) {
      throw new Error("ORDER_REQUIRES_WAREHOUSE");
    }
    if (agentId == null || agentId < 1) {
      throw new Error("ORDER_REQUIRES_AGENT");
    }
    if (!mergedPaymentMethodRef) {
      throw new Error("ORDER_REQUIRES_PAYMENT_METHOD");
    }
  }

  if (warehouseId != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenant_id: tenantId }
    });
    if (!wh) {
      throw new Error("BAD_WAREHOUSE");
    }
  }

  let orderAgentForBonus: OrderAgentBonusContext | null = null;
  if (agentId != null) {
    const u = await prisma.user.findFirst({
      where: { id: agentId, tenant_id: tenantId, is_active: true },
      select: { id: true, branch: true, trade_direction_id: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
    orderAgentForBonus = {
      userId: u.id,
      branch: u.branch,
      trade_direction_id: u.trade_direction_id
    };
  }

  const lineData: Array<{
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
  }> = [];
  let totalSum = new Prisma.Decimal(0);
  const qtyByProduct = new Map<number, number>();
  const productById = new Map<number, { id: number; category_id: number | null }>();
  const orderedProductIds = new Set<number>();

  // ✅ BATCH: bitta so'rov bilan barcha mahsulotlarni olish (N+1 fix)
  const updateProductIds = new Set(input.items.map(i => i.product_id));
  if (updateProductIds.size !== input.items.length) {
    throw new Error("DUPLICATE_PRODUCT");
  }
  for (const it of input.items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      throw new Error("BAD_QTY");
    }
  }
  const ulProductIds = [...updateProductIds];
  const ulProducts = await prisma.product.findMany({
    where: { id: { in: ulProductIds }, tenant_id: tenantId, is_active: true }
  });
  const ulProductMap = new Map(ulProducts.map(p => [p.id, p]));
  for (const it of input.items) {
    const product = ulProductMap.get(it.product_id);
    if (!product) {
      throw new Error("BAD_PRODUCT");
    }
    const priceStr = await getProductPrice(tenantId, it.product_id, "retail");
    if (priceStr == null) {
      const e = new Error("NO_PRICE") as Error & { product_id: number; price_type: string };
      e.product_id = it.product_id;
      e.price_type = "retail";
      throw e;
    }
    const price = new Prisma.Decimal(priceStr);
    const qty = new Prisma.Decimal(it.qty);
    const lineTotal = qty.mul(price);
    totalSum = totalSum.add(lineTotal);
    lineData.push({ product_id: it.product_id, qty, price, total: lineTotal });
    productById.set(product.id, { id: product.id, category_id: product.category_id });
    qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + it.qty);
    orderedProductIds.add(it.product_id);
  }

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const stackPolicy = parseBonusStackPolicy(tenantRow?.settings);

  const updated = await prisma.$transaction(async (tx) => {
    const applyBonus = input.apply_bonus ?? true;
    let paidAfterDisc = lineData;
    let paidTotal = totalSum;
    let bonusDrafts: Array<{
      product_id: number;
      qty: Prisma.Decimal;
      price: Prisma.Decimal;
      total: Prisma.Decimal;
    }> = [];
    let appliedAutoBonusRuleIds: number[] = [];
    if (applyBonus) {
      const usedRuleIds = await fetchClientUsedAutoBonusRuleIdsExcludingOrder(
        tx,
        tenantId,
        client.id,
        orderId
      );
      const resolved = await resolveOrderBonusesForCreate(
        tx,
        tenantId,
        { id: client.id, category: client.category },
        lineData,
        totalSum,
        totalSum,
        qtyByProduct,
        productById,
        orderedProductIds,
        stackPolicy,
        usedRuleIds,
        giftSelectionMap,
        warehouseId,
        { referenceAt: existing.created_at, excludeOrderId: orderId },
        orderAgentForBonus
      );
      paidAfterDisc = resolved.lines;
      paidTotal = resolved.total;
      bonusDrafts = resolved.bonusDrafts;
      appliedAutoBonusRuleIds = resolved.appliedAutoBonusRuleIds;
    }

    let bonusSum = new Prisma.Decimal(0);
    const bonusCreates = bonusDrafts.map((b) => {
      bonusSum = bonusSum.add(b.total);
      return {
        product_id: b.product_id,
        qty: b.qty,
        price: b.price,
        total: b.total,
        is_bonus: true as const
      };
    });

    const rawDiscUp = totalSum.sub(paidTotal);
    const discountSum =
      applyBonus && rawDiscUp.gt(0) ? roundOrderMoney(rawDiscUp) : new Prisma.Decimal(0);

    const creditLimit = client.credit_limit;
    if (creditLimit.gt(0)) {
      const balRow = await tx.clientBalance.findUnique({
        where: { tenant_id_client_id: { tenant_id: tenantId, client_id: client.id } },
        select: { balance: true }
      });
      const accountBalance = balRow?.balance ?? new Prisma.Decimal(0);
      const headroom = creditLimit.add(accountBalance);
      const agg = await tx.order.aggregate({
        where: {
          tenant_id: tenantId,
          client_id: client.id,
          id: { not: orderId },
          status: { notIn: [...ORDER_STATUSES_EXCLUDED_FROM_CREDIT_EXPOSURE] }
        },
        _sum: { total_sum: true }
      });
      const outstanding = agg._sum.total_sum ?? new Prisma.Decimal(0);
      const projected = outstanding.add(paidTotal);
      if (projected.gt(headroom)) {
        const err = new Error("CREDIT_LIMIT_EXCEEDED") as Error & {
          credit_limit: string;
          outstanding: string;
          order_total: string;
        };
        err.credit_limit = headroom.toString();
        err.outstanding = outstanding.toString();
        err.order_total = paidTotal.toString();
        throw err;
      }
    }

    await tx.orderItem.deleteMany({ where: { order_id: orderId } });

    await tx.order.update({
      where: { id: orderId },
      data: {
        warehouse_id: warehouseId,
        agent_id: agentId,
        ...(input.payment_method_ref !== undefined
          ? { payment_method_ref: mergedPaymentMethodRef }
          : {}),
        total_sum: paidTotal,
        bonus_sum: bonusSum,
        discount_sum: discountSum,
        applied_auto_bonus_rule_ids: appliedAutoBonusRuleIds,
        bonus_gift_selections: bonusGiftMapToJson(giftSelectionMap),
        items: {
          create: [
            ...paidAfterDisc.map((l) => ({
              product_id: l.product_id,
              qty: l.qty,
              price: l.price,
              total: l.total,
              is_bonus: false
            })),
            ...bonusCreates
          ]
        }
      }
    });

    const linesPayload: Prisma.InputJsonObject = {
      total_sum: { from: existing.total_sum.toString(), to: paidTotal.toString() },
      bonus_sum: { from: existing.bonus_sum.toString(), to: bonusSum.toString() },
      discount_sum: {
        from: existing.discount_sum.toString(),
        to: discountSum.toString()
      },
      warehouse_id: { from: existing.warehouse_id, to: warehouseId },
      agent_id: { from: existing.agent_id, to: agentId },
      paid_lines: {
        from: prevPaidItems.map((r) => ({
          product_id: r.product_id,
          qty: r.qty.toString()
        })),
        to: paidAfterDisc.map((l) => ({
          product_id: l.product_id,
          qty: l.qty.toString()
        }))
      }
    };

    await tx.orderChangeLog.create({
      data: {
        order_id: orderId,
        user_id: logUserId,
        action: "lines",
        payload: linesPayload
      }
    });

    return tx.order.findFirstOrThrow({
      where: { id: orderId, tenant_id: tenantId },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, orderId);
  if (warehouseId != null) {
    void invalidateStock(tenantId, warehouseId);
  }
  if (existing.warehouse_id != null && existing.warehouse_id !== warehouseId) {
    void invalidateStock(tenantId, existing.warehouse_id);
  }
  return enrichOrderDetailRow(tenantId, updated as unknown as OrderDetailLoaded, viewerRole);
}

/**
 * Ombor / agent / dastavchik — faqat `new` / `confirmed` (qator tahriri bilan bir xil).
 * Ombor yoki agent o‘zgarganda dastavchik qayta avtobog‘lanadi (agar `expeditor_user_id` alohida yuborilmasa).
 */
export async function updateOrderMeta(
  tenantId: number,
  orderId: number,
  input: UpdateOrderMetaInput,
  viewerRole?: string,
  actorUserId?: number | null
): Promise<OrderDetailRow> {
  const patchWh = input.warehouse_id !== undefined;
  const patchAg = input.agent_id !== undefined;
  const patchEx = input.expeditor_user_id !== undefined;
  const patchComment = input.comment !== undefined;
  const patchPm = input.payment_method_ref !== undefined;
  if (!patchWh && !patchAg && !patchEx && !patchComment && !patchPm) {
    throw new Error("EMPTY_META_PATCH");
  }

  const existing = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId },
    include: {
      client: {
        select: {
          category: true,
          sales_channel: true,
          product_category_ref: true,
          region: true,
          city: true,
          district: true,
          zone: true,
          neighborhood: true,
          address: true
        }
      }
    }
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  const commentOnly = patchComment && !patchWh && !patchAg && !patchEx && !patchPm;
  const paymentMethodOnly = patchPm && !patchWh && !patchAg && !patchEx && !patchComment;

  if (paymentMethodOnly) {
    if (existing.status === "cancelled") {
      throw new Error("ORDER_NOT_EDITABLE");
    }
    if (!ORDER_LINES_EDITABLE_STATUSES.has(existing.status)) {
      throw new Error("ORDER_NOT_EDITABLE");
    }
    const ot = normalizeOrderType(existing.order_type ?? "order");
    const pmNext =
      input.payment_method_ref === null
        ? null
        : (input.payment_method_ref ?? "").trim().slice(0, 64) || null;
    if (ot === "order" && !pmNext) {
      throw new Error("ORDER_REQUIRES_PAYMENT_METHOD");
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { payment_method_ref: pmNext }
      });
      await tx.orderChangeLog.create({
        data: {
          order_id: orderId,
          user_id:
            actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null,
          action: "meta",
          payload: {
            payment_method_ref: {
              from: (existing as { payment_method_ref?: string | null }).payment_method_ref ?? null,
              to: pmNext
            }
          } as Prisma.InputJsonObject
        }
      });
      return tx.order.findFirstOrThrow({
        where: { id: orderId, tenant_id: tenantId },
        include: orderDetailInclude
      });
    });
    emitOrderUpdated(tenantId, orderId);
    return enrichOrderDetailRow(tenantId, updated as unknown as OrderDetailLoaded, viewerRole);
  }

  if (commentOnly) {
    if (existing.status === "cancelled") {
      throw new Error("ORDER_NOT_EDITABLE");
    }
    const c = input.comment === null ? null : input.comment!.trim() || null;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { comment: c },
      include: orderDetailInclude
    });
    emitOrderUpdated(tenantId, orderId);
    return enrichOrderDetailRow(tenantId, updated as unknown as OrderDetailLoaded, viewerRole);
  }

  if (!ORDER_LINES_EDITABLE_STATUSES.has(existing.status)) {
    throw new Error("ORDER_NOT_EDITABLE");
  }

  const nextWarehouseId = patchWh ? input.warehouse_id! : existing.warehouse_id;
  const nextAgentId = patchAg ? input.agent_id! : existing.agent_id;
  const whChanged = nextWarehouseId !== existing.warehouse_id;
  const agChanged = nextAgentId !== existing.agent_id;

  const existingOtMeta = normalizeOrderType(existing.order_type ?? "order");
  const nextPaymentMethodRef = patchPm
    ? input.payment_method_ref === null
      ? null
      : (input.payment_method_ref ?? "").trim().slice(0, 64) || null
    : ((existing as { payment_method_ref?: string | null }).payment_method_ref ?? null);
  const pmChanged =
    patchPm && String(nextPaymentMethodRef ?? "") !== String((existing as { payment_method_ref?: string | null }).payment_method_ref ?? "");

  if (existingOtMeta === "order") {
    if (nextWarehouseId == null || nextWarehouseId < 1) {
      throw new Error("ORDER_REQUIRES_WAREHOUSE");
    }
    if (nextAgentId == null || nextAgentId < 1) {
      throw new Error("ORDER_REQUIRES_AGENT");
    }
    if (!nextPaymentMethodRef || !String(nextPaymentMethodRef).trim()) {
      throw new Error("ORDER_REQUIRES_PAYMENT_METHOD");
    }
  }

  let commentNext: string | null | undefined;
  if (patchComment) {
    commentNext = input.comment === null ? null : (input.comment ?? "").trim() || null;
  }
  const commentChanged =
    commentNext !== undefined && commentNext !== ((existing as { comment?: string | null }).comment ?? null);

  const logUserId =
    actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null;

  if (nextWarehouseId != null) {
    const wh = await prisma.warehouse.findFirst({
      where: { id: nextWarehouseId, tenant_id: tenantId }
    });
    if (!wh) {
      throw new Error("BAD_WAREHOUSE");
    }
  }

  if (nextAgentId != null) {
    const u = await prisma.user.findFirst({
      where: { id: nextAgentId, tenant_id: tenantId, is_active: true }
    });
    if (!u) {
      throw new Error("BAD_AGENT");
    }
  }

  if (patchEx && input.expeditor_user_id != null) {
    const ex = await prisma.user.findFirst({
      where: {
        id: input.expeditor_user_id,
        tenant_id: tenantId,
        role: "expeditor",
        is_active: true
      }
    });
    if (!ex) {
      throw new Error("BAD_EXPEDITOR");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    let expeditorResolved: number | null;
    if (patchEx) {
      expeditorResolved = input.expeditor_user_id!;
    } else if (whChanged || agChanged) {
      expeditorResolved = await resolveAutoExpeditorUserId(tx, tenantId, {
        client: {
          category: existing.client.category,
          sales_channel: existing.client.sales_channel,
          product_category_ref: existing.client.product_category_ref,
          region: existing.client.region,
          city: existing.client.city,
          district: existing.client.district,
          zone: existing.client.zone,
          neighborhood: existing.client.neighborhood,
          address: existing.client.address
        },
        orderAgentId: nextAgentId,
        warehouseId: nextWarehouseId,
        orderPriceTypes: ["retail"],
        at: new Date()
      });
    } else {
      expeditorResolved = existing.expeditor_user_id;
    }

    const exChanged = expeditorResolved !== existing.expeditor_user_id;
    if (!whChanged && !agChanged && !exChanged && !commentChanged && !pmChanged) {
      return tx.order.findFirstOrThrow({
        where: { id: orderId, tenant_id: tenantId },
        include: orderDetailInclude
      });
    }

    const metaPayload = {
      ...(whChanged
        ? { warehouse_id: { from: existing.warehouse_id, to: nextWarehouseId } }
        : {}),
      ...(agChanged ? { agent_id: { from: existing.agent_id, to: nextAgentId } } : {}),
      ...(exChanged
        ? {
            expeditor_user_id: {
              from: existing.expeditor_user_id,
              to: expeditorResolved
            }
          }
        : {}),
      ...(commentChanged
        ? {
            comment: {
              from: (existing as { comment?: string | null }).comment ?? null,
              to: commentNext ?? null
            }
          }
        : {}),
      ...(pmChanged
        ? {
            payment_method_ref: {
              from: (existing as { payment_method_ref?: string | null }).payment_method_ref ?? null,
              to: nextPaymentMethodRef
            }
          }
        : {})
    } as Prisma.InputJsonObject;

    await tx.order.update({
      where: { id: orderId },
      data: {
        warehouse_id: nextWarehouseId,
        agent_id: nextAgentId,
        expeditor_user_id: expeditorResolved,
        ...(commentNext !== undefined ? { comment: commentNext } : {}),
        ...(patchPm ? { payment_method_ref: nextPaymentMethodRef } : {})
      }
    });

    if (Object.keys(metaPayload).length > 0) {
      await tx.orderChangeLog.create({
        data: {
          order_id: orderId,
          user_id: logUserId,
          action: "meta",
          payload: metaPayload
        }
      });
    }

    return tx.order.findFirstOrThrow({
      where: { id: orderId, tenant_id: tenantId },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, orderId);
  if (whChanged) {
    if (existing.warehouse_id != null) {
      void invalidateStock(tenantId, existing.warehouse_id);
    }
    if (nextWarehouseId != null) {
      void invalidateStock(tenantId, nextWarehouseId);
    }
  }
  return enrichOrderDetailRow(tenantId, updated as unknown as OrderDetailLoaded, viewerRole);
}

export async function updateOrderStatus(
  tenantId: number,
  orderId: number,
  nextStatus: string,
  actorUserId: number | null,
  actorRole: string
): Promise<OrderDetailRow> {
  const trimmed = nextStatus.trim();
  if (!isValidOrderStatus(trimmed)) {
    throw new Error("INVALID_STATUS");
  }

  const o = await prisma.order.findFirst({
    where: { id: orderId, tenant_id: tenantId },
    include: orderDetailInclude
  });
  if (!o) {
    throw new Error("NOT_FOUND");
  }

  if (o.status === trimmed) {
    return enrichOrderDetailRow(tenantId, o as unknown as OrderDetailLoaded, actorRole);
  }

  if (!canTransitionOrderStatus(o.status, trimmed)) {
    const err = new Error("INVALID_TRANSITION") as Error & { from: string; to: string };
    err.from = o.status;
    err.to = trimmed;
    throw err;
  }

  if (isBackwardTransition(o.status, trimmed) && actorRole !== "admin") {
    throw new Error("FORBIDDEN_REVERT");
  }

  if (o.status === "cancelled" && trimmed === "new" && actorRole !== "admin") {
    throw new Error("FORBIDDEN_REOPEN_CANCELLED");
  }

  if (actorRole === "operator" && isOperatorLateStageCancelForbidden(o.status, trimmed)) {
    throw new Error("FORBIDDEN_OPERATOR_CANCEL_LATE");
  }

  const fromStatus = o.status;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: o.id },
      data: { status: trimmed }
    });
    await tx.orderStatusLog.create({
      data: {
        order_id: o.id,
        from_status: fromStatus,
        to_status: trimmed,
        user_id:
          actorUserId != null && Number.isFinite(actorUserId) && actorUserId > 0 ? actorUserId : null
      }
    });

    // ✅ Rezervatsiya mantig'i
    const whId = o.warehouse_id;
    if (whId != null) {
      const items = await tx.orderItem.findMany({
        where: { order_id: o.id },
        select: { product_id: true, qty: true, is_bonus: true, exchange_line_kind: true }
      });
      const nonBonusItems = items.filter((i) => {
        if (i.is_bonus) return false;
        if (i.exchange_line_kind === "minus") return false;
        return true;
      });

      if (trimmed === "confirmed" && fromStatus === "new") {
        // Rezlarga chiqarish + haqiqiy qoldiqdan ayirish
        for (const item of nonBonusItems) {
          await tx.stock.upsert({
            where: {
              tenant_id_warehouse_id_product_id: {
                tenant_id: tenantId,
                warehouse_id: whId,
                product_id: item.product_id
              }
            },
            create: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: item.product_id,
              qty: new Prisma.Decimal(0),
              reserved_qty: new Prisma.Decimal(0)
            },
            update: {
              qty: { decrement: item.qty },
              reserved_qty: { decrement: item.qty }
            }
          });
        }
      } else if (trimmed === "cancelled") {
        // Rezervni bekor qilish (faqat plus); minus uchun inbound qaytarish
        for (const item of nonBonusItems) {
          await tx.stock.upsert({
            where: {
              tenant_id_warehouse_id_product_id: {
                tenant_id: tenantId,
                warehouse_id: whId,
                product_id: item.product_id
              }
            },
            create: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: item.product_id,
              qty: new Prisma.Decimal(0),
              reserved_qty: new Prisma.Decimal(0)
            },
            update: {
              reserved_qty: { decrement: item.qty }
            }
          });
        }
        const minusItems = items.filter((i) => !i.is_bonus && i.exchange_line_kind === "minus");
        for (const item of minusItems) {
          await tx.stock.upsert({
            where: {
              tenant_id_warehouse_id_product_id: {
                tenant_id: tenantId,
                warehouse_id: whId,
                product_id: item.product_id
              }
            },
            create: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: item.product_id,
              qty: new Prisma.Decimal(0),
              reserved_qty: new Prisma.Decimal(0)
            },
            update: {
              qty: { decrement: item.qty }
            }
          });
        }
      } else if (fromStatus === "cancelled" && trimmed === "new") {
        // Qayta tiklash: rezervni qo'shish
        for (const item of nonBonusItems) {
          await tx.stock.upsert({
            where: {
              tenant_id_warehouse_id_product_id: {
                tenant_id: tenantId,
                warehouse_id: whId,
                product_id: item.product_id
              }
            },
            create: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: item.product_id,
              qty: new Prisma.Decimal(0),
              reserved_qty: item.qty
            },
            update: {
              reserved_qty: { increment: item.qty }
            }
          });
        }
        const minusItemsReopen = items.filter((i) => !i.is_bonus && i.exchange_line_kind === "minus");
        for (const item of minusItemsReopen) {
          await tx.stock.upsert({
            where: {
              tenant_id_warehouse_id_product_id: {
                tenant_id: tenantId,
                warehouse_id: whId,
                product_id: item.product_id
              }
            },
            create: {
              tenant_id: tenantId,
              warehouse_id: whId,
              product_id: item.product_id,
              qty: item.qty,
              reserved_qty: new Prisma.Decimal(0)
            },
            update: {
              qty: { increment: item.qty }
            }
          });
        }
      }
    }

    return tx.order.findFirstOrThrow({
      where: { id: o.id, tenant_id: tenantId },
      include: orderDetailInclude
    });
  });

  emitOrderUpdated(tenantId, orderId);
  void enqueueOrderStatusNotifyJob({
    tenant_id: tenantId,
    order_id: orderId,
    order_number: o.number,
    client_name: o.client.name,
    from_status: fromStatus,
    to_status: trimmed,
    actor_user_id: actorUserId,
    agent_id: o.agent_id,
    expeditor_user_id: o.expeditor_user_id
  });
  if (o.warehouse_id != null) {
    void invalidateStock(tenantId, o.warehouse_id);
  }
  return enrichOrderDetailRow(tenantId, updated as unknown as OrderDetailLoaded, actorRole);
}

export type BulkOrderStatusResult = {
  updated: number[];
  failed: { id: number; error: string; from?: string; to?: string }[];
};

/** Bir nechta zakaz uchun ketma-ket `updateOrderStatus` (har biri o‘z logi / socket bilan). */
export async function bulkUpdateOrderStatus(
  tenantId: number,
  orderIds: number[],
  nextStatus: string,
  actorUserId: number | null,
  actorRole: string
): Promise<BulkOrderStatusResult> {
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  const updated: number[] = [];
  const failed: BulkOrderStatusResult["failed"] = [];
  for (const id of ids) {
    try {
      await updateOrderStatus(tenantId, id, nextStatus, actorUserId, actorRole);
      updated.push(id);
    } catch (e) {
      const code = getErrorCode(e) ?? "UNKNOWN";
      const ex = e as Error & { from?: string; to?: string };
      failed.push({
        id,
        error: code,
        ...(code === "INVALID_TRANSITION" ? { from: ex.from, to: ex.to } : {})
      });
    }
  }
  return { updated, failed };
}

export type BulkOrderExpeditorResult = {
  updated: number[];
  failed: { id: number; error: string }[];
};

/** Guruh: ekspeditor biriktirish / yechish (`null` — yechish). Har biri `updateOrderMeta` qoidalariga bo‘ysunadi. */
export async function bulkUpdateOrderExpeditor(
  tenantId: number,
  orderIds: number[],
  expeditorUserId: number | null,
  actorUserId: number | null,
  viewerRole?: string
): Promise<BulkOrderExpeditorResult> {
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  const updated: number[] = [];
  const failed: BulkOrderExpeditorResult["failed"] = [];
  for (const id of ids) {
    try {
      await updateOrderMeta(
        tenantId,
        id,
        { expeditor_user_id: expeditorUserId },
        viewerRole,
        actorUserId
      );
      updated.push(id);
    } catch (e) {
      failed.push({ id, error: getErrorCode(e) ?? "UNKNOWN" });
    }
  }
  return { updated, failed };
}

export type ListOrdersQuery = {
  page: number;
  limit: number;
  status?: string;
  client_id?: number;
  /** Raqam, mijoz nomi, izoh bo‘yicha qidiruv */
  search?: string;
  warehouse_id?: number;
  agent_id?: number;
  /** Bir nechta agent (klient profili); `agent_id` bilan bir vaqtda — bu ustun. */
  agent_ids?: number[];
  /** Zakazda agent yo‘q (agent_id IS NULL) */
  include_no_agent?: boolean;
  expeditor_user_id?: number;
  /** Mijoz `category` maydoni bilan to‘liq mos (trim) */
  client_category?: string;
  /** Shu mahsulot qatori bo’lgan zakazlar */
  product_id?: number;
  /** YYYY-MM-DD (server vaqt zonasi — brauzer `date` input bilan mos) */
  date_from?: string;
  date_to?: string;
  /**
   * Sana oralig‘i qaysi vaqtga tegishli: `created` | `order` | `ship`.
   * `order` — hozircha `created_at` bilan bir xil (alohida «zakaz sanasi» ustuni yo‘q).
   * `ship` — birinchi marta `delivering` holatiga o‘tgan log vaqti.
   */
  date_mode?: string;
  /** Hujjat tipi bo’yicha filter */
  order_type?: string;
  /** Konsignatsiya zakazlari */
  is_consignment?: boolean;
  /** product.category_id — zakazda shu kategoriyadan mahsulot qatori bo‘lsa */
  product_category_id?: number;
  /** Shu payment_type bo‘lgan to‘lovi bor zakazlar */
  payment_type?: string;
  /** Zakazda saqlangan to‘lov usuli (`payment_method_ref`) */
  payment_method_ref?: string;
};

type OrderFinanceSlice = {
  id: number;
  client_id: number;
  order_type: string;
  status: string;
  total_sum: Prisma.Decimal;
};

/** Ro‘yxat va bitta zakaz tafsiloti: taqsimot, mijoz balansi, birinchi «отгружен/доставлен» vaqtlari. */
async function loadOrdersFinanceEnrichment(
  tenantId: number,
  slices: OrderFinanceSlice[]
): Promise<
  Map<
    number,
    {
      debt: string | null;
      balance: string | null;
      delivered_at: string | null;
      shipped_at: string | null;
    }
  >
> {
  const out = new Map<
    number,
    {
      debt: string | null;
      balance: string | null;
      delivered_at: string | null;
      shipped_at: string | null;
    }
  >();
  if (slices.length === 0) return out;

  const ids = slices.map((s) => s.id);
  const clientIds = [...new Set(slices.map((s) => s.client_id))];

  const [allocRows, statusRows, balRows, deliveryByClient] = await Promise.all([
    prisma.$queryRaw<Array<{ order_id: number; alloc: Prisma.Decimal }>>`
      SELECT order_id, COALESCE(SUM(amount), 0)::decimal(15,2) AS alloc
      FROM payment_allocations
      WHERE tenant_id = ${tenantId}
        AND order_id IN (${Prisma.join(ids)})
      GROUP BY order_id
    `,
    prisma.$queryRaw<Array<{ order_id: number; to_status: string; first_at: Date }>>`
      SELECT order_id, to_status, MIN(created_at) AS first_at
      FROM order_status_logs
      WHERE order_id IN (${Prisma.join(ids)})
        AND to_status IN ('delivering', 'delivered')
      GROUP BY order_id, to_status
    `,
    prisma.clientBalance.findMany({
      where: { tenant_id: tenantId, client_id: { in: clientIds } },
      select: { client_id: true, balance: true }
    }),
    loadDeliveryDebtByClient(tenantId, clientIds)
  ]);

  const allocByOrder = new Map<number, Prisma.Decimal>();
  for (const r of allocRows) {
    allocByOrder.set(r.order_id, r.alloc);
  }

  const shippedDelivered = new Map<number, { ship?: Date; del?: Date }>();
  for (const r of statusRows) {
    const cur = shippedDelivered.get(r.order_id) ?? {};
    if (r.to_status === "delivering") cur.ship = r.first_at;
    if (r.to_status === "delivered") cur.del = r.first_at;
    shippedDelivered.set(r.order_id, cur);
  }

  const balByClient = new Map<number, Prisma.Decimal>();
  for (const b of balRows) {
    balByClient.set(b.client_id, b.balance);
  }

  for (const s of slices) {
    const allocated = allocByOrder.get(s.id) ?? new Prisma.Decimal(0);
    let debt: string | null = null;
    if (statusContributesToDeliveredReceivableDebt(s.status, s.order_type)) {
      const unpaid = s.total_sum.sub(allocated);
      debt = (unpaid.gt(0) ? unpaid : new Prisma.Decimal(0)).toString();
    }
    const ledger = balByClient.get(s.client_id) ?? new Prisma.Decimal(0);
    const blend = deliveryByClient.get(s.client_id);
    const displayBal = mergeLedgerWithUnpaidDelivered(ledger, blend);
    const sd = shippedDelivered.get(s.id);
    out.set(s.id, {
      debt,
      balance: displayBal.toString(),
      delivered_at: sd?.del ? sd.del.toISOString() : null,
      shipped_at: sd?.ship ? sd.ship.toISOString() : null
    });
  }

  return out;
}

function parseListOrderLocalDayStart(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseListOrderLocalDayEnd(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function listOrdersPaged(
  tenantId: number,
  q: ListOrdersQuery,
  viewerRole: string
): Promise<{ data: OrderListRow[]; total: number; page: number; limit: number }> {
  const andClauses: Prisma.OrderWhereInput[] = [{ tenant_id: tenantId }];

  if (q.status?.trim()) {
    andClauses.push({ status: q.status.trim() });
  }
  if (q.client_id != null && Number.isFinite(q.client_id) && q.client_id > 0) {
    andClauses.push({ client_id: q.client_id });
  }
  if (q.warehouse_id != null && Number.isFinite(q.warehouse_id) && q.warehouse_id > 0) {
    andClauses.push({ warehouse_id: q.warehouse_id });
  }
  const multiAgent =
    Array.isArray(q.agent_ids) && q.agent_ids.length > 0
      ? q.agent_ids.filter((id) => Number.isFinite(id) && id > 0)
      : [];
  const hasMultiAgent = multiAgent.length > 0 || q.include_no_agent === true;
  if (hasMultiAgent) {
    const ors: Prisma.OrderWhereInput[] = [];
    if (multiAgent.length > 0) {
      ors.push({ agent_id: { in: multiAgent } });
    }
    if (q.include_no_agent === true) {
      ors.push({ agent_id: null });
    }
    if (ors.length === 1) {
      andClauses.push(ors[0]!);
    } else if (ors.length > 1) {
      andClauses.push({ OR: ors });
    }
  } else if (q.agent_id != null && Number.isFinite(q.agent_id) && q.agent_id > 0) {
    andClauses.push({ agent_id: q.agent_id });
  }
  if (q.expeditor_user_id != null && Number.isFinite(q.expeditor_user_id) && q.expeditor_user_id > 0) {
    andClauses.push({ expeditor_user_id: q.expeditor_user_id });
  }
  const cat = q.client_category?.trim();
  if (cat) {
    andClauses.push({ client: { category: cat } });
  }
  if (q.product_id != null && Number.isFinite(q.product_id) && q.product_id > 0) {
    andClauses.push({ items: { some: { product_id: q.product_id } } });
  }
  if (q.order_type?.trim()) {
    andClauses.push({ order_type: q.order_type.trim() });
  }
  if (q.is_consignment === true) {
    andClauses.push({ is_consignment: true });
  } else if (q.is_consignment === false) {
    andClauses.push({ is_consignment: false });
  }
  if (q.product_category_id != null && Number.isFinite(q.product_category_id) && q.product_category_id > 0) {
    andClauses.push({
      items: {
        some: {
          is_bonus: false,
          product: { tenant_id: tenantId, category_id: q.product_category_id }
        }
      }
    });
  }
  const payT = q.payment_type?.trim();
  if (payT) {
    andClauses.push({
      payments: { some: { payment_type: payT, deleted_at: null } }
    });
  }

  const pmRef = q.payment_method_ref?.trim();
  if (pmRef) {
    andClauses.push({ payment_method_ref: pmRef });
  }

  const fromD = q.date_from?.trim() ? parseListOrderLocalDayStart(q.date_from.trim()) : null;
  const toD = q.date_to?.trim() ? parseListOrderLocalDayEnd(q.date_to.trim()) : null;
  if (fromD && toD && fromD.getTime() > toD.getTime()) {
    return { data: [], total: 0, page: q.page, limit: q.limit };
  }
  if (fromD || toD) {
    const range: Prisma.DateTimeFilter = {};
    if (fromD) range.gte = fromD;
    if (toD) range.lte = toD;
    const rawMode = (q.date_mode?.trim() || "created").toLowerCase();
    const mode = rawMode === "order" ? "created" : rawMode;
    if (mode === "ship") {
      andClauses.push({
        status_logs: {
          some: {
            to_status: "delivering",
            created_at: range
          }
        }
      });
    } else {
      andClauses.push({ created_at: range });
    }
  }

  const rawSearch = q.search?.trim() ?? "";
  if (rawSearch.length > 0) {
    const s = rawSearch.length > 200 ? rawSearch.slice(0, 200) : rawSearch;
    andClauses.push({
      OR: [
        { number: { contains: s, mode: "insensitive" } },
        { client: { is: { name: { contains: s, mode: "insensitive" } } } },
        { comment: { contains: s, mode: "insensitive" } }
      ]
    });
  }

  const where: Prisma.OrderWhereInput = { AND: andClauses };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { created_at: "desc" },
      include: {
        client: {
          select: {
            name: true,
            region: true,
            city: true,
            district: true,
            neighborhood: true
          }
        },
        warehouse: { select: { name: true } },
        agent: { select: { name: true, code: true, consignment: true } },
        expeditor_user: { select: { id: true, login: true, name: true } },
        items: { select: { qty: true, is_bonus: true } }
      }
    })
  ]);

  const finance = await loadOrdersFinanceEnrichment(
    tenantId,
    rows.map((o) => ({
      id: o.id,
      client_id: o.client_id,
      order_type: o.order_type ?? "order",
      status: o.status,
      total_sum: o.total_sum
    }))
  );

  return {
    data: rows.map((o) => {
      const ex = o.expeditor_user;
      const expeditorDisplay = ex ? `${ex.login} (${ex.name})` : null;
      const finRow = finance.get(o.id);
      return {
      id: o.id,
      number: o.number,
      order_type: o.order_type ?? "order",
      client_id: o.client_id,
      client_name: o.client.name,
      client_legal_name: null,
      warehouse_id: o.warehouse_id,
      warehouse_name: o.warehouse?.name ?? null,
      agent_name: o.agent?.name ?? null,
      agent_code: o.agent?.code ?? null,
      expeditors: expeditorDisplay,
      expeditor_id: ex?.id ?? null,
      expeditor_display: expeditorDisplay,
      region: o.client.region ?? null,
      city: o.client.city ?? o.client.district ?? null,
      zone: o.client.neighborhood ?? null,
      consignment: o.agent?.consignment ?? null,
      is_consignment: o.is_consignment ?? false,
      day: null,
      created_by: null,
      created_by_role: null,
      expected_ship_date: null,
      shipped_at: finRow?.shipped_at ?? null,
      delivered_at: finRow?.delivered_at ?? null,
      status: o.status,
      qty: o.items
        .filter((i) => !i.is_bonus)
        .reduce((acc, i) => acc.add(i.qty), new Prisma.Decimal(0))
        .toString(),
      total_sum: o.total_sum.toString(),
      bonus_qty: sumBonusQty(o.items),
      discount_sum: o.discount_sum.toString(),
      bonus_sum: o.bonus_sum.toString(),
      balance: finRow?.balance ?? null,
      debt: finRow?.debt ?? null,
      price_type: null,
      comment: (o as { comment?: string | null }).comment ?? null,
      request_type_ref: (o as { request_type_ref?: string | null }).request_type_ref ?? null,
      created_at: o.created_at.toISOString(),
      allowed_next_statuses: allowedNextForRole(o.status, viewerRole)
    };
    }),
    total,
    page: q.page,
    limit: q.limit
  };
}

export async function getOrderDetail(
  tenantId: number,
  id: number,
  viewerRole?: string
): Promise<OrderDetailRow> {
  const o = await prisma.order.findFirst({
    where: { id, tenant_id: tenantId },
    include: orderDetailInclude
  });
  if (!o) {
    throw new Error("NOT_FOUND");
  }
  return enrichOrderDetailRow(tenantId, o as unknown as OrderDetailLoaded, viewerRole);
}

export const NAKLADNOY_TEMPLATE_IDS = ["nakladnoy_warehouse", "nakladnoy_expeditor"] as const;
export type NakladnoyTemplateId = (typeof NAKLADNOY_TEMPLATE_IDS)[number];

export type BulkNakladnoyFileResult = {
  buffer: Buffer;
  filename: string;
  template: NakladnoyTemplateId;
  format: "xlsx" | "pdf";
  order_ids: number[];
};

type OrderNakladnoyDb = {
  id: number;
  number: string;
  agent_id: number | null;
  expeditor_user_id: number | null;
  created_at: Date;
  tenant: { name: string; phone: string | null };
  warehouse: { name: string } | null;
  agent: {
    login: string;
    name: string;
    code: string | null;
    phone: string | null;
    territory: string | null;
    branch: string | null;
    created_at: Date;
  } | null;
  expeditor_user: {
    login: string;
    name: string;
    code: string | null;
    phone: string | null;
    branch: string | null;
    created_at: Date;
  } | null;
  client: {
    name: string;
    address: string | null;
    region: string | null;
    city: string | null;
    district: string | null;
    neighborhood: string | null;
    street: string | null;
    house_number: string | null;
    phone: string | null;
    client_balances: { balance: Prisma.Decimal }[];
  };
  items: Array<{
    id: number;
    product_id: number;
    qty: Prisma.Decimal;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    is_bonus: boolean;
    product: {
      sku: string;
      barcode: string | null;
      name: string;
      qty_per_block: number | null;
      category: { name: string } | null;
      product_group: { name: string } | null;
    };
  }>;
};

function fmtRuDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function mapOrderToNakladnoyPayload(o: OrderNakladnoyDb): NakladnoyOrderPayload {
  const bal = o.client.client_balances[0]?.balance ?? null;
  const ag = o.agent;
  const agentLine = ag
    ? `${ag.code?.trim() || ag.login}- [${ag.name}]${ag.phone?.trim() ? ` ${ag.phone.trim()}` : ""}`
    : "—";
  const ex = o.expeditor_user;
  const tag = (ex?.branch ?? ex?.code ?? ex?.login ?? "").toString().trim() || "—";
  const expeditorLine = ex
    ? `[${tag}] ${ex.name} (${fmtRuDateShort(ex.created_at)})${ex.phone?.trim() ? ` ${ex.phone.trim()}` : ""}`
    : "—";
  const territory =
    o.client.region?.trim() || ag?.territory?.trim() || "—";
  const addrParts = [
    o.client.region,
    o.client.city,
    o.client.district,
    o.client.neighborhood,
    o.client.street,
    o.client.house_number
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  const clientAddress = (o.client.address?.trim() || addrParts.join(", ") || "—").trim();

  const bonusQtyByProduct = new Map<number, Prisma.Decimal>();
  for (const it of o.items) {
    if (!it.is_bonus) continue;
    const prev = bonusQtyByProduct.get(it.product_id) ?? new Prisma.Decimal(0);
    bonusQtyByProduct.set(it.product_id, prev.add(it.qty));
  }

  const groupTitleOf = (it: (typeof o.items)[0]) =>
    it.product.product_group?.name?.trim() ||
    it.product.category?.name?.trim() ||
    "Прочее";

  const lines: NakladnoyLine[] = [];
  const paidLines: NakladnoyLine[] = [];
  const bonusLines: NakladnoyLine[] = [];

  for (const it of o.items) {
    if (it.is_bonus) {
      const ln: NakladnoyLine = {
        productId: it.product_id,
        sku: it.product.sku,
        barcode: it.product.barcode,
        name: it.product.name,
        qty: Number(it.qty.toString()),
        bonusQty: 0,
        price: Number(it.price.toString()),
        sum: Number(it.total.toString()),
        groupTitle: groupTitleOf(it),
        qtyPerBlock: it.product.qty_per_block
      };
      bonusLines.push(ln);
      continue;
    }
    let bonusQty = 0;
    if (bonusQtyByProduct.has(it.product_id)) {
      const bdec = bonusQtyByProduct.get(it.product_id)!;
      bonusQty = Number(bdec.toString());
      bonusQtyByProduct.delete(it.product_id);
    }
    const ln: NakladnoyLine = {
      productId: it.product_id,
      sku: it.product.sku,
      barcode: it.product.barcode,
      name: it.product.name,
      qty: Number(it.qty.toString()),
      bonusQty,
      price: Number(it.price.toString()),
      sum: Number(it.total.toString()),
      groupTitle: groupTitleOf(it),
      qtyPerBlock: it.product.qty_per_block
    };
    lines.push(ln);
    paidLines.push(ln);
  }

  for (const it of o.items) {
    if (!it.is_bonus) continue;
    const hasPaid = o.items.some((x) => !x.is_bonus && x.product_id === it.product_id);
    if (hasPaid) continue;
    lines.push({
      productId: it.product_id,
      sku: it.product.sku,
      barcode: it.product.barcode,
      name: it.product.name,
      qty: 0,
      bonusQty: Number(it.qty.toString()),
      price: 0,
      sum: 0,
      groupTitle: groupTitleOf(it),
      qtyPerBlock: it.product.qty_per_block
    });
  }

  return {
    id: o.id,
    number: o.number,
    createdAt: o.created_at,
    agentId: o.agent_id,
    expeditorUserId: o.expeditor_user_id,
    tenantName: o.tenant.name,
    tenantPhone: o.tenant.phone,
    clientName: o.client.name,
    clientBalanceNum: bal,
    clientAddress,
    currencyLabel: "So'm (UZS)",
    agentLine,
    expeditorLine,
    territory,
    warehouseName: o.warehouse?.name ?? null,
    lines,
    paidLines,
    bonusLines
  };
}

export async function requestBulkOrderNakladnoy(
  tenantId: number,
  orderIds: number[],
  template: string,
  buildOptions: NakladnoyBuildOptions = DEFAULT_NAKLADNOY_BUILD_OPTIONS,
  format: "xlsx" | "pdf" = "xlsx"
): Promise<BulkNakladnoyFileResult> {
  if (!NAKLADNOY_TEMPLATE_IDS.includes(template as NakladnoyTemplateId)) {
    throw new Error("INVALID_NAKLADNOY_TEMPLATE");
  }
  const tid = template as NakladnoyTemplateId;
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))].sort((a, b) => a - b);
  if (ids.length === 0) {
    throw new Error("EMPTY_ORDER_IDS");
  }
  if (ids.length > 500) {
    throw new Error("TOO_MANY_ORDERS");
  }
  const rows = await prisma.order.findMany({
    where: { tenant_id: tenantId, id: { in: ids } },
    select: { id: true }
  });
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    const err = new Error("ORDERS_NOT_FOUND") as Error & { missing_ids: number[] };
    err.missing_ids = missing;
    throw err;
  }

  const loaded = await prisma.order.findMany({
    where: { tenant_id: tenantId, id: { in: ids } },
    orderBy: { id: "asc" },
    include: {
      tenant: { select: { name: true, phone: true } },
      warehouse: { select: { name: true } },
      agent: {
        select: {
          login: true,
          name: true,
          code: true,
          phone: true,
          territory: true,
          branch: true,
          created_at: true
        }
      },
      expeditor_user: {
        select: {
          login: true,
          name: true,
          code: true,
          phone: true,
          branch: true,
          created_at: true
        }
      },
      client: {
        select: {
          name: true,
          address: true,
          region: true,
          city: true,
          district: true,
          neighborhood: true,
          street: true,
          house_number: true,
          phone: true,
          client_balances: {
            where: { tenant_id: tenantId },
            take: 1,
            select: { balance: true }
          }
        }
      },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: {
            select: {
              sku: true,
              barcode: true,
              name: true,
              qty_per_block: true,
              category: { select: { name: true } },
              product_group: { select: { name: true } }
            }
          }
        }
      }
    }
  });

  const byId = new Map(loaded.map((x) => [x.id, x]));
  const ordered = ids.map((id) => byId.get(id)!).map((o) => mapOrderToNakladnoyPayload(o as OrderNakladnoyDb));

  const buffer =
    format === "pdf"
      ? await buildNakladnoyPdf(tid, ordered)
      : await buildNakladnoyXlsx(tid, ordered, buildOptions);
  const day = new Date().toISOString().slice(0, 10);
  const filename =
    tid === "nakladnoy_warehouse"
      ? `zagruz_zav_sklda_5_1_8_${day}.${format}`
      : `nakladnye_2_1_0_${day}.${format}`;

  return {
    buffer,
    filename,
    template: tid,
    format,
    order_ids: ids
  };
}

