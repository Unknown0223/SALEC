"use client";

import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { AddClientExpenseDialog } from "@/components/client-expenses/add-client-expense-dialog";
import { AddPaymentDialog } from "@/components/payments/add-payment-dialog";
import { PaymentReceiptPrintSettingsDialog } from "@/components/payments/payment-receipt-print-settings-dialog";
import { PaymentReceiptsPrintView } from "@/components/payments/payment-receipts-print-view";
import {
  DEFAULT_HIDDEN_PAYMENT_COLUMNS,
  DEFAULT_PAYMENT_COLUMN_ORDER,
  PAYMENTS_TABLE_ID,
  PAYMENT_COL_TD,
  PAYMENT_COL_TH,
  PAYMENT_TABLE_COLUMNS
} from "@/components/payments/client-payments-table-config";
import { PaymentAllocateDialog } from "@/components/payments/payment-allocate-dialog";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { PaymentFiltersVisibilityDialog } from "@/components/payments/payment-filters-visibility-dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { FilterSelect, filterPanelSelectClassName, filterSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import type { ClientRow } from "@/lib/client-types";
import type { PaymentListApiResponse, PaymentListApiRow } from "@/lib/payment-list-types";
import {
  DEFAULT_PAYMENT_FILTER_VISIBILITY,
  loadPaymentFilterVisibility,
  type PaymentFilterVisibility
} from "@/lib/payment-filters-visibility";
import {
  DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS,
  loadPaymentReceiptPrintPrefs,
  type PaymentReceiptPrintPrefs
} from "@/lib/payment-receipt-print-prefs";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  Filter,
  History,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  Trash2
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type DealType = "regular" | "consignment" | "both";

export type ClientPaymentsWorkspaceVariant = "payments" | "client_expenses";

type StaffPick = { id: number; fio: string; code?: string | null };

type PaymentStatusFilter = "" | "pending_confirmation" | "confirmed" | "deleted";

type DateFieldFilter = "created_at" | "paid_at" | "confirmed_at";

type FilterForm = {
  deal_type: DealType;
  date_from: string;
  date_to: string;
  date_field: DateFieldFilter;
  client_id: string;
  payment_status: PaymentStatusFilter;
  cash_desk_ids: number[];
  agent_id: string;
  expeditor_user_id: string;
  payment_type: string;
  trade_direction: string;
  territory_region: string;
  territory_city: string;
  territory_district: string;
  amount_min: string;
  amount_max: string;
  search: string;
};

type CashDeskRow = { id: number; name: string; is_active: boolean };

