"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PriceTypeEntry = {
  id: string;
  name: string;
  code: string | null;
  kind?: "sale" | "purchase";
  sort_order: number | null;
  active: boolean;
};

type TenantProfile = {
  references?: { price_type_entries?: PriceTypeEntry[] };
};

type ProductPrice = { price_type: string; price: string; currency: string };
type ProductRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  category: { id: number; name: string } | null;
  prices?: ProductPrice[];
};

function priceKeyFromEntry(e: PriceTypeEntry): string {
  return (e.code?.trim() || e.name.trim()) || e.name;
}

function sortPriceCols(list: PriceTypeEntry[]): PriceTypeEntry[] {
  return [...list].sort((a, b) => {
    const ao = a.sort_order ?? 1e6;
    const bo = b.sort_order ?? 1e6;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, "uz");
  });
}

export default function PriceListPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const limit = 50;

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "price-list"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const priceColumns = useMemo(() => {
    const raw = profileQ.data?.references?.price_type_entries ?? [];
    return sortPriceCols(raw.filter((e) => e.active !== false));
  }, [profileQ.data]);

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "price-list", page, limit, debounced],
    enabled: Boolean(tenantSlug) && profileQ.isSuccess,
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("include_prices", "true");
      if (debounced.trim()) params.set("search", debounced.trim());
      const { data } = await api.get<{ data: ProductRow[]; total: number }>(
        `/api/${tenantSlug}/products?${params.toString()}`
      );
      return data;
    }
  });

  const rows = productsQ.data?.data ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const priceMapByProduct = useMemo(() => {
    const m = new Map<number, Map<string, ProductPrice>>();
    for (const p of rows) {
      const inner = new Map<string, ProductPrice>();
      for (const pr of p.prices ?? []) {
        inner.set(pr.price_type.trim(), pr);
      }
      m.set(p.id, inner);
    }
    return m;
  }, [rows]);

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Прайс-лист"
        description="Mahsulotlar va profildagi narx turlari ustunlari (product_prices)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/prices" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              ← Цена
            </Link>
            <Link href="/settings/prices/matrix" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              Narx matritsasi
            </Link>
            <Link href="/settings/price-types" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Narx turlari
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="SKU yoki nom bo‘yicha qidiruv…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setDebounced(search.trim());
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Jami:{" "}
            <span className="font-medium text-foreground">{formatNumberGrouped(total, { maxFractionDigits: 0 })}</span>{" "}
            ta mahsulot
          </p>
        </div>

        {profileQ.isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/15">
            <p className="text-sm text-muted-foreground">Profil Загрузка…</p>
          </div>
        ) : priceColumns.length === 0 ? (
          <div className="flex min-h-[min(50vh,400px)] flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-6 py-12 text-center">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Faol narx turi yo‘q.{" "}
              <Link href="/settings/price-types" className="underline">
                Narx turlarini
              </Link>{" "}
              sozlang.
            </p>
          </div>
        ) : productsQ.isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/15">
            <p className="text-sm text-muted-foreground">Mahsulotlar Загрузка…</p>
          </div>
        ) : productsQ.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
            Yuklashda xato.{" "}
            <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => productsQ.refetch()}>
              Qayta
            </Button>
          </div>
        ) : total === 0 ? (
          <div className="flex min-h-[min(50vh,400px)] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/25 px-6 py-16 text-center">
            <Package className="mb-4 size-10 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold tracking-tight">Ma&apos;lumot yo&apos;q</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Mahsulot qo‘shing yoki import qiling.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/settings/products/excel" className={cn(buttonVariants({ size: "sm" }))}>
                Excel import
              </Link>
              <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Mahsulotlar
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-max min-w-full border-collapse text-sm">
                <thead className="app-table-thead">
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-3 py-2 font-medium">SKU</th>
                    <th className="min-w-[12rem] px-3 py-2 font-medium">Nomi</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Birlik</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Kategoriya</th>
                    {priceColumns.map((col) => (
                      <th
                        key={col.id}
                        className="whitespace-nowrap px-3 py-2 text-right font-medium"
                        title={priceKeyFromEntry(col)}
                      >
                        <div className="max-w-[9rem] truncate">{col.name}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">{priceKeyFromEntry(col)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const pmap = priceMapByProduct.get(p.id) ?? new Map();
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.sku}</td>
                        <td className="min-w-[12rem] px-3 py-2">{p.name}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.unit}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {p.category?.name ?? "—"}
                        </td>
                        {priceColumns.map((col) => {
                          const key = priceKeyFromEntry(col);
                          const cell = pmap.get(key);
                          const num = cell ? Number.parseFloat(cell.price) : NaN;
                          return (
                            <td key={col.id} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {cell && Number.isFinite(num) ? (
                                <>
                                  {formatNumberGrouped(num, { maxFractionDigits: 0 })}
                                  <span className="ml-1 text-[10px] text-muted-foreground">{cell.currency}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sahifa {page} / {totalPages} · {limit} ta/sahifa
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || productsQ.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || productsQ.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SettingsWorkspace>
    </PageShell>
  );
}
