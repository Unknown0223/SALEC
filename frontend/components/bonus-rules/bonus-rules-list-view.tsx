"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleOrderScopeDialog } from "@/components/bonus-rules/bonus-rule-order-scope-dialog";
import { ruleSummary } from "@/components/bonus-rules/rule-summary";
import { BonusRuleLinkedBonusesCell } from "@/components/bonus-rules/bonus-rule-linked-bonuses-cell";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { writeBonusRuleCloneDraft } from "@/lib/bonus-rule-clone-draft";
import { STALE } from "@/lib/query-stale";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  LayoutGrid,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ListResponse = {
  data: BonusRuleRow[];
  total: number;
  page: number;
  limit: number;
};

export { ruleSummary } from "@/components/bonus-rules/rule-summary";

function bonusTypeLabel(type: string): string {
  switch (type) {
    case "qty":
      return "Бонус за количество";
    case "sum":
      return "Бонус по сумме";
    case "discount":
      return "Скидка (%)";
    default:
      return type;
  }
}

/** Скидки: `sum` и `discount`. */
function skidkaTypeLabel(type: string): string {
  switch (type) {
    case "sum":
      return "Мин. сумма · подарок";
    case "discount":
      return "Процентная скидка (%)";
    default:
      return type;
  }
}

function formatRuleDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
}

/** Trigger mahsulot / kategoriya cheklangan bo‘lsa — «faqat assortiment bo‘yicha». */
function onlyByAssortment(r: BonusRuleRow): boolean {
  return r.product_ids.length > 0 || r.product_category_ids.length > 0;
}

type TermKind = "expired" | "upcoming" | "current";

function termKind(r: BonusRuleRow): TermKind {
  const now = Date.now();
  const from = r.valid_from ? new Date(r.valid_from).getTime() : null;
  const to = r.valid_to ? new Date(r.valid_to).getTime() : null;
  if (to != null && !Number.isNaN(to) && to < now) return "expired";
  if (from != null && !Number.isNaN(from) && from > now) return "upcoming";
  return "current";
}

function termBadge(kind: TermKind) {
  switch (kind) {
    case "expired":
      return <Badge variant="destructive">Истёк</Badge>;
    case "upcoming":
      return <Badge variant="info">Ожидается</Badge>;
    default:
      return <Badge variant="success">Действует</Badge>;
  }
}

export type BonusRulesListVariant = "bonuses" | "discounts";

type Props = {
  activeOnly: boolean;
  /** `discounts` — faqat foizli chegirma qoidalari (alohida «Скидки» bo‘limi) */
  variant?: BonusRulesListVariant;
};

/** Бонусы: только qty. */
const BONUS_LIST_COLUMNS = [
  { id: "name", label: "Название" },
  { id: "type", label: "Тип бонуса" },
  { id: "linked", label: "Связанные бонусы" },
  { id: "only_assortment", label: "Только по ассортименту" },
  { id: "once_per_client", label: "Один раз на клиента" },
  { id: "valid_from", label: "Действует с" },
  { id: "valid_to", label: "Действует до" },
  { id: "method", label: "Метод" },
  { id: "term", label: "Срок" },
  { id: "priority", label: "Приоритет" },
  { id: "summary", label: "Условие (кол-во или сумма)" },
  { id: "active", label: "Активен" }
] as const;

/** Скидки: sum и discount. */
const DISCOUNT_LIST_COLUMNS = [
  { id: "name", label: "Название" },
  { id: "type", label: "Тип скидки" },
  { id: "linked", label: "Связанные правила" },
  { id: "only_assortment", label: "Только по ассортименту" },
  { id: "once_per_client", label: "Один раз на клиента" },
  { id: "valid_from", label: "Действует с" },
  { id: "valid_to", label: "Действует до" },
  { id: "method", label: "Метод" },
  { id: "term", label: "Срок" },
  { id: "priority", label: "Приоритет" },
  { id: "summary", label: "% скидки / краткое условие" },
  { id: "active", label: "Активен" }
] as const;

