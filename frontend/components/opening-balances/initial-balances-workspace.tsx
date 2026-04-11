"use client";

import { AddOpeningBalanceDialog } from "@/components/opening-balances/add-opening-balance-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { FilterSelect, filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import type { ClientRow } from "@/lib/client-types";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import type { OpeningBalanceListResponse, OpeningBalanceListRow } from "@/lib/opening-balance-types";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

type StaffPick = { id: number; fio: string; code?: string | null };
type CashDeskRow = { id: number; name: string; is_active: boolean };

type DateFieldFilter = "created_at" | "paid_at";

type FilterForm = {
  date_from: string;
  date_to: string;
  date_field: DateFieldFilter;
  client_ids: number[];
  payment_type: string;
  trade_direction: string;
  agent_id: string;
  cash_desk_ids: number[];
  balance_type: "" | "debt" | "surplus";
  search: string;
};

const PAGE_SIZE = 10;

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
    date_from: from,
    date_to: to,
    date_field: "created_at",
    client_ids: [],
    payment_type: "",
    trade_direction: "",
    agent_id: "",
    cash_desk_ids: [],
    balance_type: "",
    search: ""
  };
};

function buildQuery(form: FilterForm, page: number): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(PAGE_SIZE));
  if (form.date_from.trim()) p.set("date_from", form.date_from.trim());
  if (form.date_to.trim()) p.set("date_to", form.date_to.trim());
  if (form.date_field !== "created_at") p.set("date_field", form.date_field);
  if (form.client_ids.length > 0) p.set("client_ids", form.client_ids.join(","));
  if (form.payment_type.trim()) p.set("payment_type", form.payment_type.trim());
  if (form.trade_direction.trim()) p.set("trade_direction", form.trade_direction.trim());
  if (form.agent_id.trim()) p.set("agent_id", form.agent_id.trim());
  if (form.cash_desk_ids.length > 0) p.set("cash_desk_ids", form.cash_desk_ids.join(","));
  if (form.balance_type) p.set("balance_type", form.balance_type);
  if (form.search.trim()) p.set("search", form.search.trim());
  return p.toString();
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function InitialBalancesWorkspace() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<FilterForm>(() => defaultForm());
  const [applied, setApplied] = useState<FilterForm>(() => defaultForm());
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const dateRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [cashDeskSearch, setCashDeskSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [importToast, setImportToast] = useState<string | null>(null);

  const queryString = useMemo(
    () => buildQuery(applied, page),
    [applied, page]
  );

  const listQ = useQuery({
    queryKey: ["opening-balances", tenantSlug, queryString],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<OpeningBalanceListResponse>(
        `/api/${tenantSlug}/opening-balances?${queryString}`
      );
      return data;
    }
  });

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "initial-balances-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "initial-balances-filters"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "initial-balances"],
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
    queryKey: ["agents-filter-options", tenantSlug, "initial-balances"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: { trade_directions: string[]; payment_types?: string[] };
      }>(`/api/${tenantSlug}/agents/filter-options`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "initial-balances-pay"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{ references?: { payment_types?: string[] } }>(
        `/api/${tenantSlug}/settings/profile`
      );
      return data.references?.payment_types ?? [];
    }
  });

  const clientItems = useMemo(() => {
    const rows = (clientsQ.data ?? []).map((c) => ({ id: c.id, title: c.name }));
    const q = clientSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [clientsQ.data, clientSearch]);

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

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/opening-balances/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opening-balances", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
    }
  });

  const listLimit = listQ.data?.limit ?? PAGE_SIZE;
  const totalPages = listQ.data ? Math.max(1, Math.ceil(listQ.data.total / listLimit)) : 1;

  const listErrorDetail = useMemo(() => {
    if (!listQ.isError || !listQ.error) return null;
    return getUserFacingError(listQ.error);
  }, [listQ.isError, listQ.error]);

  const paymentTypeOptions =
    (profileQ.data?.length ?? 0) > 0
      ? profileQ.data!
      : (["naqd", "plastik", "o‘tkazma", "boshqa"] as const);

  return (
    <PageShell>
      <PageHeader
        title="Начальные балансы клиентов"
        description="Стартовые остатки по клиентам (долг или излишек) с учётом кассы и направления."
        actions={
          tenantSlug ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                title="Скоро"
                onClick={() => {
                  setImportToast("Импорт из Excel будет доступен позже.");
                  setTimeout(() => setImportToast(null), 3000);
                }}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Импортировать с excel</span>
              </button>
              <button
                ref={dateRangeAnchorRef}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 max-w-[14rem] gap-2 font-normal sm:max-w-none",
                  dateRangeOpen && "border-primary/60 bg-primary/5"
                )}
                aria-expanded={dateRangeOpen}
                aria-haspopup="dialog"
                onClick={() => setDateRangeOpen((o) => !o)}
              >
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs sm:text-sm">
                  {formatDateRangeButton(draft.date_from, draft.date_to)}
                </span>
              </button>
              <button
                type="button"
                className={cn(buttonVariants({ size: "sm" }), "gap-1 bg-teal-600 text-white hover:bg-teal-700")}
                onClick={() => setAddOpen(true)}
              >
                + Добавить
              </button>
            </div>
          ) : null
        }
      />

      {importToast ? (
        <p className="text-xs text-muted-foreground" role="status">
          {importToast}
        </p>
      ) : null}

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
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="space-y-1 sm:col-span-2">
                  <SearchableMultiSelectPanel
                    label="Клиенты"
                    className="w-full"
                    items={clientItems}
                    selected={new Set(draft.client_ids)}
                    onSelectedChange={(fn) => {
                      setDraft((d) => {
                        const prev = new Set(d.client_ids);
                        const next = typeof fn === "function" ? fn(prev) : fn;
                        return { ...d, client_ids: Array.from(next).sort((a, b) => a - b) };
                      });
                    }}
                    search={clientSearch}
                    onSearchChange={setClientSearch}
                    triggerPlaceholder="Все клиенты"
                    selectAllLabel="Выбрать все"
                    clearVisibleLabel="Снять выбор"
                    searchPlaceholder="Поиск…"
                    minPopoverWidth={280}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Способ оплаты</Label>
                  <FilterSelect
                    emptyLabel="Все"
                    className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                    value={draft.payment_type}
                    onChange={(e) => setDraft((d) => ({ ...d, payment_type: e.target.value }))}
                  >
                    {paymentTypeOptions.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
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
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="space-y-1 sm:col-span-2">
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
                    minPopoverWidth={260}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Тип</Label>
                  <FilterSelect
                    emptyLabel="Все типы"
                    className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                    value={draft.balance_type}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        balance_type: e.target.value as FilterForm["balance_type"]
                      }))
                    }
                  >
                    <option value="debt">Долг</option>
                    <option value="surplus">Излишек</option>
                  </FilterSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground sm:text-xs">Период по</Label>
                  <FilterSelect
                    emptyLabel="—"
                    className={cn(filterPanelSelectClassName, "max-w-none bg-background")}
                    value={draft.date_field}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        date_field: e.target.value as DateFieldFilter
                      }))
                    }
                  >
                    <option value="created_at">Дата создания</option>
                    <option value="paid_at">Дата оплаты</option>
                  </FilterSelect>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    onClick={resetDraftToApplied}
                  >
                    Сброс
                  </button>
                  <button
                    type="button"
                    className={cn(buttonVariants({ size: "default" }), "min-w-[7.5rem] bg-teal-600 text-white hover:bg-teal-700")}
                    onClick={applyFilters}
                  >
                    Применить
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[10rem] max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 w-full bg-background pl-9"
                    placeholder="Поиск"
                    value={draft.search}
                    onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters();
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-9 px-0")}
                  onClick={() => void listQ.refetch()}
                  title="Обновить"
                >
                  <RefreshCw className={cn("h-4 w-4", listQ.isFetching && "animate-spin")} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Всего: {listQ.data?.total ?? "—"}
              </p>
            </CardContent>
          </Card>

          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : listQ.isError ? (
            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Не удалось загрузить список.</p>
              {listErrorDetail ? <p className="text-muted-foreground">{listErrorDetail}</p> : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead className="app-table-thead text-left text-xs">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-2.5">Дата создания</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Клиенты</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Агент</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Направление торговли</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Касса</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Тип остатка</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Способ оплаты</th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right">Сумма</th>
                      <th className="whitespace-nowrap px-2 py-2.5">Комментарий</th>
                      <th className="w-12 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(listQ.data?.data ?? []).map((r, idx) => (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-border/60 hover:bg-muted/40",
                          idx % 2 === 1 && "bg-muted/15"
                        )}
                      >
                        <td className="whitespace-nowrap px-2 py-2 text-xs">{formatDt(r.created_at)}</td>
                        <td className="max-w-[12rem] truncate px-2 py-2">{r.client_name}</td>
                        <td className="max-w-[8rem] truncate px-2 py-2 text-xs">{r.agent_name ?? "—"}</td>
                        <td className="max-w-[8rem] truncate px-2 py-2 text-xs">
                          {r.trade_direction ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs">{r.cash_desk_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs">{r.balance_type_label}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs">{r.payment_type}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums">
                          {formatNumberGrouped(r.amount, { maxFractionDigits: 2 })}
                        </td>
                        <td className="max-w-[14rem] truncate px-2 py-2 text-xs text-muted-foreground">
                          {r.note ?? "—"}
                        </td>
                        <td className="px-1 py-2">
                          <button
                            type="button"
                            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            title="Удалить"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Удалить начальный баланс #${r.id}? Текущий баланс клиента будет скорректирован.`
                                )
                              ) {
                                deleteMut.mutate(r.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(listQ.data?.data.length ?? 0) === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Пусто</p>
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

          {tenantSlug ? (
            <AddOpeningBalanceDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              tenantSlug={tenantSlug}
              onCreated={() => {
                void qc.invalidateQueries({ queryKey: ["opening-balances", tenantSlug] });
              }}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
