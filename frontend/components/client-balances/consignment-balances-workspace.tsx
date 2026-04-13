"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerPopover, formatRuDateButton, localYmd } from "@/components/ui/date-picker-popover";
import { FilterSelect, filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import type {
  ConsignmentBalanceListResponse,
  ConsignmentBalanceRow
} from "@/lib/consignment-balances-types";
import type { ClientBalanceTerritoryOptions } from "@/lib/client-balances-types";
import type { TerritoryNode } from "@/lib/territory-tree";
import {
  buildClientTerritoryFilterLevels,
  buildPaymentTerritorySelectOptions,
  type ClientTerritoryFilterField
} from "@/lib/territory-client-filters";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, FileSpreadsheet, Filter, RefreshCw, Search, Table2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StaffPick = { id: number; fio: string; code?: string | null };

type FilterForm = {
  branch_ids: Set<string>;
  agent_id: string;
  expeditor_user_id: string;
  category: string;
  status: "" | "active" | "inactive";
  trade_direction: string;
  territory_zone: string;
  territory_region: string;
  territory_city: string;
  territory_district: string;
  territory_neighborhood: string;
  /** Bitta kun — tanlangan maydonlarga qo‘llanadi */
  filter_date: string;
  apply_order_date: boolean;
  apply_license_from: boolean;
  apply_license_to: boolean;
};

const defaultForm = (): FilterForm => {
  return {
    branch_ids: new Set(),
    agent_id: "",
    expeditor_user_id: "",
    category: "",
    status: "",
    trade_direction: "",
    territory_zone: "",
    territory_region: "",
    territory_city: "",
    territory_district: "",
    territory_neighborhood: "",
    filter_date: localYmd(new Date()),
    apply_order_date: true,
    apply_license_from: false,
    apply_license_to: false
  };
};

function readTerritoryFormField(form: FilterForm, field: ClientTerritoryFilterField): string {
  switch (field) {
    case "zone":
      return form.territory_zone;
    case "region":
      return form.territory_region;
    case "city":
      return form.territory_city;
    case "district":
      return form.territory_district;
    case "neighborhood":
      return form.territory_neighborhood;
    default:
      return "";
  }
}

function patchTerritoryFormField(
  form: FilterForm,
  field: ClientTerritoryFilterField,
  value: string
): FilterForm {
  switch (field) {
    case "zone":
      return { ...form, territory_zone: value };
    case "region":
      return { ...form, territory_region: value };
    case "city":
      return { ...form, territory_city: value };
    case "district":
      return { ...form, territory_district: value };
    case "neighborhood":
      return { ...form, territory_neighborhood: value };
    default:
      return form;
  }
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

function clientDisplayId(r: ConsignmentBalanceRow): string {
  const c = r.client_code?.trim();
  return c ? c : String(r.client_id);
}

function amountForPaymentLabel(
  amounts: ConsignmentBalanceRow["payment_amounts"] | undefined,
  label: string
): string {
  return amounts?.find((x) => x.label === label)?.amount ?? "0";
}

function MoneyCell({
  value,
  align = "right",
  className,
  summaryKpi = false
}: {
  value: string;
  align?: "left" | "right" | "center";
  className?: string;
  summaryKpi?: boolean;
}) {
  const n = parseAmount(value);
  const debt = n < 0;
  const credit = n > 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        align === "right" && "block text-right",
        align === "center" && "block text-center",
        align === "left" && "block text-left",
        debt && "font-medium text-destructive",
        credit && "font-medium text-emerald-700 dark:text-emerald-400",
        !debt &&
          !credit &&
          (summaryKpi ? "font-semibold text-foreground" : "font-medium text-muted-foreground"),
        className
      )}
    >
      {formatNumberGrouped(value, { maxFractionDigits: 2 })}
    </span>
  );
}

