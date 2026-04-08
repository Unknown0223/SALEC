"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, apiBaseURL, resolveApiOrigin } from "@/lib/api";
import { ORDER_TYPE_VALUES } from "@/lib/order-types";
import { getUserFacingError, isApiUnreachable } from "@/lib/error-utils";
import type { ClientRow } from "@/lib/client-types";
import type { ProductRow } from "@/lib/product-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";

type Props = {
  tenantSlug: string | null;
  onCreated: () => void;
  onCancel: () => void;
  /** Hujjat tipi: order | return | exchange | partial_return | return_by_order */
  orderType?: string;
};

const fieldClass =
  "flex h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function parsePriceAmount(s: string): number {
  const n = Number.parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Ombordagi jami yoki qator qiymati */
function parseStockQty(qtyStr: string | undefined): number {
  const n = Number.parseFloat(String(qtyStr ?? "0").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Buyurtma uchun mavjud: jami qoldiq − band qilingan (backend bilan mos) */
function availableOrderQty(stock: { qty: string; reserved_qty: string } | undefined): number {
  const total = parseStockQty(stock?.qty);
  const reserved = parseStockQty(stock?.reserved_qty);
  return Math.max(0, total - reserved);
}

function formatQtyState(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const r = Math.round(n * 1000) / 1000;
  const s = String(r);
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function unitPriceForType(p: ProductRow, priceTypeKey: string): string | null {
  const list = p.prices ?? [];
  if (list.length === 0) return null;
  const want = priceTypeKey.trim().toLowerCase();
  const exact = list.find((x) => x.price_type.trim().toLowerCase() === want);
  return exact?.price ?? null;
}

export function OrderCreateWorkspace({ tenantSlug, onCreated, onCancel, orderType }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [applyBonus, setApplyBonus] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [qtyByProductId, setQtyByProductId] = useState<Record<number, string>>({});
  /** Mahsulot qadoqlari (bloklar); kartotekada qty_per_block bo‘lsa Miqdor = blok × dona/blok */
  const [blockByProductId, setBlockByProductId] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [expeditorUserId, setExpeditorUserId] = useState("");
  const [priceType, setPriceType] = useState("retail");
  const [orderComment, setOrderComment] = useState("");
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [orderOpenedAt] = useState(() => new Date());

  useEffect(() => {
    setQtyByProductId({});
    setBlockByProductId({});
  }, [warehouseId]);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=200&is_active=true`
      );
      return data.data;
    }
  });

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductRow[] }>(
        `/api/${tenantSlug}/products?page=1&limit=200&is_active=true&include_prices=true`
      );
      return data.data;
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; login: string; name: string; role: string }[] }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  const stockQ = useQuery({
    queryKey: ["stock", tenantSlug, warehouseId, "order-form"],
    enabled: Boolean(tenantSlug) && Boolean(warehouseId),
    queryFn: async () => {
      const { data } = await api.get<{ data: { product_id: number; qty: string; reserved_qty: string }[] }>(
        `/api/${tenantSlug}/stock?warehouse_id=${warehouseId}`
      );
      return data.data;
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=sale`);
      return data.data.length ? data.data : ["retail"];
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/expeditors`);
      return data.data.filter((r) => r.is_active);
    }
  });

  const clientIdNum = clientId.trim() ? Number.parseInt(clientId.trim(), 10) : NaN;
  const clientSummaryQ = useQuery({
    queryKey: ["client", tenantSlug, clientIdNum, "order-form"],
    enabled: Boolean(tenantSlug) && Number.isFinite(clientIdNum) && clientIdNum > 0,
    queryFn: async () => {
      const { data } = await api.get<{
        account_balance: string;
        credit_limit: string;
        open_orders_total: string;
      }>(`/api/${tenantSlug}/clients/${clientIdNum}`);
      return data;
    }
  });

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    }
  });

  const clients = clientsQ.data ?? [];
  const products = productsQ.data ?? [];
  const warehouses = warehousesQ.data ?? [];
  const users = usersQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const agentUsers = users.filter((u) => {
    const role = u.role.trim().toLowerCase();
    return role.includes("agent") && !role.includes("expeditor");
  });
  const stockByProduct = new Map<number, { qty: string; reserved_qty: string }>(
    (stockQ.data ?? []).map((s) => [s.product_id, s])
  );
  const selectedCategoryNum = selectedCategoryId ? Number.parseInt(selectedCategoryId, 10) : null;

  const catalogProducts = useMemo(() => {
    const stockMap = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    const filtered = products.filter((p) => {
      if (selectedCategoryNum != null && p.category_id !== selectedCategoryNum) return false;
      if (!warehouseId) return false;
      if (showZeroStock) return true;
      const s = stockMap.get(p.id);
      return availableOrderQty(s) > 0;
    });
    const seen = new Set<number>();
    const deduped: ProductRow[] = [];
    for (const p of filtered) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      deduped.push(p);
    }
    return deduped;
  }, [products, selectedCategoryNum, warehouseId, showZeroStock, stockQ.data]);

  const productSearchNorm = productSearch.trim().toLowerCase();
  const displayProducts = useMemo(() => {
    if (!productSearchNorm) return catalogProducts;
    return catalogProducts.filter((p) => {
      const n = p.name.toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      return n.includes(productSearchNorm) || sku.includes(productSearchNorm);
    });
  }, [catalogProducts, productSearchNorm]);

  const hasQtyOverStock = useMemo(() => {
    const rows = stockQ.data ?? [];
    const map = new Map(rows.map((s) => [s.product_id, s]));
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      if (!raw?.trim()) continue;
      const lineQ = Number.parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(lineQ) || lineQ <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      if (lineQ > avail) return true;
    }
    return false;
  }, [catalogProducts, qtyByProductId, stockQ.data]);
  const hasMissingPriceForSelected = useMemo(() => {
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      if (unitPriceForType(p, priceType) == null) return true;
    }
    return false;
  }, [catalogProducts, qtyByProductId, priceType]);
  const missingPriceProductNames = useMemo(() => {
    const names: string[] = [];
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      if (unitPriceForType(p, priceType) == null) names.push(p.name);
    }
    return names.slice(0, 3);
  }, [catalogProducts, qtyByProductId, priceType]);

  const loadingLists =
    clientsQ.isLoading ||
    productsQ.isLoading ||
    warehousesQ.isLoading ||
    usersQ.isLoading ||
    categoriesQ.isLoading ||
    priceTypesQ.isLoading ||
    expeditorsQ.isLoading;
  const selectedItemsCount = catalogProducts.reduce((acc, p) => {
    const raw = qtyByProductId[p.id];
    const q = Number.parseFloat((raw ?? "").replace(",", "."));
    return Number.isFinite(q) && q > 0 ? acc + 1 : acc;
  }, 0);
  const selectedTotalQty = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let sum = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      sum += Math.min(q, avail);
    }
    return sum
      .toFixed(3)
      .replace(/\.?0+$/, "");
  }, [catalogProducts, qtyByProductId, stockQ.data]);

  const estimatedSum = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let t = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      const effective = Math.min(q, avail);
      if (effective <= 0) continue;
      const up = unitPriceForType(p, priceType);
      if (up != null) t += effective * parsePriceAmount(up);
    }
    return t;
  }, [catalogProducts, qtyByProductId, priceType, stockQ.data]);

  const totalVolumeM3 = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let v = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      const eff = Math.min(q, avail);
      if (eff <= 0) continue;
      const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
      if (Number.isFinite(volU)) v += eff * volU;
    }
    return v;
  }, [catalogProducts, qtyByProductId, stockQ.data]);

  const hasClient = Boolean(clientId.trim());
  const hasWarehouse = Boolean(warehouseId.trim());
  const canPickWarehouse = hasClient;
  const canPickPricingAndExpeditor = hasWarehouse;
  const canPickProducts = hasClient && hasWarehouse;

  const mutation = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");

      const wid = Number.parseInt(warehouseId, 10);
      if (!warehouseId.trim() || !Number.isFinite(wid) || wid < 1) throw new Error("warehouse");

      const agentParsed = agentId.trim() ? Number.parseInt(agentId, 10) : NaN;
      const agent_id =
        Number.isFinite(agentParsed) && agentParsed > 0 ? agentParsed : null;

      const stockRows = stockQ.data ?? [];
      const stockMap = new Map(stockRows.map((s) => [s.product_id, s]));
      const qtyAgg = new Map<number, number>();
      for (const p of catalogProducts) {
        const raw = qtyByProductId[p.id];
        if (!raw || !raw.trim()) continue;
        const q = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(q) || q < 0) throw new Error("qty");
        if (q === 0) continue;
        qtyAgg.set(p.id, (qtyAgg.get(p.id) ?? 0) + q);
      }
      const items: { product_id: number; qty: number }[] = [];
      for (const [productId, totalQ] of Array.from(qtyAgg.entries())) {
        if (totalQ <= 0) continue;
        if (!Number.isFinite(totalQ)) throw new Error("qty");
        const avail = availableOrderQty(stockMap.get(productId));
        if (totalQ > avail) throw new Error("qty_over_stock");
        items.push({ product_id: productId, qty: totalQ });
      }
      if (items.length === 0) throw new Error("nolines");

      const validatedOrderType =
        orderType && (ORDER_TYPE_VALUES as readonly string[]).includes(orderType) ? orderType : "order";
      const body: Record<string, unknown> = {
        client_id: cid,
        warehouse_id: wid,
        agent_id,
        price_type: priceType.trim() || "retail",
        order_type: validatedOrderType,
        apply_bonus: applyBonus,
        comment: orderComment.trim() || null,
        items
      };
      const expRaw = expeditorUserId.trim();
      if (expRaw === "__none__") body.expeditor_user_id = null;
      else if (expRaw !== "") {
        const eid = Number.parseInt(expRaw, 10);
        if (Number.isFinite(eid) && eid > 0) body.expeditor_user_id = eid;
      }

      await api.post(`/api/${tenantSlug}/orders`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      onCreated();
    },
    onError: (e: Error) => {
      if (e.message === "warehouse") {
        setLocalError("Omborni tanlash shart.");
        return;
      }
      if (e.message === "client") {
        setLocalError("Klientni tanlang.");
        return;
      }
      if (e.message === "nolines") {
        setLocalError("Kamida bitta to‘liq qator (mahsulot + miqdor) kerak.");
        return;
      }
      if (e.message === "qty") {
        setLocalError("Barcha qatorlarda miqdor musbat bo‘lsin.");
        return;
      }
      if (e.message === "qty_over_stock") {
        setLocalError("Miqdor qoldiqdan oshmasin — har bir mahsulot uchun «Qoldiq» ustunidagi miqdordan ko‘p bo‘lmasin.");
        return;
      }
      const ax = e as AxiosError<{
        error?: string;
        product_id?: number;
        credit_limit?: string;
        outstanding?: string;
        order_total?: string;
        details?: unknown;
      }>;
      const code = ax.response?.data?.error;
      const d = ax.response?.data;
      if (code === "ValidationError" && d?.details != null) {
        setLocalError(
          `Server tekshiruvi: ${typeof d.details === "string" ? d.details : JSON.stringify(d.details)}`
        );
        return;
      }
      if (code === "BadQty") {
        setLocalError("Miqdor noto‘g‘ri (musbat son bo‘lsin).");
        return;
      }
      if (code === "BadWarehouse") {
        setLocalError("Tanlangan ombor topilmadi.");
        return;
      }
      if (code === "BadAgent") {
        setLocalError("Tanlangan agent topilmadi yoki faol emas.");
        return;
      }
      if (code === "NoRetailPrice" || code === "NoPrice") {
        const id = ax.response?.data?.product_id as number | undefined;
        const pt = (ax.response?.data as { price_type?: string } | undefined)?.price_type ?? "retail";
        setLocalError(
          id != null
            ? `Mahsulot #${id} uchun «${pt}» narxi yo‘q.`
            : `Narx yo‘q («${pt}»).`
        );
        return;
      }
      if (code === "InsufficientStock") {
        const d = ax.response?.data as { product_id?: number; available?: string; requested?: string };
        setLocalError(
          d?.product_id != null
            ? `Mahsulot #${d.product_id}: omborda yetarli emas (mavjud ${d.available ?? "—"}, kerak ${d.requested ?? "—"}).`
            : "Omborda yetarli mahsulot yo‘q."
        );
        return;
      }
      if (code === "BadExpeditor") {
        setLocalError("Tanlangan ekspeditor topilmadi yoki faol emas.");
        return;
      }
      if (code === "BadClient") {
        setLocalError("Klient topilmadi yoki faol emas.");
        return;
      }
      if (code === "BadProduct") {
        setLocalError("Mahsulot topilmadi yoki faol emas.");
        return;
      }
      if (code === "DuplicateProduct") {
        setLocalError("Bir xil mahsulotni bir nechta qatorga qo‘shib bo‘lmaydi.");
        return;
      }
      if (code === "CreditLimitExceeded" && d) {
        setLocalError(
          `Kredit limiti yetmaydi. Limit: ${d.credit_limit ?? "—"}, ochiq zakazlar yig‘indisi: ${d.outstanding ?? "—"}, bu zakaz: ${d.order_total ?? "—"}.`
        );
        return;
      }
      if (ax.response?.status === 403) {
        setLocalError("Zakaz yaratish huquqi yo‘q (faqat admin / operator).");
        return;
      }
      setLocalError(ax.response?.data?.error ?? e.message ?? "Xato");
    }
  });

  const stockReadyForLines = !canPickProducts || (!stockQ.isLoading && !stockQ.isError);
  const canSubmit =
    hasClient &&
    hasWarehouse &&
    selectedItemsCount > 0 &&
    !mutation.isPending &&
    !loadingLists &&
    stockReadyForLines &&
    !hasQtyOverStock &&
    !hasMissingPriceForSelected;

  useEffect(() => {
    if (!hasClient) {
      setWarehouseId("");
      setAgentId("");
      setExpeditorUserId("");
    }
  }, [hasClient]);

  useEffect(() => {
    setLocalError(null);
  }, [
    clientId,
    warehouseId,
    agentId,
    applyBonus,
    selectedCategoryId,
    productSearch,
    qtyByProductId,
    expeditorUserId,
    priceType,
    orderComment
  ]);

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Yangi zakaz"
        description="Klient, ombor va mahsulot miqdorlari — to‘liq sahifa."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/orders">
              ← Zakazlar ro‘yxati
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Bekor
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              onClick={() => mutation.mutate()}
              className="bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700"
              title={
                !hasClient
                  ? "Avval klientni tanlang"
                  : !hasWarehouse
                    ? "Avval omborni tanlang"
                    : selectedItemsCount === 0
                      ? "Kamida bitta mahsulot miqdorini kiriting"
                      : hasQtyOverStock
                        ? "Miqdor qoldiqdan oshmasin"
                        : hasMissingPriceForSelected
                          ? "Tanlangan narx turi bo‘yicha narxi yo‘q mahsulotlar bor"
                        : !stockReadyForLines
                          ? "Qoldiqlar Загрузка…"
                          : undefined
              }
            >
              {mutation.isPending ? "Saqlanmoqda…" : "Yaratish"}
            </Button>
          </div>
        }
      />

      <div className="flex w-full min-w-0 flex-col gap-6 pb-32">
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}

        {clientsQ.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-semibold text-destructive">API bilan aloqa yo‘q</p>
            <p className="mt-1 text-muted-foreground">
              {isApiUnreachable(clientsQ.error) ? (
                <>
                  So‘rov manzili:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                    {apiBaseURL || resolveApiOrigin()}
                  </code>{" "}
                  (devda ko‘pincha Next proxy orqali <code className="text-xs">/api</code>).
                  Klientlar va boshqa ro‘yxatlar backend ishlamaguncha bo‘sh ko‘rinadi. Loyiha ildizidan{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">npm run dev</code> (api+web)
                  yoki{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">
                    npm run dev --prefix backend
                  </code>{" "}
                  ni ishga tushiring (odatda port 4000). Boshqa portda bo‘lsa,{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">
                    NEXT_PUBLIC_API_URL
                  </code>{" "}
                  ni frontend <code className="rounded bg-muted px-1 text-xs text-foreground">.env.local</code>{" "}
                  da moslang.
                </>
              ) : (
                getUserFacingError(clientsQ.error, "Klientlar yuklanmadi.")
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void clientsQ.refetch()}
            >
              Qayta urinish
            </Button>
          </div>
        ) : null}

        <div
          className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
          role="note"
        >
          <span className="font-medium text-foreground">Rejalashtirilmoqda: </span>
          buyurtma cheklovlari, taklif asosidagi zakaz, qator bo‘yicha skidka — alohida modul va API bilan
          ulanadi. Hozir «Skidka turi» faqat ko‘rinish; bonuslar serverdagi{" "}
          <span className="font-medium text-foreground">apply_bonus</span> bilan bog‘langan.
        </div>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">Buyurtma ma&apos;lumotlari</h2>
            <p className="text-xs text-muted-foreground">
              Tartib: klient → ombor → narx / bonus → mahsulotlar
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="oc-client">Klient</Label>
              <FilterSelect
                id="oc-client"
                className={fieldClass}
                emptyLabel="Klientni tanlang"
                aria-label="Klient"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={mutation.isPending || loadingLists}
              >
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc-order-date">Buyurtma sanasi</Label>
              <Input
                id="oc-order-date"
                readOnly
                className={cn(fieldClass, "cursor-default bg-muted/40")}
                value={orderOpenedAt.toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" })}
              />
              <p className="text-[11px] text-muted-foreground">
                Eski narxlar rejimi —{" "}
                <span className="font-medium text-foreground">rejalashtirilmoqda</span> (API yo‘q).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-5">
            {/* Chap: zakaz maydonlari */}
            <div className="space-y-4 xl:col-span-3 xl:border-r xl:border-border/70 xl:pr-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zakaz</p>
              <div className="space-y-2">
                <Label htmlFor="oc-warehouse">Ombor</Label>
                <FilterSelect
                  id="oc-warehouse"
                  className={fieldClass}
                  emptyLabel="Omborni tanlang"
                  aria-label="Ombor"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </FilterSelect>
                {!canPickWarehouse ? (
                  <p className="text-[11px] text-muted-foreground">Avval klientni tanlang.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-agent">Agent</Label>
                <FilterSelect
                  id="oc-agent"
                  className={fieldClass}
                  emptyLabel="Agent (ixtiyoriy)"
                  aria-label="Agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                >
                  {agentUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.login} · {u.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-exp">Ekspeditor</Label>
                <FilterSelect
                  id="oc-exp"
                  className={fieldClass}
                  emptyLabel="Avtobog‘lash"
                  aria-label="Ekspeditor"
                  value={expeditorUserId}
                  onChange={(e) => setExpeditorUserId(e.target.value)}
                  disabled={mutation.isPending || expeditorsQ.isLoading || !canPickPricingAndExpeditor}
                >
                  <option value="">Avtobog‘lash</option>
                  <option value="__none__">Ekspeditorsiz</option>
                  {(expeditorsQ.data ?? []).map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.login} · {r.fio}
                    </option>
                  ))}
                </FilterSelect>
                {!canPickPricingAndExpeditor ? (
                  <p className="text-[11px] text-muted-foreground">Ombor tanlang — keyin ochiladi.</p>
                ) : null}
              </div>

              <label className="flex cursor-not-allowed items-start gap-2 text-sm text-muted-foreground opacity-70">
                <input type="checkbox" disabled className="mt-0.5 size-4 rounded border-input" />
                <span>
                  Konstigatsiya{" "}
                  <span className="block text-[11px] text-destructive/90">Limit: rejalashtirilmoqda</span>
                </span>
              </label>

              <div className="space-y-2">
                <Label htmlFor="oc-bonus-mode">Bonus turi</Label>
                <select
                  id="oc-bonus-mode"
                  className={fieldClass}
                  value={applyBonus ? "auto" : "off"}
                  onChange={(e) => setApplyBonus(e.target.value === "auto")}
                  disabled={mutation.isPending || !canPickPricingAndExpeditor}
                >
                  <option value="auto">Avto (bonus qoidalarini qo‘llash)</option>
                  <option value="off">O‘chirilgan</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-discount-mode">Skidka turi</Label>
                <select id="oc-discount-mode" className={fieldClass} disabled title="API — keyinroq">
                  <option value="auto">Avto</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Chiziq / foiz skidkalari keyin ulashadi; hozir narx turi va bonus holati ishlatiladi.
                </p>
              </div>
            </div>

            {/* O‘rta: kategoriya chip’lari */}
            <div className="min-w-0 space-y-3 xl:col-span-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mahsulot kategoriyalari
              </p>
              <div
                className={cn(
                  "max-h-[min(40vh,260px)] overflow-y-auto rounded-lg border border-border bg-muted/15 p-3",
                  !canPickProducts && "pointer-events-none opacity-50"
                )}
              >
                {!canPickProducts ? (
                  <p className="text-xs text-muted-foreground">Avval klient va omborni tanlang.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId("")}
                      disabled={mutation.isPending}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedCategoryId === ""
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      Barchasi
                    </button>
                    {categories.map((c) => {
                      const active = selectedCategoryId === String(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(active ? "" : String(c.id))}
                          disabled={mutation.isPending}
                          className={cn(
                            "max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          )}
                          title={c.name}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* O‘ng: narx turi + qoldiq */}
            <div className="space-y-4 xl:col-span-4 xl:border-l xl:border-border/70 xl:pl-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Narx turi</p>
              <div
                className={cn(
                  "space-y-2 rounded-lg border border-border bg-muted/10 p-3",
                  !canPickPricingAndExpeditor && "opacity-60"
                )}
                role="radiogroup"
                aria-label="Narx turi"
              >
                {(priceTypesQ.data ?? ["retail"]).map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:bg-muted/60",
                      priceType === t && "border-primary/40 bg-primary/5"
                    )}
                  >
                    <input
                      type="radio"
                      name="oc-price-type"
                      className="size-4 border-input"
                      checked={priceType === t}
                      onChange={() => setPriceType(t)}
                      disabled={mutation.isPending || priceTypesQ.isLoading || !canPickPricingAndExpeditor}
                    />
                    <span className="font-medium capitalize">{t}</span>
                  </label>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={showZeroStock}
                  onChange={(e) => setShowZeroStock(e.target.checked)}
                  disabled={mutation.isPending || !canPickProducts}
                />
                Nol qoldiqdagi mahsulotlarni ham ko‘rsatish
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-2 border-t border-border/70 pt-5">
            <Label htmlFor="oc-comment">Izoh (ichki)</Label>
            <textarea
              id="oc-comment"
              rows={3}
              className={cn(
                fieldClass,
                "min-h-[5.5rem] resize-y py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              )}
              value={orderComment}
              onChange={(e) => setOrderComment(e.target.value)}
              disabled={mutation.isPending || !canPickPricingAndExpeditor}
              placeholder="Buyurtma bo‘yicha eslatma…"
              maxLength={4000}
            />
          </div>

          {clientSummaryQ.data ? (
            <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Mijoz moliyasi: </span>
              balans{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.account_balance, { maxFractionDigits: 2 })}
              </span>
              {" · "}kredit limiti{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.credit_limit, { maxFractionDigits: 2 })}
              </span>
              {" · "}ochiq zakazlar{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.open_orders_total, { maxFractionDigits: 2 })}
              </span>
            </div>
          ) : null}
        </section>

        <section
          className={cn(
            "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:p-6",
            !canPickProducts && "opacity-[0.88]"
          )}
        >
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Buyurtma tarkibi</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {canPickProducts
                  ? "Miqdor kiriting. Jadvalda taxminiy summa tanlangan narx turiga qarab."
                  : "Klient va omborni tanlang."}
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl lg:shrink-0">
              <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/8 px-3 py-3 text-sm shadow-sm dark:bg-emerald-950/30">
                <p className="text-xs font-medium text-emerald-800/90 dark:text-emerald-200/90">Jami hajm</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                  {formatNumberGrouped(totalVolumeM3, { maxFractionDigits: 3 })}{" "}
                  <span className="text-sm font-normal text-emerald-800/80 dark:text-emerald-300/80">m³</span>
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm shadow-sm dark:bg-amber-950/35">
                <p className="text-xs font-medium text-amber-900/90 dark:text-amber-100/90">Jami miqdor</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-50">
                  {formatNumberGrouped(selectedTotalQty, { maxFractionDigits: 3 })}{" "}
                  <span className="text-sm font-normal text-amber-800/90 dark:text-amber-200/80">dona</span>
                </p>
              </div>
              <div className="rounded-lg border border-teal-600/25 bg-teal-600/10 px-3 py-3 text-sm shadow-sm dark:bg-teal-950/35">
                <p className="text-xs font-medium text-teal-900/90 dark:text-teal-100/90">Taxminiy summa</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-teal-900 dark:text-teal-100">
                  {estimatedSum > 0 ? formatNumberGrouped(estimatedSum, { maxFractionDigits: 0 }) : "0"}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Input
                placeholder="Qidiruv: nom, SKU"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                disabled={mutation.isPending || !canPickProducts}
                className="h-10"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="max-h-[min(60vh,720px)] overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="app-table-thead sticky top-0 z-[1] backdrop-blur-sm">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="min-w-[12rem] px-3 py-2.5">Mahsulot</th>
                    <th className="min-w-[5.5rem] px-3 py-2.5 text-right">Narx</th>
                    <th
                      className="min-w-[5.5rem] px-3 py-2.5 text-center"
                      title="Qadoq / blok. Kartotekada blokdagi dona bo‘lsa, miqdor = blok × dona."
                    >
                      Blok
                    </th>
                    <th className="min-w-[5.5rem] px-3 py-2.5 text-center">Miqdor</th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right">Hajm m³</th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right" title="Fakt qoldiq (jami omborda)">
                      Fakt
                    </th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right" title="Band qilingan miqdor">
                      Bron
                    </th>
                    <th className="min-w-[5rem] px-3 py-2.5 text-right" title="Mavjud (fakt − bron)">
                      Mavjud
                    </th>
                    <th className="min-w-[6rem] px-3 py-2.5 text-right">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {canPickProducts && stockQ.isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Ombor qoldiqlari Загрузка…
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts && stockQ.isError ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-destructive">
                        Qoldiqlarni yuklab bo‘lmadi. Internet yoki omborni tekshiring.
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts && !stockQ.isLoading && !stockQ.isError
                    ? displayProducts.map((p) => {
                        const stock = stockByProduct.get(p.id);
                        const qtyTotal = stock?.qty ?? "0";
                        const reserved = stock?.reserved_qty ?? "0";
                        const availNum = availableOrderQty(stock);
                        const qpb = p.qty_per_block;
                        const unit = unitPriceForType(p, priceType);
                        const lineQtyRaw = qtyByProductId[p.id] ?? "";
                        const lineQ = Number.parseFloat(lineQtyRaw.replace(",", "."));
                        const blockRaw = blockByProductId[p.id] ?? "";
                        const blockN = Number.parseFloat(blockRaw.replace(",", "."));
                        let impliedFromBlock = NaN;
                        if (qpb != null && qpb > 0) {
                          if (Number.isFinite(blockN) && blockN > 0) impliedFromBlock = blockN * qpb;
                        } else if (Number.isFinite(blockN)) {
                          impliedFromBlock = blockN;
                        }
                        const qtyOver =
                          Boolean(lineQtyRaw.trim()) &&
                          Number.isFinite(lineQ) &&
                          lineQ > 0 &&
                          lineQ > availNum;
                        const blockOver =
                          Boolean(blockRaw.trim()) &&
                          Number.isFinite(impliedFromBlock) &&
                          impliedFromBlock > availNum;
                        const effQ =
                          Number.isFinite(lineQ) && lineQ > 0 ? Math.min(lineQ, availNum) : 0;
                        const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
                        const lineVolM3 =
                          Number.isFinite(volU) && effQ > 0 ? effQ * volU : 0;
                        const lineTotalMoney =
                          unit != null && effQ > 0 ? effQ * parsePriceAmount(unit) : null;
                        const maxLabel = formatNumberGrouped(availNum, { maxFractionDigits: 3 });
                        return (
                          <tr key={p.id} className="border-b border-border/80 last:border-0 hover:bg-muted/25">
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium leading-snug text-foreground">{p.name}</div>
                              {p.sku ? (
                                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                  {p.sku}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {unit != null
                                ? formatNumberGrouped(parsePriceAmount(unit), { maxFractionDigits: 2 })
                                : "—"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                                {blockOver ? (
                                  <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                                    Maks: {maxLabel}
                                  </span>
                                ) : null}
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  placeholder="0"
                                  title={
                                    qpb != null && qpb > 0
                                      ? `1 blok = ${qpb} dona`
                                      : "Blok va miqdor bir xil (kartotekada blok/o‘lcham yo‘q)"
                                  }
                                  className={cn(
                                    "h-9 w-full tabular-nums text-center",
                                    blockOver && "border-destructive focus-visible:ring-destructive"
                                  )}
                                  value={blockRaw}
                                  onChange={(e) => {
                                    const blockStr = e.target.value;
                                    setBlockByProductId((prev) => ({ ...prev, [p.id]: blockStr }));
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      if (!blockStr.trim()) {
                                        setQtyByProductId((prev) => ({ ...prev, [p.id]: "" }));
                                        return;
                                      }
                                      const blocks = Number.parseFloat(blockStr.replace(",", "."));
                                      if (!Number.isFinite(blocks) || blocks <= 0) return;
                                      setQtyByProductId((prev) => ({
                                        ...prev,
                                        [p.id]: formatQtyState(blocks * qpbN)
                                      }));
                                      return;
                                    }
                                    setQtyByProductId((prev) => ({ ...prev, [p.id]: blockStr }));
                                  }}
                                  onBlur={() => {
                                    const br = blockByProductId[p.id];
                                    if (!br?.trim()) return;
                                    const blocks = Number.parseFloat(br.replace(",", "."));
                                    if (!Number.isFinite(blocks) || blocks <= 0) return;
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      let qtyVal = blocks * qpbN;
                                      if (qtyVal > availNum) {
                                        qtyVal = availNum;
                                        setBlockByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: availNum > 0 ? formatQtyState(availNum / qpbN) : ""
                                        }));
                                        setQtyByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: qtyVal > 0 ? formatQtyState(qtyVal) : ""
                                        }));
                                      }
                                      return;
                                    }
                                    if (blocks > availNum) {
                                      const cap = availNum > 0 ? String(availNum) : "";
                                      setBlockByProductId((prev) => ({ ...prev, [p.id]: cap }));
                                      setQtyByProductId((prev) => ({ ...prev, [p.id]: cap }));
                                    }
                                  }}
                                  disabled={mutation.isPending}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                                {qtyOver ? (
                                  <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                                    Maks: {maxLabel}
                                  </span>
                                ) : null}
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  placeholder="0"
                                  className={cn(
                                    "h-9 w-full tabular-nums text-center",
                                    qtyOver && "border-destructive focus-visible:ring-destructive"
                                  )}
                                  value={lineQtyRaw}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQtyByProductId((prev) => ({ ...prev, [p.id]: v }));
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      const q = Number.parseFloat(v.replace(",", "."));
                                      if (!v.trim() || !Number.isFinite(q) || q <= 0) {
                                        setBlockByProductId((prev) => ({ ...prev, [p.id]: "" }));
                                      } else {
                                        setBlockByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: formatQtyState(q / qpbN)
                                        }));
                                      }
                                    } else {
                                      setBlockByProductId((prev) => ({ ...prev, [p.id]: v }));
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = qtyByProductId[p.id];
                                    if (!raw?.trim()) return;
                                    const n = Number.parseFloat(raw.replace(",", "."));
                                    if (!Number.isFinite(n) || n <= 0) return;
                                    if (n > availNum) {
                                      const capped = availNum > 0 ? formatQtyState(availNum) : "";
                                      setQtyByProductId((prev) => ({ ...prev, [p.id]: capped }));
                                      const qpbN = p.qty_per_block;
                                      if (qpbN != null && qpbN > 0 && capped) {
                                        const q = Number.parseFloat(capped.replace(",", "."));
                                        if (Number.isFinite(q) && q > 0) {
                                          setBlockByProductId((prev) => ({
                                            ...prev,
                                            [p.id]: formatQtyState(q / qpbN)
                                          }));
                                        }
                                      } else {
                                        setBlockByProductId((prev) => ({ ...prev, [p.id]: capped }));
                                      }
                                    }
                                  }}
                                  disabled={mutation.isPending}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {lineVolM3 > 0
                                ? formatNumberGrouped(lineVolM3, { maxFractionDigits: 4 })
                                : "0"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground align-middle">
                              {formatNumberGrouped(parseStockQty(qtyTotal), { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300 align-middle">
                              {formatNumberGrouped(parseStockQty(reserved), { maxFractionDigits: 3 })}
                            </td>
                            <td
                              className="px-3 py-2 text-right tabular-nums font-semibold text-foreground align-middle"
                              title={`Fakt: ${qtyTotal}, bron: ${reserved}`}
                            >
                              {formatNumberGrouped(availNum, { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground align-middle">
                              {lineTotalMoney != null && lineTotalMoney > 0
                                ? formatNumberGrouped(lineTotalMoney, { maxFractionDigits: 0 })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })
                    : null}
                  {canPickProducts &&
                  !stockQ.isLoading &&
                  !stockQ.isError &&
                  catalogProducts.length > 0 &&
                  displayProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        Qidiruv bo‘yicha mahsulot topilmadi.
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts &&
                  !stockQ.isLoading &&
                  !stockQ.isError &&
                  catalogProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        {showZeroStock
                          ? "Bu kategoriya / ombor bo‘yicha mahsulot yo‘q."
                          : "Noldan yuqori qoldiq yo‘q. «Nol qoldiq»ni yoqing yoki kategoriyani tekshiring."}
                      </td>
                    </tr>
                  ) : null}
                  {!canPickProducts ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        Avval klient va omborni tanlang — keyin jadval ochiladi.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {canPickProducts && !stockQ.isLoading && !stockQ.isError && displayProducts.length > 0 ? (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                      <td className="px-3 py-2.5 text-foreground" colSpan={3}>
                        Jami
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                        {formatNumberGrouped(selectedTotalQty, { maxFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {formatNumberGrouped(totalVolumeM3, { maxFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-teal-800 dark:text-teal-200">
                        {estimatedSum > 0
                          ? formatNumberGrouped(estimatedSum, { maxFractionDigits: 0 })
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          {hasMissingPriceForSelected ? (
            <p className="mt-3 text-xs text-destructive">
              Tanlangan narx turi ({priceType}) bo‘yicha narxi yo‘q mahsulot bor:{" "}
              {missingPriceProductNames.join(", ")}
              {missingPriceProductNames.length >= 3 ? "..." : ""}. Narx turini almashtiring yoki mahsulot narxini
              kiriting.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ombor: </span>
            yaratishda bloklangan miqdor oshadi; tasdiqlanganda qoldiq kamayadi. Bekor qilsangiz — blokdan
            qaytariladi.{" "}
            <span className="font-medium text-foreground">Taxminiy summa</span> bonus va yakuniy chegirmasiz.
          </p>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 pr-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
            Bekor
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            {mutation.isPending ? "Saqlanmoqda…" : "Yaratish"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
