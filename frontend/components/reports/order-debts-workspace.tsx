"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { localYmd } from "@/components/ui/date-picker-popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterSelect, filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { api } from "@/lib/api";
import type { ClientBalanceTerritoryOptions } from "@/lib/client-balances-types";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { getUserFacingError } from "@/lib/error-utils";
import type { OrderDebtsListResponse, OrderDebtRow } from "@/lib/order-debts-types";
import {
  ORDER_DEBTS_COLUMNS,
  ORDER_DEBTS_COLUMN_IDS,
  ORDER_DEBTS_SORT_BY,
  ORDER_DEBTS_TABLE_ID,
  type OrderDebtsColumnId
} from "@/lib/order-debts-table-columns";
import { paymentMethodSelectOptions, type ProfilePaymentMethodEntry } from "@/lib/payment-method-options";
import { STALE } from "@/lib/query-stale";
import { buildClientTerritoryFilterLevels, buildZoneRegionCityCascadeOptions } from "@/lib/territory-client-filters";
import type { TerritoryNode } from "@/lib/territory-tree";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  FileSpreadsheet,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SetStateAction
} from "react";

type StaffPick = { id: number; fio: string; code?: string | null };

type Draft = {
  page: number;
  limit: number;
  agent_id: string;
  expeditor_user_id: string;
  supervisor_user_id: string;
  trade_direction: string;
  category: string;
  status: "" | "active" | "inactive";
  agent_consignment: "" | "regular" | "consignment";
  territory_region: string;
  territory_city: string;
  territory_district: string;
  territory_zone: string;
  territory_neighborhood: string;
  agent_branch: string;
  agent_payment_type: string;
  order_date_from: string;
  order_date_to: string;
  shipment_date_from: string;
  shipment_date_to: string;
  order_consignment_due_from: string;
  order_consignment_due_to: string;
  warehouse_ids: string;
  client_ids: string;
  order_consignment: "all" | "consignment" | "regular";
  order_payment_ref: string;
  search: string;
  sort_by: string;
  sort_dir: "asc" | "desc";
};

function emptyDraft(): Draft {
  return {
    page: 1,
    limit: 50,
    agent_id: "",
    expeditor_user_id: "",
    supervisor_user_id: "",
    trade_direction: "",
    category: "",
    status: "",
    agent_consignment: "",
    territory_region: "",
    territory_city: "",
    territory_district: "",
    territory_zone: "",
    territory_neighborhood: "",
    agent_branch: "",
    agent_payment_type: "",
    order_date_from: "",
    order_date_to: "",
    shipment_date_from: "",
    shipment_date_to: "",
    order_consignment_due_from: "",
    order_consignment_due_to: "",
    warehouse_ids: "",
    client_ids: "",
    order_consignment: "all",
    order_payment_ref: "",
    search: "",
    sort_by: "remainder",
    sort_dir: "desc"
  };
}

function parseDraft(sp: URLSearchParams): Draft {
  const d = emptyDraft();
  const g = (k: string) => sp.get(k)?.trim() ?? "";
  d.page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  d.limit = Math.min(200, Math.max(1, Number.parseInt(sp.get("limit") ?? "50", 10) || 50));
  d.agent_id = g("agent_id");
  d.expeditor_user_id = g("expeditor_user_id");
  d.supervisor_user_id = g("supervisor_user_id");
  d.trade_direction = g("trade_direction");
  d.category = g("category");
  const st = g("status");
  d.status = st === "active" || st === "inactive" ? st : "";
  const ac = g("agent_consignment");
  d.agent_consignment = ac === "regular" || ac === "consignment" ? ac : "";
  d.territory_region = g("territory_region");
  d.territory_city = g("territory_city");
  d.territory_district = g("territory_district");
  d.territory_zone = g("territory_zone");
  d.territory_neighborhood = g("territory_neighborhood");
  d.agent_branch = g("agent_branch");
  d.agent_payment_type = g("agent_payment_type");
  d.order_date_from = g("order_date_from");
  d.order_date_to = g("order_date_to");
  d.shipment_date_from = g("shipment_date_from");
  d.shipment_date_to = g("shipment_date_to");
  d.order_consignment_due_from = g("order_consignment_due_from");
  d.order_consignment_due_to = g("order_consignment_due_to");
  d.warehouse_ids = g("warehouse_ids");
  d.client_ids = g("client_ids");
  const oc = g("order_consignment");
  d.order_consignment = oc === "consignment" || oc === "regular" ? oc : "all";
  d.order_payment_ref = g("order_payment_ref");
  d.search = g("search");
  const sb = g("sort_by");
  d.sort_by = sb || "remainder";
  d.sort_dir = g("sort_dir") === "asc" ? "asc" : "desc";
  return d;
}

