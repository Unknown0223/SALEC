"use client";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, useTenant } from "@/lib/api-client";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Warehouse = { id: number; name: string };
type AgentPick = { id: number; fio: string; login: string; is_active: boolean };

type CategoryRow = { id: number; name: string; parent_id: number | null; is_active: boolean };

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  is_active: boolean;
  qty_per_block: number | null;
  category: { id: number; name: string } | null;
};

type LineDraft = { qty: string; block: string; batch_no: string; line_comment: string };

const emptyDraft = (): LineDraft => ({ qty: "", block: "", batch_no: "", line_comment: "" });

const textareaClass = cn(
  "flex min-h-[88px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
);

async function fetchAllProductsInCategory(
  tenant: string,
  categoryId: number,
  signal?: AbortSignal
): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  let page = 1;
  const limit = 100;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const params = new URLSearchParams({
      category_id: String(categoryId),
      limit: String(limit),
      page: String(page),
      is_active: "true",
    });
    const res = await apiFetch<{ data?: ProductRow[]; total?: number }>(
      `/api/${tenant}/products?${params}`,
      { signal }
    );
    const chunk = res.data ?? [];
    out.push(...chunk);
    const total = res.total ?? 0;
    if (chunk.length < limit || out.length >= total) break;
    page += 1;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

