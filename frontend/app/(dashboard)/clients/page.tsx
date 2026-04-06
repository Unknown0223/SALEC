"use client";

import { ClientsDataTable } from "@/components/clients/clients-data-table";
import {
  ClientsTableToolbar,
  type ClientsToolbarFilterVisibility
} from "@/components/clients/clients-table-toolbar";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/client-types";
import { CLIENT_COLUMN_TO_SORT, type ClientSortField } from "@/lib/client-list-sort";
import {
  CLIENT_TABLE_COLUMNS,
  CLIENT_TABLE_PREF_COLUMN_IDS,
  getDefaultColumnVisibility,
  getDefaultHiddenClientColumnIds,
  loadColumnVisibility,
  type ClientColumnId
} from "@/lib/client-table-columns";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { CLIENT_IMPORT_MAX_FILE_BYTES } from "@/lib/client-import-limits";
import { downloadClientsCsvPage } from "@/lib/clients-csv-export";
import { mergeRefOptions } from "@/lib/merge-ref-options";
import {
  dedupeRefSelectOptionsByTerritoryDisplayName,
  mergeRefSelectOptions,
  optionsToValueLabelMap
} from "@/lib/ref-select-options";
import { api } from "@/lib/api";
import { clientsFilterDebugEnabled, logClientsFilters } from "@/lib/clients-filter-debug";
import {
  ClientImportMappingDialog,
  type ClientImportMappingPayload
} from "@/components/clients/client-import-mapping-dialog";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ClientsResponse = {
  data: ClientRow[];
  total: number;
  page: number;
  limit: number;
};

type ClientRefOptionDto = { value: string; label: string };

type ClientReferencesResponse = {
  categories: string[];
  client_type_codes: string[];
  regions: string[];
  cities: string[];
  districts: string[];
  neighborhoods: string[];
  zones: string[];
  client_formats: string[];
  sales_channels: string[];
  product_category_refs: string[];
  logistics_services: string[];
  category_options?: ClientRefOptionDto[];
  client_type_options?: ClientRefOptionDto[];
  client_format_options?: ClientRefOptionDto[];
  sales_channel_options?: ClientRefOptionDto[];
  city_options?: ClientRefOptionDto[];
  region_options?: ClientRefOptionDto[];
  city_territory_hints?: Record<
    string,
    {
      region_stored: string | null;
      region_label: string | null;
      zone_stored: string | null;
      zone_label: string | null;
      district_stored: string | null;
      district_label: string | null;
    }
  >;
};

type FilterBundle = {
  search: string;
  activeFilter: "all" | "true" | "false";
  categoryFilter: string;
  regionFilter: string;
  cityFilter: string;
  clientTypeFilter: string;
  clientFormatFilter: string;
  salesChannelFilter: string;
  agentFilter: string;
  expeditorFilter: string;
  sortField: ClientSortField;
  sortOrder: "asc" | "desc";
};

