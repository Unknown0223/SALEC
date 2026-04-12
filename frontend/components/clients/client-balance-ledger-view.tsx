"use client";

import { AddClientExpenseDialog } from "@/components/client-expenses/add-client-expense-dialog";
import { AddPaymentDialog } from "@/components/payments/add-payment-dialog";
import { EditPaymentDialog } from "@/components/payments/edit-payment-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { formatRuDateButton } from "@/components/ui/date-picker-popover";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientProfileLedgerFiltersOptional } from "@/components/clients/client-profile-ledger-filters-context";
import {
  BalanceKpiScrollRow,
  CompactBalanceKpiCard,
  LEDGER_KPI_LANE_CLASS,
  SelectableCompactBalanceKpiCard
} from "@/components/clients/ledger-balance-kpi-shared";
import { api } from "@/lib/api";
import type {
  ClientBalanceLedgerResponse,
  ClientDebtorCreditorMonthlyResponse,
  ClientLedgerRow,
  DebtorCreditorMonthRow
} from "@/lib/client-balance-ledger-types";
import { downloadXlsxWorkbook } from "@/lib/download-xlsx";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Pencil,
  RefreshCw,
  Search
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  clientId: number;
  /** Внутри вкладки «Долги» карточки клиента — без PageShell и дубля шапки */
  embedded?: boolean;
  /** Доп. классы для корневого PageShell (напр. `pb-12` со страницы `/clients/:id/balances`) */
  pageShellClassName?: string;
};

/** Группировка разрядов (пробел), без дробной части в ведомости и карточках. */
const LEDGER_AMOUNT_FMT = { minFractionDigits: 0, maxFractionDigits: 0 } as const;

const ledgerSectionLabelClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

const ledgerTabTriggerClass =
  "min-h-8 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600 sm:text-[13px]";

const ledgerTableTh =
  "whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

const ledgerTableTd = "px-2 py-1.5 align-middle text-[11px] leading-snug tabular-nums";

