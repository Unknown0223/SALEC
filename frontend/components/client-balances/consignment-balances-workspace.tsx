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
  buildZoneRegionCityCascadeOptions
} from "@/lib/territory-client-filters";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, FileSpreadsheet, Filter, RefreshCw, Search, Table2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StaffPick = {
  id: number;
  fio: string;
  code?: string | null;
  /** Agent / ekspektor / boshqalar — filial bo‘yicha toraytirish uchun */
  branch?: string | null;
  supervisor_user_id?: number | null;
  trade_direction?: string | null;
  expeditor_assignment_rules?: {
    trade_directions?: string[];
    agent_ids?: number[];
    price_types?: string[];
    warehouse_ids?: number[];
    territories?: string[];
    weekdays?: number[];
  };
};

type FilterForm = {
  branch_ids: Set<string>;
  supervisor_user_id: string;
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
    supervisor_user_id: "",
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

function normTrim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

type ConsignmentAgentSkip = Partial<{
  branch: true;
  supervisor: true;
  agent: true;
  tradeDirection: true;
  expeditor: true;
}>;

function agentMatchesExpeditor(agent: StaffPick, exp: StaffPick | undefined): boolean {
  if (!exp) return true;
  const rules = exp.expeditor_assignment_rules;
  if (!rules || typeof rules !== "object") return true;
  const agentIds = rules.agent_ids ?? [];
  const tds = rules.trade_directions ?? [];
  const hasRestrict = agentIds.length > 0 || tds.length > 0;
  if (!hasRestrict) return true;
  if (agentIds.length > 0 && agentIds.includes(agent.id)) return true;
  const td = normTrim(agent.trade_direction);
  if (tds.length > 0 && td) {
    if (tds.some((x) => normTrim(x) === td)) return true;
  }
  if (tds.length > 0 && !td) return false;
  return agentIds.length > 0 ? false : true;
}

function buildConsignmentTerritoryScopeParams(form: FilterForm): string {
  const p = new URLSearchParams();
  if (form.branch_ids.size > 0) p.set("branch_ids", Array.from(form.branch_ids).join(","));
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.expeditor_user_id.trim()) p.set("expeditor_user_id", form.expeditor_user_id.trim());
  if (form.supervisor_user_id.trim()) p.set("supervisor_user_id", form.supervisor_user_id.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.category.trim()) p.set("category", form.category.trim());
  if (form.status) p.set("status", form.status);
  return p.toString();
}

function expeditorMatchesConsignmentBranches(exp: StaffPick, branchIds: Set<string>): boolean {
  if (branchIds.size === 0) return true;
  const rules = exp.expeditor_assignment_rules;
  const hasAgentOrTdRules =
    rules &&
    typeof rules === "object" &&
    ((rules.agent_ids?.length ?? 0) > 0 || (rules.trade_directions?.length ?? 0) > 0);
  if (hasAgentOrTdRules) return true;
  const eb = normTrim(exp.branch);
  if (!eb) return true;
  for (const b of Array.from(branchIds)) {
    if (normTrim(b) === eb) return true;
  }
  return false;
}

