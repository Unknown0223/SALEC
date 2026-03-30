"use client";

import { ClientEditDialog } from "@/components/clients/client-edit-dialog";
import { ClientsDataTable } from "@/components/clients/clients-data-table";
import { ClientsTableToolbar } from "@/components/clients/clients-table-toolbar";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/client-types";
import { getDefaultColumnVisibility, loadColumnVisibility } from "@/lib/client-table-columns";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type ClientsResponse = {
  data: ClientRow[];
  total: number;
  page: number;
  limit: number;
};

export default function ClientsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortField, setSortField] = useState<"name" | "phone" | "id" | "created_at" | "region">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pageLimit, setPageLimit] = useState(30);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(getDefaultColumnVisibility);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  useEffect(() => {
    setColumnVisibility(loadColumnVisibility());
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "clients",
      tenantSlug,
      page,
      search,
      activeFilter,
      categoryFilter,
      sortField,
      sortOrder,
      pageLimit
    ],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageLimit),
        sort: sortField,
        order: sortOrder
      });
      if (search.trim()) params.set("search", search.trim());
      if (activeFilter !== "all") params.set("is_active", activeFilter);
      if (categoryFilter.trim()) params.set("category", categoryFilter.trim());
      const { data: body } = await api.get<ClientsResponse>(
        `/api/${tenantSlug}/clients?${params.toString()}`
      );
      return body;
    }
  });

  const rows = data?.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Klientlar"
        description={tenantSlug ? `Tenant: ${tenantSlug}` : "Ro‘yxat, filtr va ustunlar"}
        actions={
          <>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
              Boshqaruv
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/clients/duplicates">
              Dublikatlar
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/products">
              Mahsulotlar
            </Link>
          </>
        }
      />

      <ClientsTableToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        activeFilter={activeFilter}
        onActiveFilterChange={(v) => {
          setActiveFilter(v);
          setPage(1);
        }}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={(v) => {
          setCategoryFilter(v);
          setPage(1);
        }}
        sortField={sortField}
        onSortFieldChange={(v) => {
          setSortField(v);
          setPage(1);
        }}
        sortOrder={sortOrder}
        onSortOrderChange={(v) => {
          setSortOrder(v);
          setPage(1);
        }}
        pageLimit={pageLimit}
        onPageLimitChange={(v) => {
          setPageLimit(v);
          setPage(1);
        }}
        filtersVisible={filtersVisible}
        onFiltersVisibleChange={setFiltersVisible}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />

      {data ? (
        <p className="text-sm text-muted-foreground">
          Jami: <span className="font-medium text-foreground">{data.total}</span>
        </p>
      ) : null}

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "API xatosi"}
        </p>
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <ClientsDataTable
              rows={rows}
              visibility={columnVisibility}
              onEdit={(row) => {
                setEditing(row);
                setEditOpen(true);
              }}
            />
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
            onClick={() => setPage((p) => p - 1)}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Keyingi
          </Button>
        </div>
      ) : null}

      <ClientEditDialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditing(null);
        }}
        tenantSlug={tenantSlug}
        client={editing}
      />
    </PageShell>
  );
}