/** «Балансы клиентов» bilan bir xil KPI kartochka */
function SummaryKpiCard({ title, value }: { title: string; value: string }) {
  const n = parseAmount(value);
  const debt = n < 0;
  /** Qarzdan boshqa barcha kartochkalar — «ОБЩИЙ» / «NAQD» bilan bir xil yashil ramka */
  const positiveFrame = !debt;
  return (
    <Card
      className={cn(
        "flex h-[6rem] w-[11.5rem] shrink-0 flex-col overflow-hidden bg-card shadow-sm sm:h-[6.5rem] sm:w-[13.5rem]",
        "border border-t-[4px]",
        positiveFrame &&
          "border-emerald-200/90 border-t-emerald-500 dark:border-emerald-900/55 dark:border-t-emerald-500",
        debt && "border border-t-[4px] border-red-200/90 border-t-red-500 ring-1 ring-destructive/20 dark:border-red-900/50 dark:border-t-red-500"
      )}
    >
      <CardContent className="flex h-full min-h-0 max-w-full flex-1 flex-col items-center justify-center gap-1.5 overflow-x-auto overflow-y-hidden px-2 py-3 text-center sm:gap-2 sm:px-3 sm:py-3.5">
        <p
          className={cn(
            "line-clamp-2 w-full max-w-full px-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-[11px]",
            debt && "text-destructive"
          )}
          title={title}
        >
          {title}
        </p>
        <div className="w-full min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin]">
          <MoneyCell
            value={value}
            align="center"
            summaryKpi
            className="inline-block min-w-0 whitespace-nowrap px-0.5 text-[11px] font-semibold tabular-nums sm:text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function buildQuery(
  form: FilterForm,
  page: number,
  limit: number,
  search: string,
  largeExport?: boolean
): string {
  const p = new URLSearchParams();
  p.set("view", "clients");
  p.set("page", String(page));
  p.set("limit", String(limit));
  if (largeExport) p.set("large_export", "1");
  if (search.trim()) p.set("search", search.trim());
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.expeditor_user_id.trim()) p.set("expeditor_user_id", form.expeditor_user_id.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.category.trim()) p.set("category", form.category.trim());
  if (form.status) p.set("status", form.status);
  if (form.territory_zone.trim()) p.set("territory_zone", form.territory_zone.trim());
  if (form.territory_region.trim()) p.set("territory_region", form.territory_region.trim());
  if (form.territory_city.trim()) p.set("territory_city", form.territory_city.trim());
  if (form.territory_district.trim()) p.set("territory_district", form.territory_district.trim());
  if (form.territory_neighborhood.trim()) {
    p.set("territory_neighborhood", form.territory_neighborhood.trim());
  }
  const day = form.filter_date.trim();
  if (form.apply_order_date && day) {
    p.set("order_date_from", day);
    p.set("order_date_to", day);
  }
  if (form.apply_license_from && day) {
    p.set("consignment_due_from", day);
  }
  if (form.apply_license_to && day) {
    p.set("consignment_due_to", day);
  }
  if (form.branch_ids.size > 0) p.set("branch_ids", Array.from(form.branch_ids).join(","));
  return p.toString();
}

async function downloadConsignmentExcel(rows: ConsignmentBalanceRow[], paymentColumnLabels: string[]) {
  const payHeaders = paymentColumnLabels.length > 0 ? paymentColumnLabels : [];
  const headers = [
    "ID клиента",
    "Клиент",
    "Агент",
    "Код агента",
    "Супервайзер",
    "Название фирмы",
    "Направление торговли",
    "ИНН",
    "Телефон",
    "Срок",
    "Дни просрочки",
    "Общий долг",
    "Общее оплачено",
    "Баланс",
    ...payHeaders
  ];
  const dataRows = rows.map((r) => [
    clientDisplayId(r),
    r.client_name,
    r.agent_name ?? "",
    r.agent_code ?? "",
    r.supervisor_name ?? "",
    r.company_name ?? "",
    r.trade_direction ?? "",
    r.inn ?? "",
    r.phone ?? "",
    r.due_date ? formatDateOnly(r.due_date) : "",
    r.overdue_days ?? "",
    r.total_debt,
    r.total_paid,
    r.balance,
    ...payHeaders.map((lab) => amountForPaymentLabel(r.payment_amounts, lab))
  ]);
  await downloadXlsxSheet(
    `balansy-konsignatsiya-${new Date().toISOString().slice(0, 10)}.xlsx`,
    "Консигнация",
    headers,
    dataRows
  );
}

const filterFieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function ConsignmentBalancesWorkspace() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const [draft, setDraft] = useState<FilterForm>(() => defaultForm());
  const [applied, setApplied] = useState<FilterForm>(() => defaultForm());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [filterDateOpen, setFilterDateOpen] = useState(false);
  const filterDateRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const queryString = useMemo(
    () => buildQuery(applied, page, limit, debouncedSearch),
    [applied, page, limit, debouncedSearch]
  );

  const listQ = useQuery({
    queryKey: ["client-balances-consignment", tenantSlug, queryString],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.heavyList,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await api.get<ConsignmentBalanceListResponse>(
        `/api/${tenantSlug}/client-balances/consignment?${queryString}`
      );
      return data;
    }
  });

  const territoryQ = useQuery({
    queryKey: ["client-balances-territory", tenantSlug, "consignment"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientBalanceTerritoryOptions }>(
        `/api/${tenantSlug}/client-balances/territory-options`
      );
      return data.data;
    }
  });

  const clientRefsQ = useQuery({
    queryKey: ["clients", "references", tenantSlug, "consignment-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        regions?: string[];
        cities?: string[];
        districts?: string[];
        zones?: string[];
        neighborhoods?: string[];
        region_options?: { value: string; label: string }[];
        city_options?: { value: string; label: string }[];
      }>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "consignment-territory"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          territory_levels?: string[];
          territory_nodes?: TerritoryNode[];
          trade_directions?: string[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "consignment-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "consignment-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "consignment-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { trade_directions: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const applyFilters = useCallback(() => {
    setApplied({ ...draft });
    setPage(1);
  }, [draft]);

  const resetDraftToApplied = useCallback(() => {
    setDraft({ ...applied });
  }, [applied]);

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;
  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  const to = territoryQ.data;

  const territoryFilterSpecs = useMemo(
    () => buildClientTerritoryFilterLevels(profileQ.data?.territory_levels),
    [profileQ.data?.territory_levels]
  );

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

  const branchItems = useMemo(() => {
    const rows = (to?.branches ?? []).map((b) => ({ id: b, title: b }));
    const q = branchSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [to?.branches, branchSearch]);

  const runExcelExport = useCallback(async () => {
    if (!tenantSlug) return;
    setExcelBusy(true);
    try {
      const qs = buildQuery(applied, 1, 5000, debouncedSearch, true);
      const { data } = await api.get<ConsignmentBalanceListResponse>(
        `/api/${tenantSlug}/client-balances/consignment?${qs}`
      );
      const payLabels = (data.summary.payment_by_type ?? []).map((x) => x.label);
      await downloadConsignmentExcel(data.data, payLabels);
    } finally {
      setExcelBusy(false);
    }
  }, [tenantSlug, applied, debouncedSearch]);

  const rows = listQ.data?.data ?? [];
  const summary = listQ.data?.summary;
  const paymentColumnLabels = (summary?.payment_by_type ?? []).map((x) => x.label);

  return (
    <PageShell>
      <PageHeader
        title="Балансы клиентов по консигнации"
        description="Заказы с признаком консигнации или консигнационным агентом, только доставленные клиенту: долг = сумма заказа − оплаты по заказу. В списке только должники."
      />

      <div className="space-y-4 pb-12">
        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="space-y-4 p-3 sm:p-4 sm:pt-3.5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
              <div className="min-w-0 flex-1">
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(11.5rem,1fr))]">
                  <div className="space-y-1.5 sm:min-w-0">
                    <SearchableMultiSelectPanel<string>
                      label="Филиалы"
                      className="w-full"
                      items={branchItems}
                      selected={draft.branch_ids}
                      onSelectedChange={(fn) => {
                        setDraft((d) => {
                          const prev = new Set(d.branch_ids);
                          const next = typeof fn === "function" ? fn(prev) : fn;
                          return { ...d, branch_ids: next };
                        });
                      }}
                      search={branchSearch}
                      onSearchChange={setBranchSearch}
                      triggerPlaceholder="Все филиалы"
                      selectAllLabel="Выбрать все"
                      clearVisibleLabel="Снять выбор"
                      searchPlaceholder="Поиск филиала…"
                      minPopoverWidth={260}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Агент</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={filterPanelSelectClassName}
                      value={draft.agent_id}
                      onChange={(e) => setDraft((d) => ({ ...d, agent_id: e.target.value }))}
                    >
                      {(agentsQ.data ?? []).map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.fio}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Экспедитор</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={filterPanelSelectClassName}
                      value={draft.expeditor_user_id}
                      onChange={(e) => setDraft((d) => ({ ...d, expeditor_user_id: e.target.value }))}
                    >
                      {(expeditorsQ.data ?? []).map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.fio}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Категория</Label>
                    <Input
                      className="h-9 bg-background text-sm"
                      placeholder="Текст"
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Статус</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={filterPanelSelectClassName}
                      value={draft.status}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, status: e.target.value as FilterForm["status"] }))
                      }
                    >
                      <option value="active">Активные</option>
                      <option value="inactive">Неактивные</option>
                    </FilterSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Направление торговли</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={filterPanelSelectClassName}
                      value={draft.trade_direction}
                      onChange={(e) => setDraft((d) => ({ ...d, trade_direction: e.target.value }))}
                    >
                      {tradeDirectionSelectValues.map((td) => (
                        <option key={td} value={td}>
                          {td}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  {territoryFilterSpecs.map((spec) => {
                    const opts = buildPaymentTerritorySelectOptions(
                      spec.field,
                      clientRefsQ.data,
                      to,
                      profileQ.data?.territory_nodes,
                      readTerritoryFormField(draft, spec.field)
                    );
                    return (
                      <div key={`${spec.field}-${spec.visIndex}`} className="space-y-1.5">
                        <Label className={filterFieldLabelClass}>{spec.label}</Label>
                        <FilterSelect
                          emptyLabel="Все"
                          className={filterPanelSelectClassName}
                          value={readTerritoryFormField(draft, spec.field)}
                          onChange={(e) =>
                            setDraft((d) => patchTerritoryFormField(d, spec.field, e.target.value))
                          }
                        >
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </FilterSelect>
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="w-full shrink-0 space-y-3 border-t border-border/70 pt-4 xl:w-[19.5rem] xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <p className={filterFieldLabelClass}>Даты</p>
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2.5">
                  <p className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Применить период к
                  </p>
                  <div className="grid grid-cols-3 gap-1 sm:gap-2">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <span
                        className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground"
                        title="Фильтр по дате заказа"
                      >
                        Дата заказа
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_order_date}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_order_date: e.target.checked }))
                        }
                        aria-label="Дата заказа"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <span
                        className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground"
                        title="Срок от (лицензия)"
                      >
                        Срок от
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_license_from}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_license_from: e.target.checked }))
                        }
                        aria-label="Срок от (лицензия)"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <span
                        className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground"
                        title="Срок до (лицензия)"
                      >
                        Срок до
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_license_to}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_license_to: e.target.checked }))
                        }
                        aria-label="Срок до (лицензия)"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <button
                    ref={filterDateRef}
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-10 w-full justify-start gap-2 font-normal",
                      filterDateOpen && "border-primary/60 bg-primary/5"
                    )}
                    aria-expanded={filterDateOpen}
                    aria-haspopup="dialog"
                    onClick={() => setFilterDateOpen((o) => !o)}
                  >
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-left text-xs sm:text-sm">
                      {formatRuDateButton(draft.filter_date) || "дд.мм.гггг"}
                    </span>
                  </button>
                  <DatePickerPopover
                    open={filterDateOpen}
                    onOpenChange={setFilterDateOpen}
                    anchorRef={filterDateRef as React.RefObject<HTMLElement | null>}
                    value={draft.filter_date}
                    onChange={(iso) => setDraft((d) => ({ ...d, filter_date: iso }))}
                  />
                </div>
              </aside>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="hidden max-w-xl text-xs text-muted-foreground sm:block">
                Сверху отметьте, к чему относится выбранная дата; ниже — один день в календаре. В таблице только
                неоплаченный остаток по консигнации.
              </p>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 gap-1.5")}
                  onClick={resetDraftToApplied}
                >
                  <Filter className="h-4 w-4" />
                  Сброс
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-9 min-w-[9rem] rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors",
                    "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                    "dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  )}
                  onClick={applyFilters}
                >
                  Применить
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {!hydrated ? (
          <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
        ) : !tenantSlug ? (
          <p className="text-sm text-destructive">
            <Link href="/login" className="underline">
              Войти
            </Link>
          </p>
        ) : (
          <>
            {summary ? (
              <Card className="border border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-3 sm:space-y-3 sm:p-4">
                  <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                    <span className="font-medium text-foreground">Общий</span> — весь неоплаченный остаток по
                    консигнации. Остальные карточки — способы оплаты из настроек: нетто по{" "}
                    <code className="rounded bg-muted px-1">payment_type</code> минус долг по заказам с соответствующим{" "}
                    <code className="rounded bg-muted px-1">payment_method_ref</code>. Красный — долг, зелёный — ноль или
                    плюс.
                  </p>
                  <div className="flex flex-wrap content-start items-start justify-start gap-2 sm:gap-3">
                    <SummaryKpiCard title="Общий" value={summary.total_debt} />
                    {(summary.payment_by_type ?? []).map((row, i) => (
                      <SummaryKpiCard key={`${row.label}-${i}`} title={row.label} value={row.amount} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-border/60 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-3.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span
                    className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-muted/30 px-2 text-muted-foreground"
                    title="Таблица"
                  >
                    <Table2 className="h-4 w-4" />
                  </span>
                  <select
                    className={cn(filterPanelSelectClassName, "h-9 w-[5.5rem] shrink-0 bg-background")}
                    value={String(limit)}
                    onChange={(e) => {
                      setLimit(Number.parseInt(e.target.value, 10) || 10);
                      setPage(1);
                    }}
                  >
                    <option value="10">10</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                  <div className="relative min-w-[10rem] max-w-md flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 w-full bg-background pl-9"
                      placeholder="Поиск"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFilters();
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "gap-1.5 border-emerald-600/30 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    )}
                    disabled={excelBusy || rows.length === 0}
                    onClick={() => void runExcelExport()}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </button>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-9 shrink-0 px-0")}
                    onClick={() => void listQ.refetch()}
                    title="Обновить"
                  >
                    <RefreshCw className={cn("h-4 w-4", listQ.isFetching && "animate-spin")} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {listErrorDetail ? (
              <p className="text-sm text-destructive">{listErrorDetail}</p>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted/95 px-2 py-2 font-medium backdrop-blur-sm">
                      Ид клиента
                    </th>
                    <th className="px-2 py-2 font-medium">Клиент</th>
                    <th className="px-2 py-2 font-medium">Агент</th>
                    <th className="px-2 py-2 font-medium">Код агента</th>
                    <th className="px-2 py-2 font-medium">Супервайзер</th>
                    <th className="px-2 py-2 font-medium">Название фирмы</th>
                    <th className="px-2 py-2 font-medium">Направление</th>
                    <th className="px-2 py-2 font-medium">ИНН</th>
                    <th className="px-2 py-2 font-medium">Телефон</th>
                    <th className="px-2 py-2 font-medium">Срок</th>
                    <th className="px-2 py-2 font-medium text-right">Дни просрочки</th>
                    <th className="px-2 py-2 font-medium text-right">Общий долг</th>
                    <th className="px-2 py-2 font-medium text-right">Общее оплачено</th>
                    <th className="px-2 py-2 font-medium text-right">Общий баланс</th>
                    {paymentColumnLabels.map((lab) => (
                      <th key={lab} className="px-2 py-2 font-medium text-right">
                        {lab}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading ? (
                    <tr>
                      <td
                        colSpan={14 + paymentColumnLabels.length}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        Загрузка…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14 + paymentColumnLabels.length}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        Нет долга по консигнации с выбранными фильтрами
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.client_id} className="border-b border-border/60 hover:bg-muted/25">
                        <td className="sticky left-0 z-[1] bg-card px-2 py-2 text-xs tabular-nums shadow-[1px_0_0_0_hsl(var(--border))]">
                          <Link
                            href={`/clients/${r.client_id}/balances`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {clientDisplayId(r)}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] truncate px-2 py-2" title={r.client_name}>
                          {r.client_name}
                        </td>
                        <td className="max-w-[8rem] truncate px-2 py-2">{r.agent_name ?? "—"}</td>
                        <td className="px-2 py-2 text-xs">{r.agent_code ?? "—"}</td>
                        <td className="max-w-[8rem] truncate px-2 py-2">{r.supervisor_name ?? "—"}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2" title={r.company_name ?? ""}>
                          {r.company_name ?? "—"}
                        </td>
                        <td className="max-w-[8rem] truncate px-2 py-2">{r.trade_direction ?? "—"}</td>
                        <td className="px-2 py-2 text-xs tabular-nums">{r.inn ?? "—"}</td>
                        <td className="px-2 py-2 text-xs tabular-nums">{r.phone ?? "—"}</td>
                        <td
                          className={cn(
                            "px-2 py-2 text-xs tabular-nums",
                            r.overdue_days != null && r.overdue_days > 0 && "font-medium text-destructive"
                          )}
                        >
                          {formatDateOnly(r.due_date)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.overdue_days ?? "—"}</td>
                        <td className="px-2 py-2">
                          <MoneyCell value={r.total_debt} />
                        </td>
                        <td className="px-2 py-2">
                          <MoneyCell value={r.total_paid} />
                        </td>
                        <td className="px-2 py-2">
                          <MoneyCell value={r.balance} />
                        </td>
                        {paymentColumnLabels.map((lab) => (
                          <td key={lab} className="px-2 py-2">
                            <MoneyCell value={amountForPaymentLabel(r.payment_amounts, lab)} />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-transparent pt-1 text-sm text-muted-foreground">
              <span>
                {(() => {
                  const total = listQ.data?.total ?? 0;
                  if (total === 0) return "Показано 0 / 0";
                  const from = (page - 1) * limit + 1;
                  const to = Math.min(page * limit, total);
                  return `Показано ${from}–${to} / ${total} · стр. ${page} / ${totalPages}`;
                })()}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Вперёд
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