function filterConsignmentAgents(
  agents: StaffPick[],
  expeditors: StaffPick[] | undefined,
  d: FilterForm,
  skip: ConsignmentAgentSkip
): StaffPick[] {
  const branchSkip = skip.branch;
  const bid = d.branch_ids;
  const supRaw = skip.supervisor ? "" : d.supervisor_user_id;
  const supId = Number.parseInt(supRaw, 10);
  const td = skip.tradeDirection ? "" : normTrim(d.trade_direction);
  const agId = skip.agent ? NaN : Number.parseInt(d.agent_id, 10);
  const exp =
    skip.expeditor || !normTrim(d.expeditor_user_id)
      ? undefined
      : expeditors?.find((e) => String(e.id) === d.expeditor_user_id);

  return agents.filter((a) => {
    if (Number.isFinite(agId) && a.id !== agId) return false;
    if (!branchSkip && bid.size > 0) {
      const ab = normTrim(a.branch);
      if (!ab || !bid.has(ab)) return false;
    }
    if (Number.isFinite(supId) && (a.supervisor_user_id ?? -1) !== supId) return false;
    if (td && normTrim(a.trade_direction) !== td) return false;
    if (!agentMatchesExpeditor(a, exp)) return false;
    return true;
  });
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

function normPayColumnLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function amountForPaymentLabel(
  amounts: ConsignmentBalanceRow["payment_amounts"] | undefined,
  label: string,
  fallbackIndex?: number
): string {
  if (!amounts?.length) return "0";
  const want = normPayColumnLabel(label);
  const hit = amounts.find((x) => normPayColumnLabel(x.label) === want);
  if (hit) return hit.amount;
  if (
    typeof fallbackIndex === "number" &&
    Number.isInteger(fallbackIndex) &&
    fallbackIndex >= 0 &&
    fallbackIndex < amounts.length
  ) {
    return amounts[fallbackIndex]?.amount ?? "0";
  }
  return "0";
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
  if (form.supervisor_user_id.trim()) p.set("supervisor_user_id", form.supervisor_user_id.trim());
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
    ...payHeaders.map((lab, idx) => amountForPaymentLabel(r.payment_amounts, lab, idx))
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

const filterFieldLabelCompactClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

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

  const consignmentTerritoryScope = useMemo(() => buildConsignmentTerritoryScopeParams(draft), [draft]);

  const territoryQ = useQuery({
    queryKey: ["client-balances-territory", tenantSlug, "consignment", consignmentTerritoryScope],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const qs = consignmentTerritoryScope.trim();
      const { data } = await api.get<{ data: ClientBalanceTerritoryOptions }>(
        `/api/${tenantSlug}/client-balances/territory-options${qs ? `?${qs}` : ""}`
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
        categories?: string[];
        category_options?: Array<string | { value?: string; label?: string }>;
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
  const supervisorsQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "consignment-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/supervisors?is_active=true`);
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

  const resetFiltersFull = useCallback(() => {
    const fresh = defaultForm();
    setDraft(fresh);
    setApplied(fresh);
    setPage(1);
  }, []);

  const compactFilterSelectClass = cn(filterPanelSelectClassName, "h-9 min-w-0 max-w-full text-xs");

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;
  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  const to = territoryQ.data;

  const territoryCascade = useMemo(
    () =>
      buildZoneRegionCityCascadeOptions(
        clientRefsQ.data,
        to,
        profileQ.data?.territory_nodes,
        {
          zone: draft.territory_zone,
          region: draft.territory_region,
          city: draft.territory_city
        }
      ),
    [
      clientRefsQ.data,
      to,
      profileQ.data?.territory_nodes,
      draft.territory_zone,
      draft.territory_region,
      draft.territory_city
    ]
  );

  const consignmentZoneKeys = useMemo(
    () => territoryCascade.zones.map((o) => o.value).join("\u0001"),
    [territoryCascade.zones]
  );
  const consignmentRegionKeys = useMemo(
    () => territoryCascade.regions.map((o) => o.value).join("\u0001"),
    [territoryCascade.regions]
  );
  const consignmentCityKeys = useMemo(
    () => territoryCascade.cities.map((o) => o.value).join("\u0001"),
    [territoryCascade.cities]
  );

  useEffect(() => {
    const z = normTrim(draft.territory_zone);
    if (!z) return;
    const allowed = new Set(
      consignmentZoneKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(z)) setDraft((d) => ({ ...d, territory_zone: "", territory_region: "", territory_city: "" }));
  }, [consignmentZoneKeys, draft.territory_zone]);

  useEffect(() => {
    const r = normTrim(draft.territory_region);
    if (!r) return;
    const allowed = new Set(
      consignmentRegionKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(r)) setDraft((d) => ({ ...d, territory_region: "", territory_city: "" }));
  }, [consignmentRegionKeys, draft.territory_region]);

  useEffect(() => {
    const c = normTrim(draft.territory_city);
    if (!c) return;
    const allowed = new Set(
      consignmentCityKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(c)) setDraft((d) => ({ ...d, territory_city: "" }));
  }, [consignmentCityKeys, draft.territory_city]);

  const categoryFilterOpts = useMemo(() => {
    const fromOptions = (clientRefsQ.data?.category_options ?? [])
      .map((o) => (typeof o === "string" ? o : (o?.label ?? o?.value ?? "")))
      .map((x) => String(x).trim())
      .filter(Boolean);
    const fromList = (clientRefsQ.data?.categories ?? []).map((x) => String(x).trim()).filter(Boolean);
    return Array.from(new Set([...fromOptions, ...fromList])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [clientRefsQ.data]);

  const agentsSrc = agentsQ.data ?? [];
  const expeditorsSrc = expeditorsQ.data ?? [];

  const consignmentCascade = useMemo(() => {
    const d = draft;
    return {
      forAgentSelect: filterConsignmentAgents(agentsSrc, expeditorsSrc, d, { agent: true }),
      forSupervisorSelect: filterConsignmentAgents(agentsSrc, expeditorsSrc, d, { supervisor: true }),
      forBranchSelect: filterConsignmentAgents(agentsSrc, expeditorsSrc, d, { branch: true }),
      forTradeDirectionSelect: filterConsignmentAgents(agentsSrc, expeditorsSrc, d, { tradeDirection: true }),
      forExpeditorSelect: filterConsignmentAgents(agentsSrc, expeditorsSrc, d, { expeditor: true })
    };
  }, [agentsSrc, expeditorsSrc, draft]);

  const filteredAgents = consignmentCascade.forAgentSelect;

  const filteredSupervisors = useMemo(() => {
    const supIds = new Set(
      consignmentCascade.forSupervisorSelect
        .map((a) => a.supervisor_user_id)
        .filter((x): x is number => x != null && Number.isFinite(Number(x)))
    );
    const all = supervisorsQ.data ?? [];
    const bid = draft.branch_ids;
    const branchFiltered =
      bid.size === 0 ? all : all.filter((s) => s.branch && bid.has(s.branch));
    if (supIds.size === 0) return branchFiltered;
    return branchFiltered.filter((s) => supIds.has(s.id));
  }, [supervisorsQ.data, draft.branch_ids, consignmentCascade.forSupervisorSelect]);

  const branchAllowed = useMemo(() => {
    const fromAgents = new Set<string>();
    for (const a of consignmentCascade.forBranchSelect) {
      const b = normTrim(a.branch);
      if (b) fromAgents.add(b);
    }
    const territoryBranches = to?.branches ?? [];
    let set: Set<string>;
    if (territoryBranches.length === 0) {
      set = fromAgents;
    } else {
      const allowedTerr = new Set(territoryBranches.map(normTrim));
      const list = Array.from(fromAgents).filter((b) => allowedTerr.has(b));
      set =
        list.length > 0 ? new Set(list) : new Set(territoryBranches.map(normTrim).filter(Boolean));
    }
    const key = JSON.stringify(Array.from(set).sort((a, b) => a.localeCompare(b, "ru")));
    return { set, key };
  }, [consignmentCascade.forBranchSelect, to?.branches]);

  useEffect(() => {
    const allowed = branchAllowed.set;
    setDraft((d) => {
      const next = new Set<string>();
      for (const b of Array.from(d.branch_ids)) {
        const k = normTrim(b);
        if (allowed.has(k)) next.add(k);
      }
      const prevList = Array.from(d.branch_ids);
      if (next.size === d.branch_ids.size && prevList.every((x) => next.has(normTrim(x)))) {
        return d;
      }
      return { ...d, branch_ids: next };
    });
  }, [branchAllowed.key]);

  const branchItems = useMemo(() => {
    const rows = Array.from(branchAllowed.set)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((b) => ({ id: b, title: b }));
    const q = branchSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [branchAllowed.key, branchSearch]);

  const tradeDirectionSelectValues = useMemo(() => {
    const fromCascade = new Set<string>();
    for (const a of consignmentCascade.forTradeDirectionSelect) {
      const t = normTrim(a.trade_direction);
      if (t) fromCascade.add(t);
    }
    const dirs = Array.from(fromCascade).sort((a, b) => a.localeCompare(b, "ru"));
    if (dirs.length > 0) return dirs;
    const s = new Set<string>();
    for (const x of filterOptQ.data?.trade_directions ?? []) {
      const t = normTrim(x);
      if (t) s.add(t);
    }
    for (const x of profileQ.data?.trade_directions ?? []) {
      const t = normTrim(x);
      if (t) s.add(t);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [
    consignmentCascade.forTradeDirectionSelect,
    filterOptQ.data?.trade_directions,
    profileQ.data?.trade_directions
  ]);

  const filteredExpeditors = useMemo(() => {
    const bid = draft.branch_ids;
    return (expeditorsQ.data ?? []).filter((e) => {
      if (!consignmentCascade.forExpeditorSelect.some((a) => agentMatchesExpeditor(a, e))) return false;
      return expeditorMatchesConsignmentBranches(e, bid);
    });
  }, [expeditorsQ.data, consignmentCascade.forExpeditorSelect, draft.branch_ids]);

  useEffect(() => {
    if (!draft.supervisor_user_id) return;
    const valid = filteredSupervisors.some((s) => String(s.id) === draft.supervisor_user_id);
    if (!valid) setDraft((d) => ({ ...d, supervisor_user_id: "" }));
  }, [filteredSupervisors, draft.supervisor_user_id]);

  useEffect(() => {
    if (!draft.agent_id) return;
    const valid = filteredAgents.some((a) => String(a.id) === draft.agent_id);
    if (!valid) setDraft((d) => ({ ...d, agent_id: "" }));
  }, [filteredAgents, draft.agent_id]);

  useEffect(() => {
    const t = normTrim(draft.trade_direction);
    if (!t) return;
    if (!tradeDirectionSelectValues.includes(t)) setDraft((d) => ({ ...d, trade_direction: "" }));
  }, [tradeDirectionSelectValues, draft.trade_direction]);

  useEffect(() => {
    if (!draft.expeditor_user_id) return;
    const valid = filteredExpeditors.some((e) => String(e.id) === draft.expeditor_user_id);
    if (!valid) setDraft((d) => ({ ...d, expeditor_user_id: "" }));
  }, [filteredExpeditors, draft.expeditor_user_id]);

  useEffect(() => {
    console.info("[consignment-balances filters] cascade", {
      territoryScope: consignmentTerritoryScope || null,
      branches: draft.branch_ids.size,
      supervisor: draft.supervisor_user_id || null,
      agent: draft.agent_id || null,
      expeditor: draft.expeditor_user_id || null,
      tradeDirection: draft.trade_direction || null,
      filteredAgents: filteredAgents.length,
      filteredSupervisors: filteredSupervisors.length,
      filteredExpeditors: filteredExpeditors.length,
      territoryZones: territoryCascade.zones.length,
      territoryRegions: territoryCascade.regions.length,
      territoryCities: territoryCascade.cities.length
    });
  }, [
    consignmentTerritoryScope,
    draft.branch_ids,
    draft.supervisor_user_id,
    draft.agent_id,
    draft.expeditor_user_id,
    draft.trade_direction,
    filteredAgents.length,
    filteredSupervisors.length,
    filteredExpeditors.length,
    territoryCascade.zones.length,
    territoryCascade.regions.length,
    territoryCascade.cities.length
  ]);

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

  useEffect(() => {
    if (!listQ.data) return;
    let pageBalance = 0;
    const pagePayment: Record<string, number> = {};
    let nonZeroRows = 0;
    for (const row of listQ.data.data) {
      const rowBalance = parseAmount(row.balance);
      pageBalance += rowBalance;
      let rowNonZero = rowBalance !== 0;
      for (const p of row.payment_amounts ?? []) {
        const n = parseAmount(p.amount);
        pagePayment[p.label] = (pagePayment[p.label] ?? 0) + n;
        if (n !== 0) rowNonZero = true;
      }
      if (rowNonZero) nonZeroRows += 1;
    }
    console.info("[consignment-balances table debug]", {
      page: listQ.data.page,
      limit: listQ.data.limit,
      total: listQ.data.total,
      summaryBalance: listQ.data.summary.total_debt,
      summaryPaymentByType: listQ.data.summary.payment_by_type,
      pageBalance,
      pagePayment,
      pageNonZeroRows: nonZeroRows
    });
  }, [listQ.data]);

  return (
    <PageShell>
      <PageHeader
        title="Балансы клиентов по консигнации"
        description="Заказы с признаком консигнации или консигнационным агентом, только доставленные клиенту: долг = сумма заказа − оплаты по заказу. В списке только должники."
      />

      <div className="space-y-4 pb-12">
        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="space-y-3 p-3 sm:p-4 sm:pt-3.5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-8">
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  <div className="space-y-1 sm:min-w-0 sm:col-span-2 xl:col-span-2">
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
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Супервайзер</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
                      value={draft.supervisor_user_id}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          supervisor_user_id: e.target.value
                        }))
                      }
                    >
                      {filteredSupervisors.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.fio}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Агент</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
                      value={draft.agent_id}
                      onChange={(e) => setDraft((d) => ({ ...d, agent_id: e.target.value }))}
                    >
                      {filteredAgents.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.fio}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Экспедитор</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
                      value={draft.expeditor_user_id}
                      onChange={(e) => setDraft((d) => ({ ...d, expeditor_user_id: e.target.value }))}
                    >
                      {filteredExpeditors.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.fio}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Категория</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
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
                    <Label className={filterFieldLabelCompactClass}>Статус</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
                      value={draft.status}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, status: e.target.value as FilterForm["status"] }))
                      }
                    >
                      <option value="active">Активные</option>
                      <option value="inactive">Неактивные</option>
                    </FilterSelect>
                  </div>
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Направление торговли</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
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
                  <div className="space-y-1">
                    <Label className={filterFieldLabelCompactClass}>Зона</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
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
                    <Label className={filterFieldLabelCompactClass}>Область</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
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
                    <Label className={filterFieldLabelCompactClass}>Город</Label>
                    <FilterSelect
                      emptyLabel="Все"
                      className={compactFilterSelectClass}
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
                </div>
              </div>

              <aside className="w-full shrink-0 space-y-3 border-t border-border/70 pt-4 xl:w-[19.5rem] xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <p className={filterFieldLabelClass}>Даты</p>
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2.5">
                  <p className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Применить период к
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-between">
                    <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_order_date}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_order_date: e.target.checked }))
                        }
                        aria-label="Дата заказа"
                      />
                      <span title="Фильтр по дате заказа">Дата заказа</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_license_from}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_license_from: e.target.checked }))
                        }
                        aria-label="Срок от (лицензия)"
                      />
                      <span title="Срок от (лицензия)">Срок от</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={draft.apply_license_to}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, apply_license_to: e.target.checked }))
                        }
                        aria-label="Срок до (лицензия)"
                      />
                      <span title="Срок до (лицензия)">Срок до</span>
                    </label>
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
                  onClick={resetFiltersFull}
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
                    <>
                      {rows.map((r) => (
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
                            <span className="inline-flex items-center gap-1.5">
                              <span>{r.client_name}</span>
                              {applied.status === "" && r.is_active === false && parseAmount(r.balance) !== 0 ? (
                                <span
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:bg-amber-500/25 dark:text-amber-300"
                                  title="Неактивный клиент с ненулевым балансом"
                                >
                                  <AlertCircle className="h-3 w-3" />
                                </span>
                              ) : null}
                            </span>
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
                          {paymentColumnLabels.map((lab, idx) => (
                            <td key={lab} className="px-2 py-2">
                              <MoneyCell value={amountForPaymentLabel(r.payment_amounts, lab, idx)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
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
