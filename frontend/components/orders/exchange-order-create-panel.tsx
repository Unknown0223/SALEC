"use client";

import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

type ClientReturnItem = {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  qty: string;
  price: string;
  is_bonus: boolean;
  order_id?: number;
  order_number?: string;
};

export type PolkiOrderPickRow = {
  id: number;
  number: string;
  status: string;
  created_at: string;
};

export type ExchangePairRow = {
  key: string;
  order_id: number;
  product_id: number;
  max: number;
  sku: string;
  name: string;
};

type ExchangeSourceAvailabilityLine = {
  order_id: number;
  product_id: number;
  polki_remaining_qty: number;
  prior_exchange_minus_qty: number;
  max_minus_qty: number;
};

function parseLineQty(q: string): number {
  const n = Number.parseFloat(String(q).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function buildExchangePairRows(items: ClientReturnItem[] | undefined): ExchangePairRow[] {
  if (!items?.length) return [];
  const m = new Map<string, ExchangePairRow>();
  for (const it of items) {
    const oid = it.order_id ?? 0;
    if (!(oid > 0)) continue;
    const q = parseLineQty(it.qty);
    if (!(q > 0)) continue;
    const k = `${oid}-${it.product_id}`;
    const prev = m.get(k);
    if (!prev) {
      m.set(k, {
        key: k,
        order_id: oid,
        product_id: it.product_id,
        max: q,
        sku: it.sku,
        name: it.name
      });
    } else {
      m.set(k, { ...prev, max: prev.max + q });
    }
  }
  return [...m.values()].sort((a, b) => a.order_id - b.order_id || a.product_id - b.product_id);
}

export function parseExchangeQty(s: string): number {
  const n = Number.parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Props = {
  tenantSlug: string;
  clientIdNum: number;
  warehouseId: string;
  agentId: string;
  priceType: string;
  mutationPending: boolean;
  ordersForPick: PolkiOrderPickRow[];
  sourceOrderIds: number[];
  onSourceOrderIdsChange: (ids: number[]) => void;
  minusKey: string;
  onMinusKeyChange: (v: string) => void;
  minusQty: string;
  onMinusQtyChange: (v: string) => void;
  plusProductId: string;
  onPlusProductIdChange: (v: string) => void;
  plusQty: string;
  onPlusQtyChange: (v: string) => void;
};

export function ExchangeOrderCreatePanel({
  tenantSlug,
  clientIdNum,
  warehouseId,
  agentId,
  priceType,
  mutationPending,
  ordersForPick,
  sourceOrderIds,
  onSourceOrderIdsChange,
  minusKey,
  onMinusKeyChange,
  minusQty,
  onMinusQtyChange,
  plusProductId,
  onPlusProductIdChange,
  plusQty,
  onPlusQtyChange
}: Props) {
  const returnsQ = useQuery({
    queryKey: ["exchange-returns", tenantSlug, clientIdNum, sourceOrderIds.join(",")],
    enabled: Boolean(tenantSlug && clientIdNum > 0 && sourceOrderIds.length > 0),
    staleTime: STALE.detail,
    queryFn: async () => {
      const ids = sourceOrderIds.join(",");
      const { data } = await api.get<{
        items: ClientReturnItem[];
      }>(`/api/${tenantSlug}/returns/client-data?client_id=${clientIdNum}&order_ids=${ids}`);
      return data;
    }
  });

  const availabilityQ = useQuery({
    queryKey: [
      "exchange-source-availability",
      tenantSlug,
      clientIdNum,
      [...sourceOrderIds].sort((a, b) => a - b).join(",")
    ],
    enabled: Boolean(tenantSlug && clientIdNum > 0 && sourceOrderIds.length > 0),
    staleTime: STALE.detail,
    queryFn: async () => {
      const ids = [...new Set(sourceOrderIds)].sort((a, b) => a - b).join(",");
      const { data } = await api.get<{ data: ExchangeSourceAvailabilityLine[] }>(
        `/api/${tenantSlug}/orders/exchange-source-availability?client_id=${clientIdNum}&order_ids=${encodeURIComponent(ids)}`
      );
      return data.data;
    }
  });

  const pairRows = useMemo(() => {
    const base = buildExchangePairRows(returnsQ.data?.items);
    const av = availabilityQ.data;
    if (!av?.length) return base;
    const cap = new Map(av.map((r) => [`${r.order_id}-${r.product_id}`, r.max_minus_qty]));
    return base.map((row) => {
      const m = cap.get(row.key);
      if (m === undefined) return row;
      return { ...row, max: m };
    });
  }, [returnsQ.data?.items, availabilityQ.data]);

  const minusProductIdForLookup = useMemo(() => {
    const row = pairRows.find((r) => r.key === minusKey);
    return row?.product_id ?? null;
  }, [minusKey, pairRows]);

  const lookupQ = useQuery({
    queryKey: ["exchange-lookup", tenantSlug, minusProductIdForLookup, priceType],
    enabled: Boolean(tenantSlug && minusProductIdForLookup != null && minusProductIdForLookup > 0),
    staleTime: STALE.detail,
    queryFn: async () => {
      const pt = encodeURIComponent(priceType.trim() || "retail");
      const { data } = await api.get<{
        group_id: number;
        group_name: string;
        products: { id: number; sku: string; name: string }[];
      }>(
        `/api/${tenantSlug}/catalog/interchangeable-groups/exchange-lookup/${minusProductIdForLookup}?price_type=${pt}`
      );
      return data;
    }
  });

  useEffect(() => {
    onPlusProductIdChange("");
  }, [minusKey, onPlusProductIdChange]);

  const fieldClass =
    "flex h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  const toggleOrder = (id: number, on: boolean) => {
    if (on) {
      if (!sourceOrderIds.includes(id)) onSourceOrderIdsChange([...sourceOrderIds, id]);
    } else {
      onSourceOrderIdsChange(sourceOrderIds.filter((x) => x !== id));
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-violet-500/25 bg-violet-500/5 p-4 dark:bg-violet-950/20">
      <p className="text-sm font-medium text-foreground">Обмен (связанный)</p>
      <p className="text-[11px] text-muted-foreground">
        Выберите доставленные заказы клиента, затем строку «минус» из остатка к обмену и «плюс» только из группы
        взаимозаменяемых для выбранной позиции.
      </p>

      <div className="space-y-2">
        <Label className="text-xs">Манба заказы (доставлен)</Label>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border/80 bg-background/80 p-2">
          {ordersForPick.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет подходящих заказов для клиента.</p>
          ) : (
            ordersForPick.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sourceOrderIds.includes(o.id)}
                  onChange={(e) => toggleOrder(o.id, e.target.checked)}
                  disabled={mutationPending || !warehouseId.trim() || !agentId.trim()}
                />
                <span className="font-mono">№{o.number}</span>
                <span className="text-muted-foreground">({o.status})</span>
              </label>
            ))
          )}
        </div>
      </div>

      {returnsQ.isLoading || availabilityQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Загрузка строк заказа…</p>
      ) : returnsQ.isError || availabilityQ.isError ? (
        <p className="text-xs text-destructive">
          Не удалось загрузить остатки по заказам (включая лимиты обмена).
        </p>
      ) : null}

      {pairRows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Минус: позиция</Label>
            <FilterSelect
              className={fieldClass}
              emptyLabel="Выберите строку"
              value={minusKey}
              onChange={(e) => onMinusKeyChange(e.target.value)}
              disabled={mutationPending}
            >
              {pairRows.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.order_id} · {r.sku} — {r.name} (макс. {r.max})
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Минус: кол-во</Label>
            <Input
              className={fieldClass}
              inputMode="decimal"
              placeholder="0"
              value={minusQty}
              onChange={(e) => onMinusQtyChange(e.target.value)}
              disabled={mutationPending || !minusKey}
            />
          </div>
        </div>
      ) : sourceOrderIds.length > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">Нет строк с остатком для обмена.</p>
      ) : null}

      {minusProductIdForLookup != null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Плюс: товар (взаимозаменяемые)</Label>
            {lookupQ.isLoading ? (
              <p className="text-xs text-muted-foreground">Загрузка вариантов…</p>
            ) : lookupQ.data ? (
              <FilterSelect
                className={fieldClass}
                emptyLabel="Выберите товар"
                value={plusProductId}
                onChange={(e) => onPlusProductIdChange(e.target.value)}
                disabled={mutationPending}
              >
                {lookupQ.data.products.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </FilterSelect>
            ) : (
              <p className="text-xs text-destructive">
                Группа взаимозаменяемых или тип цены не найдены для этой позиции.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Плюс: кол-во</Label>
            <Input
              className={fieldClass}
              inputMode="decimal"
              placeholder="0"
              value={plusQty}
              onChange={(e) => onPlusQtyChange(e.target.value)}
              disabled={mutationPending}
            />
          </div>
        </div>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        Группа:{" "}
        {lookupQ.data ? (
          <>
            {lookupQ.data.group_name} (id {lookupQ.data.group_id})
          </>
        ) : (
          "—"
        )}
      </p>
    </div>
  );
}

export function buildExchangeCreateBody(args: {
  sourceOrderIds: number[];
  minusKey: string;
  minusQty: string;
  plusProductId: string;
  plusQty: string;
  pairRows: ExchangePairRow[];
}):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: string } {
  const { sourceOrderIds, minusKey, minusQty, plusProductId, plusQty, pairRows } = args;
  if (sourceOrderIds.length < 1) return { ok: false, reason: "source_orders" };
  const row = pairRows.find((r) => r.key === minusKey);
  if (!row) return { ok: false, reason: "minus_line" };
  const mq = parseExchangeQty(minusQty);
  if (!(mq > 0)) return { ok: false, reason: "minus_qty" };
  if (mq > row.max + 1e-9) return { ok: false, reason: "minus_over" };
  const pid = Number.parseInt(plusProductId, 10);
  if (!Number.isFinite(pid) || pid < 1) return { ok: false, reason: "plus_product" };
  const pq = parseExchangeQty(plusQty);
  if (!(pq > 0)) return { ok: false, reason: "plus_qty" };

  return {
    ok: true,
    body: {
      source_order_ids: [...new Set(sourceOrderIds)].sort((a, b) => a - b),
      minus_lines: [{ order_id: row.order_id, product_id: row.product_id, qty: mq }],
      plus_lines: [{ product_id: pid, qty: pq }]
    }
  };
}
