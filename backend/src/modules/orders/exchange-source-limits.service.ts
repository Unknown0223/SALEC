import { prisma } from "../../config/database";
import { getClientReturnsData } from "../returns/returns-enhanced.service";

export type ExchangeMinusLineInput = {
  order_id: number;
  product_id: number;
  qty: number;
};

export type ExchangeMetaPayload = {
  source_order_ids: number[];
  minus_lines: ExchangeMinusLineInput[];
  plus_lines: { product_id: number; qty: number }[];
  reason_ref?: string | null;
};

/**
 * Posted exchange hujjatlaridan (minus) sarflangan miqdorlar.
 * `cancelled` obmenlar hisobga olinmaydi (minus bekor qilinganda manba qoldiq tiklanadi).
 * `new` ham kiradi: obmen yaratilganda minus omborga qabul qilingan (`createOrder`).
 */
export async function sumPriorExchangeMinusByOrderLine(
  tenantId: number,
  clientId: number,
  opts?: { excludeOrderId?: number }
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const rows = await prisma.order.findMany({
    where: {
      tenant_id: tenantId,
      client_id: clientId,
      order_type: "exchange",
      status: { not: "cancelled" },
      ...(opts?.excludeOrderId != null ? { id: { not: opts.excludeOrderId } } : {})
    },
    select: { exchange_meta: true }
  });
  for (const r of rows) {
    const meta = r.exchange_meta;
    if (meta == null || typeof meta !== "object" || Array.isArray(meta)) continue;
    const ml = (meta as Record<string, unknown>).minus_lines;
    if (!Array.isArray(ml)) continue;
    for (const raw of ml) {
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
      const o = raw as Record<string, unknown>;
      const oid = Number(o.order_id);
      const pid = Number(o.product_id);
      const q = Number(o.qty);
      if (!Number.isFinite(oid) || oid < 1 || !Number.isFinite(pid) || pid < 1 || !Number.isFinite(q) || q <= 0) {
        continue;
      }
      const k = `${oid}:${pid}`;
      out.set(k, (out.get(k) ?? 0) + q);
    }
  }
  return out;
}

/**
 * Polki shrink qoldig‘idan keyin (har `order_id:product_id`) avvalgi obmen minuslarini ayirish.
 * `priorByKey` — odatda `sumPriorExchangeMinusByOrderLine` chiqishi.
 * Manba zakazlar `getClientReturnsData` orqali faqat **delivered** (polki manbasi) holatda olinadi.
 * Yetkazilgandan keyin `updateOrderLines` faqat `new`/`confirmed` uchun — qatorlarni kattalashtirish
 * obmen qoldig‘ini bu yerda avtomatik qoplamaydi (alohida talab bo‘lsa keyinroq).
 */
export async function computeExchangeMinusRemainingByKey(
  tenantId: number,
  clientId: number,
  sourceOrderIds: number[],
  priorByKey: Map<string, number>
): Promise<Map<string, number>> {
  const uniqueOrders = [...new Set(sourceOrderIds.filter((x) => Number.isFinite(x) && x > 0))].sort(
    (a, b) => a - b
  );
  if (uniqueOrders.length < 1) return new Map();

  const cr = await getClientReturnsData(
    tenantId,
    clientId,
    undefined,
    undefined,
    undefined,
    uniqueOrders,
    { shrinkLineQtyAfterReturns: true }
  );

  const remainingByKey = new Map<string, number>();
  for (const it of cr.items) {
    const oid = it.order_id;
    if (oid == null || oid < 1) continue;
    const k = `${oid}:${it.product_id}`;
    const q = Number.parseFloat(String(it.qty).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) continue;
    remainingByKey.set(k, (remainingByKey.get(k) ?? 0) + q);
  }

  for (const [k, used] of priorByKey) {
    const cur = remainingByKey.get(k) ?? 0;
    remainingByKey.set(k, Math.max(0, cur - used));
  }
  return remainingByKey;
}

export type ExchangeSourceAvailabilityLine = {
  order_id: number;
  product_id: number;
  /** Polki qaytarishlardan keyin qoldiq (client-data shrink) */
  polki_remaining_qty: number;
  /** Faol obmen hujjatlarining minuslari jami */
  prior_exchange_minus_qty: number;
  /** Yangi obmen minus uchun ruxsat etilgan maksimum */
  max_minus_qty: number;
};