function appendClientsFilterParams(params: URLSearchParams, p: FilterBundle) {
  if (p.search.trim()) params.set("search", p.search.trim());
  if (p.activeFilter !== "all") params.set("is_active", p.activeFilter);
  if (p.categoryFilter.trim()) params.set("category", p.categoryFilter.trim());
  if (p.regionFilter.trim()) params.set("region", p.regionFilter.trim());
  if (p.cityFilter.trim()) params.set("city", p.cityFilter.trim());
  if (p.clientTypeFilter.trim()) params.set("client_type_code", p.clientTypeFilter.trim());
  if (p.clientFormatFilter.trim()) params.set("client_format", p.clientFormatFilter.trim());
  if (p.salesChannelFilter.trim()) params.set("sales_channel", p.salesChannelFilter.trim());
  if (p.agentFilter.trim()) params.set("agent_id", p.agentFilter.trim());
  if (p.expeditorFilter.trim()) params.set("expeditor_user_id", p.expeditorFilter.trim());
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
  const [importMapOpen, setImportMapOpen] = useState(false);
  const [importStagingFile, setImportStagingFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState("");
  const [clientFormatFilter, setClientFormatFilter] = useState("");
  const [salesChannelFilter, setSalesChannelFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [expeditorFilter, setExpeditorFilter] = useState("");
  const [sortField, setSortField] = useState<ClientSortField>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const clientsPrefsMigrated = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      logClientsFilters("diag", { mode: "development", message: "filtr loglari yoqilgan" });
      return;
    }
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("salesdoc.clients.filterDebug") === "1") return;
      if (sessionStorage.getItem("salesdoc.clients.filterHint") === "1") return;
      sessionStorage.setItem("salesdoc.clients.filterHint", "1");
    } catch {
      /* ignore */
    }
    console.info(
      '[clients/filters] Diagnostika: localStorage.setItem("salesdoc.clients.filterDebug","1") keyin sahifani yangilang — har bir so‘rov konsolga chiqadi.'
    );
  }, []);

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
    cityFilter,
    clientTypeFilter,
    clientFormatFilter,
    salesChannelFilter,
    agentFilter,
    expeditorFilter,
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
    cityFilter,
    clientTypeFilter,
    clientFormatFilter,
    salesChannelFilter,
    agentFilter,
    expeditorFilter,
    sortField,
    sortOrder,
    tablePrefs.pageSize
  ]);

  const importMut = useMutation({
    mutationFn: async (payload: { file: File } & ClientImportMappingPayload) => {
      const fd = new FormData();
      fd.append("file", payload.file);
      fd.append("columnMap", JSON.stringify(payload.columnMap));
      fd.append("sheetName", payload.sheetName);
      fd.append("headerRowIndex", String(payload.headerRowIndex));
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
      setImportMapOpen(false);
      setImportStagingFile(null);
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
      cityFilter,
      clientTypeFilter,
      clientFormatFilter,
      salesChannelFilter,
      agentFilter,
      expeditorFilter,
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
      const qs = params.toString();
      logClientsFilters("request", {
        tenantSlug,
        url: `/api/${tenantSlug}/clients?${qs}`,
        queryParams: Object.fromEntries(params.entries()),
        filters: { ...filterBundle }
      });
      try {
        const { data: body } = await api.get<ClientsResponse>(`/api/${tenantSlug}/clients?${qs}`);
        logClientsFilters("response", {
          total: body.total,
          returnedRows: body.data.length,
          page: body.page,
          limit: body.limit
        });
        return body;
      } catch (e) {
        logClientsFilters("request_failed", {
          queryParams: Object.fromEntries(params.entries()),
          error: e instanceof Error ? e.message : String(e)
        });
        throw e;
      }
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

  const refData = refsQ.data;

  useEffect(() => {
    if (!refData || !clientsFilterDebugEnabled()) return;
    logClientsFilters("references_loaded", {
      category_options: refData.category_options?.length ?? 0,
      client_type_options: refData.client_type_options?.length ?? 0,
      client_format_options: refData.client_format_options?.length ?? 0,
      sales_channel_options: refData.sales_channel_options?.length ?? 0,
      region_options: refData.region_options?.length ?? 0,
      city_options: refData.city_options?.length ?? 0,
      city_territory_hint_keys: Object.keys(refData.city_territory_hints ?? {}).length,
      legacy_lists: {
        regions: refData.regions?.length ?? 0,
        districts: refData.districts?.length ?? 0,
        zones: refData.zones?.length ?? 0,
        cities: refData.cities?.length ?? 0
      }
    });
  }, [refData]);

  const categorySelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.category_options?.length) {
      return mergeRefSelectOptions(categoryFilter, refData.category_options, refData.categories);
    }
    return mergeRefOptions(categoryFilter, refData.categories).map((v) => ({ value: v, label: v }));
  }, [refData, categoryFilter]);

  const clientTypeSelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.client_type_options?.length) {
      return mergeRefSelectOptions(
        clientTypeFilter,
        refData.client_type_options,
        refData.client_type_codes
      );
    }
    return mergeRefOptions(clientTypeFilter, refData.client_type_codes).map((v) => ({ value: v, label: v }));
  }, [refData, clientTypeFilter]);

  const clientFormatSelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.client_format_options?.length) {
      return mergeRefSelectOptions(
        clientFormatFilter,
        refData.client_format_options,
        refData.client_formats
      );
    }
    return mergeRefOptions(clientFormatFilter, refData.client_formats).map((v) => ({ value: v, label: v }));
  }, [refData, clientFormatFilter]);

  const salesChannelSelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.sales_channel_options?.length) {
      return mergeRefSelectOptions(
        salesChannelFilter,
        refData.sales_channel_options,
        refData.sales_channels
      );
    }
    return mergeRefOptions(salesChannelFilter, refData.sales_channels).map((v) => ({ value: v, label: v }));
  }, [refData, salesChannelFilter]);

  const regionSelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.region_options?.length) {
      return dedupeRefSelectOptionsByTerritoryDisplayName(
        mergeRefSelectOptions(regionFilter, refData.region_options, refData.regions)
      );
    }
    return dedupeRefSelectOptionsByTerritoryDisplayName(
      mergeRefOptions(regionFilter, refData.regions).map((v) => ({ value: v, label: v }))
    );
  }, [refData, regionFilter]);

  const citySelectOptions = useMemo(() => {
    if (!refData) return [];
    if (refData.city_options?.length) {
      return mergeRefSelectOptions(cityFilter, refData.city_options, refData.cities);
    }
    return mergeRefOptions(cityFilter, refData.cities).map((v) => ({ value: v, label: v }));
  }, [refData, cityFilter]);

  const refDisplayMaps = useMemo(() => {
    if (!refData) return undefined;
    const strListToMap = (arr: string[] | undefined): Record<string, string> | undefined => {
      if (!arr?.length) return undefined;
      const m: Record<string, string> = {};
      for (const s of arr) {
        const t = s.trim();
        if (t) m[t] = t;
      }
      return Object.keys(m).length ? m : undefined;
    };
    return {
      category: optionsToValueLabelMap(refData.category_options),
      clientType: optionsToValueLabelMap(refData.client_type_options),
      clientFormat: optionsToValueLabelMap(refData.client_format_options),
      salesChannel: optionsToValueLabelMap(refData.sales_channel_options),
      city: optionsToValueLabelMap(refData.city_options),
      region: optionsToValueLabelMap(refData.region_options),
      district: strListToMap(refData.districts),
      zone: strListToMap(refData.zones),
      cityTerritoryHints: refData.city_territory_hints
    };
  }, [refData]);

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

  const filterVisibility: ClientsToolbarFilterVisibility = useMemo(
    () => ({
      category: categorySelectOptions.length > 0,
      region: regionSelectOptions.length > 0,
      city: citySelectOptions.length > 0,
      clientType: clientTypeSelectOptions.length > 0,
      clientFormat: clientFormatSelectOptions.length > 0,
      salesChannel: salesChannelSelectOptions.length > 0,
      agent: (agentsFilterQ.data ?? []).length > 0,
      expeditor: (expeditorsFilterQ.data ?? []).length > 0
    }),
    [
      categorySelectOptions,
      regionSelectOptions,
      citySelectOptions,
      clientTypeSelectOptions,
      clientFormatSelectOptions,
      salesChannelSelectOptions,
      agentsFilterQ.data,
      expeditorsFilterQ.data
    ]
  );

  const rows = data?.data ?? [];

  const handleSortByColumn = (columnId: ClientColumnId) => {
    const api = CLIENT_COLUMN_TO_SORT[columnId];
    if (!api) {
      logClientsFilters("sort_skip", { columnId, reason: "no backend sort field" });
      return;
    }
    const nextOrder = sortField === api ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    logClientsFilters("sort_change", { columnId, sortField: api, order: nextOrder });
    if (sortField === api) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(api);
      setSortOrder("asc");
    }
    setPage(1);
  };

  return (
    <PageShell>
      <ClientImportMappingDialog
        open={importMapOpen}
        onOpenChange={(next) => {
          setImportMapOpen(next);
          if (!next) {
            setImportStagingFile(null);
            if (importFileRef.current) importFileRef.current.value = "";
          }
        }}
        file={importStagingFile}
        isSubmitting={importMut.isPending}
        onConfirm={(mappingPayload) => {
          if (!importStagingFile || !tenantSlug) return;
          setImportMsg(null);
          importMut.mutate({ file: importStagingFile, ...mappingPayload });
        }}
      />
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
              logClientsFilters("export_csv_request", {
                queryParams: Object.fromEntries(params.entries()),
                note: "limit=50 — faqat eksport endpointi; filtr barcha mos yozuvlar bo‘yicha serverda"
              });
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
            setImportStagingFile(f);
            setImportMapOpen(true);
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
        cityFilter={cityFilter}
        onCityFilterChange={(v) => {
          setCityFilter(v);
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
        filterVisibility={filterVisibility}
        onApplyToolbar={() => {
          void refetch();
          setFiltersVisible(false);
        }}
        categorySelectOptions={categorySelectOptions}
        regionSelectOptions={regionSelectOptions}
        citySelectOptions={citySelectOptions}
        clientTypeSelectOptions={clientTypeSelectOptions}
        clientFormatSelectOptions={clientFormatSelectOptions}
        salesChannelSelectOptions={salesChannelSelectOptions}
        agentOptions={agentsFilterQ.data ?? []}
        expeditorOptions={expeditorsFilterQ.data ?? []}
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
        <Card className="mt-5 overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <ClientsDataTable
              rows={rows}
              visibility={getDefaultColumnVisibility()}
              orderedVisibleColumnIds={tablePrefs.visibleColumnOrder}
              refDisplayMaps={refDisplayMaps}
              sortField={sortField}
              sortOrder={sortOrder}
              onSortByColumn={handleSortByColumn}
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
