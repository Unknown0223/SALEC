"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { formatNumberGrouped } from "@/lib/format-numbers";
import type { WarehouseStockPurpose } from "@/components/warehouses/warehouses-workspace";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Download, LayoutGrid, ListFilter, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

type BalanceView = "summary" | "valuation" | "by_warehouse";

type BalanceRow = {
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  reserved_qty: string;
  available_qty: string;
};

type ValuationRow = BalanceRow & {
  amount_actual: string;
  amount_reserved: string;
  amount_available: string;
  currency: string;
};

type ByWarehouseRow = {
  warehouse_id: number;
  warehouse_name: string;
  category_id: number | null;
  category_name: string | null;
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  reserved_qty: string;
  available_qty: string;
};

type TotalsBase = {
  qty: string;
  reserved_qty: string;
  available_qty: string;
  amount_actual?: string;
  amount_reserved?: string;
  amount_available?: string;
  currency?: string;
};

type StockBalancesPayload =
  | {
      view: "summary";
      data: BalanceRow[];
      totals: TotalsBase;
      total: number;
      page: number;
      limit: number;
    }
  | {
      view: "valuation";
      data: ValuationRow[];
      totals: TotalsBase;
      total: number;
      page: number;
      limit: number;
    }
  | {
      view: "by_warehouse";
      data: ByWarehouseRow[];
      totals: TotalsBase;
      total: number;
      page: number;
      limit: number;
    };

type WarehouseOpt = {
  id: number;
  name: string;
  stock_purpose: string;
};

type CategoryOpt = { id: number; name: string };
type GroupOpt = { id: number; name: string };

const PURPOSE_TABS: { value: WarehouseStockPurpose; label: string }[] = [
  { value: "sales", label: "Склад реализации" },
  { value: "return", label: "Склад для возврата" },
  { value: "reserve", label: "Склад для резерва" }
];

const VIEW_TABS: { value: BalanceView; label: string }[] = [
  { value: "summary", label: "Общее состояние склада" },
  { value: "valuation", label: "Оценка склада" },
  { value: "by_warehouse", label: "Остатки по складам" }
];

type QtyMode = "all" | "positive" | "zero";
type ProductScope = "all" | "active";

const STOCK_BAL_TABLE_SUMMARY = "stock_balances.summary.v1";
const STOCK_BAL_TABLE_VALUATION = "stock_balances.valuation.v1";
const STOCK_BAL_TABLE_BY_WH = "stock_balances.by_warehouse.v1";

const SUMMARY_COLS = [
  { id: "name", label: "Название" },
  { id: "sku", label: "Код" },
  { id: "qty", label: "Фактический остаток" },
  { id: "reserved", label: "Новые заявки" },
  { id: "available", label: "Доступно для продаж" }
] as const;
const SUMMARY_ORDER = SUMMARY_COLS.map((c) => c.id);
const SUMMARY_NUMERIC = new Set(["qty", "reserved", "available"]);

const BY_WH_COLS = [
  { id: "warehouse", label: "Склад" },
  { id: "category", label: "Категория продукта" },
  { id: "name", label: "Название товара" },
  { id: "sku", label: "Код" },
  { id: "qty", label: "Фактический остаток" },
  { id: "reserved", label: "Новые заявки" },
  { id: "available", label: "Доступно для продаж" }
] as const;
const BY_WH_ORDER = BY_WH_COLS.map((c) => c.id);
const BY_WH_NUMERIC = new Set(["qty", "reserved", "available"]);

const VAL_COLS = [
  { id: "name", label: "Название" },
  { id: "sku", label: "Код" },
  { id: "qty", label: "Факт, шт" },
  { id: "amount_actual", label: "Факт, сумма" },
  { id: "reserved_qty", label: "Новые заявки, шт" },
  { id: "amount_reserved", label: "Новые заявки, сумма" },
  { id: "available_qty", label: "Доступно, шт" },
  { id: "amount_available", label: "Доступно, сумма" },
  { id: "currency", label: "Валюта" }
] as const;
const VAL_ORDER = VAL_COLS.map((c) => c.id);
const VAL_NUMERIC = new Set([
  "qty",
  "amount_actual",
  "reserved_qty",
  "amount_reserved",
  "available_qty",
  "amount_available"
]);

function formatQty(s: string): string {
  return formatNumberGrouped(s, { maxFractionDigits: 3 });
}

