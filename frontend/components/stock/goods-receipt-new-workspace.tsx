"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGroupedDecimal, formatGroupedInteger } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { Box, Coins, Package, Search } from "lucide-react";

type CategoryRow = { id: number; name: string; parent_id: number | null; is_active: boolean };
type AgentPick = { id: number; fio: string; login: string; is_active: boolean };

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  volume_m3: string | null;
  weight_kg: string | null;
  /** Dona (yoki boshqa birlik) soni bitta qadoq/blokda */
  qty_per_block: number | null;
  prices?: { price_type: string; price: string }[];
};

async function fetchAllProductsInCategory(
  tenantSlug: string,
  categoryId: number
): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  let page = 1;
  const limit = 100;
  for (;;) {
    const { data } = await api.get<{
      data: ProductRow[];
      total: number;
    }>(
      `/api/${tenantSlug}/products?category_id=${categoryId}&limit=${limit}&page=${page}&is_active=true&include_prices=1`
    );
    out.push(...data.data);
    if (data.data.length < limit || out.length >= data.total) break;
    page += 1;
  }
  return out;
}

/** block = qadoqlar/bloklar soni; qty = jami dona (blok × qty_per_block bo‘lsa avto) */
type LineEdit = { qty: string; block: string; price: string };

type Props = { tenantSlug: string };

const panel =
  "rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6";
const selectClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
);
const tableShell = "overflow-x-auto rounded-lg border border-border";

