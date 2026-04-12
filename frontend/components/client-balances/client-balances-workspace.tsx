"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerPopover, formatRuDateButton } from "@/components/ui/date-picker-popover";
import { FilterSelect, filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import type {
  AgentBalanceRow,
  ClientBalanceListResponse,
  ClientBalanceRow,
  ClientBalanceTerritoryOptions,
  ClientBalanceViewMode
} from "@/lib/client-balances-types";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { getUserFacingError } from "@/lib/error-utils";
import { paymentMethodSelectOptions, type ProfilePaymentMethodEntry } from "@/lib/payment-method-options";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Copy, FileSpreadsheet, Filter, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StaffPick = { id: number; fio: string; code?: string | null };

type FilterForm = {
  agent_id: string;
  expeditor_user_id: string;
  supervisor_user_id: string;
  trade_direction: string;
  category: string;
  status: "" | "active" | "inactive";
  balance_filter: "" | "debt" | "credit";
  agent_consignment: "" | "regular" | "consignment";
  territory_region: string;
  territory_city: string;
  territory_district: string;
  balance_as_of: string;
  consignment_due_from: string;
  consignment_due_to: string;
  agent_branch: string;
  agent_payment_type: string;
};

const defaultForm = (): FilterForm => ({
  agent_id: "",
  expeditor_user_id: "",
  supervisor_user_id: "",
  trade_direction: "",
  category: "",
  status: "",
  balance_filter: "",
  agent_consignment: "",
  territory_region: "",
  territory_city: "",
  territory_district: "",
  balance_as_of: "",
  consignment_due_from: "",
  consignment_due_to: "",
  agent_branch: "",
  agent_payment_type: ""
});

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

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
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

function clientDisplayId(r: ClientBalanceRow): string {
  const c = r.client_code?.trim();
  return c ? c : String(r.client_id);
}

function amountForPaymentLabel(
  amounts: { label: string; amount: string }[],
  label: string
): string {
  return amounts.find((x) => x.label === label)?.amount ?? "0";
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildQuery(
  form: FilterForm,
  view: ClientBalanceViewMode,
  page: number,
  limit: number,
  search: string,
  largeExport?: boolean
): string {
  const p = new URLSearchParams();
  p.set("view", view);
  p.set("page", String(page));
  p.set("limit", String(limit));
  if (largeExport) {
    p.set("large_export", "1");
  }
  if (search.trim()) p.set("search", search.trim());
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.expeditor_user_id.trim()) p.set("expeditor_user_id", form.expeditor_user_id.trim());
  if (form.supervisor_user_id.trim()) p.set("supervisor_user_id", form.supervisor_user_id.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.category.trim()) p.set("category", form.category.trim());
  if (form.status) p.set("status", form.status);
  if (form.balance_filter) p.set("balance_filter", form.balance_filter);
  if (form.agent_consignment) p.set("agent_consignment", form.agent_consignment);
  if (form.territory_region.trim()) p.set("territory_region", form.territory_region.trim());
  if (form.territory_city.trim()) p.set("territory_city", form.territory_city.trim());
  if (form.territory_district.trim()) p.set("territory_district", form.territory_district.trim());
  if (form.balance_as_of.trim()) p.set("balance_as_of", form.balance_as_of.trim());
  if (form.consignment_due_from.trim()) p.set("consignment_due_from", form.consignment_due_from.trim());
  if (form.consignment_due_to.trim()) p.set("consignment_due_to", form.consignment_due_to.trim());
  if (form.agent_branch.trim()) p.set("agent_branch", form.agent_branch.trim());
  if (form.agent_payment_type.trim()) p.set("agent_payment_type", form.agent_payment_type.trim());
  return p.toString();
}

/**
 * Balans / способ оплаты: manfiy = qarz (qizil), nol va musbat = yashil.
 */
function MoneyCell({
  value,
  align = "right",
  className,
  /** Svodka-kartochkalar: nol ham «NAQD» kabi qalin, kulrang emas */
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
          (summaryKpi
            ? "font-semibold text-foreground"
            : "font-medium text-muted-foreground"),
        className
      )}
    >
      {formatNumberGrouped(value, { maxFractionDigits: 2 })} UZS
    </span>
  );
}

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