function draftToSearchParams(d: Draft): string {
  const p = new URLSearchParams();
  p.set("page", String(Math.max(1, d.page)));
  p.set("limit", String(Math.min(200, Math.max(1, d.limit))));
  const set = (k: string, v: string) => {
    if (v.trim()) p.set(k, v.trim());
  };
  set("agent_id", d.agent_id);
  set("expeditor_user_id", d.expeditor_user_id);
  set("supervisor_user_id", d.supervisor_user_id);
  set("trade_direction", d.trade_direction);
  set("category", d.category);
  if (d.status) p.set("status", d.status);
  if (d.agent_consignment) p.set("agent_consignment", d.agent_consignment);
  set("territory_region", d.territory_region);
  set("territory_city", d.territory_city);
  set("territory_district", d.territory_district);
  set("territory_zone", d.territory_zone);
  set("territory_neighborhood", d.territory_neighborhood);
  set("agent_branch", d.agent_branch);
  set("agent_payment_type", d.agent_payment_type);
  set("order_date_from", d.order_date_from);
  set("order_date_to", d.order_date_to);
  set("shipment_date_from", d.shipment_date_from);
  set("shipment_date_to", d.shipment_date_to);
  set("order_consignment_due_from", d.order_consignment_due_from);
  set("order_consignment_due_to", d.order_consignment_due_to);
  set("warehouse_ids", d.warehouse_ids);
  set("client_ids", d.client_ids);
  if (d.order_consignment !== "all") p.set("order_consignment", d.order_consignment);
  set("order_payment_ref", d.order_payment_ref);
  set("search", d.search);
  if (d.sort_by.trim()) {
    p.set("sort_by", d.sort_by.trim());
    p.set("sort_dir", d.sort_dir);
  }
  return p.toString();
}

type DateQuick = "all" | "today" | "week" | "month" | "custom";

function buildTerritoryScopeParamsForDebts(d: Draft): string {
  const p = new URLSearchParams();
  if (d.agent_branch.trim()) p.set("agent_branch", d.agent_branch.trim());
  if (d.agent_id.trim()) p.set("agent_id", d.agent_id.trim());
  if (d.expeditor_user_id.trim()) p.set("expeditor_user_id", d.expeditor_user_id.trim());
  if (d.supervisor_user_id.trim()) p.set("supervisor_user_id", d.supervisor_user_id.trim());
  if (d.trade_direction.trim()) p.set("trade_direction", d.trade_direction.trim());
  if (d.category.trim()) p.set("category", d.category.trim());
  if (d.status) p.set("status", d.status);
  if (d.agent_consignment) p.set("agent_consignment", d.agent_consignment);
  if (d.agent_payment_type.trim()) p.set("agent_payment_type", d.agent_payment_type.trim());
  return p.toString();
}

function datesForQuick(q: DateQuick): { from: string; to: string } {
  const now = new Date();
  const today = localYmd(now);
  if (q === "all") return { from: "", to: "" };
  if (q === "today") return { from: today, to: today };
  if (q === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: localYmd(d), to: today };
  }
  if (q === "month") {
    return { from: localYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  return { from: "", to: "" };
}

function inferDateQuick(from: string, to: string): DateQuick {
  const f = from.trim();
  const t = to.trim();
  if (!f && !t) return "all";
  const today = localYmd(new Date());
  if (f === today && t === today) return "today";
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  if (f === localYmd(weekStart) && t === today) return "week";
  const monthStart = localYmd(new Date(now.getFullYear(), now.getMonth(), 1));
  if (f === monthStart && t === today) return "month";
  return "custom";
}

function parseAmount(s: string): number {
  const t = String(s)
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/\u2212/g, "-")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

/** `orders.status` — qisqa ruscha yorliq */
const ORDER_STATUS_RU: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  delivering: "В доставке",
  delivered: "Доставлен",
  cancelled: "Отменён",
  closed: "Закрыт"
};

function orderStatusLabelRu(code: string | null | undefined): string {
  const t = String(code ?? "").trim();
  if (!t) return "—";
  return ORDER_STATUS_RU[t] ?? t;
}

