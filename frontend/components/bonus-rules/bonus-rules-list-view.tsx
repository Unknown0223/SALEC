"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
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
  Plus,
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

export function ruleSummary(r: BonusRuleRow): string {
  if (r.type === "qty" && r.conditions?.length) {
    return r.conditions
      .map((c) => {
        const range =
          c.min_qty != null || c.max_qty != null
            ? `${c.min_qty ?? "—"}…${c.max_qty ?? "—"}: `
            : "";
        return `${range}har ${c.step_qty}→+${c.bonus_qty}${c.max_bonus_qty != null ? ` (≤${c.max_bonus_qty})` : ""}`;
      })
      .join("; ");
  }
  if (r.type === "qty") {
    return `${r.buy_qty ?? "—"} + ${r.free_qty ?? "—"} bonus`;
  }
  if (r.type === "sum") {
    return `min ${r.min_sum ?? "—"}`;
  }
  if (r.type === "discount") {
    return `${r.discount_pct ?? "—"}%`;
  }
  return r.type;
}

function bonusTypeLabel(type: string): string {
  switch (type) {
    case "qty":
      return "Miqdor bo‘yicha bonus";
    case "sum":
      return "Summa bo‘yicha bonus";
    case "discount":
      return "Chegirma (%)";
    default:
      return type;
  }
}

function formatRuleDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
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
      return <Badge variant="destructive">Muddati tugagan</Badge>;
    case "upcoming":
      return <Badge variant="info">Kutilmoqda</Badge>;
    default:
      return <Badge variant="success">Amal qiladi</Badge>;
  }
}

type Props = {
  activeOnly: boolean;
};

const BONUS_RULE_DATA_COLUMNS = [
  { id: "name", label: "Nomi" },
  { id: "type", label: "Bonus turi" },
  { id: "linked", label: "Birlashtirish (stack)" },
  { id: "only_assortment", label: "Faqat assortiment" },
  { id: "once_per_client", label: "Har mijozga bir marta" },
  { id: "valid_from", label: "Boshlanishi" },
  { id: "valid_to", label: "Tugashi" },
  { id: "method", label: "Usul" },
  { id: "term", label: "Muddat" },
  { id: "priority", label: "Ustunlik" },
  { id: "summary", label: "Shart" },
  { id: "active", label: "Faol" }
] as const;

const DEFAULT_HIDDEN = ["priority", "summary", "active"] as const;

function buildDuplicatePayload(rule: BonusRuleRow) {
  return {
    name: `${rule.name} (nusxa)`,
    type: rule.type as "qty" | "sum" | "discount",
    buy_qty: rule.buy_qty,
    free_qty: rule.free_qty,
    min_sum: rule.min_sum,
    discount_pct: rule.discount_pct,
    priority: rule.priority,
    is_active: rule.is_active,
    valid_from: rule.valid_from,
    valid_to: rule.valid_to,
    client_category: rule.client_category,
    payment_type: rule.payment_type,
    client_type: rule.client_type,
    sales_channel: rule.sales_channel,
    price_type: rule.price_type,
    product_ids: rule.product_ids,
    bonus_product_ids: rule.bonus_product_ids,
    product_category_ids: rule.product_category_ids,
    target_all_clients: rule.target_all_clients,
    selected_client_ids: rule.selected_client_ids,
    is_manual: rule.is_manual,
    in_blocks: rule.in_blocks,
    once_per_client: rule.once_per_client,
    one_plus_one_gift: rule.one_plus_one_gift,
    conditions: rule.conditions.map((c) => ({
      min_qty: c.min_qty,
      max_qty: c.max_qty,
      step_qty: c.step_qty,
      bonus_qty: c.bonus_qty,
      max_bonus_qty: c.max_bonus_qty,
      sort_order: c.sort_order
    }))
  };
}