async function downloadClientsExcel(
  rows: ClientBalanceRow[],
  view: ClientBalanceViewMode,
  paymentColumnLabels: string[]
) {
  const baseHeaders = [
    "Ид клиента",
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
    "Дата последней доставки заказа",
    "Дата последней оплаты",
    "Дни с последней оплаты",
    "Общий"
  ];
  const payHeaders = paymentColumnLabels.length > 0 ? paymentColumnLabels : [];
  const headers = [...baseHeaders, ...payHeaders];
  const dataRows = rows.map((r) => {
    const base = [
      clientDisplayId(r),
      r.name,
      r.agent_name ?? "",
      r.agent_code ?? "",
      r.supervisor_name ?? "",
      r.legal_name ?? "",
      r.trade_direction ?? "",
      r.inn ?? "",
      r.phone ?? "",
      r.license_until ? formatDateOnly(r.license_until) : "",
      r.days_overdue ?? "",
      r.last_order_at ?? "",
      r.last_payment_at ?? "",
      r.days_since_payment ?? "",
      r.balance
    ];
    const payCells = payHeaders.map((lab) => amountForPaymentLabel(r.payment_amounts, lab));
    return [...base, ...payCells];
  });
  const sheet = view === "clients_delivery" ? "По доставленным заказам" : "По клиентам";
  await downloadXlsxSheet(
    `balansy-klientov-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheet,
    headers,
    dataRows
  );
}

async function downloadAgentsExcel(rows: AgentBalanceRow[], paymentColumnLabels: string[]) {
  const headers = ["Агент id", "Агент", "Код", "Клиентов", "Общий", ...paymentColumnLabels];
  const dataRows = rows.map((r) => [
    r.agent_id ?? "",
    r.agent_name ?? "",
    r.agent_code ?? "",
    r.clients_count,
    r.balance,
    ...paymentColumnLabels.map((lab) => amountForPaymentLabel(r.payment_amounts, lab))
  ]);
  await downloadXlsxSheet(
    `balansy-agentov-${new Date().toISOString().slice(0, 10)}.xlsx`,
    "По агентам",
    headers,
    dataRows
  );
}

const filterFieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function ClientBalancesWorkspace() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const [draft, setDraft] = useState<FilterForm>(() => defaultForm());
  const [applied, setApplied] = useState<FilterForm>(() => defaultForm());
  const [view, setView] = useState<ClientBalanceViewMode>("clients");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [copyFlash, setCopyFlash] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [excelBusy, setExcelBusy] = useState(false);
  const [balanceAsOfOpen, setBalanceAsOfOpen] = useState(false);
  const [consignFromOpen, setConsignFromOpen] = useState(false);
  const [consignToOpen, setConsignToOpen] = useState(false);
  const balanceAsOfAnchorRef = useRef<HTMLButtonElement>(null);
  const consignFromAnchorRef = useRef<HTMLButtonElement>(null);
  const consignToAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const queryString = useMemo(
    () => buildQuery(applied, view, page, limit, debouncedSearch),
    [applied, view, page, limit, debouncedSearch]
  );

  const listQ = useQuery({
    queryKey: ["client-balances", tenantSlug, queryString],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<ClientBalanceListResponse>(
        `/api/${tenantSlug}/client-balances?${queryString}`
      );
      return data;
    }
  });

  const territoryQ = useQuery({
    queryKey: ["client-balances-territory", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientBalanceTerritoryOptions }>(
        `/api/${tenantSlug}/client-balances/territory-options`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "client-balances-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "client-balances-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const supervisorsQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "client-balances-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(
        `/api/${tenantSlug}/supervisors?is_active=true`
      );
      return data.data;
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "client-balances"],
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
    queryKey: ["settings", "profile", tenantSlug, "client-balances-paytypes"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          payment_types?: string[];
          payment_method_entries?: ProfilePaymentMethodEntry[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const applyFilters = useCallback(() => {
    setApplied({ ...draft });
    setPage(1);
  }, [draft]);

  const clientRowsForSelection: ClientBalanceRow[] =
    view === "clients" && listQ.data?.view === "clients"
      ? (listQ.data.data as ClientBalanceRow[])
      : view === "clients_delivery" && listQ.data?.view === "clients_delivery"
        ? (listQ.data.data as ClientBalanceRow[])
        : [];
  const agentRows = (listQ.data?.view === "agents" ? listQ.data.data : []) as AgentBalanceRow[];

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;
  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  const summary = listQ.data?.summary;
  const paymentColumnLabels = summary?.payment_by_type.map((x) => x.label) ?? [];
  const isDeliveryView = view === "clients_delivery";

  const onTabView = (v: string | null) => {
    const next: ClientBalanceViewMode =
      v === "agents" ? "agents" : v === "clients_delivery" ? "clients_delivery" : "clients";
    setView(next);
    setPage(1);
    setSelected(new Set());
  };

  const tabValue = view === "agents" ? "agents" : view === "clients_delivery" ? "clients_delivery" : "clients";

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAllPage = () => {
    if (view !== "clients" && view !== "clients_delivery") return;
    const ids = clientRowsForSelection.map((r) => r.client_id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(() => {
      if (allOn) return new Set();
      return new Set(ids);
    });
  };

  const runExcelExport = useCallback(async () => {
    if (!tenantSlug) return;
    setExcelBusy(true);
    try {
      const qs = buildQuery(applied, view, 1, 5000, debouncedSearch, true);
      const { data } = await api.get<ClientBalanceListResponse>(
        `/api/${tenantSlug}/client-balances?${qs}`
      );
      const payLabels = data.summary.payment_by_type.map((x) => x.label);
      if (data.view === "agents") {
        await downloadAgentsExcel(data.data as AgentBalanceRow[], payLabels);
      } else {
        await downloadClientsExcel(data.data as ClientBalanceRow[], data.view, payLabels);
      }
    } finally {
      setExcelBusy(false);
    }
  }, [tenantSlug, applied, view, debouncedSearch]);

  const paymentTypeFilterOpts = useMemo(
    () => paymentMethodSelectOptions(profileQ.data, profileQ.data?.payment_types),
    [profileQ.data]
  );

  const to = territoryQ.data;

  return (
    <PageShell>
      <PageHeader
        title="Балансы клиентов"
        description={
          isDeliveryView
            ? "Долг по доставленным заказам: неоплаченный остаток (total − распределённые оплаты), дата — момент перехода в «доставлен»."
            : "Оплаты и долги: баланс из учёта; «Баланс на дату» — сумма движений по счёту до выбранного дня (UTC)."
        }
      />

      <div className="space-y-4">
        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="space-y-0 p-0">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Филиалы</Label>
                      <FilterSelect
                        emptyLabel="Все филиалы"
                        className={filterPanelSelectClassName}
                        value={draft.agent_branch}
                        onChange={(e) => setDraft((d) => ({ ...d, agent_branch: e.target.value }))}
                      >
                        {(to?.branches ?? []).map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Агент</Label>
                      <FilterSelect
                        emptyLabel="Агент"
                        className={filterPanelSelectClassName}
                        value={draft.agent_id}
                        onChange={(e) => setDraft((d) => ({ ...d, agent_id: e.target.value }))}
                      >
                        {(agentsQ.data ?? []).map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.fio}
                            {a.code ? ` (${a.code})` : ""}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Экспедитор</Label>
                      <FilterSelect
                        emptyLabel="Экспедитор"
                        className={filterPanelSelectClassName}
                        value={draft.expeditor_user_id}
                        onChange={(e) => setDraft((d) => ({ ...d, expeditor_user_id: e.target.value }))}
                      >
                        {(expeditorsQ.data ?? []).map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fio}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Категория</Label>
                      <Input
                        className="h-10"
                        placeholder="Категория"
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
                        emptyLabel="Направление"
                        className={filterPanelSelectClassName}
                        value={draft.trade_direction}
                        onChange={(e) => setDraft((d) => ({ ...d, trade_direction: e.target.value }))}
                      >
                        {(filterOptQ.data?.trade_directions ?? []).map((td) => (
                          <option key={td} value={td}>
                            {td}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Супервайзер</Label>
                      <FilterSelect
                        emptyLabel="Супервайзер"
                        className={filterPanelSelectClassName}
                        value={draft.supervisor_user_id}
                        onChange={(e) => setDraft((d) => ({ ...d, supervisor_user_id: e.target.value }))}
                      >
                        {(supervisorsQ.data ?? []).map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fio}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Общий баланс</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={filterPanelSelectClassName}
                        value={draft.balance_filter}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            balance_filter: e.target.value as FilterForm["balance_filter"]
                          }))
                        }
                      >
                        <option value="debt">Долг</option>
                        <option value="credit">Переплата</option>
                      </FilterSelect>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 xl:items-end">
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Тип оплаты</Label>
                      <FilterSelect
                        emptyLabel="Все счета"
                        className={filterPanelSelectClassName}
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
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Тип группы агента</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={filterPanelSelectClassName}
                        value={draft.agent_consignment}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            agent_consignment: e.target.value as FilterForm["agent_consignment"]
                          }))
                        }
                      >
                        <option value="regular">Обычная</option>
                        <option value="consignment">Консигнация</option>
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Территория 1 — область</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={filterPanelSelectClassName}
                        value={draft.territory_region}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_region: e.target.value }))}
                      >
                        {(to?.regions ?? []).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Территория 2 — город</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={filterPanelSelectClassName}
                        value={draft.territory_city}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_city: e.target.value }))}
                      >
                        {(to?.cities ?? []).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={filterFieldLabelClass}>Территория 3 — район</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={filterPanelSelectClassName}
                        value={draft.territory_district}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_district: e.target.value }))}
                      >
                        {(to?.districts ?? []).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="flex min-h-[2.5rem] items-end justify-start sm:col-span-2 lg:col-span-1 xl:justify-end">
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "h-10 w-full min-w-0 gap-2 bg-teal-600 px-4 text-white hover:bg-teal-700 sm:w-auto sm:min-w-[10rem] sm:px-5"
                        )}
                        onClick={applyFilters}
                      >
                        <Filter className="h-4 w-4 shrink-0 opacity-90" />
                        Применить
                      </button>
                    </div>
                  </div>
                </div>

                <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-border/70 pt-4 lg:w-[15.5rem] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 xl:w-[17rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Даты
                  </p>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Баланс на дату</Label>
                    <button
                      ref={balanceAsOfAnchorRef}
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-10 w-full justify-start gap-2 font-normal",
                        balanceAsOfOpen && "border-blue-500/60 bg-blue-500/5"
                      )}
                      aria-expanded={balanceAsOfOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setConsignFromOpen(false);
                        setConsignToOpen(false);
                        setBalanceAsOfOpen((o) => !o);
                      }}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {formatRuDateButton(draft.balance_as_of) || "дд.мм.гггг"}
                      </span>
                    </button>
                    <DatePickerPopover
                      open={balanceAsOfOpen}
                      onOpenChange={setBalanceAsOfOpen}
                      anchorRef={balanceAsOfAnchorRef as React.RefObject<HTMLElement | null>}
                      value={draft.balance_as_of}
                      onChange={(iso) => setDraft((d) => ({ ...d, balance_as_of: iso }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Консигнация — срок от</Label>
                    <button
                      ref={consignFromAnchorRef}
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-10 w-full justify-start gap-2 font-normal",
                        consignFromOpen && "border-blue-500/60 bg-blue-500/5"
                      )}
                      aria-expanded={consignFromOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setBalanceAsOfOpen(false);
                        setConsignToOpen(false);
                        setConsignFromOpen((o) => !o);
                      }}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {formatRuDateButton(draft.consignment_due_from) || "дд.мм.гггг"}
                      </span>
                    </button>
                    <DatePickerPopover
                      open={consignFromOpen}
                      onOpenChange={setConsignFromOpen}
                      anchorRef={consignFromAnchorRef as React.RefObject<HTMLElement | null>}
                      value={draft.consignment_due_from}
                      onChange={(iso) =>
                        setDraft((d) => ({
                          ...d,
                          consignment_due_from: iso,
                          consignment_due_to:
                            d.consignment_due_to.trim() && d.consignment_due_to < iso ? iso : d.consignment_due_to
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={filterFieldLabelClass}>Консигнация — срок до</Label>
                    <button
                      ref={consignToAnchorRef}
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-10 w-full justify-start gap-2 font-normal",
                        consignToOpen && "border-blue-500/60 bg-blue-500/5"
                      )}
                      aria-expanded={consignToOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setBalanceAsOfOpen(false);
                        setConsignFromOpen(false);
                        setConsignToOpen((o) => !o);
                      }}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {formatRuDateButton(draft.consignment_due_to) || "дд.мм.гггг"}
                      </span>
                    </button>
                    <DatePickerPopover
                      open={consignToOpen}
                      onOpenChange={setConsignToOpen}
                      anchorRef={consignToAnchorRef as React.RefObject<HTMLElement | null>}
                      value={draft.consignment_due_to}
                      onChange={(iso) =>
                        setDraft((d) => ({
                          ...d,
                          consignment_due_to: iso,
                          consignment_due_from:
                            d.consignment_due_from.trim() && d.consignment_due_from > iso
                              ? iso
                              : d.consignment_due_from
                        }))
                      }
                    />
                  </div>
                </aside>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                «Баланс на дату» — сумма движений до конца выбранного дня (UTC). Консигнация — диапазон дат лицензии
                агента (от / до).
              </p>
            </div>
          </CardContent>
        </Card>

        {summary ? (
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="space-y-3 p-3 sm:space-y-3 sm:p-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                <span className="font-medium text-foreground">Общий</span> — баланс по фильтру. Остальные карточки —
                только способы оплаты из <span className="font-medium">Настройки → способы оплаты</span> (суммы по{" "}
                <code className="rounded bg-muted px-1">payment_type</code>). Красный — долг, зелёный — ноль или
                плюс. Суммы по способам могут не совпадать с «Общий».
              </p>
              <div className="flex flex-wrap content-start items-start justify-start gap-2 sm:gap-3">
                <SummaryKpiCard
                  title={isDeliveryView ? "Долг по доставленным" : "Общий"}
                  value={summary.balance}
                />
                {(summary.payment_by_type ?? []).map((row, i) => (
                  <SummaryKpiCard key={`${row.label}-${i}`} title={row.label} value={row.amount} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={tabValue} onValueChange={onTabView}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="inline-flex h-auto min-h-10 w-full flex-wrap gap-0.5 rounded-lg border border-border bg-slate-100 p-1 sm:w-auto dark:bg-zinc-900/60">
              <TabsTrigger
                value="clients"
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600"
              >
                По клиентам
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600"
              >
                По агентам
              </TabsTrigger>
              <TabsTrigger
                value="clients_delivery"
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600"
              >
                По доставке
              </TabsTrigger>
            </TabsList>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 dark:bg-muted/20">
              <select
                className={cn(filterPanelSelectClassName, "h-9 min-w-[5.5rem] max-w-[6rem] py-0")}
                value={String(limit)}
                title="Строк на странице"
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
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Поиск"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                disabled={!listQ.data?.data.length || excelBusy}
                onClick={() => void runExcelExport()}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {excelBusy ? "…" : "Excel"}
              </button>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 w-9 p-0")}
                title="Обновить"
                onClick={() => void listQ.refetch()}
              >
                <RefreshCw className={cn("h-4 w-4", listQ.isFetching && "animate-spin")} />
              </button>
            </div>
          </div>

          <TabsContent value="clients" className="mt-3 outline-none">
            {listErrorDetail ? (
              <p className="text-sm text-destructive">{listErrorDetail}</p>
            ) : (
              <ClientLikeTable
                variant="clients"
                paymentColumnLabels={paymentColumnLabels}
                loading={listQ.isLoading}
                rows={
                  listQ.data?.view === "clients" ? (listQ.data.data as ClientBalanceRow[]) : []
                }
                selected={selected}
                onToggle={toggleSelect}
                onToggleAll={toggleSelectAllPage}
                onCopyId={(text) =>
                  void copyToClipboard(text).then((ok) => {
                    if (ok) {
                      setCopyFlash(true);
                      window.setTimeout(() => setCopyFlash(false), 1200);
                    }
                  })
                }
              />
            )}
          </TabsContent>

          <TabsContent value="clients_delivery" className="mt-3 outline-none">
            {listErrorDetail ? (
              <p className="text-sm text-destructive">{listErrorDetail}</p>
            ) : (
              <ClientLikeTable
                variant="delivery"
                paymentColumnLabels={paymentColumnLabels}
                loading={listQ.isLoading}
                rows={
                  listQ.data?.view === "clients_delivery"
                    ? (listQ.data.data as ClientBalanceRow[])
                    : []
                }
                selected={selected}
                onToggle={toggleSelect}
                onToggleAll={toggleSelectAllPage}
                onCopyId={(text) =>
                  void copyToClipboard(text).then((ok) => {
                    if (ok) {
                      setCopyFlash(true);
                      window.setTimeout(() => setCopyFlash(false), 1200);
                    }
                  })
                }
              />
            )}
          </TabsContent>

          <TabsContent value="agents" className="mt-3 outline-none">
            {listErrorDetail ? (
              <p className="text-sm text-destructive">{listErrorDetail}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                <table
                  className="w-full min-w-0 border-collapse text-sm"
                  style={{ minWidth: Math.max(900, 900 + paymentColumnLabels.length * 112) }}
                >
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="whitespace-nowrap px-3 py-2">Агент</th>
                      <th className="whitespace-nowrap px-3 py-2">Код</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Клиентов</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Общий</th>
                      {paymentColumnLabels.map((lab) => (
                        <th
                          key={lab}
                          className="max-w-[10rem] whitespace-normal px-3 py-2 text-right text-xs leading-tight"
                          title={lab}
                        >
                          {lab}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listQ.isLoading ? (
                      <tr>
                        <td
                          colSpan={4 + paymentColumnLabels.length}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          Загрузка…
                        </td>
                      </tr>
                    ) : agentRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4 + paymentColumnLabels.length}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      agentRows.map((r, idx) => (
                        <tr key={`${r.agent_id ?? "none"}-${idx}`} className="border-b border-border/80 hover:bg-muted/25">
                          <td className="px-3 py-2">
                            {r.agent_id != null ? (
                              <span className="font-medium">{r.agent_name ?? "—"}</span>
                            ) : (
                              <span className="text-muted-foreground">Без агента</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{r.agent_code ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.clients_count}</td>
                          <td className="px-3 py-2">
                            <MoneyCell value={r.balance} />
                          </td>
                          {paymentColumnLabels.map((lab) => (
                            <td key={`${r.agent_id ?? "x"}-${idx}-${lab}`} className="px-3 py-2">
                              <MoneyCell value={amountForPaymentLabel(r.payment_amounts, lab)} />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {copyFlash ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
            Скопировано
          </p>
        ) : null}

        {listQ.data && listQ.data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <p className="text-muted-foreground">
              Показано{" "}
              {Math.min((listQ.data.page - 1) * listQ.data.limit + 1, listQ.data.total)}–
              {Math.min(listQ.data.page * listQ.data.limit, listQ.data.total)} из {listQ.data.total}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                Стр. {listQ.data.page} / {totalPages}
              </span>
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
        ) : null}
      </div>
    </PageShell>
  );
}

function ClientLikeTable({
  variant,
  paymentColumnLabels,
  loading,
  rows,
  selected,
  onToggle,
  onToggleAll,
  onCopyId
}: {
  variant: "clients" | "delivery";
  paymentColumnLabels: string[];
  loading: boolean;
  rows: ClientBalanceRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onCopyId: (text: string) => void;
}) {
  const nPay = paymentColumnLabels.length;
  const colCount = 16 + nPay;
  const headBg = "bg-muted/50";
  const note =
    variant === "delivery"
      ? "Дни просрочки — от самой ранней неоплаченной доставки; последняя доставка — по незакрытым суммам."
      : null;
  const tableMinPx = Math.max(1100, 1100 + nPay * 112);

  return (
    <div className="space-y-2">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table
          className="w-full min-w-0 border-collapse text-sm"
          style={{ minWidth: tableMinPx }}
        >
          <thead>
            <tr
              className={cn(
                "border-b border-border text-left text-xs font-medium text-muted-foreground",
                headBg
              )}
            >
              <th className={cn("sticky left-0 z-10 w-10 border-r border-border px-2 py-2", headBg)}>
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.client_id))}
                  onChange={onToggleAll}
                />
              </th>
              <th className="whitespace-nowrap px-2 py-2">Ид клиента</th>
              <th className="whitespace-nowrap px-2 py-2">Клиент</th>
              <th className="whitespace-nowrap px-2 py-2">Агент</th>
              <th className="whitespace-nowrap px-2 py-2">Код агента</th>
              <th className="whitespace-nowrap px-2 py-2">Супервайзер</th>
              <th className="whitespace-nowrap px-2 py-2">Название фирмы</th>
              <th className="whitespace-nowrap px-2 py-2">Направление торговли</th>
              <th className="whitespace-nowrap px-2 py-2">ИНН</th>
              <th className="whitespace-nowrap px-2 py-2">Телефон</th>
              <th className="whitespace-nowrap px-2 py-2">Срок</th>
              <th className="whitespace-nowrap px-2 py-2">Дни просрочки</th>
              <th className="whitespace-nowrap px-2 py-2">Дата последней доставки заказа</th>
              <th className="whitespace-nowrap px-2 py-2">Дата последней оплаты</th>
              <th className="whitespace-nowrap px-2 py-2">Дни с последней оплаты</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">Общий</th>
              {paymentColumnLabels.map((lab) => (
                <th key={lab} className="max-w-[10rem] whitespace-normal px-2 py-2 text-right text-xs leading-tight" title={lab}>
                  {lab}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">
                  Загрузка…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">
                  Нет данных
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.client_id} className="border-b border-border/80 hover:bg-muted/25">
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-2 py-2">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={selected.has(r.client_id)}
                      onChange={() => onToggle(r.client_id)}
                    />
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <Link
                        className="text-primary underline-offset-2 hover:underline"
                        href={`/clients/${r.client_id}/balances`}
                      >
                        {clientDisplayId(r)}
                      </Link>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Копировать"
                        onClick={() => onCopyId(clientDisplayId(r))}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      className="text-primary underline-offset-2 hover:underline"
                      href={`/clients/${r.client_id}/balances`}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.agent_tags.length ? r.agent_tags : [r.agent_name ?? "—"]).map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{r.agent_code ?? "—"}</td>
                  <td className="max-w-[8rem] truncate px-2 py-2 text-xs">{r.supervisor_name ?? "—"}</td>
                  <td className="max-w-[10rem] truncate px-2 py-2 text-xs">{r.legal_name ?? "—"}</td>
                  <td className="max-w-[8rem] truncate px-2 py-2 text-xs">{r.trade_direction ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.inn ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{r.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{formatDateOnly(r.license_until)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.days_overdue != null ? r.days_overdue : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{formatDt(r.last_order_at)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">{formatDt(r.last_payment_at)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.days_since_payment != null ? r.days_since_payment : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <MoneyCell value={r.balance} />
                  </td>
                  {paymentColumnLabels.map((lab) => (
                    <td key={`${r.client_id}-${lab}`} className="px-2 py-2">
                      <MoneyCell value={amountForPaymentLabel(r.payment_amounts, lab)} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