function staffDebtLabel(name: string | null | undefined, code: string | null | undefined): string {
  const n = (name ?? "").trim();
  const c = (code ?? "").trim();
  if (!n && !c) return "—";
  if (!c) return n;
  if (!n) return c;
  return `${n} (${c})`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const SORT_DESC_FIRST = new Set([
  "remainder",
  "total_sum",
  "allocated_sum",
  "client_balance",
  "shipped_at",
  "consignment_due_date"
]);

function DebtsSortTh({
  colId,
  sortBy,
  sortDir,
  onSort
}: {
  colId: OrderDebtsColumnId;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (backendKey: string) => void;
}) {
  const label = ORDER_DEBTS_COLUMNS.find((c) => c.id === colId)?.label ?? colId;
  const backendKey = ORDER_DEBTS_SORT_BY[colId];
  const alignRight =
    colId === "total_sum" ||
    colId === "allocated" ||
    colId === "remainder" ||
    colId === "unallocated" ||
    colId === "balance";

  if (!backendKey) {
    return (
      <th
        className={cn(
          "app-table-thead px-2 py-2 text-xs font-semibold text-foreground/90",
          alignRight && "text-right"
        )}
        title={colId === "unallocated" ? "Сортировка по этому полю не поддерживается" : undefined}
      >
        {label}
      </th>
    );
  }

  const active = sortBy === backendKey;
  return (
    <th className={cn("app-table-thead px-2 py-2 align-bottom", alignRight && "text-right")}>
      <button
        type="button"
        className={cn(
          "-mx-1 inline-flex max-w-none items-center gap-1 rounded px-1 py-0.5 text-xs font-bold hover:bg-muted/80",
          active ? "text-foreground" : "text-muted-foreground"
        )}
        onClick={() => onSort(backendKey)}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function OrderDebtsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [exporting, setExporting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [shipQuick, setShipQuick] = useState<DateQuick>("all");
  const [consignQuick, setConsignQuick] = useState<DateQuick>("all");
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");

  const effectiveQs = searchParams.toString() || draftToSearchParams(emptyDraft());

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: ORDER_DEBTS_TABLE_ID,
    defaultColumnOrder: [...ORDER_DEBTS_COLUMN_IDS],
    defaultPageSize: 50,
    allowedPageSizes: [10, 15, 20, 30, 50, 100, 200],
    defaultHiddenColumnIds: []
  });

  const visibleCols = useMemo(() => {
    const v = tablePrefs.visibleColumnOrder.filter((id): id is OrderDebtsColumnId =>
      (ORDER_DEBTS_COLUMN_IDS as readonly string[]).includes(id)
    );
    return v.length > 0 ? v : [...ORDER_DEBTS_COLUMN_IDS];
  }, [tablePrefs.visibleColumnOrder]);

  useEffect(() => {
    if (!hydrated || !tenantSlug) return;
    if (!searchParams.toString()) {
      router.replace(`${pathname}?${draftToSearchParams(emptyDraft())}`, { scroll: false });
    }
  }, [hydrated, tenantSlug, pathname, router, searchParams]);

  useEffect(() => {
    const qs = searchParams.toString();
    if (qs) setDraft(parseDraft(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [clientSearch]);

  useEffect(() => {
    const d = parseDraft(new URLSearchParams(searchParams.toString()));
    setShipQuick(inferDateQuick(d.shipment_date_from, d.shipment_date_to));
    setConsignQuick(inferDateQuick(d.order_consignment_due_from, d.order_consignment_due_to));
  }, [searchParams]);

  const pushDraft = useCallback(
    (next: Draft) => {
      router.replace(`${pathname}?${draftToSearchParams(next)}`, { scroll: false });
    },
    [pathname, router]
  );

  const onApply = useCallback(() => {
    pushDraft({ ...draft, page: 1 });
  }, [draft, pushDraft]);

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const supervisorsQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/supervisors?is_active=true`);
      return data.data;
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { trade_directions: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "order-debts-paytypes"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          payment_method_entries?: ProfilePaymentMethodEntry[];
          payment_types?: string[];
          territory_levels?: string[];
          territory_nodes?: TerritoryNode[];
          trade_directions?: string[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const clientRefsQ = useQuery({
    queryKey: ["clients-references", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        categories?: string[];
        category_options?: Array<string | { value?: string; label?: string }>;
        regions?: string[];
        cities?: string[];
        zones?: string[];
        region_options?: { value: string; label: string }[];
        city_options?: { value: string; label: string }[];
      }>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const territoryScopeParams = useMemo(() => buildTerritoryScopeParamsForDebts(draft), [draft]);

  const territoryOptsQ = useQuery({
    queryKey: ["client-balances-territory", tenantSlug, "order-debts", territoryScopeParams],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const qs = territoryScopeParams.trim();
      const { data } = await api.get<{ data: ClientBalanceTerritoryOptions }>(
        `/api/${tenantSlug}/client-balances/territory-options${qs ? `?${qs}` : ""}`
      );
      return data.data;
    }
  });

  const clientsPickerQ = useQuery({
    queryKey: ["order-debts-clients-picker", tenantSlug, debouncedClientSearch],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const q = new URLSearchParams({
        page: "1",
        limit: "80",
        sort: "name",
        order: "asc",
        is_active: "true"
      });
      if (debouncedClientSearch) q.set("search", debouncedClientSearch);
      const { data } = await api.get<{
        data: Array<{ id: number; name: string; client_code?: string | null }>;
      }>(`/api/${tenantSlug}/clients?${q}`);
      return data.data ?? [];
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "order-debts"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ id: number; name: string }> }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data ?? [];
    }
  });

  const listQ = useQuery({
    queryKey: ["reports", "order-debts", tenantSlug, effectiveQs],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.heavyList,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await api.get<OrderDebtsListResponse>(
        `/api/${tenantSlug}/reports/order-debts?${effectiveQs}`
      );
      return data;
    }
  });

  const paymentOptions = useMemo(() => paymentMethodSelectOptions(profileQ.data), [profileQ.data]);

  const paymentTypeFilterOpts = useMemo(
    () => paymentMethodSelectOptions(profileQ.data, profileQ.data?.payment_types),
    [profileQ.data]
  );

  const categoryFilterOpts = useMemo(() => {
    const fromOptions = (clientRefsQ.data?.category_options ?? [])
      .map((o) => (typeof o === "string" ? o : (o?.label ?? o?.value ?? "")))
      .map((x) => String(x).trim())
      .filter(Boolean);
    const fromList = (clientRefsQ.data?.categories ?? []).map((x) => String(x).trim()).filter(Boolean);
    return Array.from(new Set([...fromOptions, ...fromList])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [clientRefsQ.data]);

  const tradeDirectionSelectValues = useMemo(() => {
    const fromAgents = filterOptQ.data?.trade_directions ?? [];
    const fromProfile = profileQ.data?.trade_directions ?? [];
    const s = new Set<string>();
    for (const x of fromAgents) {
      const t = x.trim();
      if (t) s.add(t);
    }
    for (const x of fromProfile) {
      const t = x.trim();
      if (t) s.add(t);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [filterOptQ.data?.trade_directions, profileQ.data?.trade_directions]);

  const territoryCascade = useMemo(
    () =>
      buildZoneRegionCityCascadeOptions(
        clientRefsQ.data,
        territoryOptsQ.data,
        profileQ.data?.territory_nodes,
        {
          zone: draft.territory_zone,
          region: draft.territory_region,
          city: draft.territory_city
        }
      ),
    [
      clientRefsQ.data,
      territoryOptsQ.data,
      profileQ.data?.territory_nodes,
      draft.territory_zone,
      draft.territory_region,
      draft.territory_city
    ]
  );

  const territoryFilterSpecs = useMemo(
    () => buildClientTerritoryFilterLevels(profileQ.data?.territory_levels),
    [profileQ.data?.territory_levels]
  );

  const clientPickerItems = useMemo(
    () =>
      (clientsPickerQ.data ?? []).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.client_code ? String(c.client_code) : String(c.id)
      })),
    [clientsPickerQ.data]
  );

  const warehousePickerItems = useMemo(
    () =>
      (warehousesQ.data ?? []).map((w) => ({
        id: w.id,
        title: w.name
      })),
    [warehousesQ.data]
  );

  const compactSelect = cn(filterPanelSelectClassName, "h-9 min-w-0 max-w-full text-xs");
  const filterLbl = "text-xs font-medium text-muted-foreground";

  const baseFromUrl = useCallback(
    () => parseDraft(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const onPage = (next: number) => {
    pushDraft({ ...baseFromUrl(), page: Math.max(1, next) });
  };

  const onLimit = (nextLim: number) => {
    const lim = Math.min(200, Math.max(1, nextLim));
    tablePrefs.setPageSize(lim);
    pushDraft({ ...baseFromUrl(), limit: lim, page: 1 });
  };

  const onSort = (col: string) => {
    const cur = baseFromUrl();
    const nextDir =
      cur.sort_by === col
        ? cur.sort_dir === "asc"
          ? "desc"
          : "asc"
        : SORT_DESC_FIRST.has(col)
          ? "desc"
          : "asc";
    pushDraft({ ...cur, sort_by: col, sort_dir: nextDir, page: 1 });
  };

  const downloadExcel = async () => {
    if (!tenantSlug) return;
    setExporting(true);
    try {
      const p = new URLSearchParams(effectiveQs);
      p.set("export_limit", "5000");
      const res = await api.get<Blob>(`/api/${tenantSlug}/reports/order-debts/export?${p}`, {
        responseType: "blob"
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dolgi-po-zakazam.xlsx";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;
  const err = listQ.isError ? getUserFacingError(listQ.error) : null;

  const selectedWarehouseSet = useMemo(() => {
    const raw = draft.warehouse_ids
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return new Set(raw);
  }, [draft.warehouse_ids]);

  const selectedClientSet = useMemo(() => {
    const raw = draft.client_ids
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return new Set(raw);
  }, [draft.client_ids]);

  const setWarehouseSet = useCallback((action: SetStateAction<Set<number>>) => {
    setDraft((d) => {
      const prev = new Set(
        d.warehouse_ids
          .split(",")
          .map((x) => Number.parseInt(x.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      );
      const next = typeof action === "function" ? action(prev) : action;
      return {
        ...d,
        warehouse_ids: Array.from(next)
          .sort((a, b) => a - b)
          .join(",")
      };
    });
  }, []);

  const setClientSet = useCallback((action: SetStateAction<Set<number>>) => {
    setDraft((d) => {
      const prev = new Set(
        d.client_ids
          .split(",")
          .map((x) => Number.parseInt(x.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      );
      const next = typeof action === "function" ? action(prev) : action;
      return {
        ...d,
        client_ids: Array.from(next)
          .sort((a, b) => a - b)
          .join(",")
      };
    });
  }, []);

  const onShipmentQuickChange = (v: DateQuick) => {
    setShipQuick(v);
    if (v === "custom") return;
    const r = datesForQuick(v);
    setDraft((d) => ({ ...d, shipment_date_from: r.from, shipment_date_to: r.to }));
  };

  const onConsignQuickChange = (v: DateQuick) => {
    setConsignQuick(v);
    if (v === "custom") return;
    const r = datesForQuick(v);
    setDraft((d) => ({ ...d, order_consignment_due_from: r.from, order_consignment_due_to: r.to }));
  };

  const renderDebtCell = (r: OrderDebtRow, colId: OrderDebtsColumnId): ReactNode => {
    switch (colId) {
      case "order_request":
        return (
          <>
            <div className="flex items-center gap-1">
              <Link href={`/orders/${r.order_id}`} className="font-mono text-primary hover:underline">
                {r.order_number}
              </Link>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Копировать"
                onClick={() => void copyToClipboard(r.order_number)}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              id {r.order_id} · {orderStatusLabelRu(r.order_status)}
            </span>
          </>
        );
      case "client":
        return (
          <Link href={`/clients/${r.client_id}`} className="text-primary hover:underline">
            {r.client_name}
          </Link>
        );
      case "currency":
        return r.currency;
      case "address":
        return (
          <span className="max-w-[140px] truncate block" title={r.address ?? ""}>
            {r.address ?? "—"}
          </span>
        );
      case "landmark":
        return (
          <span className="max-w-[120px] truncate block" title={r.landmark ?? ""}>
            {r.landmark ?? "—"}
          </span>
        );
      case "phone":
        return <span className="font-mono text-xs">{r.phone ?? "—"}</span>;
      case "agent":
        return (
          <span className="max-w-[140px] truncate block" title={staffDebtLabel(r.agent_name, r.agent_code)}>
            {staffDebtLabel(r.agent_name, r.agent_code)}
          </span>
        );
      case "expeditor":
        return (
          <span className="max-w-[140px] truncate block" title={staffDebtLabel(r.expeditor_name, r.expeditor_code)}>
            {staffDebtLabel(r.expeditor_name, r.expeditor_code)}
          </span>
        );
      case "warehouse":
        return <span className="max-w-[120px] truncate block">{r.warehouse_name ?? "—"}</span>;
      case "total_sum":
        return (
          <span className="tabular-nums">{formatNumberGrouped(r.total_sum, { maxFractionDigits: 2 })}</span>
        );
      case "payment_method":
        return (
          <span className="max-w-[100px] truncate text-xs" title={r.payment_method_label ?? ""}>
            {r.payment_method_label ?? "—"}
          </span>
        );
      case "shipped_at":
        return <span className="whitespace-nowrap text-xs">{formatDateOnly(r.shipped_at)}</span>;
      case "consignment_due":
        return <span className="whitespace-nowrap text-xs">{formatDateOnly(r.consignment_due_date)}</span>;
      case "allocated":
        return (
          <span className="tabular-nums text-muted-foreground">
            {formatNumberGrouped(r.allocated_sum, { maxFractionDigits: 2 })}
          </span>
        );
      case "remainder":
        return (
          <span className="tabular-nums font-medium text-destructive">
            {formatNumberGrouped(r.remainder, { maxFractionDigits: 2 })}
          </span>
        );
      case "unallocated":
        return (
          <span className="tabular-nums text-muted-foreground">
            {formatNumberGrouped(r.unallocated, { maxFractionDigits: 2 })}
          </span>
        );
      case "balance":
        return (
          <span
            className={cn(
              "tabular-nums font-medium",
              parseAmount(r.client_balance) < 0 && "text-destructive",
              parseAmount(r.client_balance) > 0 && "text-emerald-700 dark:text-emerald-400"
            )}
          >
            {formatNumberGrouped(r.client_balance, { maxFractionDigits: 2 })}
          </span>
        );
      default:
        return "—";
    }
  };

  const debtCellClass = (colId: OrderDebtsColumnId): string => {
    const right =
      colId === "total_sum" ||
      colId === "allocated" ||
      colId === "remainder" ||
      colId === "unallocated" ||
      colId === "balance";
    return cn("px-2 py-1.5 align-top", right && "text-right");
  };

  return (
    <PageShell>
      <PageHeader title="Долги по заказам" description="Yetkazilgan zakazlar bo‘yicha to‘lanmagan qoldiq." />
      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-end gap-2 border-b border-border/60 pb-3">
            <div className="space-y-1">
              <Label className={filterLbl}>Срок консигнации</Label>
              <select
                className={compactSelect}
                value={consignQuick}
                onChange={(e) => onConsignQuickChange(e.target.value as DateQuick)}
              >
                <option value="all">Все</option>
                <option value="today">Сегодня</option>
                <option value="week">7 дней</option>
                <option value="month">С начала месяца</option>
                <option value="custom">Свой диапазон</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Дата отгрузки</Label>
              <select
                className={compactSelect}
                value={shipQuick}
                onChange={(e) => onShipmentQuickChange(e.target.value as DateQuick)}
              >
                <option value="all">Все</option>
                <option value="today">Сегодня</option>
                <option value="week">7 дней</option>
                <option value="month">С начала месяца</option>
                <option value="custom">Свой диапазон</option>
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5"
              title="Дополнительные фильтры (дата заказа, район, супервайзер…)"
              onClick={() => setAdvancedOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Ещё фильтры</span>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <div className="space-y-1">
              <Label className={filterLbl}>Агент</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.agent_id}
                onChange={(e) => setDraft((d) => ({ ...d, agent_id: e.target.value }))}
              >
                {(agentsQ.data ?? []).map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.code ? `${a.fio} (${a.code})` : a.fio}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <SearchableMultiSelectPanel
                label="Клиенты"
                className="[&>span]:text-xs [&>span]:font-medium [&>span]:text-muted-foreground"
                items={clientPickerItems}
                selected={selectedClientSet}
                onSelectedChange={setClientSet}
                search={clientSearch}
                onSearchChange={setClientSearch}
                loading={clientsPickerQ.isFetching}
                emptyMessage="Клиенты не найдены"
                triggerPlaceholder="Все клиенты"
                minPopoverWidth={320}
              />
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Категория клиента</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              >
                {categoryFilterOpts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Экспедитор</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.expeditor_user_id}
                onChange={(e) => setDraft((d) => ({ ...d, expeditor_user_id: e.target.value }))}
              >
                {(expeditorsQ.data ?? []).map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.code ? `${a.fio} (${a.code})` : a.fio}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Способ оплаты</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.order_payment_ref}
                onChange={(e) => setDraft((d) => ({ ...d, order_payment_ref: e.target.value }))}
              >
                {paymentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Направление торговли</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.trade_direction}
                onChange={(e) => setDraft((d) => ({ ...d, trade_direction: e.target.value }))}
              >
                {tradeDirectionSelectValues.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <SearchableMultiSelectPanel
                label="Склады"
                className="[&>span]:text-xs [&>span]:font-medium [&>span]:text-muted-foreground"
                searchable={warehousePickerItems.length > 12}
                items={warehousePickerItems}
                selected={selectedWarehouseSet}
                onSelectedChange={setWarehouseSet}
                emptyMessage="Нет складов"
                triggerPlaceholder="Все склады"
                minPopoverWidth={280}
              />
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Тип фильтра оплаты заказа</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.agent_payment_type}
                onChange={(e) => setDraft((d) => ({ ...d, agent_payment_type: e.target.value }))}
              >
                {paymentTypeFilterOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Консигнация</Label>
              <FilterSelect
                emptyLabel="Обе"
                className={compactSelect}
                value={draft.order_consignment === "all" ? "" : draft.order_consignment}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    order_consignment: (e.target.value || "all") as Draft["order_consignment"]
                  }))
                }
              >
                <option value="consignment">Консигнация</option>
                <option value="regular">Без консигнации</option>
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>
                {territoryFilterSpecs.find((s) => s.field === "zone")?.label ?? "Зона"}
              </Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.territory_zone}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    territory_zone: e.target.value,
                    territory_region: "",
                    territory_city: ""
                  }))
                }
              >
                {territoryCascade.zones.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>
                {territoryFilterSpecs.find((s) => s.field === "region")?.label ?? "Область"}
              </Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.territory_region}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    territory_region: e.target.value,
                    territory_city: ""
                  }))
                }
              >
                {territoryCascade.regions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>
                {territoryFilterSpecs.find((s) => s.field === "city")?.label ?? "Город"}
              </Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.territory_city}
                onChange={(e) => setDraft((d) => ({ ...d, territory_city: e.target.value }))}
              >
                {territoryCascade.cities.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1">
              <Label className={filterLbl}>Консигнация (агент)</Label>
              <FilterSelect
                emptyLabel="Все"
                className={compactSelect}
                value={draft.agent_consignment}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, agent_consignment: e.target.value as Draft["agent_consignment"] }))
                }
              >
                <option value="regular">Обычный агент</option>
                <option value="consignment">Консигнация</option>
              </FilterSelect>
            </div>
          </div>

          {(consignQuick === "custom" || shipQuick === "custom") && (
            <div className="grid gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {consignQuick === "custom" ? (
                <>
                  <div className="space-y-1">
                    <Label className={filterLbl}>Срок консигнации — от</Label>
                    <Input
                      type="date"
                      value={draft.order_consignment_due_from}
                      onChange={(e) => {
                        setConsignQuick("custom");
                        setDraft((d) => ({ ...d, order_consignment_due_from: e.target.value }));
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={filterLbl}>Срок консигнации — до</Label>
                    <Input
                      type="date"
                      value={draft.order_consignment_due_to}
                      onChange={(e) => {
                        setConsignQuick("custom");
                        setDraft((d) => ({ ...d, order_consignment_due_to: e.target.value }));
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                </>
              ) : null}
              {shipQuick === "custom" ? (
                <>
                  <div className="space-y-1">
                    <Label className={filterLbl}>Дата отгрузки — от</Label>
                    <Input
                      type="date"
                      value={draft.shipment_date_from}
                      onChange={(e) => {
                        setShipQuick("custom");
                        setDraft((d) => ({ ...d, shipment_date_from: e.target.value }));
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={filterLbl}>Дата отгрузки — до</Label>
                    <Input
                      type="date"
                      value={draft.shipment_date_to}
                      onChange={(e) => {
                        setShipQuick("custom");
                        setDraft((d) => ({ ...d, shipment_date_to: e.target.value }));
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={buttonVariants({ variant: "outline", size: "icon" })}
              title="Сбросить фильтры"
              onClick={() => {
                const fresh = emptyDraft();
                setDraft(fresh);
                setShipQuick("all");
                setConsignQuick("all");
                setClientSearch("");
                pushDraft(fresh);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "default" }), "min-w-[9rem] px-6")}
              onClick={onApply}
            >
              Применить
            </button>
          </div>

          <div
            className="table-toolbar -mx-4 flex flex-wrap items-end gap-2 border-t border-border/80 bg-muted/30 px-4 py-2.5"
            role="toolbar"
            aria-label="Таблица: колонки, страница, поиск"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1"
              onClick={() => setColumnDialogOpen(true)}
            >
              <ListOrdered className="h-4 w-4" />
              Колонки
            </Button>
            <label className="shrink-0 text-xs font-medium text-foreground/85">
              <span className="sr-only">Строк на странице</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={String(draft.limit)}
                onChange={(e) => onLimit(Number.parseInt(e.target.value, 10) || 50)}
              >
                {[10, 15, 20, 30, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="relative min-w-[12rem] flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draft.search}
                onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                placeholder="Поиск"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={exporting}
              onClick={() => void downloadExcel()}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
            <button
              type="button"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              title="Обновить"
              onClick={() => void listQ.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {listQ.data && (
              <span className="text-xs text-muted-foreground">
                Σ остаток:{" "}
                <span className="font-medium text-foreground">
                  {formatNumberGrouped(listQ.data.summary.total_remainder, { maxFractionDigits: 2 })}
                </span>{" "}
                {listQ.data.summary.currency}
              </span>
            )}
          </div>

          <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <DialogContent className="max-h-[min(90vh,560px)] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Дополнительные фильтры</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className={filterLbl}>Супервайзер</Label>
                  <FilterSelect
                    emptyLabel="Все"
                    className={compactSelect}
                    value={draft.supervisor_user_id}
                    onChange={(e) => setDraft((d) => ({ ...d, supervisor_user_id: e.target.value }))}
                  >
                    {(supervisorsQ.data ?? []).map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.code ? `${a.fio} (${a.code})` : a.fio}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Статус клиента</Label>
                  <FilterSelect
                    emptyLabel="Все"
                    className={compactSelect}
                    value={draft.status}
                    onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Draft["status"] }))}
                  >
                    <option value="active">Активные</option>
                    <option value="inactive">Неактивные</option>
                  </FilterSelect>
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Филиал агента</Label>
                  <Input
                    value={draft.agent_branch}
                    onChange={(e) => setDraft((d) => ({ ...d, agent_branch: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Дата заказа от</Label>
                  <Input
                    type="date"
                    value={draft.order_date_from}
                    onChange={(e) => setDraft((d) => ({ ...d, order_date_from: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Дата заказа до</Label>
                  <Input
                    type="date"
                    value={draft.order_date_to}
                    onChange={(e) => setDraft((d) => ({ ...d, order_date_to: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Район</Label>
                  <Input
                    value={draft.territory_district}
                    onChange={(e) => setDraft((d) => ({ ...d, territory_district: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className={filterLbl}>Махалля</Label>
                  <Input
                    value={draft.territory_neighborhood}
                    onChange={(e) => setDraft((d) => ({ ...d, territory_neighborhood: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAdvancedOpen(false)}>
                  Закрыть
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setAdvancedOpen(false);
                    onApply();
                  }}
                >
                  Применить
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {err && <p className="text-sm text-destructive">{err}</p>}
          {listQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="app-table-thead text-xs">
                <tr>
                  {visibleCols.map((colId) => (
                    <DebtsSortTh
                      key={colId}
                      colId={colId}
                      sortBy={draft.sort_by}
                      sortDir={draft.sort_dir}
                      onSort={onSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {(listQ.data?.data ?? []).map((r: OrderDebtRow) => (
                  <tr key={r.order_id} className="border-b last:border-0 hover:bg-muted/30">
                    {visibleCols.map((colId) => (
                      <td key={`${r.order_id}-${colId}`} className={debtCellClass(colId)}>
                        {renderDebtCell(r, colId)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {listQ.data && listQ.data.data.length === 0 && !listQ.isLoading && (
              <p className="p-6 text-center text-sm text-muted-foreground">Нет данных.</p>
            )}
          </div>

          {listQ.data && listQ.data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Стр. {listQ.data.page} / {totalPages} · всего {listQ.data.total}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  disabled={listQ.data.page <= 1}
                  onClick={() => onPage(listQ.data.page - 1)}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  disabled={listQ.data.page >= totalPages}
                  onClick={() => onPage(listQ.data.page + 1)}
                >
                  Вперёд
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Столбцы отчёта"
        description="Видимые столбцы и порядок сохраняются для вашей учётной записи (сервер)."
        columns={ORDER_DEBTS_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />
    </PageShell>
  );
}