export function BonusRulesListView({ activeOnly }: Props) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "auto" | "manual">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "qty" | "sum" | "discount">("all");
  const [termFilter, setTermFilter] = useState<"all" | "expired" | "current" | "upcoming">("all");
  const [ruleIdFilter, setRuleIdFilter] = useState<"all" | string>("all");
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);

  const bonusTableId = activeOnly ? "bonus_rules.list.active.v2" : "bonus_rules.list.inactive.v2";
  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: bonusTableId,
    defaultColumnOrder: BONUS_RULE_DATA_COLUMNS.map((c) => c.id),
    defaultPageSize: 10,
    allowedPageSizes: [10, 25, 50, 100],
    defaultHiddenColumnIds: [...DEFAULT_HIDDEN]
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, methodFilter, typeFilter, termFilter, ruleIdFilter, activeOnly, tablePrefs.pageSize]);

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
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (termFilter === "expired") params.set("term", "expired");
    if (termFilter === "current") params.set("term", "current");
    if (termFilter === "upcoming") params.set("term", "upcoming");
    if (ruleIdFilter !== "all") params.set("rule_id", ruleIdFilter);
    return params.toString();
  }, [page, tablePrefs.pageSize, activeOnly, debouncedSearch, methodFilter, typeFilter, termFilter, ruleIdFilter]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["bonus-rules", tenantSlug, filterKey, listParams],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data: body } = await api.get<ListResponse>(`/api/${tenantSlug}/bonus-rules?${listParams}`);
      return body;
    }
  });

  const duplicateMut = useMutation({
    mutationFn: async (rule: BonusRuleRow) => {
      const payload = buildDuplicatePayload(rule);
      const { data: created } = await api.post<BonusRuleRow>(
        `/api/${tenantSlug}/bonus-rules`,
        payload
      );
      return created;
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
      router.push(`/settings/bonus-rules/${created.id}/edit`);
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
    return p.toString();
  }, [activeOnly]);

  const { data: shartOptionsRows } = useQuery({
    queryKey: ["bonus-rules", tenantSlug, filterKey, "shart-options", shartOptionsParams],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data: body } = await api.get<ListResponse>(`/api/${tenantSlug}/bonus-rules?${shartOptionsParams}`);
      return body.data;
    }
  });

  const shartOptionsSorted = useMemo(() => {
    const list = shartOptionsRows ?? [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "uz"));
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
    setTypeFilter("all");
    setRuleIdFilter("all");
    setSearchInput("");
  }, []);

  const exportCsv = useCallback(() => {
    if (!rows.length) return;
    const sep = ";";
    const headers = [
      "Nomi",
      "Turi",
      "Faqat assortiment",
      "Har mijozga bir marta",
      "Boshlanishi",
      "Tugashi",
      "Usul",
      "Muddat holati"
    ];
    const lines = rows.map((r) => {
      const tk = termKind(r);
      const termLabel = tk === "expired" ? "Tugagan" : tk === "upcoming" ? "Kutilmoqda" : "Amal qiladi";
      return [
        `"${r.name.replace(/"/g, '""')}"`,
        bonusTypeLabel(r.type),
        onlyByAssortment(r) ? "Ha" : "Yo‘q",
        r.once_per_client ? "Ha" : "Yo‘q",
        formatRuleDateTime(r.valid_from),
        formatRuleDateTime(r.valid_to),
        r.is_manual ? "Qo‘lda" : "Avto",
        termLabel
      ].join(sep);
    });
    const blob = new Blob(["\uFEFF" + [headers.join(sep), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bonus-qoidalari-${filterKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, filterKey]);

  const title = activeOnly ? "Bonuslar (faol)" : "Bonuslar (nofaol)";

  return (
    <PageShell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {tenantSlug ? `Tenant: ${tenantSlug}` : "Ro‘yxat va filtrlash"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled title="Tez orada">
            Bonus toifasi
          </Button>
          <Link className={cn(buttonVariants({ size: "sm" }))} href="/settings/bonus-rules/new">
            Bonus yaratish
          </Link>
          <Button type="button" variant="outline" size="sm" disabled title="Tez orada">
            Bonuslarni uzaytirish
          </Button>
        </div>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlarni boshqarish"
        description="Ko‘rinadigan ustunlar va tartib. Sizning akkauntingiz uchun saqlanadi."
        columns={[...BONUS_RULE_DATA_COLUMNS]}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Filtr</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-teal-600/40 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    title={filtersVisible ? "Filtrlarni yashirish" : "Filtrlarni ko‘rsatish"}
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
                    title="Filtrlarni tozalash"
                    onClick={resetListFilters}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              </div>
              {filtersVisible ? (
                <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                  <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Qo‘llanish usuli</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Qo‘llanish usuli"
                      value={methodFilter}
                      onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
                    >
                      <option value="all">Barchasi</option>
                      <option value="auto">Avto</option>
                      <option value="manual">Qo‘lda</option>
                    </select>
                  </div>
                  <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Muddat holati</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Muddat holati"
                      value={termFilter}
                      onChange={(e) => setTermFilter(e.target.value as typeof termFilter)}
                    >
                      <option value="all">Barchasi</option>
                      <option value="expired">Muddati tugagan</option>
                      <option value="current">Hozir amal qiladi</option>
                      <option value="upcoming">Hali boshlanmagan</option>
                    </select>
                  </div>
                  <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Bonus turi</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Bonus turi"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                    >
                      <option value="all">Barchasi</option>
                      <option value="qty">Miqdor bo‘yicha</option>
                      <option value="sum">Summa bo‘yicha</option>
                      <option value="discount">Chegirma (%)</option>
                    </select>
                  </div>
                  <div className="grid min-w-[12rem] max-w-[280px] flex-[1_1_12rem] gap-1.5">
                    <Label className="text-xs font-medium text-foreground/88">Sharti</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Sharti"
                      value={ruleIdFilter}
                      onChange={(e) => setRuleIdFilter(e.target.value === "all" ? "all" : e.target.value)}
                    >
                      <option value="all">Barchasi</option>
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
          Tenant topilmadi.{" "}
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
                aria-label="Jadval: qatorlar va qidiruv"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-0.5">
                    <Label className="sr-only">Sahifadagi qatorlar soni</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      aria-label="Sahifadagi qatorlar"
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
                    title="Ustunlarni boshqarish"
                    onClick={() => setColumnDialogOpen(true)}
                  >
                    <LayoutGrid className="size-4" />
                  </Button>
                  <div className="relative min-w-[180px] max-w-xs flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 bg-background pl-8 text-sm"
                      placeholder="Qidirish"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      aria-label="Bonus nomi bo‘yicha qidirish"
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
                    title="Yangilash"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pb-0.5 text-xs text-muted-foreground sm:pb-0">
                  {data != null ? (
                    <>
                      Jami:{" "}
                      <span className="font-medium text-foreground">{data.total}</span>
                    </>
                  ) : null}
                </div>
              </div>

              {isLoading ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Yuklanmoqda…</p>
              ) : isError ? (
                <p className="px-4 py-6 text-sm text-destructive">
                  Xato: {error instanceof Error ? error.message : "API ga ulanib bo‘lmadi"}
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
                        aria-label="Sahifadagi barchasini tanlash"
                      />
                    </th>
                    {tablePrefs.visibleColumnOrder.map((colId) => {
                      const meta = BONUS_RULE_DATA_COLUMNS.find((c) => c.id === colId);
                      return (
                        <th key={colId} className="px-3 py-2 font-medium">
                          {meta?.label ?? colId}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right font-medium">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tablePrefs.visibleColumnOrder.length + 2}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        {activeOnly ? "Shartlarga mos qoida yo‘q" : "Nofaol qoida yo‘q"}
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
                              aria-label={`Tanlash: ${row.name}`}
                            />
                          </td>
                          {tablePrefs.visibleColumnOrder.map((colId) => (
                            <td key={colId} className="px-3 py-2 align-middle">
                              {colId === "name" ? (
                                <span className="font-medium">{row.name}</span>
                              ) : colId === "type" ? (
                                <span className="text-muted-foreground">{bonusTypeLabel(row.type)}</span>
                              ) : colId === "linked" ? (
                                <Link
                                  href="/settings/bonus-rules/strategy"
                                  className={cn(
                                    buttonVariants({ variant: "outline", size: "icon-sm" }),
                                    "inline-flex text-muted-foreground hover:text-foreground"
                                  )}
                                  title="Tenant uchun umumiy sozlama: bir zakazda chegirma, summa va miqdor bonuslarini qanday birlashtirish (stack). Har bir qatorga alohida bog‘lanish emas."
                                  aria-label="Bonus strategiyasi — birlashtirish (stack)"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Plus className="size-3.5" />
                                </Link>
                              ) : colId === "only_assortment" ? (
                                <span>{onlyByAssortment(row) ? "Ha" : "Yo‘q"}</span>
                              ) : colId === "once_per_client" ? (
                                <span>{row.once_per_client ? "Ha" : "Yo‘q"}</span>
                              ) : colId === "valid_from" ? (
                                formatRuleDateTime(row.valid_from)
                              ) : colId === "valid_to" ? (
                                formatRuleDateTime(row.valid_to)
                              ) : colId === "method" ? (
                                row.is_manual ? (
                                  <Badge variant="warning">Qo‘lda</Badge>
                                ) : (
                                  <Badge variant="success">Avto</Badge>
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
                                  aria-label={`${row.name} faolligi`}
                                />
                              ) : null}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <TableRowActionGroup className="justify-end" ariaLabel="Qoida">
                              {!activeOnly ? (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                  title="Faollashtirish"
                                  aria-label="Faollashtirish"
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
                                title="Nusxalash"
                                aria-label="Nusxalash"
                                disabled={duplicateMut.isPending}
                                onClick={() => duplicateMut.mutate(row)}
                              >
                                <Copy className="size-3.5" />
                              </Button>
                              <Link
                                href={`/settings/bonus-rules/${row.id}/edit`}
                                className={cn(
                                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                  "text-muted-foreground hover:text-foreground"
                                )}
                                title="Mijozlar / maqsad"
                                aria-label="Mijozlar va filtrlar"
                              >
                                <UserRound className="size-3.5" />
                              </Link>
                              <Link
                                href={`/settings/bonus-rules/${row.id}/edit`}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "icon-sm" }),
                                  "text-muted-foreground hover:text-foreground"
                                )}
                                title="Tahrirlash"
                                aria-label="Tahrirlash"
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

      {data && data.total > data.limit ? (
        <div className="mt-3 flex items-center gap-2">
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
