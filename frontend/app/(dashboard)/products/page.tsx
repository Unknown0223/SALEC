"use client";

import type { ProductRow } from "@/lib/product-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";

function parseProductsUrl(searchParams: URLSearchParams): {
  categoryId: string;
  page: number;
} {
  const raw = searchParams.get("category_id")?.trim() ?? "";
  const categoryId = /^\d+$/.test(raw) ? raw : "";
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { categoryId, page };
}

type ProductsResponse = {
  data: ProductRow[];
  total: number;
  page: number;
  limit: number;
};

function retailPriceLabel(row: ProductRow): string {
  const p = row.prices?.find((x) => x.price_type === "retail");
  return p != null ? p.price : "—";
}

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { categoryId: categoryIdFromUrl, page } = useMemo(
    () => parseProductsUrl(searchParams),
    [searchParams]
  );

  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const priceFileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function replaceProductsQuery(patch: { categoryId?: string; page?: number }) {
    const p = new URLSearchParams(searchParams.toString());
    const nextCat = patch.categoryId !== undefined ? patch.categoryId : categoryIdFromUrl;
    const nextPage = patch.page !== undefined ? patch.page : page;
    if (nextCat) p.set("category_id", nextCat);
    else p.delete("category_id");
    if (nextPage > 1) p.set("page", String(nextPage));
    else p.delete("page");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const categoryNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["products", tenantSlug, search, page, categoryIdFromUrl],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        include_prices: "true"
      });
      if (search.trim()) params.set("search", search.trim());
      if (categoryIdFromUrl) params.set("category_id", categoryIdFromUrl);
      const { data: body } = await api.get<ProductsResponse>(
        `/api/${tenantSlug}/products?${params.toString()}`
      );
      return body;
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/products/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
    }
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const { data: body } = await api.post<{
        created: number;
        updated: number;
        errors: string[];
      }>(`/api/${tenantSlug}/products/import`, fd);
      return body;
    },
    onSuccess: async (res) => {
      setImportMsg(
        `Yaratildi: ${res.created}, yangilandi: ${res.updated}. ${res.errors.length ? `Xatolar: ${res.errors.slice(0, 3).join("; ")}` : ""}`
      );
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { status?: number } };
      if (ax.response?.status === 403) {
        setImportMsg("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      setImportMsg("Import xatosi — fayl .xlsx bo‘lsin, 1-varaqda SKU va nomi ustunlari bo‘lsin.");
    }
  });

  const priceImportMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const { data: body } = await api.post<{ upserted: number; errors: string[] }>(
        `/api/${tenantSlug}/products/prices/import`,
        fd
      );
      return body;
    },
    onSuccess: async (res) => {
      setImportMsg(
        `Narxlar: yangilandi ${res.upserted}. ${res.errors.length ? `Xatolar: ${res.errors.slice(0, 3).join("; ")}` : ""}`
      );
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (priceFileRef.current) priceFileRef.current.value = "";
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { status?: number } };
      if (ax.response?.status === 403) {
        setImportMsg("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      setImportMsg("Narx import — .xlsx, 1-varaq: SKU va narx (price); ixtiyoriy narx turi (price_type).");
    }
  });

  function openCreate() {
    const qs = categoryIdFromUrl ? `?category_id=${encodeURIComponent(categoryIdFromUrl)}` : "";
    router.push(`/products/new${qs}`);
  }

  function openEdit(row: ProductRow) {
    router.push(`/products/${row.id}/edit`);
  }

  function confirmDelete(row: ProductRow) {
    if (!window.confirm(`“${row.name}” ni o‘chirish (soft)?`)) return;
    deleteMut.mutate(row.id);
  }

  const rows = data?.data ?? [];

  const inputCls =
    "flex h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <PageShell>
      <PageHeader
        title="Mahsulotlar"
        description={tenantSlug ? `Tenant: ${tenantSlug}` : "SKU, narxlar va import"}
        actions={
          <>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
              Boshqaruv
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/clients">
              Klientlar
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          placeholder="Qidiruv (nom, SKU)…"
          className={`${inputCls} max-w-md flex-1 sm:flex-none`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            replaceProductsQuery({ page: 1 });
          }}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Kategoriya
          <select
            className="h-10 min-w-[10rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            value={categoryIdFromUrl}
            onChange={(e) => replaceProductsQuery({ categoryId: e.target.value, page: 1 })}
          >
            <option value="">Barcha</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={openCreate}>
            Yangi mahsulot
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending || !tenantSlug}
          >
            Excel import
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => priceFileRef.current?.click()}
            disabled={priceImportMut.isPending || !tenantSlug}
          >
            Narxlar import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMut.mutate(f);
            }}
          />
          <input
            ref={priceFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) priceImportMut.mutate(f);
            }}
          />
        </div>
        {data ? (
          <span className="text-sm text-muted-foreground">
            Jami: <span className="font-medium text-foreground">{data.total}</span>
          </span>
        ) : null}
      </div>

      {importMsg ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {importMsg}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Mahsulot Excel: 1-qator — <strong>sku</strong> va <strong>nomi</strong> majburiy; ixtiyoriy <strong>birlik</strong>,{" "}
        <strong>barcode</strong>. Narxlar Excel: <strong>sku</strong> + <strong>price</strong> (narxi); ixtiyoriy{" "}
        <strong>price_type</strong> (default <code className="text-foreground">retail</code>).
      </p>

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          Diler (tenant) topilmadi.{" "}
          <Link className="underline underline-offset-4" href="/login">
            Qayta kiring
          </Link>
          .
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <QueryErrorState
          message={getUserFacingError(error, "Mahsulotlarni yuklab bo'lmadi.")}
          onRetry={() => void refetch()}
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b bg-muted/60">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Nomi</th>
                <th className="px-3 py-2 font-medium">Kategoriya</th>
                <th className="px-3 py-2 font-medium">Birlik</th>
                <th className="px-3 py-2 font-medium text-right">Chakana</th>
                <th className="px-3 py-2 font-medium">Holat</th>
                <th className="px-3 py-2 font-medium text-right w-40">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Mahsulot topilmadi
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {row.category_id != null
                        ? categoryNameById.get(row.category_id) ?? `#${row.category_id}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{retailPriceLabel(row)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.is_active ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                        }
                      >
                        {row.is_active ? "Faol" : "O‘chirilgan"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                          Tahrir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deleteMut.isPending}
                          onClick={() => confirmDelete(row)}
                        >
                          O‘chir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.total > data.limit ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => replaceProductsQuery({ page: Math.max(1, page - 1) })}
          >
            Oldingi
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(data.total / data.limit) || 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * data.limit >= data.total}
            onClick={() => replaceProductsQuery({ page: page + 1 })}
          >
            Keyingi
          </Button>
        </div>
      ) : null}

    </PageShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
