"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT } from "@/lib/return-limits";
import {
  activeRefSelectOptions,
  refEntryLabelByStored,
} from "@/lib/profile-ref-entries";
import { isDatabaseSchemaMismatchError } from "@/lib/api-errors";
import { DatabaseSchemaMismatchCallout } from "@/components/system/database-schema-mismatch-callout";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";

type ReturnRow = {
  id: number;
  number: string;
  client_id: number | null;
  client_name: string | null;
  order_id: number | null;
  order_number: string | null;
  warehouse_id: number;
  warehouse_name: string;
  status: string;
  refund_amount: string | null;
  note: string | null;
  refusal_reason_ref?: string | null;
  created_at: string;
};

type ClientReturnData = {
  /** API yangi maydon; eski kesh uchun ixtiyoriy */
  polki_scope?: "period" | "order";
  orders: { id: number; number: string; status: string; total_sum: string; bonus_sum: string; created_at: string }[];
  items: {
    product_id: number; sku: string; name: string; unit: string;
    qty: string; price: string; total: string; is_bonus: boolean;
    order_id: number; order_number: string;
  }[];
  total_orders: number;
  total_returned_qty: string;
  total_paid_value: string;
  already_returned_value: string;
  max_returnable_value: string;
  client_balance: string;
  client_debt: string;
};

type ClientForSelect = { id: number; name: string };

type OrderPickRow = {
  id: number;
  number: string;
  status: string;
  created_at: string;
};

/** URL: `order_ids=1,2,3` yoki `order_id=5` (bir zakaz). */
function parsePolkiOrderIdsFromSearch(sp: URLSearchParams): number[] {
  const multi = sp.get("order_ids")?.trim();
  if (multi) {
    const ids = multi
      .split(/[, ]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(ids)).sort((a, b) => a - b);
  }
  const one = sp.get("order_id")?.trim();
  if (one) {
    const n = Number(one);
    if (Number.isFinite(n) && n > 0) return [n];
  }
  return [];
}

