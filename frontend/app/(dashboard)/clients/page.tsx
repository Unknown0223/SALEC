"use client";

import { ClientsDataTable } from "@/components/clients/clients-data-table";
import { ClientsTableToolbar } from "@/components/clients/clients-table-toolbar";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/client-types";
import {
  CLIENT_TABLE_COLUMNS,
  CLIENT_TABLE_PREF_COLUMN_IDS,
  getDefaultColumnVisibility,
  getDefaultHiddenClientColumnIds,
  loadColumnVisibility
} from "@/lib/client-table-columns";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { CLIENT_IMPORT_MAX_FILE_BYTES } from "@/lib/client-import-limits";
import { downloadClientsCsvPage } from "@/lib/clients-csv-export";
import { api } from "@/lib/api";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ClientsResponse = {
  data: ClientRow[];
  total: number;
  page: number;
  limit: number;
};

type ClientReferencesResponse = {
  categories: string[];
  client_type_codes: string[];
  regions: string[];
  districts: string[];
  neighborhoods: string[];
  zones: string[];
  client_formats: string[];
  sales_channels: string[];
  product_category_refs: string[];
  logistics_services: string[];
};

type FilterBundle = {
  search: string;
  activeFilter: "all" | "true" | "false";
  categoryFilter: string;
  regionFilter: string;
  districtFilter: string;
  neighborhoodFilter: string;
  zoneFilter: string;
  clientTypeFilter: string;
  clientFormatFilter: string;
  salesChannelFilter: string;
  agentFilter: string;
  expeditorFilter: string;
  supervisorFilter: string;
  visitWeekdayFilter: string;
  innFilter: string;
  phoneFilter: string;
  createdFromFilter: string;
  createdToFilter: string;
  sortField: "name" | "phone" | "id" | "created_at" | "region";
  sortOrder: "asc" | "desc";
};

function appendClientsFilterParams(params: URLSearchParams, p: FilterBundle) {
  if (p.search.trim()) params.set("search", p.search.trim());
  if (p.activeFilter !== "all") params.set("is_active", p.activeFilter);
  if (p.categoryFilter.trim()) params.set("category", p.categoryFilter.trim());
  if (p.regionFilter.trim()) params.set("region", p.regionFilter.trim());
  if (p.districtFilter.trim()) params.set("district", p.districtFilter.trim());
  if (p.neighborhoodFilter.trim()) params.set("neighborhood", p.neighborhoodFilter.trim());
  if (p.zoneFilter.trim()) params.set("zone", p.zoneFilter.trim());
  if (p.clientTypeFilter.trim()) params.set("client_type_code", p.clientTypeFilter.trim());
  if (p.clientFormatFilter.trim()) params.set("client_format", p.clientFormatFilter.trim());
  if (p.salesChannelFilter.trim()) params.set("sales_channel", p.salesChannelFilter.trim());
  if (p.agentFilter.trim()) params.set("agent_id", p.agentFilter.trim());
  if (p.expeditorFilter.trim()) params.set("expeditor_user_id", p.expeditorFilter.trim());
  if (p.supervisorFilter.trim()) params.set("supervisor_user_id", p.supervisorFilter.trim());
  if (p.visitWeekdayFilter.trim()) params.set("visit_weekday", p.visitWeekdayFilter.trim());
  if (p.innFilter.trim()) params.set("inn", p.innFilter.trim());
  if (p.phoneFilter.trim()) params.set("phone", p.phoneFilter.trim());
  if (p.createdFromFilter.trim()) params.set("created_from", p.createdFromFilter.trim());
  if (p.createdToFilter.trim()) params.set("created_to", p.createdToFilter.trim());
  params.set("sort", p.sortField);
  params.set("order", p.sortOrder);
}

const CLIENTS_LIST_TABLE_ID = "clients.list.v1";
const CLIENTS_DEFAULT_HIDDEN_COLUMN_IDS = getDefaultHiddenClientColumnIds();
const CLIENT_MANAGEABLE_COLUMNS = CLIENT_TABLE_COLUMNS.filter((c) => c.id !== "_actions");

