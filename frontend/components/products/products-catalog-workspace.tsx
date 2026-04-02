"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import type { ProductRow } from "@/lib/product-types";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { getUserFacingError } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/common/query-error-state";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CatalogInterchangeableTab } from "./catalog-interchangeable-tab";
import { CatalogSimpleTab } from "./catalog-simple-tab";
import { ProductQuickAddDialog } from "./product-quick-add-dialog";

const TABS = [
  { id: "items", label: "Товар" },
  { id: "product-groups", label: "Группа товаров" },
  { id: "interchangeable", label: "Группа взаимозаменяемых" },
  { id: "brands", label: "Бренд" },
  { id: "manufacturers", label: "Производитель" },
  { id: "segments", label: "Сегменты" }
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (c: string) => `"${c.replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");
  const blob = new Blob(["\ufeff", body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function retailPriceLabel(row: ProductRow): string {
  const p = row.prices?.find((x) => x.price_type === "retail");
  return p != null ? p.price : "—";
}

type ItemsProps = {
  tenantSlug: string | null;
  isAdmin: boolean;
  statusTab: "active" | "inactive";
  search: string;
  pageSize: number;
};

function ItemsTab({ tenantSlug, isAdmin, statusTab, search, pageSize }: ItemsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const productsBasePath = pathname.startsWith("/settings/products")
    ? "/settings/products"
    : "/products";
  const qc = useQueryClient();
  const priceFileRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [productGroupId, setProductGroupId] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const isActiveFilter = statusTab === "active" ? "true" : "false";

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "items-tab"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    }
  });

  const groupsQ = useQuery({
    queryKey: ["catalog-simple", "catalog/product-groups", tenantSlug, "items-filter"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", is_active: "true" });
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/catalog/product-groups?${params}`
      );
      return data.data;
    }
  });

  const listQ = useQuery({
    queryKey: [
      "products",
      tenantSlug,
      "workspace",
      search,
      page,
      pageSize,
      categoryId,
      productGroupId,
      isActiveFilter
    ],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        include_prices: "true",
        is_active: isActiveFilter
      });
      if (search.trim()) params.set("search", search.trim());
      if (categoryId) params.set("category_id", categoryId);
      if (productGroupId) params.set("product_group_id", productGroupId);
      const { data } = await api.get<{
        data: ProductRow[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/${tenantSlug}/products?${params}`);
      return data;
    }
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusTab, pageSize, categoryId, productGroupId]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/products/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
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
      setImportMsg(`Narxlar: ${res.upserted}`);
      await qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (priceFileRef.current) priceFileRef.current.value = "";
    },
    onError: () => setImportMsg("Narx import xatosi.")
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function exportExcel() {
    const headers = [
      "SKU",
      "Название",
      "Категория",
      "Группа",
      "Бренд",
      "Сегмент",
      "Ед.",
      "Chakana",
      "ИКПУ",
      "ТН ВЭД",
      "Активный"
    ];
    const dataRows = rows.map((r) => [
      r.sku,
      r.name,
      r.category?.name ?? "",
      r.product_group?.name ?? "",
      r.brand?.name ?? "",
      r.segment?.name ?? "",
      r.unit,
      retailPriceLabel(r),
      r.ikpu_code ?? "",
      r.hs_code ?? "",
      r.is_active ? "1" : "0"
    ]);
    downloadCsv("products.csv", headers, dataRows);
  }

  const inputCls =
    "flex h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Категория
          <select
            className={`${inputCls} min-w-[9rem]`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Все</option>
            {(categoriesQ.data ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Группа товаров
          <select
            className={`${inputCls} min-w-[9rem]`}
            value={productGroupId}
            onChange={(e) => setProductGroupId(e.target.value)}
          >
            <option value="">Все</option>
            {(groupsQ.data ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              <div className="relative">
                <div className="flex">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-r-none"
                    onClick={() => {
                      setQuickAddOpen(true);
                      setAddMenuOpen(false);
                    }}
                  >
                    Добавить
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-l-none border-l border-primary-foreground/30 px-2"
                    onClick={() => setAddMenuOpen((o) => !o)}
                    aria-expanded={addMenuOpen}
                    aria-label="Добавить меню"
                  >
                    ▾
                  </Button>
                </div>
                {addMenuOpen ? (
                  <div
                    className="absolute right-0 z-50 mt-1 min-w-[240px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setQuickAddOpen(true);
                        setAddMenuOpen(false);
                      }}
                    >
                      Добавить
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setAddMenuOpen(false);
                        router.push(`${productsBasePath}/bulk`);
                      }}
                    >
                      Bir nechta qo‘shish
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setAddMenuOpen(false);
                        router.push(`${productsBasePath}/excel`);
                      }}
                    >
                      Exceldan import
                    </button>
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => priceFileRef.current?.click()}
                disabled={priceImportMut.isPending}
              >
                Narx import
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={exportExcel}>
            Excel
          </Button>
        </div>
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

      {importMsg ? <p className="text-xs text-muted-foreground">{importMsg}</p> : null}

      <p className="text-xs text-muted-foreground">
        <Link href="/settings/product-categories" className="text-primary underline-offset-4 hover:underline">
          Категория продукта
        </Link>{" "}
        — иерархия; здесь «группа товаров» — отдельный справочник (вкладка).
      </p>

      {listQ.isError ? (
        <QueryErrorState
          message={getUserFacingError(listQ.error, "Mahsulotlar yuklanmadi.")}
          onRetry={() => void listQ.refetch()}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-2 py-2 font-medium">Название</th>
                <th className="px-2 py-2 font-medium">Категория</th>
                <th className="px-2 py-2 font-medium">Группа</th>
                <th className="px-2 py-2 font-medium">Ед.</th>
                <th className="px-2 py-2 font-medium">Сорт.</th>
                <th className="px-2 py-2 font-medium">Бренд</th>
                <th className="px-2 py-2 font-medium">Сегмент</th>
                <th className="px-2 py-2 font-medium">Код</th>
                <th className="px-2 py-2 font-medium">ИКПУ</th>
                <th className="px-2 py-2 font-medium">ТН ВЭД</th>
                <th className="px-2 py-2 font-medium text-right">Цена</th>
                <th className="px-2 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                    Yuklanmoqda…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                    Пусто
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.category?.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.product_group?.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{r.unit}</td>
                    <td className="px-2 py-1.5 text-xs">{r.sort_order ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.brand?.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.segment?.name ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.sku}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.ikpu_code ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.hs_code ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">
                      {retailPriceLabel(r)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {isAdmin ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/products/${r.id}/edit`)}
                          >
                            ✎
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (window.confirm(`«${r.name}» o‘chirilsinmi?`)) deleteMut.mutate(r.id);
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total ? `Показано ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}` : ""}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </Button>
          <span className="px-2 py-1">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      </div>

      <ProductQuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        tenantSlug={tenantSlug}
        onDone={() => void qc.invalidateQueries({ queryKey: ["products", tenantSlug] })}
      />
    </div>
  );
}