function monthBoundsUtcIso(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(last)}`
  };
}

const defaultForm = (): FilterForm => {
  const { from, to } = monthBoundsUtcIso();
  return {
    deal_type: "both",
    date_from: from,
    date_to: to,
    date_field: "created_at",
    client_id: "",
    payment_status: "",
    cash_desk_ids: [],
    agent_id: "",
    expeditor_user_id: "",
    payment_type: "",
    trade_direction: "",
    territory_region: "",
    territory_city: "",
    territory_district: "",
    amount_min: "",
    amount_max: "",
    search: ""
  };
};

function buildPaymentsQuery(
  form: FilterForm,
  page: number,
  pageSize: number,
  variant: ClientPaymentsWorkspaceVariant
): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(pageSize));
  p.set("entry_kind", variant === "client_expenses" ? "client_expense" : "payment");
  if (form.date_from.trim()) p.set("date_from", form.date_from.trim());
  if (form.date_to.trim()) p.set("date_to", form.date_to.trim());
  if (form.date_field !== "created_at") p.set("date_field", form.date_field);
  if (form.client_id.trim()) p.set("client_id", form.client_id.trim());
  if (form.search.trim()) p.set("search", form.search.trim());
  if (variant !== "client_expenses") {
    if (form.amount_min.trim()) p.set("amount_min", form.amount_min.trim().replace(/\s/g, "").replace(/,/g, ""));
    if (form.amount_max.trim()) p.set("amount_max", form.amount_max.trim().replace(/\s/g, "").replace(/,/g, ""));
  }
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.expeditor_user_id.trim()) p.set("expeditor_user_id", form.expeditor_user_id.trim());
  if (form.payment_type.trim()) p.set("payment_type", form.payment_type.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.territory_region.trim()) p.set("territory_region", form.territory_region.trim());
  if (form.territory_city.trim()) p.set("territory_city", form.territory_city.trim());
  if (form.territory_district.trim()) p.set("territory_district", form.territory_district.trim());
  if (form.deal_type !== "both") p.set("deal_type", form.deal_type);
  if (form.payment_status) p.set("payment_status", form.payment_status);
  if (form.cash_desk_ids.length > 0) p.set("cash_desk_ids", form.cash_desk_ids.join(","));
  return p.toString();
}

function downloadPaymentsExcel(rows: PaymentListApiRow[]) {
  const headers = [
    "ID",
    "Дата создания",
    "Дата оплаты",
    "Дата получения",
    "Дата подтверждения",
    "Клиент",
    "Юр. название",
    "Ид клиента",
    "Баланс",
    "Тип",
    "Способ оплаты",
    "Сумма",
    "Агент",
    "Направление",
    "Консигнация",
    "Код агента",
    "Экспедитор",
    "Касса",
    "Область",
    "Город",
    "Район",
    "Комментарий",
    "Заказ"
  ];
  const dataRows = rows.map((r) => [
    r.id,
    r.created_at,
    r.paid_at ?? "",
    r.received_at ?? "",
    r.confirmed_at ?? "",
    r.client_name,
    r.client_legal_name ?? "",
    r.client_code ?? "",
    r.client_balance,
    r.payment_kind,
    r.payment_type,
    r.amount,
    r.agent_name ?? "",
    r.trade_direction ?? "",
    r.consignment ? "Да" : "Нет",
    r.agent_code ?? "",
    r.expeditor_name ?? "",
    r.cash_desk_name ?? "",
    r.client_region ?? "",
    r.client_city ?? "",
    r.client_district ?? "",
    r.note ?? "",
    r.order_number ?? ""
  ]);
  downloadXlsxSheet(
    `oplata-klientov-${new Date().toISOString().slice(0, 10)}.xlsx`,
    "Оплаты клиентов",
    headers,
    dataRows
  );
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function parseAmount(s: string): number {
  const n = Number.parseFloat(s.replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CellCtx = {
  formatDt: (iso: string | null | undefined) => string;
  parseAmount: (s: string) => number;
  onCopy: (ok: boolean) => void;
};

function paymentDataCell(colId: string, r: PaymentListApiRow, ctx: CellCtx): ReactNode {
  switch (colId) {
    case "id":
      return (
        <Link className="font-mono text-xs text-primary underline-offset-2 hover:underline" href={`/payments/${r.id}`}>
          {r.id}
        </Link>
      );
    case "created_at":
      return <span className="text-xs text-muted-foreground">{ctx.formatDt(r.created_at)}</span>;
    case "paid_at":
      return <span className="text-xs text-muted-foreground">{ctx.formatDt(r.paid_at)}</span>;
    case "received_at":
      return <span className="text-xs text-muted-foreground">{ctx.formatDt(r.received_at)}</span>;
    case "confirmed_at":
      return <span className="text-xs text-muted-foreground">{ctx.formatDt(r.confirmed_at)}</span>;
    case "client_name":
      return (
        <div className="flex items-center gap-1">
          <Link className="text-primary underline-offset-2 hover:underline" href={`/clients/${r.client_id}`}>
            {r.client_name}
          </Link>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Копировать название"
            onClick={() => void copyToClipboard(r.client_name).then(ctx.onCopy)}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    case "legal_name":
      return <span className="text-xs text-muted-foreground">{r.client_legal_name ?? "—"}</span>;
    case "client_code":
      return (
        <div className="flex items-center gap-1 font-mono text-xs">
          <span>{r.client_code ?? "—"}</span>
          {r.client_code ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Копировать код"
              onClick={() => void copyToClipboard(r.client_code!).then(ctx.onCopy)}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      );
    case "balance":
      return (
        <span
          className={cn(
            "tabular-nums",
            ctx.parseAmount(r.client_balance) < 0 && "font-medium text-destructive"
          )}
        >
          {formatNumberGrouped(r.client_balance, { maxFractionDigits: 2 })} UZS
        </span>
      );
    case "kind":
      return <span className="text-xs">{r.payment_kind}</span>;
    case "method":
      return <span className="text-xs">{r.payment_type}</span>;
    case "amount":
      return (
        <span
          className={cn(
            "text-xs font-medium",
            r.entry_kind === "client_expense" && "text-destructive"
          )}
        >
          {formatNumberGrouped(r.amount, { maxFractionDigits: 2 })} UZS
        </span>
      );
    case "agent":
      return (
        <span className="text-xs">
          {r.agent_name ?? "—"}
          {r.agent_id != null ? <span className="text-muted-foreground"> ({r.agent_id})</span> : null}
        </span>
      );
    case "trade":
      return <span className="text-xs">{r.trade_direction ?? "—"}</span>;
    case "consignment":
      return <span className="text-xs">{r.consignment ? "Да" : "Нет"}</span>;
    case "agent_code":
      return <span className="font-mono text-xs">{r.agent_code ?? "—"}</span>;
    case "expeditor":
      return <span className="text-xs">{r.expeditor_name ?? "—"}</span>;
    case "cash_desk":
      return <span className="text-xs text-muted-foreground">{r.cash_desk_name ?? "—"}</span>;
    case "note":
      return <span className="truncate text-xs text-muted-foreground">{r.note ?? "—"}</span>;
    case "order":
      return r.order_id != null && r.order_number ? (
        <Link className="font-mono text-xs text-primary underline-offset-2 hover:underline" href={`/orders/${r.order_id}`}>
          {r.order_number}
        </Link>
      ) : (
        <span className="font-mono text-xs">—</span>
      );
    default:
      return "—";
  }
}

/** Ячейки с одной строкой — выравнивание по центру строки таблицы */
const PAYMENT_TD_NOWRAP = new Set([
  "id",
  "created_at",
  "paid_at",
  "received_at",
  "confirmed_at",
  "client_code",
  "balance",
  "kind",
  "method",
  "amount",
  "agent",
  "trade",
  "consignment",
  "agent_code",
  "expeditor",
  "cash_desk",
  "order"
]);

export function ClientPaymentsWorkspace({
  variant = "payments"
}: {
  variant?: ClientPaymentsWorkspaceVariant;
}) {
  const isExpenses = variant === "client_expenses";
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<FilterForm>(() => defaultForm());
  const [applied, setApplied] = useState<FilterForm>(() => defaultForm());
  const [page, setPage] = useState(1);
  const [allocateRow, setAllocateRow] = useState<PaymentListApiRow | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [cashDeskSearch, setCashDeskSearch] = useState("");
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [filterVis, setFilterVis] = useState<PaymentFilterVisibility>(DEFAULT_PAYMENT_FILTER_VISIBILITY);
  const [filterVisDialogOpen, setFilterVisDialogOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const dateRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [receiptPrefs, setReceiptPrefs] = useState<PaymentReceiptPrintPrefs>(DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS);
  const [receiptSettingsOpen, setReceiptSettingsOpen] = useState(false);
  const [printRows, setPrintRows] = useState<PaymentListApiRow[] | null>(null);
  const [selectedById, setSelectedById] = useState<Map<number, PaymentListApiRow>>(() => new Map());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: isExpenses ? "finance.client_expenses.v1" : PAYMENTS_TABLE_ID,
    defaultColumnOrder: DEFAULT_PAYMENT_COLUMN_ORDER,
    defaultPageSize: 10,
    allowedPageSizes: [10, 30, 50, 100],
    defaultHiddenColumnIds: [...DEFAULT_HIDDEN_PAYMENT_COLUMNS]
  });

  const allowedColIds = useMemo(() => new Set(PAYMENT_TABLE_COLUMNS.map((c) => c.id)), []);
  const visibleDataColumns = useMemo(
    () => tablePrefs.visibleColumnOrder.filter((id) => allowedColIds.has(id)),
    [tablePrefs.visibleColumnOrder, allowedColIds]
  );

  const queryString = useMemo(
    () => buildPaymentsQuery(applied, page, tablePrefs.pageSize, variant),
    [applied, page, tablePrefs.pageSize, variant]
  );

  const listQ = useQuery({
    queryKey: ["payments", tenantSlug, variant, queryString],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<PaymentListApiResponse>(`/api/${tenantSlug}/payments?${queryString}`);
      return data;
    }
  });

  const pageRows = listQ.data?.data ?? [];

  useEffect(() => {
    setReceiptPrefs(loadPaymentReceiptPrintPrefs());
  }, []);

  useEffect(() => {
    setFilterVis(loadPaymentFilterVisibility());
  }, []);

  useEffect(() => {
    const rows = listQ.data?.data;
    if (!rows?.length) return;
    setSelectedById((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const r of rows) {
        if (next.has(r.id) && next.get(r.id) !== r) {
          next.set(r.id, r);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [listQ.data]);

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedById.has(r.id));
  const somePageSelected = pageRows.some((r) => selectedById.has(r.id));

  useLayoutEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = somePageSelected && !allPageSelected;
  }, [somePageSelected, allPageSelected]);

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "payments-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const clientsFilterQ = useQuery({
    queryKey: ["clients", tenantSlug, "client-expenses-filters"],
    enabled: Boolean(tenantSlug) && hydrated && isExpenses,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data;
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "payments-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "payments-page"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CashDeskRow[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data.filter((d) => d.is_active);
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "payments"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: { trade_directions: string[]; territories: string[]; territory_tokens: string[] };
      }>(`/api/${tenantSlug}/agents/filter-options`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "payments-methods"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{ references?: { payment_types?: string[] } }>(
        `/api/${tenantSlug}/settings/profile`
      );
      return data.references?.payment_types ?? [];
    }
  });

  const territoryOptions1 = filterOptQ.data?.territories ?? [];
  const territoryOptions2 = useMemo(() => {
    const a = filterOptQ.data?.territories ?? [];
    const b = filterOptQ.data?.territory_tokens ?? [];
    return Array.from(new Set([...a, ...b])).sort((x, y) => x.localeCompare(y, "ru"));
  }, [filterOptQ.data]);

  const sliderCeiling = useMemo(() => {
    const rows = listQ.data?.data ?? [];
    let m = 0;
    for (const r of rows) {
      const v = Number.parseFloat(r.amount) || 0;
      if (v > m) m = v;
    }
    const fromMax = Math.ceil(m * 1.15);
    const rounded = Math.max(fromMax, 1_000_000);
    return Math.min(Math.ceil(rounded / 100_000) * 100_000, 999_999_999);
  }, [listQ.data?.data]);

  const amountMaxNumeric = Math.min(parseAmount(draft.amount_max) || sliderCeiling, sliderCeiling);

  const cashDeskItems = useMemo(() => {
    const rows = (cashDesksQ.data ?? []).map((d) => ({ id: d.id, title: d.name }));
    const q = cashDeskSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [cashDesksQ.data, cashDeskSearch]);

  const applyFilters = useCallback(() => {
    setApplied({ ...draft });
    setPage(1);
  }, [draft]);

  const resetDraftToApplied = useCallback(() => {
    setDraft({ ...applied });
  }, [applied]);

  const toggleSelectRow = useCallback((r: PaymentListApiRow) => {
    setSelectedById((prev) => {
      const next = new Map(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, r);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedById((prev) => {
      const rows = listQ.data?.data ?? [];
      if (rows.length === 0) return prev;
      const next = new Map(prev);
      const allSelected = rows.every((r) => next.has(r.id));
      for (const r of rows) {
        if (allSelected) next.delete(r.id);
        else next.set(r.id, r);
      }
      return next;
    });
  }, [listQ.data]);

  const closePrintView = useCallback(() => setPrintRows(null), []);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/payments/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      setDeleteFeedback(
        isExpenses
          ? "Запись удалена, баланс клиента восстановлен."
          : "Платёж удалён, баланс клиента скорректирован."
      );
      setTimeout(() => setDeleteFeedback(null), 4000);
    },
    onError: () => {
      setDeleteFeedback(isExpenses ? "Не удалось удалить запись." : "Не удалось удалить платёж.");
      setTimeout(() => setDeleteFeedback(null), 4000);
    }
  });

  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listQ.data.limit)) : 1;

  const showCopyTip = useCallback((ok: boolean) => {
    setCopyToast(ok ? "Скопировано" : "Не удалось скопировать");
    setTimeout(() => setCopyToast(null), 2000);
  }, []);

  const cellCtx = useMemo<CellCtx>(
    () => ({
      formatDt,
      parseAmount,
      onCopy: showCopyTip
    }),
    [showCopyTip]
  );

  const columnLabelById = useMemo(
    () => Object.fromEntries(PAYMENT_TABLE_COLUMNS.map((c) => [c.id, c.label])),
    []
  );

  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  return (
    <PageShell>
      <PageHeader
        title={isExpenses ? "Расходы клиента" : "Оплаты клиентов"}
        description={
          isExpenses
            ? "Расходы уменьшают баланс клиента (долг). Фильтры и список."
            : "Платежи клиентов на баланс: фильтры, экспорт и распределение по заказам."
        }
        actions={
          tenantSlug ? (
            <button
              type="button"
              className={cn(buttonVariants({ size: "sm" }), "gap-1")}
              onClick={() => setAddPaymentOpen(true)}
            >
              {isExpenses ? "+ Добавить" : "+ Добавить оплату"}
            </button>
          ) : null
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="space-y-2.5 p-3 sm:p-4 sm:pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 w-fit gap-1.5 font-normal"
                  )}
                  title="Показать / скрыть поля фильтров"
                  onClick={() => setFilterVisDialogOpen(true)}
                >
                  <ChevronDown className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">Видимость фильтров</span>
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:justify-end">
                  {!isExpenses && filterVis.deal_type ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-medium text-foreground sm:text-sm">Тип сделки</span>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs sm:text-sm">
                        <input
                          type="radio"
                          name="deal_type"
                          className="size-3.5 accent-primary sm:size-4"
                          checked={draft.deal_type === "regular"}
                          onChange={() => setDraft((d) => ({ ...d, deal_type: "regular" }))}
                        />
                        Обычная
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs sm:text-sm">
                        <input
                          type="radio"
                          name="deal_type"
                          className="size-3.5 accent-primary sm:size-4"
                          checked={draft.deal_type === "consignment"}
                          onChange={() => setDraft((d) => ({ ...d, deal_type: "consignment" }))}
                        />
                        Для консигнации
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs sm:text-sm">
                        <input
                          type="radio"
                          name="deal_type"
                          className="size-3.5 accent-primary sm:size-4"
                          checked={draft.deal_type === "both"}
                          onChange={() => setDraft((d) => ({ ...d, deal_type: "both" }))}
                        />
                        Обе
                      </label>
                    </div>
                  ) : null}
                  {filterVis.date_range ? (
                    <button
                      ref={dateRangeAnchorRef}
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 max-w-full gap-2 font-normal",
                        dateRangeOpen && "border-primary/60 bg-primary/5"
                      )}
                      title="Календарь и быстрый выбор периода"
                      aria-expanded={dateRangeOpen}
                      aria-haspopup="dialog"
                      onClick={() => setDateRangeOpen((o) => !o)}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span className="truncate text-left text-xs sm:text-sm">
                        {formatDateRangeButton(draft.date_from, draft.date_to)}
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>

              {filterVis.status ||
              filterVis.cash_desk ||
              filterVis.agent ||
              filterVis.expeditor ||
              filterVis.payment_type ||
              filterVis.trade_direction ||
              filterVis.territory1 ||
              filterVis.territory2 ||
              filterVis.territory3 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
                  {isExpenses ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Клиент</Label>
                        <FilterSelect
                          emptyLabel="Все"
                          className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                          value={draft.client_id}
                          onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}
                        >
                          {(clientsFilterQ.data ?? []).map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name}
                            </option>
                          ))}
                        </FilterSelect>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Тип</Label>
                        <FilterSelect
                          emptyLabel="Дата"
                          className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                          value={draft.date_field}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              date_field: e.target.value as DateFieldFilter
                            }))
                          }
                        >
                          <option value="created_at">Дата операции</option>
                          <option value="paid_at">Дата оплаты</option>
                          <option value="confirmed_at">Дата подтверждения платежа</option>
                        </FilterSelect>
                      </div>
                    </>
                  ) : null}
                  {filterVis.status ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Статус</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                        value={draft.payment_status}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            payment_status: e.target.value as PaymentStatusFilter
                          }))
                        }
                      >
                        <option value="pending_confirmation">Ожидание подтверждения</option>
                        <option value="confirmed">Подтверждена</option>
                        <option value="deleted">Удалено</option>
                      </FilterSelect>
                    </div>
                  ) : null}

                  {filterVis.cash_desk ? (
                    <div className="space-y-1 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                      <SearchableMultiSelectPanel
                        label="Касса"
                        className="w-full"
                        items={cashDeskItems}
                        selected={new Set(draft.cash_desk_ids)}
                        onSelectedChange={(fn) => {
                          setDraft((d) => {
                            const prev = new Set(d.cash_desk_ids);
                            const next = typeof fn === "function" ? fn(prev) : fn;
                            return { ...d, cash_desk_ids: Array.from(next).sort((a, b) => a - b) };
                          });
                        }}
                        search={cashDeskSearch}
                        onSearchChange={setCashDeskSearch}
                        triggerPlaceholder="Все кассы"
                        selectAllLabel="Выбрать все"
                        clearVisibleLabel="Снять выбор"
                        searchPlaceholder="Поиск кассы…"
                        minPopoverWidth={280}
                      />
                    </div>
                  ) : null}

                  {filterVis.agent ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Агент</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
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
                  ) : null}

                  {filterVis.expeditor ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Экспедитор</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
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
                  ) : null}

                  {filterVis.payment_type ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Способ оплаты</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                        value={draft.payment_type}
                        onChange={(e) => setDraft((d) => ({ ...d, payment_type: e.target.value }))}
                      >
                        {(profileQ.data ?? []).map((pt) => (
                          <option key={pt} value={pt}>
                            {pt}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  ) : null}

                  {filterVis.trade_direction ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">
                        Направление торговли
                      </Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
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
                  ) : null}

                  {filterVis.territory1 ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Территория 1</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                        value={draft.territory_region}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_region: e.target.value }))}
                      >
                        {territoryOptions1.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  ) : null}

                  {filterVis.territory2 ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Территория 2</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                        value={draft.territory_city}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_city: e.target.value }))}
                      >
                        {territoryOptions2.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  ) : null}

                  {filterVis.territory3 ? (
                    <div className="space-y-1">
                      <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Территория 3</Label>
                      <FilterSelect
                        emptyLabel="Все"
                        className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                        value={draft.territory_district}
                        onChange={(e) => setDraft((d) => ({ ...d, territory_district: e.target.value }))}
                      >
                        {territoryOptions2.map((t) => (
                          <option key={`d-${t}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className={cn(
                  "mt-0.5 flex flex-col gap-2.5 border-t border-border/30 pt-2 sm:flex-row sm:items-end sm:gap-3 sm:pt-2.5",
                  isExpenses ? "sm:justify-end" : "sm:justify-between"
                )}
              >
                {!isExpenses && filterVis.amount ? (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                      <span className="font-medium text-foreground">Сумма</span>
                      <span className="tabular-nums">
                        от{" "}
                        <span className="font-medium text-foreground">
                          {formatNumberGrouped(draft.amount_min || "0", { maxFractionDigits: 0 })}
                        </span>
                        {" — "}
                        <span className="font-medium text-foreground">
                          {formatNumberGrouped(String(amountMaxNumeric || 0), { maxFractionDigits: 0 })}
                        </span>
                      </span>
                      <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground/80 sm:text-[0.7rem]">
                        макс. {formatNumberGrouped(String(sliderCeiling), { maxFractionDigits: 0 })}
                      </span>
                    </div>
                    <input
                      type="range"
                      className="h-1.5 w-full max-w-xl cursor-pointer accent-primary sm:h-2"
                      min={0}
                      max={sliderCeiling}
                      value={amountMaxNumeric}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        setDraft((d) => ({
                          ...d,
                          amount_max: String(Number.isFinite(v) ? v : 0)
                        }));
                      }}
                    />
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">От</Label>
                        <Input
                          className="h-8 w-[7.25rem] bg-background text-xs sm:h-9 sm:w-36"
                          inputMode="decimal"
                          value={draft.amount_min}
                          onChange={(e) => setDraft((d) => ({ ...d, amount_min: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">До</Label>
                        <Input
                          className="h-8 w-[7.25rem] bg-background text-xs sm:h-9 sm:w-36"
                          inputMode="decimal"
                          value={draft.amount_max}
                          onChange={(e) => setDraft((d) => ({ ...d, amount_max: e.target.value }))}
                          placeholder={String(sliderCeiling)}
                        />
                      </div>
                    </div>
                  </div>
                ) : !isExpenses && !filterVis.amount ? (
                  <div className="min-w-0 flex-1 text-xs text-muted-foreground sm:text-sm">
                    Сумма скрыта — включите «Сумма (от — до)» в «Видимость фильтров».
                  </div>
                ) : null}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pb-0.5">
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                    onClick={resetDraftToApplied}
                    title="Сбросить черновик к последнему «Применить»"
                    aria-label="Сбросить черновик фильтров"
                  >
                    <Filter className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">Сброс</span>
                  </button>
                  <button
                    type="button"
                    className={cn(buttonVariants({ size: "default" }), "min-w-[7.5rem] sm:min-w-[8rem]")}
                    onClick={applyFilters}
                  >
                    Применить
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-3.5">
              <div className="flex min-w-0 w-full items-center gap-2 overflow-x-auto sm:w-auto sm:flex-1 sm:flex-nowrap sm:pb-0">
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 shrink-0 gap-1.5 px-2.5"
                  )}
                  title="Столбцы таблицы"
                  onClick={() => setColumnDialogOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Столбцы</span>
                </button>
                <span
                  className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-muted/30 px-2 text-muted-foreground"
                  title="Таблица"
                >
                  <Table2 className="h-4 w-4" />
                </span>
                {!isExpenses ? (
                  <select
                    className={cn(filterSelectClassName, "h-9 min-w-[5.5rem] max-w-[8rem] shrink-0 bg-background")}
                    value={String(tablePrefs.pageSize)}
                    onChange={(e) => {
                      const lim = Number.parseInt(e.target.value, 10) || 10;
                      tablePrefs.setPageSize(lim);
                      setPage(1);
                    }}
                  >
                    <option value="10">10</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                ) : null}
                <div className="relative min-w-[10rem] max-w-xs flex-1 sm:min-w-[12rem]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 w-full min-w-0 bg-background pl-9"
                    placeholder="Поиск"
                    value={draft.search}
                    onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters();
                    }}
                  />
                </div>
                {!isExpenses ? (
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-9 shrink-0 gap-1.5 border-emerald-600/30 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    )}
                    disabled={!listQ.data?.data.length}
                    onClick={() => downloadPaymentsExcel(listQ.data?.data ?? [])}
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Excel
                  </button>
                ) : null}
                <span
                  className="hidden shrink-0 text-xs text-muted-foreground sm:inline"
                  title="Отмеченные на всех страницах (снимок строки сохраняется)"
                >
                  Выбрано: {selectedById.size}
                </span>
                {!isExpenses ? (
                  <>
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 shrink-0 gap-1.5")}
                      title="Как группировать чеки и какие поля печатать (в этом браузере)"
                      onClick={() => setReceiptSettingsOpen(true)}
                    >
                      <Receipt className="h-4 w-4" />
                      <span className="hidden sm:inline">Чеки</span>
                    </button>
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-9 shrink-0 gap-1.5")}
                      title="Печать всех отмеченных одним заданием"
                      disabled={selectedById.size === 0}
                      onClick={() => setPrintRows(Array.from(selectedById.values()))}
                    >
                      <Printer className="h-4 w-4" />
                      <span className="hidden sm:inline">Печать</span>
                      {selectedById.size > 0 ? <span className="tabular-nums">({selectedById.size})</span> : null}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-9 shrink-0 px-0")}
                  onClick={() => void listQ.refetch()}
                  title="Обновить"
                >
                  <RefreshCw className={cn("h-4 w-4", listQ.isFetching && "animate-spin")} />
                </button>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground sm:max-w-[min(100%,20rem)] sm:text-right">
                {isExpenses
                  ? "Расходы клиента (уменьшают баланс)"
                  : "Список платежей, разрешённых для изменения"}
                {listQ.data != null ? ` · всего: ${listQ.data.total}` : ""}
              </p>
            </CardContent>
          </Card>

          {copyToast ? (
            <p className="text-xs text-muted-foreground" role="status">
              {copyToast}
            </p>
          ) : null}

          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : listQ.isError ? (
            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Не удалось загрузить список.</p>
              {listErrorDetail ? <p className="text-muted-foreground">{listErrorDetail}</p> : null}
              <p className="text-xs text-muted-foreground">
                Если недавно обновляли сервер, выполните миграции БД и перезапустите API.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
                <table
                  className={cn(
                    "w-full border-collapse text-sm",
                    visibleDataColumns.length >= 14 ? "min-w-[1640px]" : "min-w-[1000px]"
                  )}
                >
                  <thead className="app-table-thead text-left text-xs">
                    <tr>
                      <th className="w-10 min-w-10 px-1 py-2.5 align-middle text-center">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={allPageSelected}
                          onChange={toggleSelectAllOnPage}
                          title="Выбрать все на этой странице"
                          aria-label={
                            isExpenses
                              ? "Выбрать все расходы на странице"
                              : "Выбрать все платежи на странице"
                          }
                        />
                      </th>
                      {visibleDataColumns.map((colId) => (
                        <th
                          key={colId}
                          className={cn(
                            "px-2 py-2.5 align-middle",
                            PAYMENT_COL_TH[colId],
                            PAYMENT_TD_NOWRAP.has(colId) && "whitespace-nowrap"
                          )}
                        >
                          {columnLabelById[colId] ?? colId}
                        </th>
                      ))}
                      <th className="w-32 px-2 py-2.5 align-middle whitespace-nowrap">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(listQ.data?.data ?? []).map((r, idx) => (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-border/60 transition-colors hover:bg-muted/40",
                          idx % 2 === 1 && "bg-muted/20"
                        )}
                      >
                        <td className="px-1 py-2 align-middle text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={selectedById.has(r.id)}
                            onChange={() => toggleSelectRow(r)}
                            aria-label={
                            isExpenses ? `Выбрать расход ${r.id}` : `Выбрать платёж ${r.id}`
                          }
                          />
                        </td>
                        {visibleDataColumns.map((colId) => (
                          <td
                            key={colId}
                            className={cn(
                              "px-2 py-2 align-middle",
                              PAYMENT_COL_TD[colId],
                              PAYMENT_TD_NOWRAP.has(colId) && "whitespace-nowrap"
                            )}
                          >
                            {paymentDataCell(colId, r, cellCtx)}
                          </td>
                        ))}
                        <td className="px-2 py-2 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-0.5">
                            <Link
                              href={`/payments/${r.id}`}
                              className="rounded p-1.5 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                              title="История / просмотр"
                            >
                              <History className="h-4 w-4" />
                            </Link>
                            <Link
                              href={`/payments/${r.id}`}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                              title="Удалить"
                              disabled={deleteMut.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    isExpenses
                                      ? `Удалить расход #${r.id} (${formatNumberGrouped(r.amount, { maxFractionDigits: 2 })} UZS)? Баланс клиента будет восстановлен.`
                                      : `Удалить платёж #${r.id} (${formatNumberGrouped(r.amount, { maxFractionDigits: 2 })} UZS)? Баланс будет скорректирован.`
                                  )
                                ) {
                                  deleteMut.mutate(r.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {!isExpenses ? (
                              <button
                                type="button"
                                data-testid="payment-open-allocate"
                                className="ml-0.5 text-xs font-medium text-primary underline underline-offset-2"
                                onClick={() => setAllocateRow(r)}
                              >
                                Распр.
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(listQ.data?.data.length ?? 0) === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {isExpenses ? "Пусто" : "Нет записей по фильтру."}
                  </p>
                ) : null}
              </div>

              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p className="text-muted-foreground">
                    Стр. {page} из {totalPages}
                  </p>
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
              ) : null}
            </>
          )}

          {deleteFeedback ? <p className="text-sm text-muted-foreground">{deleteFeedback}</p> : null}
        </div>
      )}

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Управление столбцами"
        description="Видимые столбцы и порядок сохраняются для вашей учётной записи."
        columns={PAYMENT_TABLE_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      {tenantSlug ? (
        isExpenses ? (
          <AddClientExpenseDialog
            open={addPaymentOpen}
            onOpenChange={setAddPaymentOpen}
            tenantSlug={tenantSlug}
            onCreated={() => {
              void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
              void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
            }}
          />
        ) : (
          <AddPaymentDialog
            open={addPaymentOpen}
            onOpenChange={setAddPaymentOpen}
            tenantSlug={tenantSlug}
            onCreated={() => {
              void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
              void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
            }}
          />
        )
      ) : null}

      {!isExpenses ? (
        <>
          <PaymentReceiptPrintSettingsDialog
            open={receiptSettingsOpen}
            onOpenChange={setReceiptSettingsOpen}
            prefs={receiptPrefs}
            onSave={setReceiptPrefs}
          />

          {printRows != null && printRows.length > 0 ? (
            <PaymentReceiptsPrintView rows={printRows} prefs={receiptPrefs} onClose={closePrintView} />
          ) : null}

          <PaymentAllocateDialog
            open={allocateRow != null}
            onOpenChange={(o) => {
              if (!o) setAllocateRow(null);
            }}
            tenantSlug={tenantSlug ?? ""}
            payment={
              allocateRow
                ? {
                    id: allocateRow.id,
                    client_id: allocateRow.client_id,
                    client_name: allocateRow.client_name,
                    amount: allocateRow.amount
                  }
                : null
            }
          />
        </>
      ) : null}

      <PaymentFiltersVisibilityDialog
        open={filterVisDialogOpen}
        onOpenChange={setFilterVisDialogOpen}
        value={filterVis}
        onChange={setFilterVis}
      />

      <DateRangePopover
        open={dateRangeOpen}
        onOpenChange={setDateRangeOpen}
        anchorRef={dateRangeAnchorRef}
        dateFrom={draft.date_from}
        dateTo={draft.date_to}
        onApply={({ dateFrom, dateTo }) =>
          setDraft((d) => ({
            ...d,
            date_from: dateFrom,
            date_to: dateTo
          }))
        }
      />
    </PageShell>
  );
}
