"use client";

import { ClientBalancesBulkPaymentDialog } from "@/components/client-balances/client-balances-bulk-payment-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerPopover, formatRuDateButton, localYmd } from "@/components/ui/date-picker-popover";
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
import type { TerritoryNode } from "@/lib/territory-tree";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { getUserFacingError } from "@/lib/error-utils";
import { paymentMethodSelectOptions, type ProfilePaymentMethodEntry } from "@/lib/payment-method-options";
import { buildZoneRegionCityCascadeOptions } from "@/lib/territory-client-filters";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertCircle,
  CalendarDays,
  Copy,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type StaffPick = {
  id: number;
  fio: string;
  code?: string | null;
  supervisor_user_id?: number | null;
  branch?: string | null;
  supervisees?: Array<{ id: number; fio: string; code?: string | null }>;
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
  agent_id: string;
  expeditor_user_id: string;
  supervisor_user_id: string;
  trade_direction: string;
  category: string;
  status: "" | "active" | "inactive";
  balance_filter: "" | "debt" | "credit";
  territory_zone: string;
  territory_region: string;
  territory_city: string;
  /** YYYY-MM-DD — belgilangan «Применить период к» maydonlariga */
  filter_date: string;
  apply_balance_as_of: boolean;
  apply_order_date: boolean;
  apply_license_from: boolean;
  apply_license_to: boolean;
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
  territory_zone: "",
  territory_region: "",
  territory_city: "",
  filter_date: localYmd(new Date()),
  apply_balance_as_of: false,
  apply_order_date: false,
  apply_license_from: false,
  apply_license_to: false,
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

/** Backend `label` va jadval sarlavhasi registr / bo‘shliq bo‘yicha farq qilmasin. */
function normPayColumnLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function amountForPaymentLabel(
  amounts: { label: string; amount: string }[],
  label: string,
  fallbackIndex?: number
): string {
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type SortDir = "asc" | "desc";

function cmpStr(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "ru", { sensitivity: "base" });
}

function cmpNum(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function cmpIso(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return 1;
  if (!Number.isFinite(tb)) return -1;
  return ta - tb;
}

function compareClientBalanceRows(
  a: ClientBalanceRow,
  b: ClientBalanceRow,
  col: string,
  paymentLabels: string[],
  dir: 1 | -1
): number {
  const m = dir;
  switch (col) {
    case "order_id": {
      const na = rowDeliveryOrderId(a) ?? 0;
      const nb = rowDeliveryOrderId(b) ?? 0;
      return (na - nb) * m;
    }
    case "client_id":
      return cmpStr(clientDisplayId(a), clientDisplayId(b)) * m;
    case "name":
      return cmpStr(a.name, b.name) * m;
    case "agent": {
      const sa = a.agent_tags.length ? a.agent_tags.join(" ") : (a.agent_name ?? "");
      const sb = b.agent_tags.length ? b.agent_tags.join(" ") : (b.agent_name ?? "");
      return cmpStr(sa, sb) * m;
    }
    case "agent_code":
      return cmpStr(a.agent_code, b.agent_code) * m;
    case "supervisor":
      return cmpStr(a.supervisor_name, b.supervisor_name) * m;
    case "legal_name":
      return cmpStr(a.legal_name, b.legal_name) * m;
    case "trade_direction":
      return cmpStr(a.trade_direction, b.trade_direction) * m;
    case "inn":
      return cmpStr(a.inn, b.inn) * m;
    case "phone":
      return cmpStr(a.phone, b.phone) * m;
    case "license_until":
      return cmpIso(a.license_until, b.license_until) * m;
    case "days_overdue":
      return cmpNum(a.days_overdue, b.days_overdue) * m;
    case "last_order_at":
      return cmpIso(a.last_order_at, b.last_order_at) * m;
    case "last_payment_at":
      return cmpIso(a.last_payment_at, b.last_payment_at) * m;
    case "days_since_payment":
      return cmpNum(a.days_since_payment, b.days_since_payment) * m;
    case "balance":
      return (parseAmount(a.balance) - parseAmount(b.balance)) * m;
    default: {
      if (col.startsWith("pay:")) {
        const lab = col.slice(4);
        const idx = paymentLabels.findIndex(
          (x) => normPayColumnLabel(x) === normPayColumnLabel(lab)
        );
        const fallbackIdx = idx >= 0 ? idx : undefined;
        return (
          (parseAmount(amountForPaymentLabel(a.payment_amounts, lab, fallbackIdx)) -
            parseAmount(amountForPaymentLabel(b.payment_amounts, lab, fallbackIdx))) *
          m
        );
      }
      return 0;
    }
  }
}

function compareAgentRows(
  a: AgentBalanceRow,
  b: AgentBalanceRow,
  col: string,
  paymentLabels: string[],
  dir: 1 | -1
): number {
  const m = dir;
  switch (col) {
    case "agent_name":
      return cmpStr(a.agent_name, b.agent_name) * m;
    case "agent_code":
      return cmpStr(a.agent_code, b.agent_code) * m;
    case "clients_count":
      return (a.clients_count - b.clients_count) * m;
    case "balance":
      return (parseAmount(a.balance) - parseAmount(b.balance)) * m;
    default: {
      if (col.startsWith("pay:")) {
        const lab = col.slice(4);
        const idx = paymentLabels.findIndex(
          (x) => normPayColumnLabel(x) === normPayColumnLabel(lab)
        );
        const fallbackIdx = idx >= 0 ? idx : undefined;
        return (
          (parseAmount(amountForPaymentLabel(a.payment_amounts, lab, fallbackIdx)) -
            parseAmount(amountForPaymentLabel(b.payment_amounts, lab, fallbackIdx))) *
          m
        );
      }
      return 0;
    }
  }
}

function SortTh({
  label,
  sortKey,
  current,
  onSort,
  className,
  align = "left"
}: {
  label: ReactNode;
  sortKey: string;
  current: { col: string; dir: SortDir };
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = current.col === sortKey;
  return (
    <th className={cn(className, align === "right" && "text-right")}>
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          align === "right" && "ml-auto w-full justify-end"
        )}
        onClick={() => onSort(sortKey)}
      >
        <span className="min-w-0 truncate text-left">{label}</span>
        {active ? (
          current.dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-45" aria-hidden />
        )}
      </button>
    </th>
  );
}

function buildQuery(
  form: FilterForm,
  view: ClientBalanceViewMode,
  page: number,
  limit: number,
  search: string,
  sort: { col: string; dir: SortDir },
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
  if (form.territory_zone.trim()) p.set("territory_zone", form.territory_zone.trim());
  if (form.territory_region.trim()) p.set("territory_region", form.territory_region.trim());
  if (form.territory_city.trim()) p.set("territory_city", form.territory_city.trim());
  const day = form.filter_date.trim();
  if (form.apply_balance_as_of && day) p.set("balance_as_of", day);
  if (form.apply_order_date && day) {
    p.set("order_date_from", day);
    p.set("order_date_to", day);
  }
  if (form.apply_license_from && day) p.set("consignment_due_from", day);
  if (form.apply_license_to && day) p.set("consignment_due_to", day);
  if (form.agent_branch.trim()) p.set("agent_branch", form.agent_branch.trim());
  if (form.agent_payment_type.trim()) p.set("agent_payment_type", form.agent_payment_type.trim());
  if (sort.col.trim()) {
    p.set("sort_by", sort.col.trim());
    p.set("sort_dir", sort.dir);
  }
  return p.toString();
}

/** Hudud tanlovlari: filial / agent / boshqalar bo‘yicha (territory-options API), «Применить»siz. */
function buildTerritoryScopeParams(form: FilterForm): string {
  const p = new URLSearchParams();
  if (form.agent_branch.trim()) p.set("agent_branch", form.agent_branch.trim());
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.expeditor_user_id.trim()) p.set("expeditor_user_id", form.expeditor_user_id.trim());
  if (form.supervisor_user_id.trim()) p.set("supervisor_user_id", form.supervisor_user_id.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.category.trim()) p.set("category", form.category.trim());
  if (form.status) p.set("status", form.status);
  if (form.agent_payment_type.trim()) p.set("agent_payment_type", form.agent_payment_type.trim());
  return p.toString();
}

