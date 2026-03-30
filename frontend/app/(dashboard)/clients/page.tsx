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
import { CLIENT_IMPORT_MAX_FILE_BYTES } from "@/lib/client-import-limits";
import { api } from "@/lib/api";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ClientsResponse = {
  data: ClientRow[];
  total: number;
  page: number;
  limit: number;
};

export default function ClientsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
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

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{ created: number; errors: string[] }>(
        `/api/${tenantSlug}/clients/import`,
        fd
      );
      return data;
    },
    onSuccess: async (data) => {
      console.info("[clients import] natija", { created: data.created, errors: data.errors });
      if (data.errors.length > 0) {
        console.warn("[clients import] qator xatolari", data.errors);
      }
      await qc.invalidateQueries({ queryKey: ["clients", tenantSlug] });
      const errPart =
        data.errors.length > 0 ? ` Xatolar (${data.errors.length}): ${data.errors.slice(0, 5).join("; ")}` : "";
      setImportMsg(`Qo‘shildi: ${data.created}.${errPart}`);
      if (importFileRef.current) importFileRef.current.value = "";
    },
    onError: (e: unknown) => {
      console.error("[clients import] xato", e);
      if (isAxiosError(e)) {
        const st = e.response?.status;
        const data = e.response?.data as
          | { error?: string; message?: string; maxBytes?: number }
          | undefined;
        console.error("[clients import] javob", { status: st, data });
        if (st === 413) {
          const mb = data?.maxBytes ? Math.round(data.maxBytes / (1024 * 1024)) : 50;
          setImportMsg(
            data?.message ??
              `Fayl juda katta (server cheklovi ~${mb} MB). Faylni qisqartiring yoki backend .env da MULTIPART_MAX_FILE_BYTES ni oshiring.`
          );
          return;
        }
        if (st === 403) {
          setImportMsg("Ruxsat yo‘q (faqat admin yoki operator).");
          return;
        }
        if (data?.message) {
          setImportMsg(data.message);
          return;
        }
      }
      setImportMsg(
        "Import xatosi: .xlsx, 1-varaq, 1-qator sarlavha (name / nomi / RU: imya). Konsol: F12."
      );
    }
  });

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!tenantSlug}
          onClick={async () => {
            if (!tenantSlug) return;
            setImportMsg(null);
            try {
              const res = await api.get(`/api/${tenantSlug}/clients/import/template`, {
                responseType: "blob"
              });
              const blob = new Blob([res.data], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "mijozlar_import_shablon.xlsx";
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              setImportMsg("Shablonni yuklab bo‘lmadi (ruxsat yoki tarmoq).");
            }
          }}
        >
          Shablon (.xlsx)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={importMut.isPending || !tenantSlug}
          onClick={() => importFileRef.current?.click()}
        >
          Excel import
        </Button>
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > CLIENT_IMPORT_MAX_FILE_BYTES) {
              const mb = Math.round(CLIENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024));
              console.error("[clients import] fayl juda katta", {
                name: f.name,
                bytes: f.size,
                limit: CLIENT_IMPORT_MAX_FILE_BYTES
              });
              setImportMsg(
                `Fayl ${mb} MB dan katta (${(f.size / (1024 * 1024)).toFixed(1)} MB). Qisqartiring yoki backend .env: MULTIPART_MAX_FILE_BYTES.`
              );
              e.target.value = "";
              return;
            }
            console.info("[clients import] yuklanmoqda", { name: f.name, bytes: f.size });
            importMut.mutate(f);
          }}
        />
        {importMsg ? <span className="text-sm text-muted-foreground">{importMsg}</span> : null}
      </div>

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