function listColumnsForVariant(v: BonusRulesListVariant) {
  return v === "discounts" ? DISCOUNT_LIST_COLUMNS : BONUS_LIST_COLUMNS;
}

const DEFAULT_HIDDEN = ["priority", "summary", "active"] as const;

export function BonusRulesListView({ activeOnly, variant = "bonuses" }: Props) {
  const isDiscounts = variant === "discounts";
  const listBase = isDiscounts ? "/settings/discount-rules" : "/settings/bonus-rules";
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "auto" | "manual">("all");
  const [termFilter, setTermFilter] = useState<"all" | "expired" | "current" | "upcoming">("all");
  const [ruleIdFilter, setRuleIdFilter] = useState<"all" | string>("all");
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);
  const [scopeRule, setScopeRule] = useState<BonusRuleRow | null>(null);

  const listColumns = useMemo(() => listColumnsForVariant(variant), [variant]);

  const bonusTableId = isDiscounts
    ? activeOnly
      ? "discount_rules.list.active.v3"
      : "discount_rules.list.inactive.v3"
    : activeOnly
      ? "bonus_rules.list.active.v4"
      : "bonus_rules.list.inactive.v4";
  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: bonusTableId,
    defaultColumnOrder: listColumns.map((c) => c.id),
    defaultPageSize: 10,
    allowedPageSizes: [10, 25, 50, 100],
    defaultHiddenColumnIds: [...DEFAULT_HIDDEN]
  });

  const allowedColumnIds = useMemo(
    () => new Set<string>(listColumns.map((c) => c.id)),
    [listColumns]
  );
  const visibleDataColumns = useMemo(
    () => tablePrefs.visibleColumnOrder.filter((id) => allowedColumnIds.has(id)),
    [tablePrefs.visibleColumnOrder, allowedColumnIds]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, methodFilter, termFilter, ruleIdFilter, activeOnly, tablePrefs.pageSize, variant]);

  useEffect(() => {
    setRuleIdFilter("all");
  }, [variant]);

  const filterKey = activeOnly ? "active" : "inactive";

  const listParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(tablePrefs.pageSize),
      is_active: activeOnly ? "true" : "false"
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (methodFilter === "auto") params.set("manual", "false");
    if (methodFilter === "manual") params.set("manual", "true");
    if (isDiscounts) {
      params.set("types", "sum,discount");
    } else {
      params.set("types", "qty");
    }
    if (termFilter === "expired") params.set("term", "expired");
    if (termFilter === "current") params.set("term", "current");
    if (termFilter === "upcoming") params.set("term", "upcoming");
    if (ruleIdFilter !== "all") params.set("rule_id", ruleIdFilter);
    return params.toString();
  }, [
    page,
    tablePrefs.pageSize,
    activeOnly,
    debouncedSearch,
    methodFilter,
    termFilter,
    ruleIdFilter,
    isDiscounts
  ]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["bonus-rules", tenantSlug, variant, filterKey, listParams],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data: body } = await api.get<ListResponse>(`/api/${tenantSlug}/bonus-rules?${listParams}`);
      return body;
    }
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await api.patch(`/api/${tenantSlug}/bonus-rules/${id}/active`, { is_active });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
    }
  });

  const shartOptionsParams = useMemo(() => {
    const p = new URLSearchParams({
      page: "1",
      limit: "500",
      is_active: activeOnly ? "true" : "false"
    });
    if (isDiscounts) p.set("types", "sum,discount");
    else p.set("types", "qty");
    return p.toString();
  }, [activeOnly, isDiscounts]);

  const { data: shartOptionsRows } = useQuery({
    queryKey: ["bonus-rules", tenantSlug, variant, filterKey, "shart-options", shartOptionsParams],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data: body } = await api.get<ListResponse>(`/api/${tenantSlug}/bonus-rules?${shartOptionsParams}`);
      return body.data;
    }
  });

  const shartOptionsSorted = useMemo(() => {
    const list = shartOptionsRows ?? [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [shartOptionsRows]);

  const rows = data?.data ?? [];

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleSelectAllOnPage = useCallback(() => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.add(r.id);
        return next;
      });
    }
  }, [allOnPageSelected, rows]);

  const resetListFilters = useCallback(() => {
    setMethodFilter("all");
    setTermFilter("all");
    setRuleIdFilter("all");
    setSearchInput("");
  }, []);

  const exportCsv = useCallback(() => {
    if (!rows.length) return;
    const sep = ";";
    const headers = isDiscounts
      ? [
          "Название",
          "Тип скидки",
          "Значение (% или мин. сумма)",
          "Только ассортимент",
          "Один раз на клиента",
          "Действует с",
          "Действует до",
          "Метод",
          "Срок"
        ]
      : [
          "Название",
          "Тип бонуса",
          "Только ассортимент",
          "Один раз на клиента",
          "Действует с",
          "Действует до",
          "Метод",
          "Срок"
        ];
    const lines = rows.map((r) => {
      const tk = termKind(r);
      const termLabel = tk === "expired" ? "Истёк" : tk === "upcoming" ? "Ожидается" : "Действует";
      const skidkaValue =
        r.type === "discount"
          ? String(r.discount_pct ?? "—")
          : r.type === "sum"
            ? String(r.min_sum ?? "—")
            : "—";
      const base = [
        `"${r.name.replace(/"/g, '""')}"`,
        ...(isDiscounts
          ? [skidkaTypeLabel(r.type), skidkaValue]
          : [bonusTypeLabel(r.type)]),
        onlyByAssortment(r) ? "Да" : "Нет",
        r.once_per_client ? "Да" : "Нет",
        formatRuleDateTime(r.valid_from),
        formatRuleDateTime(r.valid_to),
        r.is_manual ? "Вручную" : "Авто",
        termLabel
      ];
      return base.join(sep);
    });
    const blob = new Blob(["\uFEFF" + [headers.join(sep), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${isDiscounts ? "skidki" : "bonusy"}-${filterKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, filterKey, isDiscounts]);

  const title = isDiscounts
    ? activeOnly
      ? "Скидки (активные)"
      : "Скидки (неактивные)"
    : activeOnly
      ? "Бонусы (активные)"
      : "Бонусы (неактивные)";

  return (
    <PageShell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {tenantSlug
              ? isDiscounts
                ? `Тенант: ${tenantSlug} · процентные скидки и мин. сумма (подарок); бонусы по штукам — отдельно`
                : `Тенант: ${tenantSlug} · только бонусы по количеству; сумма/скидка — в другом разделе`
              : isDiscounts
                ? "Правила: процент и минимальная сумма"
                : "Только бонусы по количеству"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isDiscounts ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled title="Скоро">
                Категория бонуса
              </Button>
              <Button type="button" variant="outline" size="sm" disabled title="Скоро">
                Продлить бонусы
              </Button>
            </>
          ) : null}
          <Link className={cn(buttonVariants({ size: "sm" }))} href={`${listBase}/new`}>
            {isDiscounts ? "Создать скидку" : "Создать бонус"}
          </Link>
        </div>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Настройка столбцов"
        description={
          isDiscounts
            ? "Таблица скидок: видимые столбцы и порядок (отдельно от таблицы бонусов)."
            : "Таблица бонусов: видимые столбцы и порядок (отдельно от таблицы скидок)."
        }
        columns={[...listColumns]}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      {tenantSlug ? (
        <div className="orders-hub-section orders-hub-section--filters orders-hub-section--stack-tight mb-3">
          <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                  {isDiscounts ? "Фильтр (скидки)" : "Фильтр (бонусы)"}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-teal-600/40 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    title={filtersVisible ? "Скрыть фильтры" : "Показать фильтры"}
                    aria-expanded={filtersVisible}
                    onClick={() => setFiltersVisible((v) => !v)}
                  >
                    {filtersVisible ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-teal-600/40 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    title="Сбросить фильтры"
                    onClick={resetListFilters}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              </div>
              {filtersVisible ? (
                <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                  <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Способ применения</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Способ применения"
                      value={methodFilter}
                      onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
                    >
                      <option value="all">Все</option>
                      <option value="auto">Авто</option>
                      <option value="manual">Вручную</option>
                    </select>
                  </div>
                  <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Состояние срока</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Состояние срока"
                      value={termFilter}
                      onChange={(e) => setTermFilter(e.target.value as typeof termFilter)}
                    >
                      <option value="all">Все</option>
                      <option value="expired">Истёк срок</option>
                      <option value="current">Действует сейчас</option>
                      <option value="upcoming">Ещё не начался</option>
                    </select>
                  </div>
                  <div className="grid min-w-[12rem] max-w-[280px] flex-[1_1_12rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">
                      {isDiscounts ? "Правило скидки" : "Правило бонуса"}
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label={isDiscounts ? "Фильтр по правилу скидки" : "Фильтр по правилу бонуса"}
                      value={ruleIdFilter}
                      onChange={(e) => setRuleIdFilter(e.target.value === "all" ? "all" : e.target.value)}
                    >
                      <option value="all">{isDiscounts ? "Все скидки" : "Все бонусы"}</option>
                      {shartOptionsSorted.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          Тенант не найден.{" "}
          <Link className="underline underline-offset-4" href="/login">
            Войти снова
          </Link>
        </p>
      ) : (
        <div className="orders-hub-section orders-hub-section--table mt-1">
          <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
            <CardContent className="p-0">
              <div
                className="table-toolbar flex flex-wrap items-end justify-between gap-3 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4"
                role="toolbar"
                aria-label={
                  isDiscounts ? "Таблица скидок: строки и поиск" : "Таблица бонусов: строки и поиск"
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-0.5">
                    <Label className="sr-only">Число строк на странице</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Строк на странице"
                      value={String(tablePrefs.pageSize)}
                      onChange={(e) => tablePrefs.setPageSize(Number(e.target.value))}
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Настройка столбцов"
                    onClick={() => setColumnDialogOpen(true)}
                  >
                    <LayoutGrid className="size-4" />
                  </Button>
                  <div className="relative min-w-[180px] max-w-xs flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 bg-background pl-8 text-sm"
                      placeholder={isDiscounts ? "Название скидки…" : "Название бонуса…"}
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      aria-label={isDiscounts ? "Поиск по названию скидки" : "Поиск по названию бонуса"}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1"
                    onClick={() => exportCsv()}
                    disabled={!rows.length}
                  >
                    <Download className="size-3.5" />
                    Excel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Обновить"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pb-0.5 text-xs text-muted-foreground sm:pb-0">
                  {data != null ? (
                    <>
                      Всего:{" "}
                      <span className="font-medium text-foreground">{data.total}</span>
                    </>
                  ) : null}
                </div>
              </div>

              {isLoading ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Загрузка…</p>
              ) : isError ? (
                <p className="px-4 py-6 text-sm text-destructive">
                  Ошибка: {error instanceof Error ? error.message : "Не удалось связаться с API"}
                </p>
              ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-sm">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="app-table-thead">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Выбрать все на странице"
                      />
                    </th>
                    {visibleDataColumns.map((colId) => {
                      const meta = listColumns.find((c) => c.id === colId);
                      return (
                        <th key={colId} className="px-3 py-2 font-medium">
                          {meta?.label ?? colId}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleDataColumns.length + 2}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        {activeOnly
                          ? isDiscounts
                            ? "Нет правил скидок"
                            : "Нет правил бонусов"
                          : isDiscounts
                            ? "Нет неактивных скидок"
                            : "Нет неактивных бонусов"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const tk = termKind(row);
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-b last:border-0",
                            focusedRowId === row.id && "bg-primary/5"
                          )}
                          onClick={() => setFocusedRowId(row.id)}
                        >
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-input"
                              checked={selectedIds.has(row.id)}
                              onChange={() => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                });
                              }}
                              aria-label={`Выбрать: ${row.name}`}
                            />
                          </td>
                          {visibleDataColumns.map((colId) => (
                            <td key={colId} className="px-3 py-2 align-middle">
                              {colId === "name" ? (
                                <span className="font-medium">{row.name}</span>
                              ) : colId === "type" ? (
                                <span className="text-muted-foreground">
                                  {isDiscounts ? skidkaTypeLabel(row.type) : bonusTypeLabel(row.type)}
                                </span>
                              ) : colId === "linked" ? (
                                tenantSlug ? (
                                  <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                                    <BonusRuleLinkedBonusesCell tenantSlug={tenantSlug} row={row} />
                                  </div>
                                ) : null
                              ) : colId === "only_assortment" ? (
                                <span>{onlyByAssortment(row) ? "Да" : "Нет"}</span>
                              ) : colId === "once_per_client" ? (
                                <span>{row.once_per_client ? "Да" : "Нет"}</span>
                              ) : colId === "valid_from" ? (
                                formatRuleDateTime(row.valid_from)
                              ) : colId === "valid_to" ? (
                                formatRuleDateTime(row.valid_to)
                              ) : colId === "method" ? (
                                row.is_manual ? (
                                  <Badge variant="warning">Вручную</Badge>
                                ) : (
                                  <Badge variant="success">Авто</Badge>
                                )
                              ) : colId === "term" ? (
                                termBadge(tk)
                              ) : colId === "priority" ? (
                                row.priority
                              ) : colId === "summary" ? (
                                <span className="font-mono text-xs">{ruleSummary(row)}</span>
                              ) : colId === "active" ? (
                                <input
                                  type="checkbox"
                                  checked={row.is_active}
                                  disabled={toggleMut.isPending}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleMut.mutate({ id: row.id, is_active: e.target.checked });
                                  }}
                                  aria-label={`Активность: ${row.name}`}
                                />
                              ) : null}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <TableRowActionGroup className="justify-end" ariaLabel="Правило">
                              {!activeOnly ? (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                  title="Активировать"
                                  aria-label="Активировать"
                                  disabled={toggleMut.isPending}
                                  onClick={() => toggleMut.mutate({ id: row.id, is_active: true })}
                                >
                                  <Power className="size-3.5" />
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground"
                                title="Копировать в форму «Новое правило»"
                                aria-label="Копировать в форму нового правила"
                                disabled={!tenantSlug}
                                onClick={() => {
                                  if (!tenantSlug) return;
                                  writeBonusRuleCloneDraft(isDiscounts ? "discount" : "bonus", row);
                                  router.push(`${listBase}/new`);
                                }}
                              >
                                <Copy className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground"
                                title="Филиал, агенты, клиенты, направление"
                                aria-label="Привязка к заказу"
                                onClick={() => setScopeRule(row)}
                              >
                                <UserRound className="size-3.5" />
                              </Button>
                              <Link
                                href={`${listBase}/${row.id}/edit`}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "icon-sm" }),
                                  "text-muted-foreground hover:text-foreground"
                                )}
                                title="Редактировать"
                                aria-label="Редактировать"
                              >
                                <Pencil className="size-3.5" />
                              </Link>
                            </TableRowActionGroup>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tenantSlug ? (
        <BonusRuleOrderScopeDialog
          open={scopeRule != null}
          onOpenChange={(o) => {
            if (!o) setScopeRule(null);
          }}
          tenantSlug={tenantSlug}
          rule={scopeRule}
        />
      ) : null}

      {data && data.total > data.limit ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
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
            Вперёд
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