function ReturnsPageContent() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState(50);

  const activeTab = searchParams.get("tab") === "polki" ? "polki" : "list";
  const polkiMode = searchParams.get("polki_mode") === "order" ? "order" : "free";

  // ─── Returns list ──────────────────────────────────────────────────────
  const listQ = useQuery({
    queryKey: ["returns", tenantSlug, limit],
    enabled: Boolean(tenantSlug) && hydrated && activeTab === "list",
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ReturnRow[]; total: number }>(
        `/api/${tenantSlug}/returns?page=1&limit=${limit}`
      );
      return data;
    }
  });

  // ─── Polki form ───────────────────────────────────────────────────────
  const clientIdFromUrl = searchParams.get("client_id") ?? undefined;
  const client_id_num = clientIdFromUrl ? Number(clientIdFromUrl) : null;
  const selectedOrderIds = useMemo(
    () => parsePolkiOrderIdsFromSearch(searchParams),
    [searchParams]
  );
  const primaryOrderIdForMeta =
    selectedOrderIds.length === 1 ? selectedOrderIds[0]! : null;

  const [clientId, setClientId] = useState(client_id_num ? String(client_id_num) : "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [polkiRangeOpen, setPolkiRangeOpen] = useState(false);
  const polkiRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState("");
  const [refusalReasonRef, setRefusalReasonRef] = useState("");
  const [returnLines, setReturnLines] = useState<
    { key: string; product_id: string; order_id?: string; qty: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Clients dropdown
  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "return-select"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientForSelect[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data ?? [];
    }
  });

  // Return warehouses
  const profileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "returns-refusal"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references: { refusal_reason_entries?: unknown };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });
  const refusalOptions = useMemo(
    () => activeRefSelectOptions(profileRefsQ.data?.references?.refusal_reason_entries),
    [profileRefsQ.data]
  );

  const orderForReturnQ = useQuery({
    queryKey: ["order-for-return", tenantSlug, primaryOrderIdForMeta],
    enabled: Boolean(
      tenantSlug &&
        primaryOrderIdForMeta &&
        hydrated &&
        activeTab === "polki" &&
        polkiMode === "order"
    ),
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<{ client_id: number; number: string }>(
        `/api/${tenantSlug}/orders/${primaryOrderIdForMeta}`
      );
      return data;
    }
  });

  const didApplyClientFromOrder = useRef(false);
  useEffect(() => {
    didApplyClientFromOrder.current = false;
  }, [primaryOrderIdForMeta]);

  useEffect(() => {
    const cid = orderForReturnQ.data?.client_id;
    if (cid == null || primaryOrderIdForMeta == null || didApplyClientFromOrder.current) return;
    if (client_id_num != null) return;
    if (clientId === "") {
      setClientId(String(cid));
      didApplyClientFromOrder.current = true;
    }
  }, [orderForReturnQ.data?.client_id, primaryOrderIdForMeta, clientId, client_id_num]);

  /** Chuqur havola: order_id bor, polki_mode yo‘q → zakaz rejimiga o‘tkazish */
  useEffect(() => {
    if (activeTab !== "polki") return;
    const oid = searchParams.get("order_id");
    if (!oid?.trim()) return;
    if (searchParams.get("polki_mode")) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("polki_mode", "order");
    router.replace(`/returns?${p.toString()}`, { scroll: false });
  }, [activeTab, searchParams, router]);

  /** `polki_mode=free` bo‘lsa, zakaz parametrlarini URLdan olib tashlash */
  useEffect(() => {
    if (activeTab !== "polki") return;
    if (searchParams.get("polki_mode") !== "free") return;
    if (!searchParams.get("order_id")?.trim() && !searchParams.get("order_ids")?.trim()) return;
    const p = new URLSearchParams(searchParams.toString());
    p.delete("order_id");
    p.delete("order_ids");
    router.replace(`/returns?${p.toString()}`, { scroll: false });
  }, [activeTab, searchParams, router]);

  const hasPolkiOrderSelection = polkiMode === "order" && selectedOrderIds.length > 0;
  const polkiOrderIdsQueryKey = selectedOrderIds.join(",");

  const setPolkiMode = (mode: "free" | "order") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", "polki");
    p.set("polki_mode", mode);
    if (mode === "free") {
      p.delete("order_id");
      p.delete("order_ids");
    }
    router.replace(`/returns?${p.toString()}`, { scroll: false });
    setReturnLines([]);
  };

  const setPolkiOrderIdsInUrl = (ids: number[]) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", "polki");
    p.set("polki_mode", "order");
    p.delete("order_id");
    p.delete("order_ids");
    const sorted = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0))).sort(
      (a, b) => a - b
    );
    if (sorted.length === 1) p.set("order_id", String(sorted[0]));
    else if (sorted.length > 1) p.set("order_ids", sorted.join(","));
    router.replace(`/returns?${p.toString()}`, { scroll: false });
    setReturnLines([]);
  };

  const warehouseQuery = useQuery({
    queryKey: ["warehouses", tenantSlug, "returns"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string; stock_purpose: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data ?? [];
    }
  });
  const returnWh = warehouseQuery.data?.find((w) => w.stock_purpose === "return");

  const clientOrdersPickQ = useQuery({
    queryKey: ["returns-order-pick", tenantSlug, clientId, polkiMode],
    enabled: Boolean(
      tenantSlug &&
        clientId &&
        Number.isFinite(Number(clientId)) &&
        Number(clientId) > 0 &&
        activeTab === "polki" &&
        polkiMode === "order"
    ),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: OrderPickRow[] }>(
        `/api/${tenantSlug}/orders?page=1&limit=100&client_id=${encodeURIComponent(clientId)}`
      );
      return body.data ?? [];
    }
  });

  const toggleOrderSelected = (orderId: number, checked: boolean) => {
    const set = new Set(selectedOrderIds);
    if (checked) set.add(orderId);
    else set.delete(orderId);
    setPolkiOrderIdsInUrl(Array.from(set));
  };

  const toggleSelectAllOrders = (checked: boolean) => {
    const all = (clientOrdersPickQ.data ?? []).map((o) => o.id);
    if (checked) setPolkiOrderIdsInUrl(all);
    else setPolkiOrderIdsInUrl([]);
  };

  const clientDataQuery = useQuery({
    queryKey: [
      "returns-client-data",
      tenantSlug,
      clientId,
      dateFrom,
      dateTo,
      polkiMode,
      polkiOrderIdsQueryKey
    ],
    enabled: Boolean(
      tenantSlug &&
        clientId &&
        Number.isFinite(Number(clientId)) &&
        Number(clientId) > 0 &&
        (polkiMode === "free" || hasPolkiOrderSelection)
    ),
    staleTime: STALE.detail,
    queryFn: async () => {
      const params = new URLSearchParams({ client_id: clientId });
      if (polkiMode === "free") {
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
      } else if (selectedOrderIds.length > 1) {
        params.set("order_ids", selectedOrderIds.join(","));
      } else if (selectedOrderIds.length === 1) {
        params.set("order_id", String(selectedOrderIds[0]));
      }
      const { data } = await api.get<ClientReturnData>(
        `/api/${tenantSlug}/returns/client-data?${params.toString()}`
      );
      return data;
    }
  });

  const clientData = clientDataQuery.data;

  /** Zakaz bo‘yicha: har zakaz + mahsulot + bonus qatori alohida (yig‘indi emas). */
  const orderPolkiLines = useMemo(() => {
    if (polkiMode !== "order" || !clientData?.items?.length) return [];
    return clientData.items.map((it) => {
      const lineKey = `${it.order_id}-${it.product_id}-${it.is_bonus ? "b" : "p"}`;
      return {
        lineKey,
        order_id: it.order_id,
        order_number: it.order_number,
        product_id: it.product_id,
        sku: it.sku,
        name: it.name,
        unit: it.unit,
        total_qty: Number(it.qty),
        price: Number(it.price),
        is_bonus: it.is_bonus
      };
    });
  }, [polkiMode, clientData?.items]);

  // Aggregate products by product_id (faqat mijoz + davr)
  const productMap = useMemo(() => {
    const map = new Map<number, {
      product_id: number; sku: string; name: string; unit: string;
      total_qty: number; has_bonus: boolean;
    }>();
    if (polkiMode === "order") return map;
    const _items = clientData?.items ?? [];
    for (const it of _items) {
      const cur = map.get(it.product_id);
      const qty = Number(it.qty);
      if (cur) {
        cur.total_qty += qty;
        if (it.is_bonus) cur.has_bonus = true;
      } else {
        map.set(it.product_id, {
          product_id: it.product_id, sku: it.sku, name: it.name,
          unit: it.unit, total_qty: qty, has_bonus: it.is_bonus
        });
      }
    }
    return map;
  }, [clientData?.items, polkiMode]);

  // Price by product (first non-zero) — davr rejimi
  const priceByProduct = useMemo(() => {
    const map = new Map<string, number>();
    const _items = clientData?.items ?? [];
    for (const it of _items) {
      const k = String(it.product_id);
      const p = Number(it.price);
      if (!map.has(k) || map.get(k) === 0) map.set(k, p);
    }
    return map;
  }, [clientData?.items]);

  const orderLinePriceByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of orderPolkiLines) m.set(r.lineKey, r.price);
    return m;
  }, [orderPolkiLines]);

  // Totals
  let totalReturnQty = 0;
  let totalReturnValue = 0;
  for (const rl of returnLines) {
    const q = Number(rl.qty) || 0;
    totalReturnQty += q;
    const key = rl.key || `p-${rl.product_id}`;
    const unit =
      polkiMode === "order"
        ? (orderLinePriceByKey.get(key) ?? 0)
        : (priceByProduct.get(rl.product_id) ?? 0);
    totalReturnValue += q * unit;
  }
  const maxRet = Number(clientData?.max_returnable_value ?? 0);
  const maxReturnable = clientData?.max_returnable_value ?? "0";
  const clientDebt = clientData?.client_debt ?? "0";

  // Clear return lines when filters change
  const clearLines = useCallback(() => setReturnLines([]), []);

  // Reset clientId when URL has client_id
  if (client_id_num && clientId === "") {
    setClientId(String(client_id_num));
  }

  const setAllReturnQty = (qty: number) => {
    if (polkiMode === "order") {
      setReturnLines(
        orderPolkiLines.map((r) => ({
          key: r.lineKey,
          product_id: String(r.product_id),
          order_id: String(r.order_id),
          qty: String(qty)
        }))
      );
    } else {
      setReturnLines(
        Array.from(productMap.values()).map((p) => ({
          key: `p-${p.product_id}`,
          product_id: String(p.product_id),
          qty: String(qty)
        }))
      );
    }
  };

  const handleLineChange = (
    key: string,
    meta: { product_id: number; order_id?: number },
    val: string
  ) => {
    setReturnLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      const next = [...prev];
      const row = {
        key,
        product_id: String(meta.product_id),
        order_id: meta.order_id != null ? String(meta.order_id) : undefined,
        qty: val
      };
      if (idx >= 0) next[idx] = { ...next[idx]!, ...row };
      else next.push(row);
      return next;
    });
  };

  const handleSubmit = async () => {
    setErr(null);
    if (!clientId || !Number.isFinite(Number(clientId))) {
      setErr("Mijozni tanlang."); return;
    }
    if (polkiMode === "order" && !hasPolkiOrderSelection) {
      setErr("Kamida bitta zakazni belgilang.");
      return;
    }
    const linesFree = returnLines
      .map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) }))
      .filter((l) => Number.isFinite(l.product_id) && l.product_id > 0 && l.qty > 0);
    const linesBatch = returnLines
      .map((l) => ({
        order_id: Number(l.order_id),
        product_id: Number(l.product_id),
        qty: Number(l.qty)
      }))
      .filter(
        (l) =>
          Number.isFinite(l.order_id) &&
          l.order_id > 0 &&
          Number.isFinite(l.product_id) &&
          l.product_id > 0 &&
          l.qty > 0
      );
    const lines = polkiMode === "order" ? linesBatch : linesFree;
    if (lines.length === 0) {
      setErr("Kamida bitta mahsulot va miqdor kiriting."); return;
    }
    if (totalReturnQty > MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT) {
      setErr(
        `Max ${MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT} ta mahsulot qaytarish mumkin. Siz ${totalReturnQty} ta kiritdingiz.`
      );
      return;
    }
    if (maxRet > 0 && totalReturnValue > maxRet) {
      setErr(`Qaytarish qiymati maksimal summadan (${maxReturnable}) oshmoqda.`); return;
    }

    setSubmitting(true);
    try {
      if (polkiMode === "order") {
        const body: Record<string, unknown> = {
          client_id: Number(clientId),
          lines: linesBatch
        };
        if (returnWh) body.warehouse_id = returnWh.id;
        if (note.trim()) body.note = note.trim();
        if (refusalReasonRef.trim()) body.refusal_reason_ref = refusalReasonRef.trim();
        await api.post(`/api/${tenantSlug}/returns/period-batch`, body);
      } else {
        const body: Record<string, unknown> = { client_id: Number(clientId), lines: linesFree };
        if (returnWh) body.warehouse_id = returnWh.id;
        if (dateFrom) body.date_from = dateFrom;
        if (dateTo) body.date_to = dateTo;
        if (note.trim()) body.note = note.trim();
        if (refusalReasonRef.trim()) body.refusal_reason_ref = refusalReasonRef.trim();
        await api.post(`/api/${tenantSlug}/returns/period`, body);
      }
      await queryClient.invalidateQueries({ queryKey: ["returns", tenantSlug] });
      router.push("/returns");
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      if (data?.error === "TooManyItems")
        setErr(`Max ${MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT} ta mahsulot qaytarish mumkin.`);
      else if (data?.error === "QtyExceedsOrdered") setErr("Qaytarish miqdori buyurtma miqdoridan oshmoqda.");
      else if (data?.error === "NothingToReturn") setErr("Tanlangan davrda qaytariladigan mahsulot yo'q.");
      else if (data?.error === "BadClient") setErr("Mijoz topilmadi.");
      else if (data?.error === "BadProduct") setErr("Mahsulot topilmadi.");
      else if (data?.error === "BadOrder") setErr("Zakaz topilmadi yoki bu mijozga tegishli emas.");
      else if (data?.error === "NoWarehouse") setErr("Qaytarish ombori topilmadi.");
      else if (data?.error === "DatabaseSchemaMismatch")
        setErr("Baza migratsiyasi qo‘llanmagan. backend: npm run db:deploy");
      else setErr("Qaytarish yaratilmadi.");
    } finally {
      setSubmitting(false);
    }
  };

  const changeTab = (v: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (v === "polki") {
      p.set("tab", "polki");
      if (!p.get("polki_mode")) {
        p.set("polki_mode", "free");
        p.delete("order_id");
        p.delete("order_ids");
      }
    } else {
      p.delete("tab");
      p.delete("polki_mode");
      p.delete("order_id");
      p.delete("order_ids");
    }
    const qs = p.toString();
    router.push(qs ? `/returns?${qs}` : "/returns", { scroll: false });
  };

  return (
    <PageShell>
      <PageHeader
        title="Qaytarishlar"
        description="Ro‘yxat, polki (mijoz+davr yoki zakaz bo‘yicha) — zakazga bog‘lanishi ixtiyoriy"
      />

      <Tabs value={activeTab} onValueChange={changeTab} className="mb-4">
        <TabsList className="grid w-fit grid-cols-2 gap-2">
          <TabsTrigger value="polki" className="min-w-[140px]">Vazvrat Polki</TabsTrigger>
          <TabsTrigger value="list">Ro&apos;yxat</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "polki" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground max-w-xl">
              <span className="font-medium text-foreground">Polki</span> — mahsulotlar qaytarish omboriga qaytadi;
              pul bonus qoidalariga ko‘ra qayta hisoblanadi. Zakazsiz rejimda bir nechta buyurtmalar yig‘iladi;
              zakaz rejimida bir yoki bir nechta zakaz belgilanadi; har zakaz qatori alohida.
            </p>
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setPolkiMode("free")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  polkiMode === "free"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Mijoz + davr
              </button>
              <button
                type="button"
                onClick={() => setPolkiMode("order")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  polkiMode === "order"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Zakaz bo‘yicha
              </button>
            </div>
          </div>

          {polkiMode === "order" && selectedOrderIds.length > 0 ? (
            <p className="text-sm rounded-md border border-border bg-muted/20 px-3 py-2 text-muted-foreground">
              {selectedOrderIds.length === 1 && orderForReturnQ.data ? (
                <>
                  Zakaz{" "}
                  <span className="font-mono font-medium text-foreground">
                    {orderForReturnQ.data.number}
                  </span>
                  — qaytarish shu hujjat bilan bog‘lanadi.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{selectedOrderIds.length}</span> ta zakaz
                  tanlangan — har biri uchun alohida qaytarish hujjati yaratiladi (bir operatsiya).
                </>
              )}
            </p>
          ) : null}

          {/* Filters card */}
          <Card className="shadow-panel">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mijoz</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={clientId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClientId(v);
                      setReturnLines([]);
                      if (polkiMode === "order") setPolkiOrderIdsInUrl([]);
                    }}
                  >
                    <option value="">Mijozni tanlang…</option>
                    {(clientsQ.data ?? []).map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {polkiMode === "order" ? (
                  <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs text-muted-foreground">Zakazlar (bir nechtasini belgilash mumkin)</label>
                      {(clientOrdersPickQ.data?.length ?? 0) > 0 ? (
                        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            className="rounded border-input"
                            checked={
                              selectedOrderIds.length > 0 &&
                              selectedOrderIds.length === (clientOrdersPickQ.data?.length ?? 0)
                            }
                            onChange={(e) => toggleSelectAllOrders(e.target.checked)}
                          />
                          Barchasini tanlash
                        </label>
                      ) : null}
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/20 p-2 space-y-1.5">
                      {!clientId ? (
                        <p className="text-[11px] text-muted-foreground px-1">Avval mijozni tanlang.</p>
                      ) : clientOrdersPickQ.isLoading ? (
                        <p className="text-[11px] text-muted-foreground px-1">Zakazlar yuklanmoqda…</p>
                      ) : (clientOrdersPickQ.data?.length ?? 0) === 0 ? (
                        <p className="text-[11px] text-muted-foreground px-1">Bu mijoz uchun zakaz topilmadi.</p>
                      ) : (
                        (clientOrdersPickQ.data ?? []).map((o) => (
                          <label
                            key={o.id}
                            className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-background/80"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-input"
                              checked={selectedOrderIds.includes(o.id)}
                              onChange={(e) => toggleOrderSelected(o.id, e.target.checked)}
                            />
                            <span className="text-xs leading-snug">
                              <span className="font-mono font-medium">{o.number}</span>
                              <span className="text-muted-foreground"> · {o.status}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                · {new Date(o.created_at).toLocaleDateString()}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedOrderIds.length > 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Tanlangan: {selectedOrderIds.length} ta zakaz
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Buyurtmalar davri</label>
                    <button
                      ref={polkiRangeAnchorRef}
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-10 w-full max-w-md justify-start gap-2 font-normal",
                        polkiRangeOpen && "border-primary/60 bg-primary/5"
                      )}
                      aria-expanded={polkiRangeOpen}
                      aria-haspopup="dialog"
                      onClick={() => setPolkiRangeOpen((o) => !o)}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span className="truncate text-sm">{formatDateRangeButton(dateFrom, dateTo)}</span>
                    </button>
                  </div>
                )}
                {clientData ? (
                  <div className="flex items-end lg:col-span-1">
                    <div className="text-xs space-y-0.5">
                      <div>
                        {(clientData.polki_scope ?? "period") === "order" ? "Zakaz" : "Buyurtmalar"}:{" "}
                        <span className="font-medium">{formatNumberGrouped(clientData.total_orders)}</span>
                      </div>
                      <div>Qaytarilgan: <span className="font-medium">{formatNumberGrouped(clientData.already_returned_value, { maxFractionDigits: 2 })}</span></div>
                      <div>Max qaytarish: <span className="font-medium text-amber-600">{formatNumberGrouped(maxReturnable, { maxFractionDigits: 2 })}</span></div>
                      <div>Qarz: <span className="font-medium text-red-600">{formatNumberGrouped(clientDebt, { maxFractionDigits: 2 })}</span></div>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Err */}
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}

          {/* Products table */}
          {((polkiMode === "free" && productMap.size > 0) ||
            (polkiMode === "order" && orderPolkiLines.length > 0)) && (
            <Card className="shadow-panel">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-medium">Mahsulotlar va qaytarish miqdori</h3>
                  <div className="flex gap-2 items-center">
                    {[1, 2, 5].map((n) => (
                      <Button key={n} type="button" variant="outline" size="sm" onClick={() => setAllReturnQty(n)} className="text-xs">
                        Barcha {n}
                      </Button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReturnLines([])} className="text-xs">
                      Tozalash
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead className="app-table-thead text-xs">
                      <tr>
                        {polkiMode === "order" ? (
                          <th className="px-3 py-2 text-left">Zakaz</th>
                        ) : null}
                        <th className="px-3 py-2 text-left">Kod</th>
                        <th className="px-3 py-2 text-left">Mahsulot</th>
                        <th className="px-3 py-2 text-right">Olgan</th>
                        <th className="px-3 py-2 text-center">Qaytarish</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {polkiMode === "order"
                        ? orderPolkiLines.map((r) => {
                            const rl = returnLines.find((l) => l.key === r.lineKey);
                            const rq = Number(rl?.qty) || 0;
                            const rv = rq * r.price;
                            const isOver = rq > r.total_qty;
                            return (
                              <tr
                                key={r.lineKey}
                                className={`border-b last:border-0 ${isOver ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                              >
                                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                  {r.order_number}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                                <td className="px-3 py-2">
                                  {r.name}
                                  {r.is_bonus ? (
                                    <span className="ml-1 text-[10px] text-amber-600">(bonus)</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatNumberGrouped(r.total_qty, { maxFractionDigits: 3 })}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={r.total_qty}
                                    value={rl?.qty ?? ""}
                                    onChange={(e) =>
                                      handleLineChange(
                                        r.lineKey,
                                        { product_id: r.product_id, order_id: r.order_id },
                                        e.target.value
                                      )
                                    }
                                    className="w-20 h-8 text-center"
                                    disabled={submitting}
                                  />
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {rq > 0 ? formatNumberGrouped(rv, { maxFractionDigits: 2 }) : "—"}
                                  {isOver ? (
                                    <div className="text-[10px] text-red-500">Oshib ketdi!</div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })
                        : Array.from(productMap.values()).map((p) => {
                            const rowKey = `p-${p.product_id}`;
                            const rl = returnLines.find(
                              (l) => (l.key || `p-${l.product_id}`) === rowKey
                            );
                            const rq = Number(rl?.qty) || 0;
                            const price = priceByProduct.get(String(p.product_id)) ?? 0;
                            const rv = rq * price;
                            const isOver = rq > p.total_qty;
                            return (
                              <tr
                                key={p.product_id}
                                className={`border-b last:border-0 ${isOver ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                              >
                                <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                                <td className="px-3 py-2">
                                  {p.name}
                                  {p.has_bonus && (
                                    <span className="ml-1 text-[10px] text-amber-600">(bonus)</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatNumberGrouped(p.total_qty, { maxFractionDigits: 3 })}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={p.total_qty}
                                    value={rl?.qty ?? ""}
                                    onChange={(e) =>
                                      handleLineChange(rowKey, { product_id: p.product_id }, e.target.value)
                                    }
                                    className="w-20 h-8 text-center"
                                    disabled={submitting}
                                  />
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {rq > 0 ? formatNumberGrouped(rv, { maxFractionDigits: 2 }) : "—"}
                                  {isOver && <div className="text-[10px] text-red-500">Oshib ketdi!</div>}
                                </td>
                              </tr>
                            );
                          })}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 text-xs">
                      <tr>
                        <td
                          colSpan={polkiMode === "order" ? 3 : 2}
                          className="px-3 py-2"
                        >
                          Jami qaytarish
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumberGrouped(totalReturnQty, { maxFractionDigits: 3 })} dona
                        </td>
                        <td />
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${totalReturnValue > maxRet ? "text-red-600" : ""}`}>
                          {formatNumberGrouped(totalReturnValue, { maxFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {(clientData?.polki_scope ?? "period") === "order"
                        ? selectedOrderIds.length > 1
                          ? "To‘langan summa (tanlangan zakazlar)"
                          : "To‘langan summa (shu zakaz)"
                        : "To‘langan summa (tanlangan davr)"}
                      :
                    </span>
                    <span className="tabular-nums font-medium">
                      {clientData ? formatNumberGrouped(clientData.total_paid_value, { maxFractionDigits: 2 }) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avval qaytarilgan:</span>
                    <span className="tabular-nums">
                      {clientData ? formatNumberGrouped(clientData.already_returned_value, { maxFractionDigits: 2 }) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Maksimal:</span>
                    <span className="tabular-nums font-medium text-amber-600">
                      {formatNumberGrouped(maxReturnable, { maxFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground">Qaytarish summasi:</span>
                    <span className={`tabular-nums font-bold ${totalReturnValue > maxRet ? "text-red-600" : totalReturnValue > 0 ? "text-emerald-600" : ""}`}>
                      {formatNumberGrouped(totalReturnValue, { maxFractionDigits: 2 })}
                    </span>
                  </div>
                  {totalReturnQty > MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT && (
                    <p className="text-xs text-red-600">
                      ⚠ Max {MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT} ta. Hozir {totalReturnQty} ta.
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {refusalOptions.length > 0 ? (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Rad etish sababi (spravochnik) —{" "}
                        <Link href="/settings/reasons/refusal-reasons" className="text-primary underline">
                          sozlash
                        </Link>
                      </label>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={refusalReasonRef}
                        onChange={(e) => setRefusalReasonRef(e.target.value)}
                      >
                        <option value="">—</option>
                        {refusalOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Izoh</label>
                    <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Sabab…" />
                  </div>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1" />
                  <Button type="button" disabled={submitting || totalReturnQty === 0} onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {submitting ? "Saqlanmoqda…" : "Yaratish"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {clientId && polkiMode === "order" && !hasPolkiOrderSelection ? (
            <p className="text-sm text-muted-foreground">
              Kamida bitta zakazni belgilang — shundan keyin qaytarish uchun mahsulotlar ko‘rinadi.
            </p>
          ) : null}
          {clientId &&
            (polkiMode === "free" || hasPolkiOrderSelection) &&
            clientDataQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Ma&apos;lumotlar yuklanmoqda…</p>
            )}
          {clientId &&
            (polkiMode === "free" || hasPolkiOrderSelection) &&
            clientData &&
            (polkiMode === "free" ? productMap.size === 0 : orderPolkiLines.length === 0) && (
              <p className="text-sm text-muted-foreground">
                {(clientData.polki_scope ?? "period") === "order"
                  ? "Tanlangan zakaz(lar) bo‘yicha qaytarish uchun qoldiq yo‘q yoki barchasi qaytarilgan."
                  : "Tanlangan shartlarda mahsulot topilmadi."}
              </p>
            )}
          {!clientId && <p className="text-sm text-muted-foreground">Mijozni tanlang.</p>}
        </div>
      ) : (
        /* ─── Returns list ─────────────────────────────────────────────── */
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            {listQ.isLoading && <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>}
            {listQ.isError && isDatabaseSchemaMismatchError(listQ.error) && (
              <div className="p-4">
                <DatabaseSchemaMismatchCallout />
              </div>
            )}
            {listQ.isError && !isDatabaseSchemaMismatchError(listQ.error) && (
              <p className="p-4 text-sm text-destructive">Xato yuz berdi.</p>
            )}
            {!listQ.isLoading && !listQ.isError && (
              <>
                <div className="flex items-center gap-3 px-3 pt-2">
                  {(listQ.data?.data.length ?? 0) > 0 && (
                    <span className="text-sm text-muted-foreground">
                      Jami: {formatNumberGrouped(listQ.data?.data.length ?? 0)} ta
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Ko&apos;rsatish
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {[30, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead className="app-table-thead text-left text-xs">
                      <tr>
                        <th className="px-3 py-2">Sana</th>
                        <th className="px-3 py-2">Raqam</th>
                        <th className="px-3 py-2">Ombor</th>
                        <th className="px-3 py-2">Mijoz</th>
                        <th className="px-3 py-2">Zakaz</th>
                        <th className="px-3 py-2">Rad sababi</th>
                        <th className="px-3 py-2 text-right">Qaytarilgan pul</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(listQ.data?.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.number}</td>
                          <td className="px-3 py-2">{r.warehouse_name}</td>
                          <td className="px-3 py-2">
                            {r.client_id != null ? (
                              <Link className="text-primary underline-offset-2 hover:underline" href={`/clients/${r.client_id}`}>
                                {r.client_name ?? r.client_id}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.order_id != null && r.order_number ? (
                              <Link className="text-primary underline-offset-2 hover:underline" href={`/orders/${r.order_id}`}>
                                {r.order_number}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.refusal_reason_ref?.trim()
                              ? refEntryLabelByStored(
                                  profileRefsQ.data?.references?.refusal_reason_entries,
                                  r.refusal_reason_ref
                                ) ?? r.refusal_reason_ref
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.refund_amount == null ? "—" : formatNumberGrouped(r.refund_amount, { maxFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(listQ.data?.data.length ?? 0) === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">Hozircha yozuv yo&apos;q.</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <DateRangePopover
        open={polkiRangeOpen}
        onOpenChange={setPolkiRangeOpen}
        anchorRef={polkiRangeAnchorRef}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onApply={({ dateFrom: f, dateTo: t }) => {
          setDateFrom(f);
          setDateTo(t);
          clearLines();
        }}
      />
    </PageShell>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Загрузка…</div>}>
      <ReturnsPageContent />
    </Suspense>
  );
}
