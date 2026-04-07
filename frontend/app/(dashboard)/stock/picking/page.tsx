"use client";

import type { OrderListRow } from "@/components/orders/order-detail-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatIntGrouped, formatNumberGrouped } from "@/lib/format-numbers";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw, ScanBarcode, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WarehouseOpt = { id: number; name: string };

type PickingAggRow = {
  product_id: number;
  sku: string;
  name: string;
  unit: string | null;
  barcode: string | null;
  total_qty: string;
  order_count: number;
};

function aggRowMatchesScan(r: PickingAggRow, code: string): boolean {
  const t = code.trim().toLowerCase();
  if (!t) return true;
  if (r.sku.toLowerCase() === t) return true;
  const bc = r.barcode?.trim();
  if (bc && bc.toLowerCase() === t) return true;
  if (r.sku.toLowerCase().includes(t)) return true;
  if (r.name.toLowerCase().includes(t)) return true;
  if (bc?.toLowerCase().includes(t)) return true;
  return false;
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

export default function StockPickingPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [scanLine, setScanLine] = useState("");
  const [scanFilter, setScanFilter] = useState("");
  const limit = 25;

  useEffect(() => {
    document.documentElement.setAttribute("data-print-picking", "1");
    return () => document.documentElement.removeAttribute("data-print-picking");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, warehouseId]);

  const whQ = useQuery({
    queryKey: ["warehouses", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    queryFn: async () => {
      const { data } = await api.get<{ data: WarehouseOpt[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data ?? [];
    }
  });

  const ordersQ = useQuery({
    queryKey: ["orders-picking", tenantSlug, page, limit, debounced, warehouseId],
    enabled: Boolean(tenantSlug) && hydrated,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "picking",
        page: String(page),
        limit: String(limit)
      });
      if (debounced) params.set("q", debounced);
      if (warehouseId) params.set("warehouse_id", warehouseId);
      const { data } = await api.get<{
        data: OrderListRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/${tenantSlug}/orders?${params.toString()}`);
      return data;
    }
  });

  const aggregateQ = useQuery({
    queryKey: ["stock-picking-aggregate", tenantSlug, debounced, warehouseId],
    enabled: Boolean(tenantSlug) && hydrated,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      if (warehouseId) params.set("warehouse_id", warehouseId);
      const qs = params.toString();
      const { data } = await api.get<{ data: PickingAggRow[] }>(
        `/api/${tenantSlug}/stock/picking-aggregate${qs ? `?${qs}` : ""}`
      );
      return data.data ?? [];
    }
  });

  function refetchAll() {
    void ordersQ.refetch();
    void aggregateQ.refetch();
  }

  const aggAll = aggregateQ.data ?? [];
  const aggFiltered = useMemo(
    () => (scanFilter.trim() ? aggAll.filter((r) => aggRowMatchesScan(r, scanFilter)) : aggAll),
    [aggAll, scanFilter]
  );

  useEffect(() => {
    if (!scanFilter.trim() || aggFiltered.length !== 1) return;
    const id = aggFiltered[0]!.product_id;
    requestAnimationFrame(() => {
      document.getElementById(`picking-agg-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [scanFilter, aggFiltered]);

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Kirish kerak.</p>
      </PageShell>
    );
  }

  const rows = ordersQ.data?.data ?? [];
  const total = ordersQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <PageShell>
      <PageHeader
        title="Komplektatsiya (picking)"
        description={`Zakazlar holati «${ORDER_STATUS_LABELS.picking ?? "picking"}». Pastda zakazlar ro‘yxati va SKU bo‘yicha jamlanma (barcha picking zakazlaridan bonussiz qatorlar).`}
      />

      <div className="no-print-picking mb-4 flex flex-wrap items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock">
          ← Ombor
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/orders?status=picking">
          Barcha filtrlarda (Заявки)
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => window.print()}
        >
          <Printer className="size-4" aria-hidden />
          Chop etish
        </Button>
      </div>

      <p className="text-muted-foreground hidden text-xs print:block">
        Komplektatsiya — {tenantSlug} — {new Date().toLocaleString("ru-RU")}
      </p>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[12rem] flex-1 space-y-2">
              <Label htmlFor="picking-wh">Ombor</Label>
              <select
                id="picking-wh"
                className="border-input bg-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">Barcha</option>
                {(whQ.data ?? []).map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative min-w-[12rem] flex-[2]">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="Zakaz yoki mahsulot (SKU, nom)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Qidiruv"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="no-print-picking h-10 w-10 shrink-0"
              title="Yangilash"
              disabled={ordersQ.isFetching || aggregateQ.isFetching}
              onClick={() => refetchAll()}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  (ordersQ.isFetching || aggregateQ.isFetching) && "animate-spin"
                )}
              />
            </Button>
          </div>

          <div className="text-muted-foreground text-sm">
            Jami:{" "}
            <span className="text-foreground font-medium tabular-nums">{formatIntGrouped(total)}</span> ta zakaz
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-2 font-medium">Raqam</th>
                  <th className="px-3 py-2 font-medium">Mijoz</th>
                  <th className="px-3 py-2 font-medium">Ombor</th>
                  <th className="px-3 py-2 font-medium text-right">Miqdor</th>
                  <th className="px-3 py-2 font-medium text-right">Summa</th>
                  <th className="px-3 py-2 font-medium">Sana</th>
                  <th className="px-3 py-2 font-medium">Keyingi holat</th>
                  <th className="px-3 py-2 font-medium text-right">Amal</th>
                </tr>
              </thead>
              <tbody>
                {ordersQ.isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-muted-foreground px-3 py-8 text-center">
                      Загрузка…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-muted-foreground px-3 py-8 text-center">
                      «Picking» holatida zakaz yo‘q yoki filtrga mos kelmaydi.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.number}</td>
                      <td className="max-w-[200px] truncate px-3 py-2">{r.client_name}</td>
                      <td className="text-muted-foreground max-w-[140px] truncate px-3 py-2">
                        {r.warehouse_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumberGrouped(r.qty, { minFractionDigits: 0, maxFractionDigits: 6 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumberGrouped(r.total_sum, { minFractionDigits: 2, maxFractionDigits: 2 })}
                      </td>
                      <td className="text-muted-foreground whitespace-nowrap px-3 py-2 text-xs">
                        {formatDt(r.created_at)}
                      </td>
                      <td className="text-muted-foreground max-w-[180px] px-3 py-2 text-xs">
                        {(r.allowed_next_statuses ?? [])
                          .map((s) => ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS] ?? s)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/orders/${r.id}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "no-print-picking"
                          )}
                        >
                          Ochish
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="no-print-picking flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs tabular-nums">
                Sahifa {formatIntGrouped(page)} / {formatIntGrouped(pages)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Oldingi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Keyingi
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 mt-6 shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">SKU bo‘yicha jamlanma</h2>
            <p className="text-muted-foreground text-xs">
              {aggregateQ.isLoading
                ? "Загрузка…"
                : `${formatIntGrouped(aggFiltered.length)}${scanFilter.trim() ? ` / ${formatIntGrouped(aggAll.length)}` : ""} mahsulot`}
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            Yuqoridagi ombor va qidiruv shu jadvalga ham qo‘llanadi. Bonus qatorlar hisobga olinmaydi.
          </p>

          <div className="no-print-picking flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="relative min-w-[12rem] flex-1 space-y-2">
              <Label htmlFor="picking-scan" className="flex items-center gap-1.5">
                <ScanBarcode className="size-3.5" aria-hidden />
                Shtrix / SKU (skaner)
              </Label>
              <Input
                id="picking-scan"
                className="font-mono"
                placeholder="Skaner yoki yozib Enter"
                value={scanLine}
                autoComplete="off"
                onChange={(e) => setScanLine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = scanLine.trim();
                  setScanFilter(v);
                  setScanLine("");
                  if (v) {
                    requestAnimationFrame(() =>
                      (document.getElementById("picking-scan") as HTMLInputElement | null)?.focus()
                    );
                  }
                }}
              />
            </div>
            {scanFilter.trim() ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setScanFilter("")}>
                Skaner filtrini tozalash («{scanFilter}»)
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Shtrix</th>
                  <th className="px-3 py-2 font-medium">Nomi</th>
                  <th className="px-3 py-2 font-medium">Birlik</th>
                  <th className="px-3 py-2 font-medium text-right">Jami miqdor</th>
                  <th className="px-3 py-2 font-medium text-right">Zakazlar soni</th>
                </tr>
              </thead>
              <tbody>
                {aggregateQ.isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                      Загрузка…
                    </td>
                  </tr>
                ) : aggAll.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                      Picking zakazlarida bonussiz qator yo‘q yoki filtrga mos kelmaydi.
                    </td>
                  </tr>
                ) : aggFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                      Skaner filtriga mos qator yo‘q.
                    </td>
                  </tr>
                ) : (
                  aggFiltered.map((r) => (
                    <tr
                      key={r.product_id}
                      id={`picking-agg-${r.product_id}`}
                      className="border-b border-border/60 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                        {r.barcode?.trim() || "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2">{r.name}</td>
                      <td className="text-muted-foreground px-3 py-2">{r.unit?.trim() || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumberGrouped(r.total_qty, { minFractionDigits: 0, maxFractionDigits: 6 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatIntGrouped(r.order_count)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