export function GoodsReceiptNewWorkspace({ tenantSlug }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState("");
  const [agentFilterId, setAgentFilterId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [comment, setComment] = useState("");
  const [priceType, setPriceType] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set());
  const [lines, setLines] = useState<Record<number, LineEdit>>({});
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "receipt-new"],
    queryFn: async () => {
      const { data } = await api.get<{ data: CategoryRow[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data.filter((c) => c.is_active);
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });

  const flatCats = categoriesQ.data ?? [];

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "receipt-new", agentFilterId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentFilterId.trim()) params.set("selected_agent_id", agentFilterId.trim());
      const qs = params.toString();
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses${qs ? `?${qs}` : ""}`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });
  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "receipt-new"],
    queryFn: async () => {
      const { data } = await api.get<{ data: AgentPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return (data.data ?? []).filter((a) => a.is_active);
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });
  useEffect(() => {
    if (!warehouseId.trim()) return;
    const ok = (warehousesQ.data ?? []).some((w) => String(w.id) === warehouseId.trim());
    if (!ok) setWarehouseId("");
  }, [warehouseId, warehousesQ.data]);

  const suppliersQ = useQuery({
    queryKey: ["suppliers", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/suppliers`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "receipt"],
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(
        `/api/${tenantSlug}/price-types?kind=purchase`
      );
      if (data.data.length > 0) return data.data;
      const { data: all } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types`);
      return all.data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });

  const catIds = useMemo(() => Array.from(selectedCats), [selectedCats]);

  const catIdsKey = useMemo(
    () => [...catIds].sort((a, b) => a - b).join(","),
    [catIds]
  );

  const productQueries = useQueries({
    queries: catIds.map((cid) => ({
      queryKey: ["products-receipt-cat", tenantSlug, cid],
      queryFn: () => fetchAllProductsInCategory(tenantSlug, cid),
      enabled: Boolean(tenantSlug) && catIds.length > 0
    }))
  });

  const queriesDataFingerprint = productQueries
    .map((q) => `${q.dataUpdatedAt}:${q.fetchStatus}:${q.data?.length ?? 0}`)
    .join("|");

  const mergedProducts = useMemo(() => {
    const m = new Map<number, ProductRow>();
    for (const q of productQueries) {
      for (const p of q.data ?? []) {
        m.set(p.id, p);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [catIdsKey, queriesDataFingerprint]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return mergedProducts;
    return mergedProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [mergedProducts, productSearch]);

  useEffect(() => {
    if (!priceType.trim()) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const p of mergedProducts) {
        const pr = p.prices?.find((x: { price_type: string; price: string }) => x.price_type === priceType.trim());
        const existing = next[p.id];
        if (!existing) {
          next[p.id] = { qty: "", block: "", price: pr?.price ?? "" };
        } else if (!existing.price.trim() && pr) {
          next[p.id] = { ...existing, price: pr.price };
        }
      }
      return next;
    });
  }, [mergedProducts, priceType]);

  const createSupplierMut = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<{ data: { id: number; name: string } }>(
        `/api/${tenantSlug}/suppliers`,
        { name }
      );
      return data.data;
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["suppliers", tenantSlug] });
      setSupplierId(String(row.id));
      setSupplierOpen(false);
      setNewSupplierName("");
    }
  });

  type CreateBody = {
    warehouse_id: number;
    supplier_id?: number | null;
    comment?: string | null;
    price_type: string;
    external_ref?: string | null;
    status: "draft" | "posted";
    lines: { product_id: number; qty: number; unit_price?: number | null; defect_qty?: number | null }[];
  };

  const createMut = useMutation({
    mutationFn: async (body: CreateBody) => {
      const { data } = await api.post<{ data: { id: number; number: string } }>(
        `/api/${tenantSlug}/goods-receipts`,
        body
      );
      return data.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["goods-receipts", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["stock", tenantSlug] });
      router.push("/stock/receipts");
    }
  });

  const toggleCat = useCallback((id: number) => {
    setSelectedCats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAllCats = useCallback(() => {
    if (selectedCats.size === flatCats.length) setSelectedCats(new Set());
    else setSelectedCats(new Set(flatCats.map((c) => c.id)));
  }, [flatCats, selectedCats.size]);

  const updateLine = useCallback((productId: number, patch: Partial<LineEdit>) => {
    setLines((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? { qty: "", block: "", price: "" }), ...patch }
    }));
  }, []);

  /** Blok soni o‘zgarganda: kartotekada «шт/блок» bo‘lsa, кол-во = blok × qty_per_block */
  const setBlockForProduct = useCallback((productId: number, blockStr: string, p: ProductRow) => {
    setLines((prev) => {
      const cur = prev[productId] ?? { qty: "", block: "", price: "" };
      const next: LineEdit = { ...cur, block: blockStr };
      const blocks = Number.parseFloat(blockStr.replace(",", "."));
      const qpb = p.qty_per_block;
      if (qpb != null && qpb > 0 && Number.isFinite(blocks) && blocks > 0) {
        const total = blocks * qpb;
        next.qty =
          Number.isInteger(total) && Number.isInteger(blocks) && Number.isInteger(qpb)
            ? String(total)
            : String(Math.round(total * 1000) / 1000);
      }
      return { ...prev, [productId]: next };
    });
  }, []);

  const buildPayloadLines = useCallback(() => {
    const payloadLines: {
      product_id: number;
      qty: number;
      unit_price?: number | null;
      defect_qty?: number | null;
    }[] = [];
    for (const p of mergedProducts) {
      const ln = lines[p.id];
      if (!ln) continue;
      const qty = Number.parseFloat(ln.qty.replace(",", "."));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const unitPriceRaw = ln.price.trim().replace(",", ".");
      const unitPrice =
        unitPriceRaw === "" ? null : Number.parseFloat(unitPriceRaw);
      payloadLines.push({
        product_id: p.id,
        qty,
        unit_price: unitPrice != null && Number.isFinite(unitPrice) ? unitPrice : null,
        defect_qty: null
      });
    }
    return payloadLines;
  }, [mergedProducts, lines]);

  const grandTotals = useMemo(() => {
    let totalQty = 0;
    let totalVol = 0;
    let totalSum = 0;
    for (const p of mergedProducts) {
      const ln = lines[p.id] ?? { qty: "", block: "", price: "" };
      const qtyN = Number.parseFloat(ln.qty.replace(",", "."));
      const priceN = Number.parseFloat(ln.price.replace(",", "."));
      const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
      if (Number.isFinite(qtyN) && qtyN > 0) {
        totalQty += qtyN;
        if (Number.isFinite(priceN)) totalSum += qtyN * priceN;
        if (Number.isFinite(volU)) totalVol += qtyN * volU;
      }
    }
    return { totalQty, totalVol, totalSum };
  }, [mergedProducts, lines]);

  const filteredTotals = useMemo(() => {
    let totalQty = 0;
    let totalVol = 0;
    let totalSum = 0;
    for (const p of filteredProducts) {
      const ln = lines[p.id] ?? { qty: "", block: "", price: "" };
      const qtyN = Number.parseFloat(ln.qty.replace(",", "."));
      const priceN = Number.parseFloat(ln.price.replace(",", "."));
      const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
      if (Number.isFinite(qtyN) && qtyN > 0) {
        totalQty += qtyN;
        if (Number.isFinite(priceN)) totalSum += qtyN * priceN;
        if (Number.isFinite(volU)) totalVol += qtyN * volU;
      }
    }
    return { totalQty, totalVol, totalSum };
  }, [filteredProducts, lines]);

  const submit = useCallback(
    (status: "draft" | "posted") => {
      const wid = Number.parseInt(warehouseId, 10);
      if (!Number.isFinite(wid) || wid <= 0) {
        window.alert("Выберите склад.");
        return;
      }
      if (!priceType.trim()) {
        window.alert("Выберите тип цены.");
        return;
      }
      if (catIds.length === 0) {
        window.alert("Отметьте хотя бы одну категорию.");
        return;
      }
      const payloadLines = buildPayloadLines();
      if (!payloadLines.length) {
        window.alert("Укажите количество хотя бы у одного товара.");
        return;
      }
      createMut.mutate({
        warehouse_id: wid,
        supplier_id: supplierId ? Number.parseInt(supplierId, 10) : null,
        comment: comment.trim() || null,
        price_type: priceType.trim(),
        external_ref: externalRef.trim() || null,
        status,
        lines: payloadLines
      });
    },
    [
      warehouseId,
      supplierId,
      comment,
      priceType,
      externalRef,
      catIds.length,
      buildPayloadLines,
      createMut
    ]
  );

  const productsLoading = productQueries.some((q) => q.isLoading);

  return (
    <PageShell>
      <PageHeader
        title="Добавить поступление"
        description="Тип цены и склад; дата прихода ставится автоматически при сохранении. В колонке «Блок» — число упаковок; «Кол-во» считается из карточки товара (шт/блок), если задано."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/stock/receipts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          ← К списку
        </Link>
      </div>

      <div className="space-y-6">
        <section className={panel}>
          <h2 className="mb-5 text-lg font-semibold tracking-tight sm:text-xl">Реквизиты и категории</h2>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-10">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Поставщик</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSupplierOpen(true)}>
                    + Новый
                  </Button>
                </div>
                <select
                  className={selectClass}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">—</option>
                  {(suppliersQ.data ?? []).map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Агент (фильтр склада)</Label>
                <select
                  className={selectClass}
                  value={agentFilterId}
                  onChange={(e) => setAgentFilterId(e.target.value)}
                >
                  <option value="">— все —</option>
                  {(agentsQ.data ?? []).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.fio} ({a.login})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Склад *</Label>
                <select
                  className={selectClass}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {(warehousesQ.data ?? []).map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Комментарий</Label>
                <textarea
                  className="border-input bg-background min-h-[88px] w-full rounded-md border px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Тип цены *</Label>
                <select
                  className={selectClass}
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {(priceTypesQ.data ?? []).map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">Дата прихода проставляется автоматически в момент сохранения.</p>
              </div>
              <div className="space-y-2">
                <Label>Номер прихода 1С</Label>
                <Input className="h-10" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} maxLength={128} />
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-base">Категории товаров *</Label>
                <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input rounded"
                    checked={flatCats.length > 0 && selectedCats.size === flatCats.length}
                    onChange={() => selectAllCats()}
                  />
                  Выбрать все
                </label>
              </div>
              <div className="bg-muted/30 max-h-[min(280px,40vh)] overflow-y-auto rounded-lg border border-border p-3 sm:max-h-[320px]">
                {categoriesQ.isLoading ? (
                  <p className="text-muted-foreground text-sm">Загрузка категорий…</p>
                ) : flatCats.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Нет категорий — создайте в настройках каталога.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {flatCats.map((c) => (
                      <label
                        key={c.id}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                          selectedCats.has(c.id)
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selectedCats.has(c.id)}
                          onChange={() => toggleCat(c.id)}
                        />
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            selectedCats.has(c.id) ? "bg-primary" : "bg-muted-foreground/40"
                          )}
                        />
                        <span className="leading-tight">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={panel}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">Товары</h2>
            <div className="relative max-w-md flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                className="h-10 pl-9"
                placeholder="Поиск по названию или SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
          </div>

          <div className={tableShell}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="app-table-thead">
                <tr>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-left text-xs font-medium uppercase tracking-wide"
                  >
                    Товар
                  </th>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-right text-xs font-medium uppercase tracking-wide"
                  >
                    Цена
                  </th>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-right text-xs font-medium uppercase tracking-wide"
                    title="Число упаковок (блоков). Если в карточке товара задано «кол-во в блоке», кол-во пересчитается автоматически."
                  >
                    Блок
                  </th>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-right text-xs font-medium uppercase tracking-wide"
                  >
                    Кол-во
                  </th>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-right text-xs font-medium uppercase tracking-wide"
                  >
                    Объём
                  </th>
                  <th
                    scope="col"
                    className="text-muted-foreground px-3 py-3 text-right text-xs font-medium uppercase tracking-wide"
                  >
                    Общая сумма
                  </th>
                </tr>
              </thead>
              <tbody>
                {catIds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center">
                      Отметьте категории — список товаров появится здесь.
                    </td>
                  </tr>
                ) : productsLoading ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center">
                      Загрузка товаров…
                    </td>
                  </tr>
                ) : mergedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center">
                      В выбранных категориях нет активных товаров.
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center">
                      Ничего не найдено по запросу.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const ln = lines[p.id] ?? { qty: "", block: "", price: "" };
                    const qtyN = Number.parseFloat(ln.qty.replace(",", "."));
                    const priceN = Number.parseFloat(ln.price.replace(",", "."));
                    const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
                    const lineVol =
                      Number.isFinite(qtyN) && Number.isFinite(volU) ? qtyN * volU : null;
                    const sum =
                      Number.isFinite(qtyN) && Number.isFinite(priceN) ? qtyN * priceN : null;
                    return (
                      <tr key={p.id} className="hover:bg-muted/40 border-b">
                        <td className="max-w-[280px] px-3 py-2">
                          <div className="leading-tight font-medium">{p.name}</div>
                          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 font-mono text-xs">
                            <span>{p.sku}</span>
                            {p.qty_per_block != null && p.qty_per_block > 0 ? (
                              <span>• {p.qty_per_block} шт/блок</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            className="ml-auto h-8 w-24 text-right tabular-nums"
                            inputMode="decimal"
                            value={ln.price}
                            onChange={(e) => updateLine(p.id, { price: e.target.value })}
                            placeholder="авто"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            className="ml-auto h-8 w-20 text-right tabular-nums"
                            inputMode="decimal"
                            value={ln.block}
                            placeholder={p.qty_per_block != null && p.qty_per_block > 0 ? "упак." : "—"}
                            onChange={(e) => setBlockForProduct(p.id, e.target.value, p)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            className="ml-auto h-8 w-20 text-right tabular-nums"
                            inputMode="decimal"
                            value={ln.qty}
                            onChange={(e) => updateLine(p.id, { qty: e.target.value })}
                          />
                        </td>
                        <td className="text-muted-foreground px-3 py-2 text-right text-xs tabular-nums">
                          {lineVol != null && Number.isFinite(lineVol)
                            ? `${formatGroupedDecimal(lineVol, 4)} м³`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {sum != null && Number.isFinite(sum) ? formatGroupedDecimal(sum, 2) : "0"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {catIds.length > 0 && !productsLoading && mergedProducts.length > 0 && filteredProducts.length > 0 ? (
                <tfoot>
                  <tr className="bg-muted/40 border-t font-medium">
                    <td className="px-3 py-3">Итого</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right tabular-nums">
                      {filteredTotals.totalQty > 0
                        ? formatGroupedDecimal(filteredTotals.totalQty, 0)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm">
                      {filteredTotals.totalVol > 0
                        ? `${formatGroupedDecimal(filteredTotals.totalVol, 4)} м³`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {filteredTotals.totalSum > 0 ? formatGroupedDecimal(filteredTotals.totalSum, 2) : "0"}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="bg-muted/20 flex items-center gap-3 rounded-xl border border-border px-4 py-4">
              <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Box className="size-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Общий объём</p>
                <p className="text-lg font-semibold tabular-nums">
                  {grandTotals.totalVol > 0
                    ? `${formatGroupedDecimal(grandTotals.totalVol, 4)} м³`
                    : "0 м³"}
                </p>
              </div>
            </div>
            <div className="bg-muted/20 flex items-center gap-3 rounded-xl border border-border px-4 py-4">
              <div className="flex size-11 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Package className="size-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Общее количество</p>
                <p className="text-lg font-semibold tabular-nums">
                  {grandTotals.totalQty > 0
                    ? `${formatGroupedInteger(Math.round(grandTotals.totalQty))} шт`
                    : "0 шт"}
                </p>
              </div>
            </div>
            <div className="bg-muted/20 flex items-center gap-3 rounded-xl border border-border px-4 py-4">
              <div className="flex size-11 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Coins className="size-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Общая сумма</p>
                <p className="text-lg font-semibold tabular-nums">
                  {grandTotals.totalSum > 0 ? formatGroupedDecimal(grandTotals.totalSum, 2) : "0"}
                </p>
              </div>
            </div>
          </div>

          {createMut.isError ? (
            <p className="text-destructive mt-4 text-sm">Не удалось сохранить. Проверьте склад, цены и количества.</p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-6">
            <Link href="/stock/receipts" className={cn(buttonVariants({ variant: "outline" }))}>
              Отмена
            </Link>
            <Button type="button" variant="outline" disabled={createMut.isPending} onClick={() => submit("draft")}>
              {createMut.isPending ? "…" : "Создать"}
            </Button>
            <Button type="button" disabled={createMut.isPending} onClick={() => submit("posted")}>
              {createMut.isPending ? "Сохранение…" : "Создать и отправить"}
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Новый поставщик</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Название"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setSupplierOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!newSupplierName.trim() || createSupplierMut.isPending}
              onClick={() => createSupplierMut.mutate(newSupplierName.trim())}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