function formatMoney(s: string, currency: string): string {
  const cur = /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : "UZS";
  return `${formatNumberGrouped(s, { minFractionDigits: 2, maxFractionDigits: 2 })} ${cur}`;
}

function parseBalanceQty(s: string): number {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Jadval qatori: nol qoldiq, manfiy «доступно», barchasi rezervda — tez vizual ajratish. */
function stockBalanceRowClass(row: { qty: string; available_qty: string }): string {
  const q = parseBalanceQty(row.qty);
  const a = parseBalanceQty(row.available_qty);
  const base = "border-b border-border/70";
  if (Number.isFinite(a) && a < 0) {
    return cn(base, "bg-destructive/10 hover:bg-destructive/15");
  }
  if (Number.isFinite(q) && q <= 0 && (!Number.isFinite(a) || a <= 0)) {
    return cn(base, "bg-muted/35 hover:bg-muted/45");
  }
  if (Number.isFinite(a) && a === 0 && Number.isFinite(q) && q > 0) {
    return cn(base, "bg-amber-500/10 hover:bg-amber-500/18");
  }
  return cn(base, "hover:bg-muted/20");
}

type Props = { tenantSlug: string };

type BalanceSort = "name_asc" | "name_desc" | "available_desc";

function buildBalancesParams(args: {
  purpose: WarehouseStockPurpose;
  view: BalanceView;
  priceType: string;
  applied: {
    warehouseId: string;
    categoryId: string;
    groupId: string;
    activeOnly: boolean;
    qtyMode: QtyMode;
    sort: BalanceSort;
    q: string;
  };
  page: number;
  limit: number;
}): URLSearchParams {
  const { purpose, view, priceType, applied, page, limit } = args;
  const p = new URLSearchParams();
  p.set("purpose", purpose);
  p.set("view", view);
  p.set("active_only", applied.activeOnly ? "true" : "false");
  p.set("qty_mode", applied.qtyMode);
  p.set("sort", applied.sort);
  p.set("page", String(page));
  p.set("limit", String(limit));
  if (applied.q.trim()) p.set("q", applied.q.trim());
  if (applied.warehouseId) p.set("warehouse_id", applied.warehouseId);
  if (applied.categoryId) p.set("category_id", applied.categoryId);
  if (applied.groupId) p.set("group_id", applied.groupId);
  if (view === "valuation" && priceType.trim()) {
    p.set("price_type", priceType.trim());
  }
  return p;
}

function leadingNonNumericCount(visible: string[], numericIds: Set<string>): number {
  let i = 0;
  while (i < visible.length && !numericIds.has(visible[i]!)) i += 1;
  return i;
}

function colLabel(cols: readonly { id: string; label: string }[], id: string): string {
  return cols.find((c) => c.id === id)?.label ?? id;
}

function thClassNumeric(numericIds: Set<string>, colId: string): string {
  return cn("px-3 py-2.5 font-semibold", numericIds.has(colId) ? "text-right" : "");
}

const SUMMARY_HEADER_TITLE: Partial<Record<string, string>> = {
  reserved: "Данные из Stock.reserved_qty. Авто по заказам пока не заполняется."
};

const BY_WH_HEADER_TITLE: Partial<Record<string, string>> = {
  reserved: "Stock.reserved_qty по строке склад+товар."
};

function renderSummaryDataCell(row: BalanceRow, colId: string): ReactNode {
  switch (colId) {
    case "name":
      return <span className="font-medium">{row.name}</span>;
    case "sku":
      return <span className="text-muted-foreground">{row.sku || "—"}</span>;
    case "qty":
      return formatQty(row.qty);
    case "reserved":
      return formatQty(row.reserved_qty);
    case "available":
      return (
        <span className="font-medium text-teal-800 dark:text-teal-300">
          {formatQty(row.available_qty)}
        </span>
      );
    default:
      return "—";
  }
}

function renderByWhDataCell(row: ByWarehouseRow, colId: string): ReactNode {
  switch (colId) {
    case "warehouse":
      return <span className="max-w-[160px]">{row.warehouse_name}</span>;
    case "category":
      return (
        <span className="max-w-[140px] text-muted-foreground">{row.category_name ?? "—"}</span>
      );
    case "name":
      return <span className="max-w-[220px] font-medium">{row.name}</span>;
    case "sku":
      return <span className="text-muted-foreground">{row.sku || "—"}</span>;
    case "qty":
      return formatQty(row.qty);
    case "reserved":
      return formatQty(row.reserved_qty);
    case "available":
      return (
        <span className="font-medium text-teal-800 dark:text-teal-300">
          {formatQty(row.available_qty)}
        </span>
      );
    default:
      return "—";
  }
}

function renderValuationDataCell(row: ValuationRow, colId: string): ReactNode {
  switch (colId) {
    case "name":
      return <span className="max-w-[220px] font-medium">{row.name}</span>;
    case "sku":
      return <span className="text-muted-foreground">{row.sku || "—"}</span>;
    case "qty":
      return formatQty(row.qty);
    case "amount_actual":
      return formatMoney(row.amount_actual, row.currency);
    case "reserved_qty":
      return formatQty(row.reserved_qty);
    case "amount_reserved":
      return formatMoney(row.amount_reserved, row.currency);
    case "available_qty":
      return (
        <span className="font-medium text-teal-800 dark:text-teal-300">
          {formatQty(row.available_qty)}
        </span>
      );
    case "amount_available":
      return (
        <span className="font-medium text-teal-800 dark:text-teal-300">
          {formatMoney(row.amount_available, row.currency)}
        </span>
      );
    case "currency":
      return <span className="text-muted-foreground">{row.currency}</span>;
    default:
      return "—";
  }
}

function renderSummaryTotalCell(colId: string, totals: TotalsBase): ReactNode {
  switch (colId) {
    case "qty":
      return formatQty(totals.qty);
    case "reserved":
      return formatQty(totals.reserved_qty);
    case "available":
      return (
        <span className="text-teal-800 dark:text-teal-300">{formatQty(totals.available_qty)}</span>
      );
    default:
      return null;
  }
}

function renderByWhTotalCell(colId: string, totals: TotalsBase): ReactNode {
  switch (colId) {
    case "qty":
      return formatQty(totals.qty);
    case "reserved":
      return formatQty(totals.reserved_qty);
    case "available":
      return (
        <span className="text-teal-800 dark:text-teal-300">{formatQty(totals.available_qty)}</span>
      );
    default:
      return null;
  }
}

function renderValuationTotalCell(colId: string, totals: TotalsBase): ReactNode {
  const cur = totals.currency ?? "UZS";
  switch (colId) {
    case "qty":
      return formatQty(totals.qty);
    case "amount_actual":
      return formatMoney(totals.amount_actual ?? "0", cur);
    case "reserved_qty":
      return formatQty(totals.reserved_qty);
    case "amount_reserved":
      return formatMoney(totals.amount_reserved ?? "0", cur);
    case "available_qty":
      return formatQty(totals.available_qty);
    case "amount_available":
      return (
        <span className="text-teal-800 dark:text-teal-300">
          {formatMoney(totals.amount_available ?? "0", cur)}
        </span>
      );
    case "currency":
      return totals.currency ?? "—";
    default:
      return null;
  }
}

export function StockBalancesWorkspace({ tenantSlug }: Props) {
  const [purpose, setPurpose] = useState<WarehouseStockPurpose>("sales");
  const [balanceView, setBalanceView] = useState<BalanceView>("summary");
  const [draftWh, setDraftWh] = useState("");
  const [draftCat, setDraftCat] = useState("");
  const [draftGroup, setDraftGroup] = useState("");
  const [draftPriceType, setDraftPriceType] = useState("");
  const [draftQtyMode, setDraftQtyMode] = useState<QtyMode>("all");
  const [draftProductScope, setDraftProductScope] = useState<ProductScope>("active");
  const [draftSort, setDraftSort] = useState<BalanceSort>("name_asc");
  const [searchDraft, setSearchDraft] = useState("");
  const [applied, setApplied] = useState<{
    warehouseId: string;
    categoryId: string;
    groupId: string;
    priceType: string;
    activeOnly: boolean;
    qtyMode: QtyMode;
    sort: BalanceSort;
    q: string;
  }>({
    warehouseId: "",
    categoryId: "",
    groupId: "",
    priceType: "",
    activeOnly: true,
    qtyMode: "all",
    sort: "name_asc",
    q: ""
  });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const prefsSummary = useUserTablePrefs({
    tenantSlug,
    tableId: STOCK_BAL_TABLE_SUMMARY,
    defaultColumnOrder: SUMMARY_ORDER,
    defaultPageSize: 25,
    allowedPageSizes: [10, 25, 50, 100]
  });
  const prefsValuation = useUserTablePrefs({
    tenantSlug,
    tableId: STOCK_BAL_TABLE_VALUATION,
    defaultColumnOrder: VAL_ORDER,
    defaultPageSize: 25,
    allowedPageSizes: [10, 25, 50, 100]
  });
  const prefsByWh = useUserTablePrefs({
    tenantSlug,
    tableId: STOCK_BAL_TABLE_BY_WH,
    defaultColumnOrder: BY_WH_ORDER,
    defaultPageSize: 25,
    allowedPageSizes: [10, 25, 50, 100]
  });

  const tablePrefs =
    balanceView === "summary"
      ? prefsSummary
      : balanceView === "valuation"
        ? prefsValuation
        : prefsByWh;

  const columnDialogColumns =
    balanceView === "summary"
      ? [...SUMMARY_COLS]
      : balanceView === "valuation"
        ? [...VAL_COLS]
        : [...BY_WH_COLS];

  const pageSize = tablePrefs.pageSize;

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: WarehouseOpt[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: CategoryOpt[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const groupsQ = useQuery({
    queryKey: ["catalog-product-groups-balances", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: GroupOpt[]; total: number }>(
        `/api/${tenantSlug}/catalog/product-groups?limit=200&page=1`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "stock-balances"],
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(
        `/api/${tenantSlug}/price-types?kind=sale`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const warehousesForPurpose = useMemo(() => {
    const list = warehousesQ.data ?? [];
    return list.filter((w) => w.stock_purpose === purpose && w.stock_purpose != null);
  }, [warehousesQ.data, purpose]);

  const balancesEnabled =
    Boolean(tenantSlug) &&
    (balanceView !== "valuation" || Boolean(applied.priceType.trim()));

  const balancesQ = useQuery({
    queryKey: [
      "stock-balances",
      tenantSlug,
      purpose,
      balanceView,
      applied.priceType,
      applied.warehouseId,
      applied.categoryId,
      applied.groupId,
      applied.activeOnly,
      applied.qtyMode,
      applied.sort,
      applied.q,
      page,
      pageSize
    ],
    queryFn: async () => {
      const p = buildBalancesParams({
        purpose,
        view: balanceView,
        priceType: applied.priceType,
        applied,
        page,
        limit: pageSize
      });
      const { data } = await api.get<StockBalancesPayload>(
        `/api/${tenantSlug}/stock/balances?${p.toString()}`
      );
      return data;
    },
    enabled: balancesEnabled
  });

  function applyFilters() {
    setApplied({
      warehouseId: draftWh,
      categoryId: draftCat,
      groupId: draftGroup,
      priceType: draftPriceType.trim(),
      activeOnly: draftProductScope === "active",
      qtyMode: draftQtyMode,
      sort: draftSort,
      q: searchDraft.trim()
    });
    setPage(1);
  }

  const resetFiltersToDefaults = useCallback(() => {
    setDraftWh("");
    setDraftCat("");
    setDraftGroup("");
    setDraftQtyMode("all");
    setDraftProductScope("active");
    setDraftSort("name_asc");
    setSearchDraft("");
    setDraftPriceType("");
    setApplied({
      warehouseId: "",
      categoryId: "",
      groupId: "",
      priceType: "",
      activeOnly: true,
      qtyMode: "all",
      sort: "name_asc",
      q: ""
    });
    setPage(1);
  }, []);

  function selectView(next: BalanceView) {
    setBalanceView(next);
    setPage(1);
    if (next === "valuation") {
      const list = priceTypesQ.data ?? [];
      const first = list[0];
      setDraftPriceType((d) => (d.trim() ? d : first ?? ""));
      setApplied((prev) => {
        if (prev.priceType.trim() || !first) return prev;
        return { ...prev, priceType: first };
      });
    }
  }

  const total = balancesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const visibleCols = tablePrefs.visibleColumnOrder;
  const colCount = Math.max(1, visibleCols.length);

  const summaryMeta = SUMMARY_COLS as readonly { id: string; label: string }[];
  const byWhMeta = BY_WH_COLS as readonly { id: string; label: string }[];
  const valMeta = VAL_COLS as readonly { id: string; label: string }[];

  const numericForView =
    balanceView === "summary"
      ? SUMMARY_NUMERIC
      : balanceView === "valuation"
        ? VAL_NUMERIC
        : BY_WH_NUMERIC;

  async function downloadExcel() {
    if (balanceView === "valuation" && !applied.priceType.trim()) {
      window.alert("Выберите тип цены (справа в панели над таблицей).");
      return;
    }
    setExporting(true);
    try {
      const p = buildBalancesParams({
        purpose,
        view: balanceView,
        priceType: applied.priceType,
        applied,
        page: 1,
        limit: pageSize
      });
      p.delete("page");
      p.delete("limit");
      const res = await api.get(`/api/${tenantSlug}/stock/balances/export?${p.toString()}`, {
        responseType: "arraybuffer"
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ostatki-${balanceView}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (isAxiosError(e)) {
        const st = e.response?.status;
        if (st === 413) {
          window.alert("Слишком много строк для выгрузки (лимит 25 000). Сузьте фильтр.");
          return;
        }
        if (st === 400) {
          window.alert("Проверьте параметры выгрузки (тип цены для оценки).");
          return;
        }
      }
      window.alert("Не удалось выгрузить файл.");
    } finally {
      setExporting(false);
    }
  }

  const totals = balancesQ.data?.totals;

  return (
    <PageShell>
      <PageHeader
        title="Остатки товаров"
        description="Сводные остатки по выбранному типу складов. Доступно = факт − резерв. Подсветка строк: серый — нулевой остаток; янтарный — нет доступного при положительном факте (резерв); красный — отрицательное доступно."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {PURPOSE_TABS.map((t) => (
              <Button
                key={t.value}
                type="button"
                size="sm"
                variant={purpose === t.value ? "default" : "outline"}
                className={cn(
                  purpose === t.value &&
                    "bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
                )}
                onClick={() => {
                  setPurpose(t.value);
                  setDraftWh("");
                  setDraftCat("");
                  setDraftGroup("");
                  setDraftPriceType("");
                  setDraftQtyMode("all");
                  setDraftProductScope("active");
                  setDraftSort("name_asc");
                  setSearchDraft("");
                  setApplied({
                    warehouseId: "",
                    categoryId: "",
                    groupId: "",
                    priceType: "",
                    activeOnly: true,
                    qtyMode: "all",
                    sort: "name_asc",
                    q: ""
                  });
                  setPage(1);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="orders-hub-section orders-hub-section--filters orders-hub-section--stack-tight">
        <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="space-y-2 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Фильтр</p>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
            <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Склад</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftWh}
                onChange={(e) => setDraftWh(e.target.value)}
              >
                <option value="">Все ({PURPOSE_TABS.find((x) => x.value === purpose)?.label})</option>
                {warehousesForPurpose.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Категория</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftCat}
                onChange={(e) => setDraftCat(e.target.value)}
              >
                <option value="">Все</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-[9.5rem] max-w-[220px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Группа товаров</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftGroup}
                onChange={(e) => setDraftGroup(e.target.value)}
              >
                <option value="">Все</option>
                {(groupsQ.data ?? []).map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-[9.5rem] max-w-[200px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Кол-во</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftQtyMode}
                onChange={(e) => setDraftQtyMode(e.target.value as QtyMode)}
              >
                <option value="all">Количество</option>
                <option value="positive">С остатком</option>
                <option value="zero">Нулевые</option>
              </select>
            </div>
            <div className="grid min-w-[9.5rem] max-w-[200px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Все продукты</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftProductScope}
                onChange={(e) => setDraftProductScope(e.target.value as ProductScope)}
              >
                <option value="active">Только активные</option>
                <option value="all">Все продукты</option>
              </select>
            </div>
            <div className="grid min-w-[9.5rem] max-w-[200px] flex-[1_1_9.5rem] gap-1.5">
              <Label className="text-xs font-medium text-foreground/88">Тип сортировки</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={draftSort}
                onChange={(e) => setDraftSort(e.target.value as typeof draftSort)}
              >
                <option value="name_asc">Название А→Я</option>
                <option value="name_desc">Название Я→А</option>
                <option value="available_desc">Доступно (убыв.)</option>
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-teal-600/40 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
              title="Сбросить фильтры"
              onClick={() => resetFiltersToDefaults()}
            >
              <ListFilter className="size-4" />
            </Button>
            <Button
              type="button"
              className="h-9 shrink-0 bg-teal-600 px-4 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
              onClick={() => applyFilters()}
            >
              Применить
            </Button>
          </div>
          </CardContent>
        </Card>
      </div>

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Управление столбцами"
        description="Видимые столбцы и порядок сохраняются для вашей учётной записи."
        columns={columnDialogColumns}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="orders-hub-section orders-hub-section--table mt-4">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-wrap gap-1 border-b border-border bg-muted/25 px-3 py-0 sm:px-4">
              {VIEW_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => selectView(t.value)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    balanceView === t.value
                      ? "border-teal-600 text-teal-700 dark:border-teal-500 dark:text-teal-400"
                      : "border-transparent text-foreground/65 hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="table-toolbar flex flex-wrap items-end justify-between gap-3 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-0.5">
                  <Label className="sr-only">Строк на странице</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={String(pageSize)}
                    onChange={(e) => {
                      tablePrefs.setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Управление столбцами"
                  onClick={() => setColumnDialogOpen(true)}
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 bg-background pl-8 text-foreground"
                    placeholder="Поиск"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters();
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={exporting || (balanceView === "valuation" && !applied.priceType.trim())}
                  onClick={() => void downloadExcel()}
                >
                  <Download className="mr-1 size-3.5" />
                  {exporting ? "…" : "Excel"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Обновить"
                  onClick={() => void balancesQ.refetch()}
                >
                  <RefreshCw className={cn("size-4", balancesQ.isFetching && "animate-spin")} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {balanceView === "valuation" ? (
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-foreground/88">Тип цены</Label>
                    <select
                      className="flex h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      value={draftPriceType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftPriceType(v);
                        setApplied((prev) => ({ ...prev, priceType: v.trim() }));
                        setPage(1);
                      }}
                    >
                      <option value="">— выберите —</option>
                      {(priceTypesQ.data ?? []).map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {balanceView === "summary" ? (
                  <>
                    <Link
                      href="/stock"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-9 whitespace-nowrap"
                      )}
                    >
                      Движения товаров на складе
                    </Link>
                    <Link
                      href="/products"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-9 whitespace-nowrap"
                      )}
                    >
                      Движение одного товара
                    </Link>
                  </>
                ) : null}
              </div>
            </div>

            {balanceView === "valuation" &&
            priceTypesQ.isSuccess &&
            (priceTypesQ.data?.length ?? 0) === 0 ? (
              <p className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                Нет типов цен продажи. Настройте в разделе «Типы цен».
              </p>
            ) : null}

            <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {visibleCols.length === 0 ? (
            <tbody>
              <tr>
                <td className="px-3 py-10 text-center text-muted-foreground">
                  Нет видимых столбцов. Откройте «Управление столбцами» и включите колонки.
                </td>
              </tr>
            </tbody>
          ) : (
            <>
          <thead className="app-table-thead">
            <tr className="text-left">
              {visibleCols.map((colId) => (
                <th
                  key={colId}
                  className={cn("whitespace-nowrap", thClassNumeric(numericForView, colId))}
                  title={
                    balanceView === "summary"
                      ? SUMMARY_HEADER_TITLE[colId]
                      : balanceView === "by_warehouse"
                        ? BY_WH_HEADER_TITLE[colId]
                        : undefined
                  }
                >
                  {balanceView === "summary"
                    ? colLabel(summaryMeta, colId)
                    : balanceView === "valuation"
                      ? colLabel(valMeta, colId)
                      : colLabel(byWhMeta, colId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {balanceView === "valuation" && !applied.priceType.trim() ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">
                  Выберите тип цены справа над таблицей.
                </td>
              </tr>
            ) : balancesQ.isLoading ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">
                  Загрузка…
                </td>
              </tr>
            ) : (balancesQ.data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">
                  Пусто
                </td>
              </tr>
            ) : balanceView === "summary" ? (
              <>
                {(balancesQ.data as Extract<StockBalancesPayload, { view: "summary" }>).data.map(
                  (row) => (
                    <tr key={row.product_id} className={stockBalanceRowClass(row)}>
                      {visibleCols.map((colId) => (
                        <td
                          key={colId}
                          className={cn(
                            "px-3 py-2",
                            SUMMARY_NUMERIC.has(colId) && "text-right tabular-nums",
                            colId === "name" && "max-w-[280px]"
                          )}
                        >
                          {renderSummaryDataCell(row, colId)}
                        </td>
                      ))}
                    </tr>
                  )
                )}
                {totals ? (
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    {(() => {
                      const lead = leadingNonNumericCount(visibleCols, SUMMARY_NUMERIC);
                      const rest = visibleCols.slice(lead);
                      const cells: ReactNode[] = [
                        <td
                          key="total-lbl"
                          colSpan={lead === 0 ? 1 : lead}
                          className="px-3 py-2.5"
                        >
                          Итого
                        </td>
                      ];
                      for (const colId of rest) {
                        cells.push(
                          <td
                            key={colId}
                            className={cn(
                              "px-3 py-2.5",
                              SUMMARY_NUMERIC.has(colId) && "text-right tabular-nums"
                            )}
                          >
                            {SUMMARY_NUMERIC.has(colId)
                              ? renderSummaryTotalCell(colId, totals)
                              : null}
                          </td>
                        );
                      }
                      return cells;
                    })()}
                  </tr>
                ) : null}
              </>
            ) : balanceView === "valuation" ? (
              <>
                {(
                  balancesQ.data as Extract<StockBalancesPayload, { view: "valuation" }>
                ).data.map((row) => (
                  <tr key={row.product_id} className={stockBalanceRowClass(row)}>
                    {visibleCols.map((colId) => (
                      <td
                        key={colId}
                        className={cn(
                          "px-3 py-2",
                          VAL_NUMERIC.has(colId) && "text-right tabular-nums",
                          colId === "name" && "max-w-[220px]"
                        )}
                      >
                        {renderValuationDataCell(row, colId)}
                      </td>
                    ))}
                  </tr>
                ))}
                {totals && totals.currency ? (
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    {(() => {
                      const lead = leadingNonNumericCount(visibleCols, VAL_NUMERIC);
                      const rest = visibleCols.slice(lead);
                      const cells: ReactNode[] = [
                        <td
                          key="total-lbl"
                          colSpan={lead === 0 ? 1 : lead}
                          className="px-3 py-2.5"
                        >
                          Итого
                        </td>
                      ];
                      for (const colId of rest) {
                        cells.push(
                          <td
                            key={colId}
                            className={cn(
                              "px-3 py-2.5",
                              VAL_NUMERIC.has(colId) && "text-right tabular-nums"
                            )}
                          >
                            {VAL_NUMERIC.has(colId)
                              ? renderValuationTotalCell(colId, totals)
                              : null}
                          </td>
                        );
                      }
                      return cells;
                    })()}
                  </tr>
                ) : null}
              </>
            ) : (
              <>
                {(
                  balancesQ.data as Extract<StockBalancesPayload, { view: "by_warehouse" }>
                ).data.map((row) => (
                  <tr key={`${row.warehouse_id}-${row.product_id}`} className={stockBalanceRowClass(row)}>
                    {visibleCols.map((colId) => (
                      <td
                        key={colId}
                        className={cn(
                          "px-3 py-2",
                          BY_WH_NUMERIC.has(colId) && "text-right tabular-nums"
                        )}
                      >
                        {renderByWhDataCell(row, colId)}
                      </td>
                    ))}
                  </tr>
                ))}
                {totals ? (
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    {(() => {
                      const lead = leadingNonNumericCount(visibleCols, BY_WH_NUMERIC);
                      const rest = visibleCols.slice(lead);
                      const cells: ReactNode[] = [
                        <td
                          key="total-lbl"
                          colSpan={lead === 0 ? 1 : lead}
                          className="px-3 py-2.5"
                        >
                          Итого
                        </td>
                      ];
                      for (const colId of rest) {
                        cells.push(
                          <td
                            key={colId}
                            className={cn(
                              "px-3 py-2.5",
                              BY_WH_NUMERIC.has(colId) && "text-right tabular-nums"
                            )}
                          >
                            {BY_WH_NUMERIC.has(colId)
                              ? renderByWhTotalCell(colId, totals)
                              : null}
                          </td>
                        );
                      }
                      return cells;
                    })()}
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
            </>
          )}
        </table>
            </div>
            <div className="table-content-footer flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/25 px-3 py-3 text-xs sm:px-4">
              <span className="text-foreground/80">
                Показано {from}–{to} / {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page <= 1 || !balancesEnabled}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                <span className="tabular-nums text-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={page >= totalPages || !balancesEnabled}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