/** UI / API: manba zakazlar bo‘yicha obmen minus limitlari (bitta GET). */
export async function getExchangeSourceAvailability(
  tenantId: number,
  clientId: number,
  sourceOrderIds: number[],
  opts?: { excludeExchangeOrderId?: number }
): Promise<ExchangeSourceAvailabilityLine[]> {
  const uniqueOrders = [...new Set(sourceOrderIds.filter((x) => Number.isFinite(x) && x > 0))].sort(
    (a, b) => a - b
  );
  if (uniqueOrders.length < 1) return [];

  const prior = await sumPriorExchangeMinusByOrderLine(tenantId, clientId, {
    excludeOrderId: opts?.excludeExchangeOrderId
  });

  const cr = await getClientReturnsData(
    tenantId,
    clientId,
    undefined,
    undefined,
    undefined,
    uniqueOrders,
    { shrinkLineQtyAfterReturns: true }
  );

  const shrunkByKey = new Map<string, number>();
  for (const it of cr.items) {
    const oid = it.order_id;
    if (oid == null || oid < 1) continue;
    const k = `${oid}:${it.product_id}`;
    const q = Number.parseFloat(String(it.qty).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) continue;
    shrunkByKey.set(k, (shrunkByKey.get(k) ?? 0) + q);
  }

  const keys = new Set<string>([...shrunkByKey.keys(), ...prior.keys()]);
  const lines: ExchangeSourceAvailabilityLine[] = [];
  for (const k of keys) {
    const [os, ps] = k.split(":");
    const order_id = Number(os);
    const product_id = Number(ps);
    if (!Number.isFinite(order_id) || order_id < 1 || !Number.isFinite(product_id) || product_id < 1) continue;
    const polkiRem = shrunkByKey.get(k) ?? 0;
    const priorEx = prior.get(k) ?? 0;
    const maxMinus = Math.max(0, polkiRem - priorEx);
    lines.push({
      order_id,
      product_id,
      polki_remaining_qty: polkiRem,
      prior_exchange_minus_qty: priorEx,
      max_minus_qty: maxMinus
    });
  }
  lines.sort((a, b) => a.order_id - b.order_id || a.product_id - b.product_id);
  return lines;
}

/**
 * Yetkazilgan manba zakazlar bo‘yicha (polki qoidasi) qoldiq + avvalgi obmen minuslari.
 */
export async function validateExchangeMinusAgainstSourceOrders(
  tenantId: number,
  clientId: number,
  sourceOrderIds: number[],
  minusLines: ExchangeMinusLineInput[]
): Promise<void> {
  const uniqueOrders = [...new Set(sourceOrderIds.filter((x) => Number.isFinite(x) && x > 0))].sort(
    (a, b) => a - b
  );
  if (uniqueOrders.length < 1) {
    throw new Error("EXCHANGE_SOURCE_ORDERS_REQUIRED");
  }

  const priorExchange = await sumPriorExchangeMinusByOrderLine(tenantId, clientId);

  const remainingByKey = await computeExchangeMinusRemainingByKey(
    tenantId,
    clientId,
    uniqueOrders,
    priorExchange
  );

  const requested = new Map<string, number>();
  for (const ln of minusLines) {
    const k = `${ln.order_id}:${ln.product_id}`;
    requested.set(k, (requested.get(k) ?? 0) + ln.qty);
  }

  for (const [k, req] of requested) {
    const [os, ps] = k.split(":");
    const orderId = Number(os);
    const productId = Number(ps);
    if (!uniqueOrders.includes(orderId)) {
      throw new Error("EXCHANGE_MINUS_ORDER_NOT_IN_SOURCE");
    }
    const avail = remainingByKey.get(k) ?? 0;
    if (req > avail + 1e-9) {
      const err = new Error("EXCHANGE_MINUS_OVER_LIMIT") as Error & {
        order_id?: number;
        product_id?: number;
        max_qty?: string;
      };
      err.order_id = orderId;
      err.product_id = productId;
      err.max_qty = String(avail);
      throw err;
    }
  }
}