export default function ClientsPage() {
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const canCatalog = role === "admin" || role === "operator";
  const qc = useQueryClient();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState("");
  const [clientFormatFilter, setClientFormatFilter] = useState("");
  const [salesChannelFilter, setSalesChannelFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [expeditorFilter, setExpeditorFilter] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("");
  const [visitWeekdayFilter, setVisitWeekdayFilter] = useState("");
  const [innFilter, setInnFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [createdFromFilter, setCreatedFromFilter] = useState("");
  const [createdToFilter, setCreatedToFilter] = useState("");
  const [sortField, setSortField] = useState<"name" | "phone" | "id" | "created_at" | "region">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const clientsPrefsMigrated = useRef(false);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: CLIENTS_LIST_TABLE_ID,
    defaultColumnOrder: CLIENT_TABLE_PREF_COLUMN_IDS,
    defaultPageSize: 30,
    allowedPageSizes: [10, 20, 30, 50, 100],
    defaultHiddenColumnIds: CLIENTS_DEFAULT_HIDDEN_COLUMN_IDS
  });
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantSlug || clientsPrefsMigrated.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ data: { tables?: Record<string, unknown> } }>(
          `/api/${tenantSlug}/me/ui-preferences`
        );
        if (cancelled) return;
        if (data.data.tables?.[CLIENTS_LIST_TABLE_ID]) {
          clientsPrefsMigrated.current = true;
          return;
        }
        const ls = loadColumnVisibility();
        const hidden = CLIENT_TABLE_PREF_COLUMN_IDS.filter((id) => !ls[id]);
        await api.patch(`/api/${tenantSlug}/me/ui-preferences`, {
          tables: {
            [CLIENTS_LIST_TABLE_ID]: {
              columnOrder: [...CLIENT_TABLE_PREF_COLUMN_IDS],
              hiddenColumnIds: hidden,
              pageSize: 30
            }
          }
        });
        clientsPrefsMigrated.current = true;
        await qc.invalidateQueries({ queryKey: ["me", "ui-preferences", tenantSlug] });
      } catch {
        clientsPrefsMigrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, qc]);

  const filterBundle: FilterBundle = {
    search,
    activeFilter,
    categoryFilter,
    regionFilter,
    districtFilter,
    neighborhoodFilter,
    zoneFilter,
    clientTypeFilter,
    clientFormatFilter,
    salesChannelFilter,
    agentFilter,
    expeditorFilter,
    supervisorFilter,
    visitWeekdayFilter,
    innFilter,
    phoneFilter,
    createdFromFilter,
    createdToFilter,
    sortField,
    sortOrder
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    tenantSlug,
    search,
    activeFilter,
    categoryFilter,
    regionFilter,
    districtFilter,
    neighborhoodFilter,
    zoneFilter,
    clientTypeFilter,
    clientFormatFilter,
    salesChannelFilter,
    agentFilter,
    expeditorFilter,
    supervisorFilter,
    visitWeekdayFilter,
    innFilter,
    phoneFilter,
    createdFromFilter,
    createdToFilter,
    sortField,
    sortOrder,
    tablePrefs.pageSize
  ]);

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

  const bulkMut = useMutation({
    mutationFn: async (payload: { client_ids: number[]; is_active: boolean }) => {
      const slug = tenantSlug;
      if (!slug) throw new Error("TenantRequired");
      const { data: body } = await api.patch<{ updated: number }>(
        `/api/${slug}/clients/bulk-active`,
        payload
      );
      return body;
    },
    onSuccess: (body) => {
      setBulkMsg(`Yangilandi: ${body.updated} ta`);
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["clients", tenantSlug] });
    },
    onError: (e: unknown) => {
      if (isAxiosError(e) && e.response?.status === 403) {
        setBulkMsg("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      setBulkMsg("Guruh yangilashi muvaffaqiyatsiz.");
    }
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "clients",
      tenantSlug,
      page,
      search,
      activeFilter,
      categoryFilter,
      regionFilter,
      districtFilter,
      neighborhoodFilter,
      zoneFilter,
      clientTypeFilter,
      clientFormatFilter,
      salesChannelFilter,
      agentFilter,
      expeditorFilter,
      supervisorFilter,
      visitWeekdayFilter,
      innFilter,
      phoneFilter,
      createdFromFilter,
      createdToFilter,
      sortField,
      sortOrder,
      tablePrefs.pageSize
    ],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(tablePrefs.pageSize)
      });
      appendClientsFilterParams(params, filterBundle);
      const { data: body } = await api.get<ClientsResponse>(
        `/api/${tenantSlug}/clients?${params.toString()}`
      );
      return body;
    }
  });

  const refsQ = useQuery({
    queryKey: ["clients-references", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<ClientReferencesResponse>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const agentsFilterQ = useQuery({
    queryKey: ["agents", tenantSlug, "clients-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/agents`);
      return data.data
        .filter((r) => r.is_active)
        .map((r) => ({ id: r.id, name: r.fio, login: r.login }));
    }
  });

  const expeditorsFilterQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "clients-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/expeditors`);
      return data.data
        .filter((r) => r.is_active)
        .map((r) => ({ id: r.id, name: r.fio, login: r.login }));
    }
  });

  const supervisorsFilterQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "clients-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/supervisors`);
      return data.data
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, name: s.fio, login: s.login }));
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
            <Link className={cn(buttonVariants({ variant: "default", size: "sm" }))} href="/clients/new">
              Yangi mijoz
            </Link>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => {
            downloadClientsCsvPage(rows, `mijozlar_sahifa_${page}.csv`);
          }}
        >
          CSV (joriy sahifa)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canCatalog || !tenantSlug || exportBusy}
          onClick={async () => {
            if (!tenantSlug || !canCatalog) return;
            setExportMsg(null);
            setExportBusy(true);
            try {
              const params = new URLSearchParams({ page: "1", limit: "50" });
              appendClientsFilterParams(params, filterBundle);
              const res = await api.get<Blob>(`/api/${tenantSlug}/clients/export?${params.toString()}`, {
                responseType: "blob"
              });
              const truncated = String(res.headers["x-clients-export-truncated"] ?? "") === "1";
              const total = String(res.headers["x-clients-export-total"] ?? "");
              const blob = new Blob([res.data as BlobPart], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `mijozlar_filtr_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              if (truncated) {
                setExportMsg(
                  `Eksport: jami mos ${total} ta; faylda dastlabki 10 000 qator (qolganlari kesilgan).`
                );
              } else if (total) {
                setExportMsg(`Eksport: ${total} ta qator.`);
              }
            } catch {
              setExportMsg("Filtr bo‘yicha CSV yuklab bo‘lmadi (ruxsat yoki tarmoq).");
            } finally {
              setExportBusy(false);
            }
          }}
        >
          {exportBusy ? "CSV…" : "CSV (barcha filtr)"}
        </Button>
        {canCatalog ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={
                selectedIds.size === 0 || selectedIds.size > 500 || bulkMut.isPending || !tenantSlug
              }
              title={selectedIds.size > 500 ? "Bir vaqtda 500 tadan oshmasin" : undefined}
              onClick={() => {
                setBulkMsg(null);
                bulkMut.mutate({ client_ids: Array.from(selectedIds), is_active: true });
              }}
            >
              Tanlangan → faol
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={
                selectedIds.size === 0 || selectedIds.size > 500 || bulkMut.isPending || !tenantSlug
              }
              title={selectedIds.size > 500 ? "Bir vaqtda 500 tadan oshmasin" : undefined}
              onClick={() => {
                setBulkMsg(null);
                bulkMut.mutate({ client_ids: Array.from(selectedIds), is_active: false });
              }}
            >
              Tanlangan → nofaol
            </Button>
            {selectedIds.size > 0 ? (
              <span className="text-sm text-muted-foreground">Tanlangan: {selectedIds.size}</span>
            ) : null}
          </>
        ) : null}
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
        {exportMsg ? <span className="text-sm text-muted-foreground">{exportMsg}</span> : null}
        {bulkMsg ? <span className="text-sm text-muted-foreground">{bulkMsg}</span> : null}
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
        regionFilter={regionFilter}
        onRegionFilterChange={(v) => {
          setRegionFilter(v);
          setPage(1);
        }}
        districtFilter={districtFilter}
        onDistrictFilterChange={(v) => {
          setDistrictFilter(v);
          setPage(1);
        }}
        neighborhoodFilter={neighborhoodFilter}
        onNeighborhoodFilterChange={(v) => {
          setNeighborhoodFilter(v);
          setPage(1);
        }}
        zoneFilter={zoneFilter}
        onZoneFilterChange={(v) => {
          setZoneFilter(v);
          setPage(1);
        }}
        clientTypeFilter={clientTypeFilter}
        onClientTypeFilterChange={(v) => {
          setClientTypeFilter(v);
          setPage(1);
        }}
        clientFormatFilter={clientFormatFilter}
        onClientFormatFilterChange={(v) => {
          setClientFormatFilter(v);
          setPage(1);
        }}
        salesChannelFilter={salesChannelFilter}
        onSalesChannelFilterChange={(v) => {
          setSalesChannelFilter(v);
          setPage(1);
        }}
        agentFilter={agentFilter}
        onAgentFilterChange={(v) => {
          setAgentFilter(v);
          setPage(1);
        }}
        expeditorFilter={expeditorFilter}
        onExpeditorFilterChange={(v) => {
          setExpeditorFilter(v);
          setPage(1);
        }}
        supervisorFilter={supervisorFilter}
        onSupervisorFilterChange={(v) => {
          setSupervisorFilter(v);
          setPage(1);
        }}
        visitWeekdayFilter={visitWeekdayFilter}
        onVisitWeekdayFilterChange={(v) => {
          setVisitWeekdayFilter(v);
          setPage(1);
        }}
        innFilter={innFilter}
        onInnFilterChange={(v) => {
          setInnFilter(v);
          setPage(1);
        }}
        phoneFilter={phoneFilter}
        onPhoneFilterChange={(v) => {
          setPhoneFilter(v);
          setPage(1);
        }}
        createdFromFilter={createdFromFilter}
        onCreatedFromFilterChange={(v) => {
          setCreatedFromFilter(v);
          setPage(1);
        }}
        createdToFilter={createdToFilter}
        onCreatedToFilterChange={(v) => {
          setCreatedToFilter(v);
          setPage(1);
        }}
        onApplyToolbar={() => {
          void refetch();
          setFiltersVisible(false);
        }}
        categoryOptions={refsQ.data?.categories ?? []}
        regionOptions={refsQ.data?.regions ?? []}
        districtOptions={refsQ.data?.districts ?? []}
        neighborhoodOptions={refsQ.data?.neighborhoods ?? []}
        zoneOptions={refsQ.data?.zones ?? []}
        clientTypeOptions={refsQ.data?.client_type_codes ?? []}
        clientFormatOptions={refsQ.data?.client_formats ?? []}
        salesChannelOptions={refsQ.data?.sales_channels ?? []}
        agentOptions={agentsFilterQ.data ?? []}
        expeditorOptions={expeditorsFilterQ.data ?? []}
        supervisorOptions={supervisorsFilterQ.data ?? []}
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
        pageLimit={tablePrefs.pageSize}
        onPageLimitChange={(v) => {
          tablePrefs.setPageSize(v);
          setPage(1);
        }}
        filtersVisible={filtersVisible}
        onFiltersVisibleChange={setFiltersVisible}
        onOpenColumnSettings={() => setColumnDialogOpen(true)}
      />

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlarni boshqarish"
        description="Ko‘rinadigan ustunlar va tartib. Sizning akkauntingiz uchun saqlanadi (server)."
        columns={CLIENT_MANAGEABLE_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
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
        <QueryErrorState message={getUserFacingError(error, "Klientlarni yuklab bo'lmadi.")} onRetry={() => void refetch()} />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <ClientsDataTable
              rows={rows}
              visibility={getDefaultColumnVisibility()}
              orderedVisibleColumnIds={tablePrefs.visibleColumnOrder}
              bulkSelect={canCatalog}
              selectedIds={selectedIds}
              onToggleRow={(id, selected) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selected) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
              onTogglePage={(selectAll) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selectAll) {
                    for (const r of rows) next.add(r.id);
                  } else {
                    for (const r of rows) next.delete(r.id);
                  }
                  return next;
                });
              }}
              onEdit={(row) => {
                router.push(`/clients/${row.id}/edit`);
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

    </PageShell>
  );
}