function ledgerPeriodButtonLabel(dateFrom: string, dateTo: string): string {
  const f = dateFrom.trim();
  const t = dateTo.trim();
  if (f && t) return formatDateRangeButton(f, t);
  if (f) return `${formatRuDateButton(f)} — …`;
  if (t) return `… — ${formatRuDateButton(t)}`;
  return "Период";
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

function consignmentDaNet(v: boolean | null | undefined): string {
  return v === true ? "Да" : "Нет";
}

function generalDebtPositive(r: ClientLedgerRow): number {
  const d = parseAmount(r.debt_amount ?? "0");
  if (Math.abs(d) < 1e-12) return 0;
  return Math.abs(d);
}

function generalPaymentPositive(r: ClientLedgerRow): number {
  return Math.max(0, parseAmount(r.payment_amount ?? "0"));
}

function formatPayTypeLower(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function formatLedgerExcelDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function buildLedgerExcelGeneralRow(r: ClientLedgerRow): (string | number)[] {
  return [
    formatLedgerExcelDate(r.sort_at),
    r.type_code,
    generalDebtPositive(r) || "",
    generalPaymentPositive(r) || "",
    r.payment_type ?? "",
    r.agent_name ?? "",
    r.expeditor_name ?? "",
    consignmentDaNet(r.is_consignment),
    r.cash_desk_name ?? "",
    r.note ?? "",
    r.created_by_display ?? ""
  ];
}

function buildLedgerExcelDetailedRow(r: ClientLedgerRow): (string | number)[] {
  return [
    formatLedgerExcelDate(r.sort_at),
    r.type_code,
    r.operation_type_code,
    r.order_kind_label ?? "",
    consignmentDaNet(r.is_consignment),
    parseAmount(r.debt_amount ?? "0") || "",
    parseAmount(r.payment_amount ?? "0") || "",
    r.balance_after != null && r.balance_after !== "" ? parseAmount(r.balance_after) : "",
    (r.payment_type ?? "").trim().toLowerCase(),
    r.agent_name ?? "",
    r.expeditor_name ?? "",
    r.comment_primary ?? "",
    r.comment_transaction ?? "",
    r.created_by_display ?? ""
  ];
}

function LedgerMoney({
  value,
  column
}: {
  value: string | null | undefined;
  /** debt: любая ненулевая сумма в колонке «Долг» — красная. payment: минус красный, плюс зелёный. signed: как payment (дельта счёта). */
  column?: "debt" | "payment" | "signed";
}) {
  if (value == null || value === "") return <span className="text-muted-foreground">—</span>;
  const n = parseAmount(value);
  const formatted = formatNumberGrouped(n, LEDGER_AMOUNT_FMT);
  const cls =
    column === "debt"
      ? n !== 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground"
      : n < 0
        ? "text-red-600 dark:text-red-400"
        : n > 0
          ? "text-teal-600 dark:text-teal-400"
          : "text-muted-foreground";
  return <span className={cn("text-[11px] tabular-nums", cls)}>{formatted}</span>;
}

function formatLedgerDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type RowFilter = "all" | "debt" | "payment";

function ReportDcCell({ value, variant }: { value: string; variant: "plain" | "saldo" }) {
  const n = parseAmount(value);
  const formatted = formatNumberGrouped(n, LEDGER_AMOUNT_FMT);
  if (variant === "plain") {
    return <span className="tabular-nums">{formatted}</span>;
  }
  const cls =
    n < 0
      ? "text-red-600 dark:text-red-400"
      : n > 0
        ? "text-teal-600 dark:text-teal-400"
        : "text-muted-foreground";
  return <span className={cn("tabular-nums font-medium", cls)}>{formatted}</span>;
}

function DebtorCreditorMonthlySection({
  tenantSlug,
  clientId,
  open,
  onOpenChange
}: {
  tenantSlug: string;
  clientId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const hydrated = useAuthStoreHydrated();
  const q = useQuery({
    queryKey: ["client-debtor-creditor-monthly", tenantSlug, clientId],
    staleTime: STALE.list,
    enabled: Boolean(hydrated && tenantSlug && open),
    queryFn: async () => {
      const { data } = await api.get<ClientDebtorCreditorMonthlyResponse>(
        `/api/${tenantSlug}/clients/${clientId}/debtor-creditor-monthly`
      );
      return data;
    }
  });

  return (
    <div className="mt-8 w-full overflow-hidden rounded-xl border border-border/90 bg-card shadow-panel">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm font-semibold text-foreground hover:bg-muted/50"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-teal-600 transition-transform dark:text-teal-400", open && "rotate-180")}
        />
        Отчёт по дебиторской и кредиторской задолженности
      </button>
      {open ? (
        <div className="border-t border-border/70 bg-muted/15 p-3 sm:p-5 dark:bg-muted/10">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">Не удалось загрузить отчёт.</p>
          ) : (q.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных за период.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th rowSpan={2} className="align-bottom px-3 py-2">
                      Месяц
                    </th>
                    <th colSpan={3} className="border-l border-border px-3 py-2 text-center">
                      За этот месяц
                    </th>
                    <th colSpan={3} className="border-l border-border px-3 py-2 text-center">
                      За весь период
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                    <th className="border-l border-border px-3 py-2 text-right">Дебет</th>
                    <th className="px-3 py-2 text-right">Кредит</th>
                    <th className="px-3 py-2 text-right">Сальдо</th>
                    <th className="border-l border-border px-3 py-2 text-right">Дебет</th>
                    <th className="px-3 py-2 text-right">Кредит</th>
                    <th className="px-3 py-2 text-right">Сальдо</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data!.rows.map((row: DebtorCreditorMonthRow, i: number) => (
                    <tr
                      key={row.month_key}
                      className={cn(
                        "border-b border-border/80",
                        i % 2 === 1 && "bg-sky-50/45 dark:bg-sky-950/20"
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-teal-700 dark:text-teal-300">
                        {row.month_label}
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right">
                        <ReportDcCell value={row.this_month.debit} variant="plain" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReportDcCell value={row.this_month.credit} variant="plain" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReportDcCell value={row.this_month.saldo} variant="saldo" />
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right">
                        <ReportDcCell value={row.cumulative.debit} variant="plain" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReportDcCell value={row.cumulative.credit} variant="plain" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ReportDcCell value={row.cumulative.saldo} variant="saldo" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ClientBalanceLedgerView({ clientId, embedded = false, pageShellClassName }: Props) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const queryClient = useQueryClient();
  const role = useEffectiveRole();
  const canEditPayments = role === "admin" || role === "operator";

  const [tab, setTab] = useState<"general" | "detailed">("general");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dateRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const profileLedgerCtx = useClientProfileLedgerFiltersOptional();
  const [localShowGeneralBlock, setLocalShowGeneralBlock] = useState(true);
  const [localAgentFilter, setLocalAgentFilter] = useState<{ agentIds: number[]; noAgent: boolean }>({
    agentIds: [],
    noAgent: false
  });

  const showGeneralBlock =
    embedded && profileLedgerCtx ? profileLedgerCtx.showGeneralBlock : localShowGeneralBlock;
  const setShowGeneralBlock =
    embedded && profileLedgerCtx ? profileLedgerCtx.setShowGeneralBlock : setLocalShowGeneralBlock;
  const agentFilter = embedded && profileLedgerCtx ? profileLedgerCtx.agentFilter : localAgentFilter;
  const setAgentFilter = embedded && profileLedgerCtx ? profileLedgerCtx.setAgentFilter : setLocalAgentFilter;
  const hasAgentTableFilter = agentFilter.agentIds.length > 0 || agentFilter.noAgent;
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [excelBusy, setExcelBusy] = useState(false);
  const [debtorReportOpen, setDebtorReportOpen] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState<number | null>(null);
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (embedded && profileLedgerCtx) return;
    setLocalAgentFilter({ agentIds: [], noAgent: false });
  }, [clientId, embedded, profileLedgerCtx]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, limit, rowFilter, agentFilter.agentIds, agentFilter.noAgent, tab]);

  const ledgerQs = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });
    if (tab === "detailed") p.set("ledger_detail", "1");
    if (dateFrom.trim()) p.set("date_from", dateFrom.trim());
    if (dateTo.trim()) p.set("date_to", dateTo.trim());
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (rowFilter !== "all") p.set("ledger_kind", rowFilter);
    if (agentFilter.agentIds.length > 0) {
      const sorted = [...agentFilter.agentIds].sort((a, b) => a - b);
      p.set("agent_ids", sorted.join(","));
    }
    if (agentFilter.noAgent) p.set("no_agent", "1");
    return p.toString();
  }, [page, limit, tab, dateFrom, dateTo, debouncedSearch, rowFilter, agentFilter.agentIds, agentFilter.noAgent]);

  const ledgerQ = useQuery({
    queryKey: ["client-balance-ledger", tenantSlug, clientId, ledgerQs],
    staleTime: STALE.list,
    enabled: Boolean(hydrated && tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<ClientBalanceLedgerResponse>(
        `/api/${tenantSlug}/clients/${clientId}/balance-ledger?${ledgerQs}`
      );
      return data;
    }
  });

  const ledgerClientLabel = useMemo(() => {
    const c = ledgerQ.data?.client;
    if (!c) return "";
    const code = c.client_code?.trim();
    return code ? `${code} ${c.name}` : c.name;
  }, [ledgerQ.data?.client]);

  const resetTableFilters = useCallback(() => {
    setDateRangeOpen(false);
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setRowFilter("all");
    setAgentFilter({ agentIds: [], noAgent: false });
    setPage(1);
  }, []);

  const runExcel = useCallback(async () => {
    if (!tenantSlug) return;
    setExcelBusy(true);
    try {
      const p = new URLSearchParams({ page: "1", limit: "5000", ledger_detail: "1" });
      if (dateFrom.trim()) p.set("date_from", dateFrom.trim());
      if (dateTo.trim()) p.set("date_to", dateTo.trim());
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (rowFilter !== "all") p.set("ledger_kind", rowFilter);
      if (agentFilter.agentIds.length > 0) {
        const sorted = [...agentFilter.agentIds].sort((a, b) => a - b);
        p.set("agent_ids", sorted.join(","));
      }
      if (agentFilter.noAgent) p.set("no_agent", "1");
      const { data } = await api.get<ClientBalanceLedgerResponse>(
        `/api/${tenantSlug}/clients/${clientId}/balance-ledger?${p}`
      );
      const headersGeneral = [
        "Дата",
        "Тип",
        "Долг",
        "Оплата",
        "Способ оплаты",
        "Агент",
        "Экспедиторы",
        "Консигнация",
        "Касса",
        "Комментарий",
        "Кто создал"
      ];
      const headersDetailed = [
        "Дата",
        "Тип",
        "Название типа операции",
        "Тип заказ",
        "Консигнация",
        "Долг",
        "Оплата",
        "Баланс (после)",
        "Способ оплаты",
        "Агент",
        "Экспедиторы",
        "Комментарий",
        "Комментарий к транзакциям",
        "Кто создал"
      ];
      const fname = `balans-klient-${data.client.name.slice(0, 40).replace(/[/\\?%*:|"<>]/g, "_")}-${localYmd(new Date())}.xlsx`;
      await downloadXlsxWorkbook(fname, [
        {
          name: "Общий",
          headers: headersGeneral,
          rows: data.rows.map((r) => buildLedgerExcelGeneralRow(r)),
          colWidths: [18, 6, 14, 14, 14, 22, 16, 10, 18, 28, 20]
        },
        {
          name: "Подробно",
          headers: headersDetailed,
          rows: data.rows.map((r) => buildLedgerExcelDetailedRow(r)),
          colWidths: [18, 6, 8, 10, 10, 12, 12, 14, 12, 20, 16, 24, 24, 18]
        }
      ]);
    } finally {
      setExcelBusy(false);
    }
  }, [tenantSlug, clientId, dateFrom, dateTo, debouncedSearch, rowFilter, agentFilter.agentIds, agentFilter.noAgent]);

  if (!hydrated || !tenantSlug) {
    if (embedded) {
      return <p className="py-4 text-sm text-muted-foreground">Загрузка…</p>;
    }
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </PageShell>
    );
  }

  const d = ledgerQ.data;
  const err = ledgerQ.isError ? "Не удалось загрузить данные." : null;

  const clientTitle =
    d?.client.client_code?.trim() ? `${d.client.client_code.trim()} ${d.client.name}` : (d?.client.name ?? "");
  const clientDescription =
    d != null
      ? [d.client.territory_label, d.client.phone].filter(Boolean).join(" · ") || undefined
      : undefined;

  const ledgerToolbarActions = (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="rounded border-input"
          checked={showGeneralBlock}
          onChange={(e) => setShowGeneralBlock(e.target.checked)}
        />
        Показать общий блок
      </label>
      <button
        type="button"
        className={cn(
          buttonVariants({ size: "sm" }),
          "gap-2 bg-teal-600 px-4 text-white hover:bg-teal-700"
        )}
        onClick={() => {
          void ledgerQ.refetch();
          void queryClient.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug, clientId] });
          void queryClient.invalidateQueries({
            queryKey: ["client-debtor-creditor-monthly", tenantSlug, clientId]
          });
        }}
      >
        <RefreshCw className={cn("h-4 w-4 shrink-0", ledgerQ.isFetching && "animate-spin")} />
        Обновить данные
      </button>
    </div>
  );

  const inner = (
    <>
      {!embedded ? (
        <nav
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
          aria-label="Навигация"
        >
          <Link
            href="/client-balances"
            className="rounded-md hover:text-primary hover:underline underline-offset-4"
          >
            Балансы клиентов
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
          <Link
            href={`/clients/${clientId}`}
            className="font-medium text-foreground hover:text-primary hover:underline underline-offset-4"
          >
            {clientTitle || "Баланс"}
          </Link>
        </nav>
      ) : null}

      {d && !embedded ? (
        <PageHeader
          className="pb-5"
          title={
            <Link
              href={`/clients/${clientId}`}
              className="hover:text-primary hover:underline decoration-teal-600/70 underline-offset-4 dark:decoration-teal-400/70"
            >
              {clientTitle || "Баланс"}
            </Link>
          }
          description={clientDescription}
          actions={ledgerToolbarActions}
        />
      ) : null}
      {!d && embedded ? <p className="text-sm text-muted-foreground">Загрузка ведомости…</p> : null}
      {!d && !embedded ? <PageHeader title="Баланс клиента" description="Загрузка…" /> : null}

      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      {d ? (
        <>
          {!embedded && (showGeneralBlock || d.agent_cards.length > 0 ? (
            <div className="mb-3 space-y-1 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border/60 pb-1">
                <span className={ledgerSectionLabelClass}>Баланс (фильтр таблицы)</span>
                {hasAgentTableFilter ? (
                  <button
                    type="button"
                    className="text-[10px] font-semibold uppercase tracking-wide text-primary underline-offset-2 hover:underline"
                    onClick={() => setAgentFilter({ agentIds: [], noAgent: false })}
                  >
                    Все агенты
                  </button>
                ) : null}
              </div>
              <BalanceKpiScrollRow
                layoutSignature={`${d.agent_cards.length}-${showGeneralBlock}-${d.ledger_net_balance ?? ""}-${[...agentFilter.agentIds].sort((a, b) => a - b).join(",")}-${agentFilter.noAgent ? 1 : 0}`}
              >
                {showGeneralBlock ? (
                  <div className={LEDGER_KPI_LANE_CLASS}>
                    <CompactBalanceKpiCard
                      title="Общий"
                      mainAmountStr={d.ledger_net_balance ?? d.account_balance}
                      paymentByType={d.summary_payment_by_type}
                    />
                  </div>
                ) : null}
                {d.agent_cards.map((ac) => {
                  const isNullAgent = ac.agent_id == null;
                  const aid = ac.agent_id;
                  const cardChecked = isNullAgent
                    ? agentFilter.noAgent
                    : typeof aid === "number" && agentFilter.agentIds.includes(aid);
                  const gd = parseAmount(ac.ledger_general_debt_total ?? "0");
                  const gp = parseAmount(ac.ledger_general_payment_total ?? "0");
                  const net = gp - gd;
                  const title = ac.agent_code ? `${ac.agent_name} (${ac.agent_code})` : ac.agent_name;
                  return (
                    <div key={`${ac.agent_id ?? "null"}-${ac.agent_name}`} className={LEDGER_KPI_LANE_CLASS}>
                      <SelectableCompactBalanceKpiCard
                        title={title}
                        mainAmountStr={String(Math.round(net))}
                        paymentByType={ac.payment_by_type}
                        checked={cardChecked}
                        selectedTone={net < 0 ? "red" : "teal"}
                        onToggle={() => {
                          if (isNullAgent) {
                            setAgentFilter((prev) => ({ ...prev, noAgent: !prev.noAgent }));
                          } else {
                            const id = ac.agent_id as number;
                            setAgentFilter((prev) => {
                              const next = new Set(prev.agentIds);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return { ...prev, agentIds: Array.from(next) };
                            });
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </BalanceKpiScrollRow>
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">Нет активных заказов по агентам для карточек.</p>
          ))}

          <Tabs value={tab} onValueChange={(v) => setTab(v as "general" | "detailed")} className="gap-4">
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <TabsList className="inline-flex h-auto min-h-8 w-full flex-wrap gap-0.5 rounded-lg border border-border bg-slate-100 p-0.5 sm:w-auto dark:bg-zinc-900/60">
                  <TabsTrigger value="general" className={ledgerTabTriggerClass}>
                    Общее
                  </TabsTrigger>
                  <TabsTrigger value="detailed" className={ledgerTabTriggerClass}>
                    Подробно
                  </TabsTrigger>
                </TabsList>
                <Label htmlFor="ledger-row-kind" className="sr-only">
                  Показать строки таблицы
                </Label>
                <select
                  id="ledger-row-kind"
                  className={cn(
                    filterPanelSelectClassName,
                    "h-8 min-h-8 min-w-[10.5rem] max-w-[14rem] py-0 text-xs sm:w-auto"
                  )}
                  value={rowFilter}
                  title="Фильтр строк ведомости"
                  onChange={(e) => {
                    setRowFilter(e.target.value as RowFilter);
                    setPage(1);
                  }}
                >
                  <option value="all">Все строки</option>
                  <option value="debt">Только долг</option>
                  <option value="payment">Только оплата</option>
                </select>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                {embedded ? ledgerToolbarActions : null}
                {canEditPayments && tenantSlug ? (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 text-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/55 dark:text-red-400 dark:hover:bg-red-950/35"
                      )}
                      title="Добавить расход (колонка «Долг»)"
                      onClick={() => setAddDebtOpen(true)}
                    >
                      Долг
                    </button>
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 text-xs border-teal-200 text-teal-800 hover:bg-teal-50 dark:border-teal-900/55 dark:text-teal-300 dark:hover:bg-teal-950/35"
                      )}
                      title="Добавить оплату"
                      onClick={() => setAddPaymentOpen(true)}
                    >
                      Оплата
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2 sm:flex-row sm:items-center sm:justify-between dark:bg-muted/20">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title="Сбросить фильтры таблицы"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 w-8 shrink-0 border-border bg-background p-0")}
                  onClick={resetTableFilters}
                >
                  <Filter className="h-3.5 w-3.5" />
                </button>
                <Label className="sr-only">Строк на странице</Label>
                <select
                  className={cn(filterPanelSelectClassName, "h-8 min-w-[4.5rem] max-w-[5.5rem] py-0 text-xs")}
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
                </select>
                <div className="relative min-w-[10rem] flex-1 sm:max-w-[14rem]">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 border-border bg-background pl-7 text-xs"
                    placeholder="Поиск"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto sm:flex-nowrap">
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 border-border bg-background px-2.5 text-xs")}
                  disabled={excelBusy || !d.rows.length}
                  onClick={() => void runExcel()}
                  title="Два листа: «Общий» и «Подробно», как в шаблоне Excel"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {excelBusy ? "…" : "Excel"}
                </button>
                <div className="flex shrink-0 items-center gap-0">
                  <button
                    ref={dateRangeAnchorRef}
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-8 min-w-[11rem] max-w-[20rem] justify-start gap-1.5 border-border bg-background px-2 text-xs font-normal tabular-nums",
                      dateRangeOpen && "border-blue-500/60 bg-blue-500/5"
                    )}
                    title="Период: дата от и дата до"
                    aria-label="Период: дата от и дата до"
                    aria-expanded={dateRangeOpen}
                    aria-haspopup="dialog"
                    onClick={() => setDateRangeOpen((o) => !o)}
                  >
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{ledgerPeriodButtonLabel(dateFrom, dateTo)}</span>
                  </button>
                  <DateRangePopover
                    open={dateRangeOpen}
                    onOpenChange={setDateRangeOpen}
                    anchorRef={dateRangeAnchorRef}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onApply={({ dateFrom: nextFrom, dateTo: nextTo }) => {
                      setDateFrom(nextFrom);
                      setDateTo(nextTo);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 shrink-0 gap-1.5 border-border bg-background px-3 text-xs"
                  )}
                  onClick={() => {
                    void ledgerQ.refetch();
                    void queryClient.invalidateQueries({
                      queryKey: ["client-debtor-creditor-monthly", tenantSlug, clientId]
                    });
                  }}
                  title="Обновить таблицу и отчёт"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", ledgerQ.isFetching && "animate-spin")} />
                  Обновить
                </button>
              </div>
            </div>

            <TabsContent value="general" className="mt-3 space-y-3 outline-none">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Общий</span> — как в Excel: тип{" "}
                <span className="font-medium text-foreground">1</span> — заказ (долг),{" "}
                <span className="font-medium text-foreground">2</span> — оплата/расход; суммы в «Долг» и «Оплата» —
                положительные; консигнация «Да»/«Нет».
              </p>
              <Card className="overflow-hidden border border-border/90 shadow-panel">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 dark:bg-muted/40">
                      <th className={ledgerTableTh}>Дата</th>
                      <th className={cn(ledgerTableTh, "text-center")}>Тип</th>
                      <th className={ledgerTableTh}>Операция</th>
                      <th className={cn(ledgerTableTh, "text-right")}>Долг</th>
                      <th className={cn(ledgerTableTh, "text-right")}>Оплата</th>
                      <th className={ledgerTableTh}>Способ оплаты</th>
                      <th className={ledgerTableTh}>Агент</th>
                      <th className={ledgerTableTh}>Экспедиторы</th>
                      <th className={ledgerTableTh}>Консигнация</th>
                      <th className={ledgerTableTh}>Касса</th>
                      <th className={ledgerTableTh}>Комментарий</th>
                      <th className={ledgerTableTh}>Кто создал</th>
                      <th className="w-8 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQ.isLoading ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                          Загрузка…
                        </td>
                      </tr>
                    ) : d.rows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      d.rows.map((r, i) => {
                        const gd = generalDebtPositive(r);
                        const gp = generalPaymentPositive(r);
                        return (
                          <tr
                            key={`${r.row_kind}-${r.order_id ?? ""}-${r.payment_id ?? ""}-${r.sort_at}`}
                            className={cn(
                              "border-b border-border/80 hover:bg-muted/25",
                              i % 2 === 1 && "bg-sky-50/35 dark:bg-sky-950/15"
                            )}
                          >
                            <td className={cn(ledgerTableTd, "whitespace-nowrap")}>{formatLedgerDt(r.sort_at)}</td>
                            <td
                              className={cn(ledgerTableTd, "text-center text-muted-foreground")}
                              title={r.type_label}
                            >
                              {r.type_code}
                            </td>
                            <td className={cn(ledgerTableTd, "max-w-[12rem]")}>
                              {r.row_kind === "order" && r.order_id != null ? (
                                <Link
                                  className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                                  href={`/orders/${r.order_id}`}
                                >
                                  {r.type_label}
                                </Link>
                              ) : r.row_kind === "payment" && r.payment_id != null ? (
                                <Link
                                  className={cn(
                                    "font-medium underline-offset-2 hover:underline",
                                    r.entry_kind === "client_expense"
                                      ? "text-amber-600 dark:text-amber-500"
                                      : "text-teal-600 dark:text-teal-400"
                                  )}
                                  href={`/payments/${r.payment_id}`}
                                >
                                  {r.type_label}
                                </Link>
                              ) : (
                                r.type_label
                              )}
                            </td>
                            <td className={cn(ledgerTableTd, "text-right")}>
                              {gd > 0 ? (
                                <span className="font-medium text-destructive">
                                  {formatNumberGrouped(gd, LEDGER_AMOUNT_FMT)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className={cn(ledgerTableTd, "text-right")}>
                              {gp > 0 ? (
                                <span className="font-medium text-teal-600 dark:text-teal-400">
                                  {formatNumberGrouped(gp, LEDGER_AMOUNT_FMT)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className={ledgerTableTd}>{r.payment_type ?? "—"}</td>
                            <td className={cn(ledgerTableTd, "max-w-[9rem] truncate")}>{r.agent_name ?? "—"}</td>
                            <td className={cn(ledgerTableTd, "max-w-[7rem] truncate")}>{r.expeditor_name ?? "—"}</td>
                            <td className={ledgerTableTd}>{consignmentDaNet(r.is_consignment)}</td>
                            <td className={cn(ledgerTableTd, "max-w-[7rem] truncate")}>{r.cash_desk_name ?? "—"}</td>
                            <td className={cn(ledgerTableTd, "max-w-[10rem] truncate text-muted-foreground")}>
                              {r.note ?? "—"}
                            </td>
                            <td className={cn(ledgerTableTd, "text-muted-foreground")}>{r.created_by_display ?? "—"}</td>
                            <td className="px-1 py-1.5">
                              {canEditPayments && r.row_kind === "payment" && r.payment_id != null ? (
                                <button
                                  type="button"
                                  className="inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Tahrirlash"
                                  onClick={() => setEditPaymentId(r.payment_id!)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                    </table>
                  </div>
                  {d.total > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground dark:bg-muted/10">
                      <span>
                        Показано {(page - 1) * limit + 1}–{Math.min(page * limit, d.total)} из {d.total}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-8 border-border bg-background px-2.5 text-xs"
                          )}
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-8 border-border bg-background px-2.5 text-xs"
                          )}
                          disabled={page * limit >= d.total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Вперёд
                        </button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="detailed" className="mt-3 space-y-3 outline-none">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Подробно</span> — коды{" "}
                <span className="font-medium text-foreground">7 / 1 / 2</span> (заказ / оплата / расход), знаковые
                суммы, нарастающий <span className="font-medium text-foreground">«Баланс (после)»</span>, два поля
                комментария.
              </p>
              <Card className="overflow-hidden border border-border/90 shadow-panel">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1380px] border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 dark:bg-muted/40">
                      <th className={ledgerTableTh}>Дата</th>
                      <th className={cn(ledgerTableTh, "text-center")}>Тип</th>
                      <th className={cn(ledgerTableTh, "text-center")}>Название типа операции</th>
                      <th className={ledgerTableTh}>Тип заказ</th>
                      <th className={ledgerTableTh}>Консигнация</th>
                      <th className={cn(ledgerTableTh, "text-right")}>Долг</th>
                      <th className={cn(ledgerTableTh, "text-right")}>Оплата</th>
                      <th className={cn(ledgerTableTh, "text-right")}>Баланс (после)</th>
                      <th className={ledgerTableTh}>Способ оплаты</th>
                      <th className={ledgerTableTh}>Агент</th>
                      <th className={ledgerTableTh}>Экспедиторы</th>
                      <th className={ledgerTableTh}>Комментарий</th>
                      <th className={ledgerTableTh}>Комментарий к транзакциям</th>
                      <th className={ledgerTableTh}>Кто создал</th>
                      <th className="w-8 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQ.isLoading ? (
                      <tr>
                        <td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">
                          Загрузка…
                        </td>
                      </tr>
                    ) : d.rows.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      d.rows.map((r, i) => (
                        <tr
                          key={`d-${r.row_kind}-${r.order_id ?? ""}-${r.payment_id ?? ""}-${r.sort_at}`}
                          className={cn(
                            "border-b border-border/80 hover:bg-muted/25",
                            i % 2 === 1 && "bg-sky-50/35 dark:bg-sky-950/15"
                          )}
                        >
                          <td className={cn(ledgerTableTd, "whitespace-nowrap")}>{formatLedgerDt(r.sort_at)}</td>
                          <td className={cn(ledgerTableTd, "text-center text-muted-foreground")}>{r.type_code}</td>
                          <td className={cn(ledgerTableTd, "text-center font-mono")}>{r.operation_type_code}</td>
                          <td className={ledgerTableTd}>{r.order_kind_label ?? "—"}</td>
                          <td className={ledgerTableTd}>{consignmentDaNet(r.is_consignment)}</td>
                          <td className={cn(ledgerTableTd, "text-right")}>
                            <LedgerMoney value={r.debt_amount} column="debt" />
                          </td>
                          <td className={cn(ledgerTableTd, "text-right")}>
                            <LedgerMoney value={r.payment_amount} column="payment" />
                          </td>
                          <td className={cn(ledgerTableTd, "text-right")}>
                            <LedgerMoney value={r.balance_after} column="signed" />
                          </td>
                          <td className={cn(ledgerTableTd, "lowercase")}>{formatPayTypeLower(r.payment_type) || "—"}</td>
                          <td className={cn(ledgerTableTd, "max-w-[8rem] truncate")}>{r.agent_name ?? "—"}</td>
                          <td className={cn(ledgerTableTd, "max-w-[7rem] truncate")}>{r.expeditor_name ?? "—"}</td>
                          <td className={cn(ledgerTableTd, "max-w-[9rem] truncate text-muted-foreground")}>
                            {r.comment_primary ?? "—"}
                          </td>
                          <td className={cn(ledgerTableTd, "max-w-[9rem] truncate text-muted-foreground")}>
                            {r.comment_transaction ?? "—"}
                          </td>
                          <td className={cn(ledgerTableTd, "text-muted-foreground")}>{r.created_by_display ?? "—"}</td>
                          <td className="px-1 py-1.5">
                            {canEditPayments && r.row_kind === "payment" && r.payment_id != null ? (
                              <button
                                type="button"
                                className="inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Tahrirlash"
                                onClick={() => setEditPaymentId(r.payment_id!)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                    </table>
                  </div>
                  {d.total > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground dark:bg-muted/10">
                      <span>
                        Показано {(page - 1) * limit + 1}–{Math.min(page * limit, d.total)} из {d.total}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-8 border-border bg-background px-2.5 text-xs"
                          )}
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-8 border-border bg-background px-2.5 text-xs"
                          )}
                          disabled={page * limit >= d.total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Вперёд
                        </button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {tenantSlug ? (
            <>
              <AddClientExpenseDialog
                key={`debt-${clientId}`}
                open={addDebtOpen}
                onOpenChange={setAddDebtOpen}
                tenantSlug={tenantSlug}
                fixedClientId={clientId}
                fixedClientLabel={ledgerClientLabel || `Клиент #${clientId}`}
                defaultLedgerAgentId={d.client.agent_id}
                onCreated={() => {
                  void queryClient.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug, clientId] });
                }}
              />
              <AddPaymentDialog
                key={`pay-${clientId}`}
                open={addPaymentOpen}
                onOpenChange={setAddPaymentOpen}
                tenantSlug={tenantSlug}
                lockedClientId={String(clientId)}
                lockedClientLabel={ledgerClientLabel || `Клиент #${clientId}`}
                initialLedgerAgentId={d.client.agent_id}
                onCreated={() => {
                  void queryClient.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug, clientId] });
                }}
              />
              <EditPaymentDialog
                open={editPaymentId != null}
                onOpenChange={(o) => {
                  if (!o) setEditPaymentId(null);
                }}
                tenantSlug={tenantSlug}
                paymentId={editPaymentId}
                clientId={clientId}
                onSaved={() => {
                  void queryClient.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug, clientId] });
                }}
              />
            </>
          ) : null}

          <DebtorCreditorMonthlySection
            tenantSlug={tenantSlug}
            clientId={clientId}
            open={debtorReportOpen}
            onOpenChange={setDebtorReportOpen}
          />
        </>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="min-w-0 space-y-4">{inner}</div>;
  }
  return <PageShell className={pageShellClassName}>{inner}</PageShell>;
}