/** Qoidalarsiz ekspektor: tanlangan filial bilan mos kelmasa, boshqa filialdagi qatorlarni yashiramiz. */
function expeditorMatchesBranchContext(exp: StaffPick, selectedBranch: string): boolean {
  const b = normTrim(selectedBranch);
  if (!b) return true;
  const rules = exp.expeditor_assignment_rules;
  const hasAgentOrTdRules =
    rules &&
    typeof rules === "object" &&
    ((rules.agent_ids?.length ?? 0) > 0 || (rules.trade_directions?.length ?? 0) > 0);
  if (hasAgentOrTdRules) return true;
  const eb = normTrim(exp.branch);
  if (!eb) return true;
  return eb === b;
}

/** Zakaz id ro‘yxat qatorida (API: delivery_order_id yoki order_id). */
function rowDeliveryOrderId(r: ClientBalanceRow): number | undefined {
  const raw = r.delivery_order_id ?? r.order_id ?? null;
  if (raw == null) return undefined;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function clientBalanceRowKey(
  view: ClientBalanceViewMode,
  r: ClientBalanceRow,
  rowIndex: number
): string {
  if (view === "clients_delivery") {
    const oid = rowDeliveryOrderId(r);
    if (oid != null) return `o:${oid}`;
    return `c:${r.client_id}:i:${rowIndex}`;
  }
  return `c:${r.client_id}`;
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
      {formatNumberGrouped(value, { maxFractionDigits: 2 })}
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
  const orderCols =
    view === "clients_delivery" && rows.some((r) => rowDeliveryOrderId(r) != null);
  const baseHeaders = orderCols
    ? [
        "ID заказа",
        "Номер заказа",
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
        "Дата доставки заказа",
        "Дата последней оплаты",
        "Дни с последней оплаты",
        "Общий"
      ]
    : [
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
    const base = orderCols
      ? [
          rowDeliveryOrderId(r) ?? "",
          r.delivery_order_number ?? "",
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
        ]
      : [
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
    const payCells = payHeaders.map((lab, idx) =>
      amountForPaymentLabel(r.payment_amounts, lab, idx)
    );
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
    ...paymentColumnLabels.map((lab, idx) => amountForPaymentLabel(r.payment_amounts, lab, idx))
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

const filterFieldLabelCompactClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

function normTrim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

type AgentFilterSkip = Partial<{
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

function filterAgentsForBalances(
  agents: StaffPick[],
  expeditors: StaffPick[] | undefined,
  d: FilterForm,
  skip: AgentFilterSkip
): StaffPick[] {
  const br = skip.branch ? "" : normTrim(d.agent_branch);
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
    if (br && normTrim(a.branch) !== br) return false;
    if (Number.isFinite(supId) && (a.supervisor_user_id ?? -1) !== supId) return false;
    if (td && normTrim(a.trade_direction) !== td) return false;
    if (!agentMatchesExpeditor(a, exp)) return false;
    return true;
  });
}

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
  /** Tanlangan qatorlar (sahifa almashganda ham saqlanadi) */
  const [selectedClients, setSelectedClients] = useState<Map<string, ClientBalanceRow>>(
    () => new Map()
  );
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPayClients, setBulkPayClients] = useState<ClientBalanceRow[]>([]);
  const [excelBusy, setExcelBusy] = useState(false);
  const [clientSort, setClientSort] = useState<{ col: string; dir: SortDir }>({ col: "", dir: "asc" });
  const [agentSort, setAgentSort] = useState<{ col: string; dir: SortDir }>({ col: "", dir: "asc" });
  const [filterDateOpen, setFilterDateOpen] = useState(false);
  const filterDateRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const activeSort = view === "agents" ? agentSort : clientSort;
  const queryString = useMemo(
    () => buildQuery(applied, view, page, limit, debouncedSearch, activeSort),
    [applied, view, page, limit, debouncedSearch, activeSort]
  );

  const listQ = useQuery({
    queryKey: ["client-balances", tenantSlug, queryString],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.heavyList,
    placeholderData: keepPreviousData,
    structuralSharing: false,
    queryFn: async () => {
      const { data } = await api.get<ClientBalanceListResponse>(
        `/api/${tenantSlug}/client-balances?${queryString}`
      );
      return data;
    }
  });

  const territoryScopeParams = useMemo(() => buildTerritoryScopeParams(draft), [draft]);

  const territoryQ = useQuery({
    queryKey: ["client-balances-territory", tenantSlug, territoryScopeParams],
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

  const clientRefsQ = useQuery({
    queryKey: ["clients", "references", tenantSlug, "client-balances"],
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

  const territoryNodesQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "territory-nodes-for-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          territory_nodes?: TerritoryNode[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references?.territory_nodes ?? [];
    }
  });

  const applyFilters = useCallback(() => {
    setApplied({ ...draft });
    setPage(1);
  }, [draft]);

  const resetFilters = useCallback(() => {
    const fresh = defaultForm();
    setDraft(fresh);
    setApplied(fresh);
    setPage(1);
  }, []);

  const compactFilterSelectClass = cn(filterPanelSelectClassName, "h-9 min-w-0 max-w-full text-xs");

  const clientRowsForSelection: ClientBalanceRow[] =
    view === "clients" && listQ.data?.view === "clients"
      ? (listQ.data.data as ClientBalanceRow[])
      : view === "clients_delivery" && listQ.data?.view === "clients_delivery"
        ? (listQ.data.data as ClientBalanceRow[])
        : [];
  const agentRows = (listQ.data?.view === "agents" ? listQ.data.data : []) as AgentBalanceRow[];
  const summary = listQ.data?.summary;
  const paymentColumnLabels = summary?.payment_by_type.map((x) => x.label) ?? [];
  const onClientSort = useCallback((key: string) => {
    setPage(1);
    setClientSort((prev) =>
      prev.col !== key ? { col: key, dir: "asc" } : { col: key, dir: prev.dir === "asc" ? "desc" : "asc" }
    );
  }, []);
  const onAgentSort = useCallback((key: string) => {
    setPage(1);
    setAgentSort((prev) =>
      prev.col !== key ? { col: key, dir: "asc" } : { col: key, dir: prev.dir === "asc" ? "desc" : "asc" }
    );
  }, []);

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;
  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  const isDeliveryView = view === "clients_delivery";

  useEffect(() => {
    if (!listQ.data) return;
    const rows =
      listQ.data.view === "agents"
        ? ((listQ.data.data as AgentBalanceRow[]) ?? [])
        : ((listQ.data.data as ClientBalanceRow[]) ?? []);
    let pageBalance = 0;
    const pagePayment: Record<string, number> = {};
    let nonZeroRows = 0;
    for (const row of rows) {
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
    console.info("[client-balances table debug]", {
      view: listQ.data.view,
      page: listQ.data.page,
      limit: listQ.data.limit,
      total: listQ.data.total,
      summaryBalance: listQ.data.summary.balance,
      summaryPaymentByType: listQ.data.summary.payment_by_type,
      pageBalance,
      pagePayment,
      pageNonZeroRows: nonZeroRows
    });
  }, [listQ.data]);

  const onTabView = (v: string | null) => {
    const next: ClientBalanceViewMode =
      v === "agents" ? "agents" : v === "clients_delivery" ? "clients_delivery" : "clients";
    setView(next);
    setPage(1);
    setSelectedClients(new Map());
  };

  const tabValue = view === "agents" ? "agents" : view === "clients_delivery" ? "clients_delivery" : "clients";

  const toggleSelect = (row: ClientBalanceRow, rowIndex: number) => {
    const key = clientBalanceRowKey(view, row, rowIndex);
    setSelectedClients((prev) => {
      const n = new Map(prev);
      if (n.has(key)) n.delete(key);
      else n.set(key, row);
      return n;
    });
  };

  const toggleSelectAllPage = () => {
    if (view !== "clients" && view !== "clients_delivery") return;
    const keys = clientRowsForSelection.map((r, i) => clientBalanceRowKey(view, r, i));
    const allOn = keys.length > 0 && keys.every((k) => selectedClients.has(k));
    setSelectedClients((prev) => {
      const n = new Map(prev);
      if (allOn) {
        for (const k of keys) n.delete(k);
      } else {
        clientRowsForSelection.forEach((r, i) => {
          n.set(clientBalanceRowKey(view, r, i), r);
        });
      }
      return n;
    });
  };

  const openBulkPayModal = () => {
    if (selectedClients.size === 0) return;
    const byClient = new Map<number, ClientBalanceRow>();
    for (const r of Array.from(selectedClients.values())) {
      byClient.set(r.client_id, r);
    }
    setBulkPayClients(Array.from(byClient.values()));
    setBulkPayOpen(true);
  };

  const runExcelExport = useCallback(async () => {
    if (!tenantSlug) return;
    setExcelBusy(true);
    try {
      const qs = buildQuery(applied, view, 1, 5000, debouncedSearch, activeSort, true);
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
  }, [tenantSlug, applied, view, debouncedSearch, activeSort]);

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

  const agentsSrc = agentsQ.data ?? [];
  const expeditorsSrc = expeditorsQ.data ?? [];

  const balanceCascade = useMemo(() => {
    const d = draft;
    return {
      forAgentSelect: filterAgentsForBalances(agentsSrc, expeditorsSrc, d, { agent: true }),
      forSupervisorSelect: filterAgentsForBalances(agentsSrc, expeditorsSrc, d, { supervisor: true }),
      forBranchSelect: filterAgentsForBalances(agentsSrc, expeditorsSrc, d, { branch: true }),
      forTradeDirectionSelect: filterAgentsForBalances(agentsSrc, expeditorsSrc, d, { tradeDirection: true }),
      forExpeditorSelect: filterAgentsForBalances(agentsSrc, expeditorsSrc, d, { expeditor: true })
    };
  }, [agentsSrc, expeditorsSrc, draft]);

  const filteredAgents = balanceCascade.forAgentSelect;

  const filteredSupervisors = useMemo(() => {
    const supIds = new Set(
      balanceCascade.forSupervisorSelect
        .map((a) => a.supervisor_user_id)
        .filter((x): x is number => x != null && Number.isFinite(Number(x)))
    );
    const br = normTrim(draft.agent_branch);
    const all = supervisorsQ.data ?? [];
    const branchFiltered = all.filter((s) => !br || normTrim(s.branch) === br);
    if (supIds.size === 0) return branchFiltered;
    return branchFiltered.filter((s) => supIds.has(s.id));
  }, [supervisorsQ.data, draft.agent_branch, balanceCascade.forSupervisorSelect]);

  const to = territoryQ.data;

  const branchSelectOptionsFiltered = useMemo(() => {
    const fromAgents = new Set<string>();
    for (const a of balanceCascade.forBranchSelect) {
      const b = normTrim(a.branch);
      if (b) fromAgents.add(b);
    }
    let list = Array.from(fromAgents).sort((a, b) => a.localeCompare(b, "ru"));
    const territoryBranches = to?.branches ?? [];
    if (territoryBranches.length > 0) {
      const allowed = new Set(territoryBranches.map(normTrim));
      list = list.filter((b) => allowed.has(b));
      if (list.length === 0) {
        list = territoryBranches.map(normTrim).filter(Boolean).sort((a, b) => a.localeCompare(b, "ru"));
      }
    }
    return list;
  }, [balanceCascade.forBranchSelect, to?.branches]);

  const tradeDirectionFilterOpts = useMemo(() => {
    const fromAgents = new Set<string>();
    for (const a of balanceCascade.forTradeDirectionSelect) {
      const t = normTrim(a.trade_direction);
      if (t) fromAgents.add(t);
    }
    const dirs = Array.from(fromAgents).sort((a, b) => a.localeCompare(b, "ru"));
    if (dirs.length > 0) return dirs;
    const fromApi = (filterOptQ.data?.trade_directions ?? []).map(normTrim).filter(Boolean);
    return Array.from(new Set(fromApi)).sort((a, b) => a.localeCompare(b, "ru"));
  }, [balanceCascade.forTradeDirectionSelect, filterOptQ.data?.trade_directions]);

  const filteredExpeditors = useMemo(() => {
    const br = normTrim(draft.agent_branch);
    return (expeditorsQ.data ?? []).filter((e) => {
      if (!balanceCascade.forExpeditorSelect.some((a) => agentMatchesExpeditor(a, e))) return false;
      return expeditorMatchesBranchContext(e, br);
    });
  }, [expeditorsQ.data, balanceCascade.forExpeditorSelect, draft.agent_branch]);

  useEffect(() => {
    if (!draft.agent_id) return;
    const valid = filteredAgents.some((a) => String(a.id) === draft.agent_id);
    if (!valid) setDraft((d) => ({ ...d, agent_id: "" }));
  }, [filteredAgents, draft.agent_id]);

  useEffect(() => {
    if (!draft.supervisor_user_id) return;
    const valid = filteredSupervisors.some((s) => String(s.id) === draft.supervisor_user_id);
    if (!valid) setDraft((d) => ({ ...d, supervisor_user_id: "" }));
  }, [filteredSupervisors, draft.supervisor_user_id]);

  useEffect(() => {
    const b = normTrim(draft.agent_branch);
    if (!b) return;
    if (!branchSelectOptionsFiltered.includes(b)) setDraft((d) => ({ ...d, agent_branch: "" }));
  }, [branchSelectOptionsFiltered, draft.agent_branch]);

  useEffect(() => {
    const t = normTrim(draft.trade_direction);
    if (!t) return;
    if (!tradeDirectionFilterOpts.includes(t)) setDraft((d) => ({ ...d, trade_direction: "" }));
  }, [tradeDirectionFilterOpts, draft.trade_direction]);

  useEffect(() => {
    if (!draft.expeditor_user_id) return;
    const valid = filteredExpeditors.some((e) => String(e.id) === draft.expeditor_user_id);
    if (!valid) setDraft((d) => ({ ...d, expeditor_user_id: "" }));
  }, [filteredExpeditors, draft.expeditor_user_id]);

  const territoryCascade = useMemo(
    () =>
      buildZoneRegionCityCascadeOptions(
        clientRefsQ.data,
        to,
        territoryNodesQ.data,
        {
          zone: draft.territory_zone,
          region: draft.territory_region,
          city: draft.territory_city
        }
      ),
    [
      clientRefsQ.data,
      to,
      territoryNodesQ.data,
      draft.territory_zone,
      draft.territory_region,
      draft.territory_city
    ]
  );

  const zoneOptionKeys = useMemo(
    () => territoryCascade.zones.map((o) => o.value).join("\u0001"),
    [territoryCascade.zones]
  );
  const regionOptionKeys = useMemo(
    () => territoryCascade.regions.map((o) => o.value).join("\u0001"),
    [territoryCascade.regions]
  );
  const cityOptionKeys = useMemo(
    () => territoryCascade.cities.map((o) => o.value).join("\u0001"),
    [territoryCascade.cities]
  );

  useEffect(() => {
    const z = normTrim(draft.territory_zone);
    if (!z) return;
    const allowed = new Set(
      zoneOptionKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(z)) setDraft((d) => ({ ...d, territory_zone: "", territory_region: "", territory_city: "" }));
  }, [zoneOptionKeys, draft.territory_zone]);

  useEffect(() => {
    const r = normTrim(draft.territory_region);
    if (!r) return;
    const allowed = new Set(
      regionOptionKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(r)) setDraft((d) => ({ ...d, territory_region: "", territory_city: "" }));
  }, [regionOptionKeys, draft.territory_region]);

  useEffect(() => {
    const c = normTrim(draft.territory_city);
    if (!c) return;
    const allowed = new Set(
      cityOptionKeys
        .split("\u0001")
        .map((x) => normTrim(x))
        .filter(Boolean)
    );
    if (!allowed.has(c)) setDraft((d) => ({ ...d, territory_city: "" }));
  }, [cityOptionKeys, draft.territory_city]);

  useEffect(() => {
    console.info("[client-balances filters] cascade", {
      territoryScope: territoryScopeParams || null,
      branch: draft.agent_branch || null,
      supervisor: draft.supervisor_user_id || null,
      agent: draft.agent_id || null,
      expeditor: draft.expeditor_user_id || null,
      tradeDirection: draft.trade_direction || null,
      filteredAgents: filteredAgents.length,
      filteredSupervisors: filteredSupervisors.length,
      filteredExpeditors: filteredExpeditors.length,
      branchOptions: branchSelectOptionsFiltered.length,
      tradeDirectionOptions: tradeDirectionFilterOpts.length,
      territoryZones: territoryCascade.zones.length,
      territoryRegions: territoryCascade.regions.length,
      territoryCities: territoryCascade.cities.length,
      balanceFilter: draft.balance_filter || "all"
    });
  }, [
    territoryScopeParams,
    draft.agent_branch,
    draft.supervisor_user_id,
    draft.agent_id,
    draft.expeditor_user_id,
    draft.trade_direction,
    draft.balance_filter,
    filteredAgents.length,
    filteredSupervisors.length,
    filteredExpeditors.length,
    branchSelectOptionsFiltered.length,
    tradeDirectionFilterOpts.length,
    territoryCascade.zones.length,
    territoryCascade.regions.length,
    territoryCascade.cities.length
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Балансы клиентов"
        description={
          isDeliveryView
            ? "Долг по доставленным заказам: неоплаченный остаток (total − распределённые оплаты), дата — момент перехода в «доставлен»."
            : "Оплаты и долги: баланс из учёта. Даты — один календарь; отметьте «Баланс», «Дата заказа» (долг по доставленным), «Срок от/до» (лицензия)."
        }
      />

      <div className="space-y-4">
        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="space-y-0 p-0">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Филиалы</Label>
                      <FilterSelect
                        emptyLabel="Все филиалы"
                        className={compactFilterSelectClass}
                        value={draft.agent_branch}
                        onChange={(e) => setDraft((d) => ({ ...d, agent_branch: e.target.value }))}
                      >
                        {branchSelectOptionsFiltered.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Агент</Label>
                      <FilterSelect
                        emptyLabel="Агент"
                        className={compactFilterSelectClass}
                        value={draft.agent_id}
                        onChange={(e) => setDraft((d) => ({ ...d, agent_id: e.target.value }))}
                      >
                        {filteredAgents.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.fio}
                            {a.code ? ` (${a.code})` : ""}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Экспедитор</Label>
                      <FilterSelect
                        emptyLabel="Экспедитор"
                        className={compactFilterSelectClass}
                        value={draft.expeditor_user_id}
                        onChange={(e) => setDraft((d) => ({ ...d, expeditor_user_id: e.target.value }))}
                      >
                        {filteredExpeditors.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fio}
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
                        emptyLabel="Направление"
                        className={compactFilterSelectClass}
                        value={draft.trade_direction}
                        onChange={(e) => setDraft((d) => ({ ...d, trade_direction: e.target.value }))}
                      >
                        {tradeDirectionFilterOpts.map((td) => (
                          <option key={td} value={td}>
                            {td}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Супервайзер</Label>
                      <FilterSelect
                        emptyLabel="Супервайзер"
                        className={compactFilterSelectClass}
                        value={draft.supervisor_user_id}
                        onChange={(e) => setDraft((d) => ({ ...d, supervisor_user_id: e.target.value }))}
                      >
                        {filteredSupervisors.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fio}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Общий баланс</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={compactFilterSelectClass}
                        value={draft.balance_filter}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            balance_filter: e.target.value as FilterForm["balance_filter"]
                          }))
                        }
                      >
                        <option value="">Все</option>
                        <option value="debt">Долг</option>
                        <option value="credit">Переплата</option>
                      </FilterSelect>
                    </div>
                    <div className="space-y-1">
                      <Label className={filterFieldLabelCompactClass}>Тип оплаты</Label>
                      <FilterSelect
                        emptyLabel="Все счета"
                        className={compactFilterSelectClass}
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
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 pt-0.5 xl:pr-2">
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 gap-1.5")}
                      onClick={resetFilters}
                    >
                      Сброс
                    </button>
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ size: "sm" }),
                        "h-9 min-w-[9.5rem] gap-2 bg-teal-600 px-4 text-white hover:bg-teal-700"
                      )}
                      onClick={applyFilters}
                    >
                      <Filter className="h-4 w-4 shrink-0 opacity-90" />
                      Применить
                    </button>
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
                          checked={draft.apply_balance_as_of}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, apply_balance_as_of: e.target.checked }))
                          }
                          aria-label="Баланс на дату"
                        />
                        <span title="Обороты до конца дня (UTC)">Баланс</span>
                      </label>
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
                        <span title="Долг по доставленным заказам с датой заказа (Asia/Tashkent)">
                          Дата заказа
                        </span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                          checked={draft.apply_license_from}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, apply_license_from: e.target.checked }))
                          }
                          aria-label="Срок от"
                        />
                        <span title="Срок лицензии от">Срок от</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                          checked={draft.apply_license_to}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, apply_license_to: e.target.checked }))
                          }
                          aria-label="Срок до"
                        />
                        <span title="Срок лицензии до">Срок до</span>
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
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Отметьте, к чему относится дата в календаре, и нажмите «Применить». Баланс — движения до конца дня
                (UTC). Дата заказа — долг по доставленным заказам с этой датой создания (Asia/Tashkent). Срок от/до —
                фильтр по дате лицензии клиента.
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
                <SummaryKpiCard title="Общий" value={summary.balance} />
                {(summary.payment_by_type ?? []).map((row, i) => (
                  <SummaryKpiCard key={`${row.label}-${i}`} title={row.label} value={row.amount} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={tabValue} onValueChange={onTabView}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Select va tablar bir qatorda: TabsList da w-full bo‘lmasin — aks holda select yuqoriga “tushadi” */}
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 overflow-x-auto">
              <select
                className={cn(
                  filterPanelSelectClassName,
                  "h-9 min-w-[5.5rem] max-w-[6rem] shrink-0 py-0"
                )}
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
              <TabsList className="inline-flex h-auto min-h-10 shrink-0 flex-nowrap gap-0.5 rounded-lg border border-border bg-slate-100 p-1 dark:bg-zinc-900/60">
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
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 dark:bg-muted/20">
              {(view === "clients" || view === "clients_delivery") && selectedClients.size > 0 ? (
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "h-9 shrink-0 gap-2 bg-emerald-600 px-3 text-white hover:bg-emerald-700 sm:px-4"
                  )}
                  onClick={openBulkPayModal}
                >
                  Оплатить
                  <span className="rounded-md bg-white/20 px-1.5 text-xs tabular-nums">
                    {selectedClients.size}
                  </span>
                </button>
              ) : null}
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
                statusFilter={applied.status}
                rowKey={(r, idx) => clientBalanceRowKey(view, r, idx)}
                paymentColumnLabels={paymentColumnLabels}
                sort={clientSort}
                onSort={onClientSort}
                loading={listQ.isLoading}
                rows={
                  listQ.data?.view === "clients" ? (listQ.data.data as ClientBalanceRow[]) : []
                }
                selected={selectedClients}
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
                statusFilter={applied.status}
                rowKey={(r, idx) => clientBalanceRowKey(view, r, idx)}
                paymentColumnLabels={paymentColumnLabels}
                sort={clientSort}
                onSort={onClientSort}
                loading={listQ.isLoading}
                rows={
                  listQ.data?.view === "clients_delivery"
                    ? (listQ.data.data as ClientBalanceRow[])
                    : []
                }
                selected={selectedClients}
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
                      <SortTh
                        label="Агент"
                        sortKey="agent_name"
                        current={agentSort}
                        onSort={onAgentSort}
                        className="whitespace-nowrap px-3 py-2"
                      />
                      <SortTh
                        label="Код"
                        sortKey="agent_code"
                        current={agentSort}
                        onSort={onAgentSort}
                        className="whitespace-nowrap px-3 py-2"
                      />
                      <SortTh
                        label="Клиентов"
                        sortKey="clients_count"
                        current={agentSort}
                        onSort={onAgentSort}
                        className="whitespace-nowrap px-3 py-2 text-right"
                        align="right"
                      />
                      <SortTh
                        label="Общий"
                        sortKey="balance"
                        current={agentSort}
                        onSort={onAgentSort}
                        className="whitespace-nowrap px-3 py-2 text-right"
                        align="right"
                      />
                      {paymentColumnLabels.map((lab) => (
                        <SortTh
                          key={lab}
                          label={<span title={lab}>{lab}</span>}
                          sortKey={`pay:${lab}`}
                          current={agentSort}
                          onSort={onAgentSort}
                          className="max-w-[10rem] whitespace-normal px-3 py-2 text-xs leading-tight"
                          align="right"
                        />
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
                      <>
                        {agentRows.map((r, idx) => (
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
                            {paymentColumnLabels.map((lab, idx) => (
                              <td key={`${r.agent_id ?? "x"}-${idx}-${lab}`} className="px-3 py-2">
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
      {tenantSlug ? (
        <ClientBalancesBulkPaymentDialog
          open={bulkPayOpen}
          onOpenChange={(o) => {
            setBulkPayOpen(o);
            if (!o) setBulkPayClients([]);
          }}
          tenantSlug={tenantSlug}
          clients={bulkPayClients}
          paymentColumnLabels={paymentColumnLabels}
          tradeDirections={filterOptQ.data?.trade_directions ?? []}
          onSaved={() => setSelectedClients(new Map())}
        />
      ) : null}
    </PageShell>
  );
}

function ClientLikeTable({
  variant,
  statusFilter,
  rowKey,
  paymentColumnLabels,
  sort,
  onSort,
  loading,
  rows,
  selected,
  onToggle,
  onToggleAll,
  onCopyId
}: {
  variant: "clients" | "delivery";
  /** «Все» — inactive + non-zero balans uchun belgi */
  statusFilter: "" | "active" | "inactive";
  rowKey: (r: ClientBalanceRow, rowIndex: number) => string;
  paymentColumnLabels: string[];
  sort: { col: string; dir: SortDir };
  onSort: (key: string) => void;
  loading: boolean;
  rows: ClientBalanceRow[];
  selected: Map<string, ClientBalanceRow>;
  onToggle: (row: ClientBalanceRow, rowIndex: number) => void;
  onToggleAll: () => void;
  onCopyId: (text: string) => void;
}) {
  const router = useRouter();

  const nPay = paymentColumnLabels.length;
  const colCount = (variant === "delivery" ? 17 : 16) + nPay;
  const headBg = "bg-muted/50";
  const note =
    variant === "delivery"
      ? "Одна строка — один доставленный неоплаченный заказ. Клик по строке (кроме ссылки и чекбокса) открывает карточку заказа."
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
                  checked={
                    rows.length > 0 &&
                    rows.every((r, i) => selected.has(rowKey(r, i)))
                  }
                  title="Выбрать всех на странице"
                  onChange={onToggleAll}
                />
              </th>
              {variant === "delivery" ? (
                <SortTh
                  label="Заказ (id)"
                  sortKey="order_id"
                  current={sort}
                  onSort={onSort}
                  className="whitespace-nowrap px-2 py-2"
                />
              ) : null}
              <SortTh
                label="Ид клиента"
                sortKey="client_id"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Клиент"
                sortKey="name"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Агент"
                sortKey="agent"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Код агента"
                sortKey="agent_code"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Супервайзер"
                sortKey="supervisor"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Название фирмы"
                sortKey="legal_name"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Направление торговли"
                sortKey="trade_direction"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh label="ИНН" sortKey="inn" current={sort} onSort={onSort} className="whitespace-nowrap px-2 py-2" />
              <SortTh
                label="Телефон"
                sortKey="phone"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Срок"
                sortKey="license_until"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Дни просрочки"
                sortKey="days_overdue"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label={variant === "delivery" ? "Дата доставки заказа" : "Дата последней доставки заказа"}
                sortKey="last_order_at"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Дата последней оплаты"
                sortKey="last_payment_at"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Дни с последней оплаты"
                sortKey="days_since_payment"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2"
              />
              <SortTh
                label="Общий"
                sortKey="balance"
                current={sort}
                onSort={onSort}
                className="whitespace-nowrap px-2 py-2 text-right"
                align="right"
              />
              {paymentColumnLabels.map((lab) => (
                <SortTh
                  key={lab}
                  label={<span title={lab}>{lab}</span>}
                  sortKey={`pay:${lab}`}
                  current={sort}
                  onSort={onSort}
                  className="max-w-[10rem] whitespace-normal px-2 py-2 text-xs leading-tight"
                  align="right"
                />
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
              <>
                {rows.map((r, rowIndex) => {
                  const oid = rowDeliveryOrderId(r);
                  return (
                    <tr
                      key={rowKey(r, rowIndex)}
                      className={cn(
                        "border-b border-border/80 hover:bg-muted/25",
                        variant === "delivery" && oid != null && "cursor-pointer"
                      )}
                      onClick={(e) => {
                        if (variant !== "delivery" || oid == null) return;
                        const el = e.target as HTMLElement;
                        if (el.closest("a,button,input,label")) return;
                        router.push(`/orders/${oid}`);
                      }}
                    >
                      <td
                        className="sticky left-0 z-10 border-r border-border bg-card px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-input"
                          checked={selected.has(rowKey(r, rowIndex))}
                          onChange={() => onToggle(r, rowIndex)}
                        />
                      </td>
                      {variant === "delivery" ? (
                        <td className="max-w-[10rem] px-2 py-2 text-xs">
                          {oid != null ? (
                            <Link
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              href={`/orders/${oid}`}
                            >
                              #{oid}
                              {r.delivery_order_number ? (
                                <span className="block truncate font-normal text-muted-foreground">
                                  {r.delivery_order_number}
                                </span>
                              ) : null}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
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
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/clients/${r.client_id}/balances`}
                          >
                            {r.name}
                          </Link>
                          {statusFilter === "" &&
                          r.is_active === false &&
                          parseAmount(r.balance) !== 0 ? (
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:bg-amber-500/25 dark:text-amber-300"
                              title="Неактивный клиент с ненулевым балансом"
                            >
                              <AlertCircle className="h-3 w-3" />
                            </span>
                          ) : null}
                        </div>
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
                      {paymentColumnLabels.map((lab, idx) => (
                        <td key={`${rowKey(r, rowIndex)}-${lab}`} className="px-2 py-2">
                          <MoneyCell value={amountForPaymentLabel(r.payment_amounts, lab, idx)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