function parseQty(s: string): number {
  const n = Number.parseFloat(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function blockHint(p: ProductRow): string {
  const qpb = p.qty_per_block;
  if (qpb != null && qpb > 0) {
    return `${qpb} ${p.unit} / blok`;
  }
  return "—";
}

type StockApiRow = {
  product_id: number;
  qty: string;
  reserved_qty: string;
};

function parseDec(s: string): number {
  const n = Number.parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function TransferAmaliyotWorkspace() {
  const router = useRouter();
  const tenant = useTenant();
  const hydrated = useAuthStoreHydrated();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const canWrite = role === "admin" || role === "operator";

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [agents, setAgents] = useState<AgentPick[]>([]);
  const [agentFilterId, setAgentFilterId] = useState("");
  const [loadWh, setLoadWh] = useState(true);
  const [whError, setWhError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadCats, setLoadCats] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState<string>("");
  const [destId, setDestId] = useState<string>("");
  const [comment, setComment] = useState("");
  const [plannedDate, setPlannedDate] = useState("");

  const [categoryId, setCategoryId] = useState<string>("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadProducts, setLoadProducts] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [stockRows, setStockRows] = useState<StockApiRow[]>([]);
  const [loadStock, setLoadStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !tenant || !sourceId) {
      setStockRows([]);
      setStockError(null);
      setLoadStock(false);
      return;
    }
    const wid = Number.parseInt(sourceId, 10);
    if (!Number.isFinite(wid)) return;
    let cancelled = false;
    setLoadStock(true);
    setStockError(null);
    void (async () => {
      try {
        const res = await apiFetch<{ data?: StockApiRow[] }>(
          `/api/${tenant}/stock?warehouse_id=${wid}`
        );
        if (!cancelled) setStockRows(res.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setStockRows([]);
          setStockError(e instanceof Error ? e.message : "Qoldiq yuklanmadi");
        }
      } finally {
        if (!cancelled) setLoadStock(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, tenant, sourceId]);

  const stockByProductId = useMemo(() => {
    const m = new Map<number, { qty: string; reserved: string; available: string }>();
    for (const r of stockRows) {
      const q = parseDec(r.qty);
      const resv = parseDec(r.reserved_qty);
      const av = Math.max(0, q - resv);
      m.set(r.product_id, {
        qty: r.qty,
        reserved: r.reserved_qty,
        available: av.toString(),
      });
    }
    return m;
  }, [stockRows]);

  useEffect(() => {
    if (!hydrated || !tenant) return;
    let cancelled = false;
    (async () => {
      setLoadWh(true);
      setWhError(null);
      try {
        const params = new URLSearchParams();
        if (agentFilterId.trim()) params.set("selected_agent_id", agentFilterId.trim());
        const qs = params.toString();
        const res = await apiFetch<{ data?: Warehouse[] }>(
          `/api/${tenant}/warehouses${qs ? `?${qs}` : ""}`
        );
        if (!cancelled) setWarehouses(res.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setWhError(e instanceof Error ? e.message : "Omborlar yuklanmadi");
          setWarehouses([]);
        }
      } finally {
        if (!cancelled) setLoadWh(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, tenant, agentFilterId]);

  useEffect(() => {
    if (!hydrated || !tenant) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data?: AgentPick[] }>(`/api/${tenant}/agents?is_active=true`);
        if (!cancelled) setAgents((res.data ?? []).filter((a) => a.is_active));
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, tenant]);

  useEffect(() => {
    if (!sourceId.trim()) return;
    if (!warehouses.some((w) => String(w.id) === sourceId.trim())) setSourceId("");
  }, [sourceId, warehouses]);
  useEffect(() => {
    if (!destId.trim()) return;
    if (!warehouses.some((w) => String(w.id) === destId.trim())) setDestId("");
  }, [destId, warehouses]);

  useEffect(() => {
    if (!hydrated || !tenant) return;
    let cancelled = false;
    (async () => {
      setLoadCats(true);
      setCatError(null);
      try {
        const res = await apiFetch<{ data?: CategoryRow[] }>(`/api/${tenant}/product-categories`);
        const rows = (res.data ?? [])
          .filter((c) => c.is_active)
          .sort((a, b) => a.name.localeCompare(b.name, "uz"));
        if (!cancelled) setCategories(rows);
      } catch (e) {
        if (!cancelled) {
          setCatError(e instanceof Error ? e.message : "Kategoriyalar yuklanmadi");
          setCategories([]);
        }
      } finally {
        if (!cancelled) setLoadCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, tenant]);

  useEffect(() => {
    if (!hydrated || !tenant || !categoryId) {
      setProducts([]);
      setProdError(null);
      setLoadProducts(false);
      return;
    }
    const cid = Number.parseInt(categoryId, 10);
    if (!Number.isFinite(cid)) return;

    const ac = new AbortController();
    setLoadProducts(true);
    setProdError(null);
    void (async () => {
      try {
        const list = await fetchAllProductsInCategory(tenant, cid, ac.signal);
        if (!ac.signal.aborted) {
          setProducts(list);
          setDrafts({});
          setRowFilter("");
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          setProducts([]);
          setDrafts({});
          setProdError(e instanceof Error ? e.message : "Mahsulotlar yuklanmadi");
        }
      } finally {
        if (!ac.signal.aborted) setLoadProducts(false);
      }
    })();
    return () => ac.abort();
  }, [hydrated, tenant, categoryId]);

  const selectedCategoryName = useMemo(() => {
    const id = Number.parseInt(categoryId, 10);
    return categories.find((c) => c.id === id)?.name ?? null;
  }, [categories, categoryId]);

  const filteredProducts = useMemo(() => {
    const q = rowFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, rowFilter]);

  const summary = useMemo(() => {
    let withQty = 0;
    let sumQty = 0;
    let withBron = 0;
    for (const p of products) {
      const st = stockByProductId.get(p.id);
      if (st && parseDec(st.reserved) > 0) withBron += 1;
      const d = drafts[p.id] ?? emptyDraft();
      const q = parseQty(d.qty);
      if (Number.isFinite(q) && q > 0) {
        withQty += 1;
        sumQty += q;
      }
    }
    return {
      totalInCategory: products.length,
      linesWithQty: withQty,
      sumQty,
      withBron,
    };
  }, [products, drafts, stockByProductId]);

  const updateDraft = useCallback((productId: number, patch: Partial<LineDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? emptyDraft()), ...patch },
    }));
  }, []);

  const setBlockForProduct = useCallback((productId: number, blockStr: string, p: ProductRow) => {
    setDrafts((prev) => {
      const cur = prev[productId] ?? emptyDraft();
      const next: LineDraft = { ...cur, block: blockStr };
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

  const clearQuantities = useCallback(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of products) {
        next[p.id] = emptyDraft();
      }
      return next;
    });
  }, [products]);

  const destOptions = useMemo(() => {
    const sid = Number.parseInt(sourceId, 10);
    if (!Number.isFinite(sid)) return warehouses;
    return warehouses.filter((w) => w.id !== sid);
  }, [warehouses, sourceId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const src = Number.parseInt(sourceId, 10);
    const dst = Number.parseInt(destId, 10);
    if (!Number.isFinite(src) || !Number.isFinite(dst)) {
      setFormError("Manba va qabul omborini tanlang.");
      return;
    }
    if (src === dst) {
      setFormError("Manba va qabul ombori bir xil bo‘lmasligi kerak.");
      return;
    }
    const payloadLines: {
      product_id: number;
      qty: number;
      batch_no: string | null;
      comment: string | null;
    }[] = [];
    for (const p of products) {
      const d = drafts[p.id] ?? emptyDraft();
      const qty = parseQty(d.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      payloadLines.push({
        product_id: p.id,
        qty,
        batch_no: d.batch_no.trim() || null,
        comment: d.line_comment.trim() || null,
      });
    }
    if (payloadLines.length === 0) {
      setFormError("Kamida bitta mahsulot uchun miqdor kiriting (0 dan katta).");
      return;
    }
    const eps = 1e-6;
    for (const line of payloadLines) {
      const st = stockByProductId.get(line.product_id);
      const av = st ? parseDec(st.available) : 0;
      if (line.qty > av + eps) {
        const p = products.find((x) => x.id === line.product_id);
        setFormError(
          `${p?.sku ?? line.product_id}: ko‘chirish ${line.qty}, mavjud (qoldiq − bron) ${av}. Bron ostidagi miqdor yuborilmaydi.`
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await apiFetch<{ id: number; number: string }>(`/api/${tenant}/transfers`, {
        method: "POST",
        body: JSON.stringify({
          source_warehouse_id: src,
          destination_warehouse_id: dst,
          comment: comment.trim() || null,
          planned_date: plannedDate.trim() || null,
          lines: payloadLines,
        }),
      });
      router.push("/stock/transfers");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Saqlashda xato");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground p-4">Загрузка…</p>;
  }

  if (!canWrite) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-muted-foreground">Huquqlar yetarli emas.</p>
        <Link href="/stock/transfers" className="text-sm text-primary underline">
          Ro‘yxatga qaytish
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Ko‘chirishni rasmiylashtirish</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manba ombordan qoldiq va bron ko‘rinadi; «Mavjud» miqdordan oshiq ko‘chirish saqlanmaydi.
          </p>
        </div>
        <Link
          href="/stock/transfers"
          className={cn(buttonVariants({ variant: "outline" }), "shrink-0 self-start sm:self-center")}
        >
          Jurnalga
        </Link>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_minmax(260px,300px)] xl:grid-cols-[1fr_320px]">
          <div className="order-1 min-w-0 space-y-4">
            <section className="rounded-xl border border-border/80 bg-card/60 px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Omborlar</h2>
                {loadWh && (
                  <span className="text-xs text-muted-foreground">Загрузка…</span>
                )}
              </div>
              {whError && <p className="mt-2 text-sm text-destructive">{whError}</p>}
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Agent (ombor filtri)</Label>
                <Select
                  value={agentFilterId || "__all__"}
                  onValueChange={(v) => setAgentFilterId(v === "__all__" ? "" : v)}
                  disabled={loadWh}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Barchasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Barchasi</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.fio} ({a.login})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Manba</Label>
                  <Select
                    value={sourceId}
                    onValueChange={(v) => {
                      setSourceId(v);
                      if (v && v === destId) setDestId("");
                    }}
                    disabled={loadWh}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={loadWh ? "Загрузка…" : "Tanlang"} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Qabul</Label>
                  <Select value={destId} onValueChange={setDestId} disabled={loadWh || !sourceId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {destOptions.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ikki xil ombor; qoldiq va bron faqat <span className="font-medium text-foreground/80">manba</span>{" "}
                bo‘yicha.
              </p>
            </section>

            <Card className="shadow-sm">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="text-base">Mahsulotlar</CardTitle>
                <p
                  className="text-xs text-muted-foreground"
                  title="Mavjud = qoldiq − bron. Blok maydoni kartotekadagi blok o‘lchamiga qarab miqdorni avto hisoblaydi."
                >
                  <span className="font-medium text-foreground">Mavjud</span> = qoldiq − bron; blok
                  bo‘lsa miqdor avto.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {!sourceId && (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                    <strong className="font-medium">Manba ombor</strong>ni tanlang — qoldiq va bron shu
                    joydan olinadi.
                  </div>
                )}
                {sourceId && loadStock && (
                  <p className="text-sm text-muted-foreground">Qoldiqlar Загрузка…</p>
                )}
                {stockError && <p className="text-sm text-destructive">{stockError}</p>}
                {catError && <p className="text-sm text-destructive">{catError}</p>}

                <div
                  className={cn(
                    "flex min-h-[min(24rem,50vh)] flex-col overflow-hidden rounded-xl border border-border/80 bg-muted/15 sm:min-h-[min(28rem,calc(100vh-13rem))] md:flex-row"
                  )}
                >
                  {/* Chap: kategoriyalar (vertikal) */}
                  <aside
                    className={cn(
                      "flex w-full shrink-0 flex-col border-border/70 bg-card/40 md:w-[min(13.5rem,32vw)] md:border-r lg:w-56"
                    )}
                  >
                    <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Kategoriyalar
                      </p>
                    </div>
                    <div className="max-h-44 overflow-y-auto p-2 md:max-h-none md:flex-1 md:overflow-y-auto">
                      {loadCats ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">Загрузка…</p>
                      ) : categories.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">Faol kategoriya yo‘q.</p>
                      ) : (
                        <nav className="flex flex-col gap-0.5" aria-label="Mahsulot kategoriyalari">
                          {categories.map((c) => {
                            const active = categoryId === String(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setCategoryId(String(c.id))}
                                className={cn(
                                  "w-full rounded-md px-2.5 py-2 text-left text-sm leading-snug transition-colors",
                                  active
                                    ? "bg-primary font-medium text-primary-foreground shadow-sm"
                                    : "text-foreground hover:bg-muted/90"
                                )}
                              >
                                <span className="line-clamp-3">{c.name}</span>
                              </button>
                            );
                          })}
                        </nav>
                      )}
                    </div>
                  </aside>

                  {/* O‘ng: qidiruv + jadval */}
                  <div className="flex min-w-0 flex-1 flex-col bg-background/60">
                    <div className="flex flex-col gap-2 border-b border-border/60 p-2 sm:flex-row sm:items-center sm:gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor="row-filter" className="text-xs text-muted-foreground">
                          Qidiruv
                        </Label>
                        <Input
                          id="row-filter"
                          className="h-9"
                          value={rowFilter}
                          onChange={(e) => setRowFilter(e.target.value)}
                          placeholder="SKU, nom, shtrix…"
                          disabled={!categoryId || loadProducts}
                        />
                      </div>
                      {categoryId && !loadProducts && products.length > 0 && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-5">
                          <Button type="button" variant="outline" size="sm" onClick={clearQuantities}>
                            Miqdorlarni tozalash
                          </Button>
                          {filteredProducts.length !== products.length && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {filteredProducts.length} / {products.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto p-2">
                      {prodError && (
                        <p className="mb-2 text-sm text-destructive">{prodError}</p>
                      )}

                      {!categoryId && !loadCats && categories.length > 0 && (
                        <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                          Chapdan kategoriya tanlang — mahsulotlar shu yerda chiqadi.
                        </div>
                      )}

                      {categoryId && loadProducts && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          Mahsulotlar Загрузка…
                        </p>
                      )}

                      {categoryId && !loadProducts && products.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          Bu kategoriyada faol mahsulot topilmadi.
                        </p>
                      )}

                      {categoryId && !loadProducts && filteredProducts.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-border/80">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10">№</TableHead>
                                <TableHead className="w-[100px]">Kod</TableHead>
                                <TableHead>Nomi</TableHead>
                                <TableHead className="w-28">Blok</TableHead>
                                <TableHead className="w-32 text-xs font-normal text-muted-foreground">
                                  1 blok
                                </TableHead>
                                <TableHead className="w-24 text-right">Qoldiq</TableHead>
                                <TableHead className="w-24 text-right">Bron</TableHead>
                                <TableHead className="w-24 text-right">Mavjud</TableHead>
                                <TableHead className="w-28">Ko‘chirish</TableHead>
                                <TableHead className="w-28">Partiya</TableHead>
                                <TableHead className="min-w-[120px]">Izoh</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredProducts.map((p, idx) => {
                                const d = drafts[p.id] ?? emptyDraft();
                                const st = stockByProductId.get(p.id);
                                const qDisplay = st?.qty ?? (sourceId ? "0" : "—");
                                const rDisplay = st?.reserved ?? (sourceId ? "0" : "—");
                                const aDisplay = st?.available ?? (sourceId ? "0" : "—");
                                const want = parseQty(d.qty);
                                const availN = st ? parseDec(st.available) : 0;
                                const over =
                                  sourceId &&
                                  Number.isFinite(want) &&
                                  want > 0 &&
                                  want > availN + 1e-6;
                                return (
                                  <TableRow
                                    key={p.id}
                                    className={
                                      over ? "bg-destructive/10 dark:bg-destructive/20" : undefined
                                    }
                                  >
                                    <TableCell className="text-muted-foreground text-sm">
                                      {idx + 1}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs align-top">{p.sku}</TableCell>
                                    <TableCell className="align-top">
                                      <div className="font-medium text-sm leading-snug">{p.name}</div>
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {p.unit}
                                        {p.barcode ? ` · ${p.barcode}` : ""}
                                      </div>
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <Input
                                        className="h-8"
                                        value={d.block}
                                        onChange={(e) => setBlockForProduct(p.id, e.target.value, p)}
                                        inputMode="decimal"
                                        placeholder="0"
                                        disabled={p.qty_per_block == null || p.qty_per_block <= 0}
                                        title={
                                          p.qty_per_block != null && p.qty_per_block > 0
                                            ? "Blok soni — miqdor avto"
                                            : "Bu mahsulotda blok o‘lchami yo‘q"
                                        }
                                      />
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground align-top">
                                      {blockHint(p)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs align-top tabular-nums">
                                      {qDisplay}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs align-top tabular-nums">
                                      {rDisplay}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs font-medium align-top tabular-nums">
                                      {aDisplay}
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <Input
                                        className={cn("h-8", over && "border-destructive")}
                                        value={d.qty}
                                        onChange={(e) => updateDraft(p.id, { qty: e.target.value })}
                                        inputMode="decimal"
                                        placeholder="0"
                                        title={sourceId ? `Maks. ${aDisplay}` : undefined}
                                      />
                                      {over && (
                                        <p className="text-[10px] text-destructive mt-0.5">
                                          Mavjuddan oshiq
                                        </p>
                                      )}
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <Input
                                        className="h-8"
                                        value={d.batch_no}
                                        onChange={(e) => updateDraft(p.id, { batch_no: e.target.value })}
                                      />
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <Input
                                        className="h-8"
                                        value={d.line_comment}
                                        onChange={(e) =>
                                          updateDraft(p.id, { line_comment: e.target.value })
                                        }
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
        </Card>
          </div>

          <aside className="order-2 lg:sticky lg:top-16 lg:self-start">
            <Card className="border-border/90 shadow-md ring-1 ring-border/40">
              <CardHeader className="border-b border-border/60 bg-muted/20 pb-3">
                <CardTitle className="text-base">Yakunlash</CardTitle>
                <p className="text-xs font-normal text-muted-foreground">
                  Izoh, reja va qisqa statistika — keyin saqlash.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="comment" className="text-xs text-muted-foreground">
                    Izoh <span className="font-normal opacity-80">(ixtiyoriy)</span>
                  </Label>
                  <textarea
                    id="comment"
                    className={cn(textareaClass, "min-h-[96px] resize-y")}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ko‘chirish bo‘yicha izoh…"
                    rows={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="planned" className="text-xs text-muted-foreground">
                    Reja sanasi <span className="font-normal opacity-80">(ixtiyoriy)</span>
                  </Label>
                  <Input
                    id="planned"
                    className="h-9"
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                  />
                </div>

                <div className="border-t border-border/60 pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Yig‘ma</p>
                  {!categoryId ? (
                    <p className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                      Kategoriya tanlang — statistika shu yerda chiqadi.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Kategoriya
                        </p>
                        <p className="mt-0.5 truncate text-sm font-semibold" title={selectedCategoryName ?? ""}>
                          {loadProducts ? "…" : (selectedCategoryName ?? "—")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Katalog
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {loadProducts ? "…" : summary.totalInCategory}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Qatorlar
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {loadProducts ? "—" : summary.linesWithQty}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Jami miqdor
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {loadProducts ? "—" : formatNumberGrouped(summary.sumQty, { maxFractionDigits: 3 })}
                        </p>
                      </div>
                      <div className="col-span-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Broni bor pozitsiyalar
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {loadProducts ? "—" : `${summary.withBron} ta`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {formError && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </p>
                )}

                <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Link
                    href="/stock/transfers"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-9 w-full justify-center sm:w-auto"
                    )}
                  >
                    Orqaga
                  </Link>
                  <Button
                    type="submit"
                    className="h-9 w-full sm:w-auto"
                    disabled={submitting || loadWh || (Boolean(sourceId) && loadStock)}
                  >
                    {submitting ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  );
}