type WorkspaceProps = {
  /** Sozlamalar yon paneli (Категория продукта, …); PageHeader tashqarida bo‘lsa false */
  showSettingsNav?: boolean;
  hideOuterHeader?: boolean;
};

function ProductsCatalogWorkspaceInner({
  showSettingsNav = false,
  hideOuterHeader = false
}: WorkspaceProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin" || role === "operator";

  const tabRaw = searchParams.get("tab");
  const tab: TabId = isTabId(tabRaw) ? tabRaw : "items";

  const [statusTab, setStatusTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const pageSize = 10;

  function setTab(next: TabId) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", next);
    router.replace(`${pathname}?${p}`, { scroll: false });
  }

  const main = useMemo(() => {
    switch (tab) {
      case "items":
        return (
          <ItemsTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      case "product-groups":
        return (
          <CatalogSimpleTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            apiPath="catalog/product-groups"
            title="Справочник групп товаров"
            addLabel="Добавить"
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      case "interchangeable":
        return (
          <CatalogInterchangeableTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      case "brands":
        return (
          <CatalogSimpleTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            apiPath="catalog/brands"
            title="Бренды"
            addLabel="Добавить"
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      case "manufacturers":
        return (
          <CatalogSimpleTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            apiPath="catalog/manufacturers"
            title="Производители"
            addLabel="Добавить"
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      case "segments":
        return (
          <CatalogSimpleTab
            tenantSlug={tenantSlug}
            isAdmin={isAdmin}
            apiPath="catalog/segments"
            title="Сегменты"
            addLabel="Добавить"
            statusTab={statusTab}
            search={search}
            pageSize={pageSize}
          />
        );
      default:
        return null;
    }
  }, [tab, tenantSlug, isAdmin, statusTab, search, pageSize]);

  const headerBlock = hideOuterHeader ? null : (
    <PageHeader
      title="Продукты"
      description="Каталог и справочники. Категории: /settings/product-categories."
      actions={
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
          Boshqaruv
        </Link>
      }
    />
  );

  const shell = (
    <div className="space-y-4">
      {headerBlock}

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/80 pb-2">
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-xs",
            statusTab === "active" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
          )}
          onClick={() => setStatusTab("active")}
        >
          Активный
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-xs",
            statusTab === "inactive" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
          )}
          onClick={() => setStatusTab("inactive")}
        >
          Не активный
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Поиск"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
            void qc.invalidateQueries({ queryKey: ["catalog-simple"] });
            void qc.invalidateQueries({ queryKey: ["catalog-interchangeable", tenantSlug] });
          }}
        >
          Обновить
        </Button>
      </div>

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">Tenant yo‘q</p>
      ) : (
        main
      )}
    </div>
  );

  if (showSettingsNav) {
    return <SettingsWorkspace>{shell}</SettingsWorkspace>;
  }
  return shell;
}

export function ProductsCatalogWorkspace(props: WorkspaceProps) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}>
      <ProductsCatalogWorkspaceInner {...props} />
    </Suspense>
  );
}
