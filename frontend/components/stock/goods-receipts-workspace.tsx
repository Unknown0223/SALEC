"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { cn } from "@/lib/utils";
import { formatGroupedDecimal } from "@/lib/format-numbers";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useEffectiveRole } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Download, LayoutGrid, ListFilter, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

const TABLE_ID = "goods_receipts.list.v1";
const COLS = [
  { id: "created_at", label: "Дата создания" },
  { id: "receipt_at", label: "Дата прихода" },
  { id: "total_qty", label: "Кол-во" },
  { id: "total_sum", label: "Сумма" },
  { id: "total_volume_m3", label: "Объём" },
  { id: "total_weight_kg", label: "Вес" },
  { id: "status", label: "Статус" },
  { id: "warehouse_name", label: "Склад" },
  { id: "comment", label: "Комментарий" },
  { id: "external_ref", label: "Номер прихода 1С" },
  { id: "supplier_name", label: "Поставщики" },
  { id: "number", label: "Номер" },
  { id: "price_type", label: "Тип цены" }
] as const;
const DEFAULT_ORDER = COLS.map((c) => c.id);
const NUMERIC = new Set(["total_qty", "total_sum", "total_volume_m3", "total_weight_kg"]);

export type GoodsReceiptRow = {
  id: number;
  number: string;
  status: string;
  created_at: string;
  receipt_at: string | null;
  total_qty: string;
  total_sum: string;
  total_volume_m3: string;
  total_weight_kg: string;
  comment: string | null;
  price_type: string;
  external_ref: string | null;
  warehouse_id: number;
  warehouse_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
};

function colLabel(id: string): string {
  return COLS.find((c) => c.id === id)?.label ?? id;
}

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "posted":
      return "Проведён";
    case "draft":
      return "Черновик";
    case "cancelled":
      return "Отменён";
    default:
      return s;
  }
}

function renderCell(row: GoodsReceiptRow, colId: string): ReactNode {
  switch (colId) {
    case "created_at":
      return fmtDt(row.created_at);
    case "receipt_at":
      return fmtDt(row.receipt_at);
    case "total_qty": {
      const raw = row.total_qty;
      const n = Number.parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) return <span className="tabular-nums">{raw}</span>;
      return <span className="tabular-nums">{formatGroupedDecimal(n, 0)}</span>;
    }
    case "total_sum": {
      const raw = row.total_sum;
      const n = Number.parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) return <span className="tabular-nums">{raw}</span>;
      return <span className="tabular-nums">{formatGroupedDecimal(n, 2)}</span>;
    }
    case "total_volume_m3":
    case "total_weight_kg": {
      const raw = row[colId as keyof GoodsReceiptRow] as string;
      const n = Number.parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) return <span className="tabular-nums">{raw}</span>;
      return <span className="tabular-nums">{formatGroupedDecimal(n, 4)}</span>;
    }
    case "status":
      return statusLabel(row.status);
    case "warehouse_name":
      return row.warehouse_name;
    case "comment":
      return row.comment ? <span className="max-w-[200px] truncate">{row.comment}</span> : "—";
    case "external_ref":
      return row.external_ref ?? "—";
    case "supplier_name":
      return row.supplier_name ?? "—";
    case "number":
      return <span className="font-mono text-xs">{row.number}</span>;
    case "price_type":
      return row.price_type;
    default:
      return "—";
  }
}

type Props = { tenantSlug: string };

export function GoodsReceiptsWorkspace({ tenantSlug }: Props) {
  const role = useEffectiveRole();
  const canWrite = role === "admin" || role === "operator";

  const [draftWh, setDraftWh] = useState("");
  const [draftSupplier, setDraftSupplier] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftRangeOpen, setDraftRangeOpen] = useState(false);
  const draftRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [applied, setApplied] = useState({
    warehouseId: "",
    supplierId: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    q: ""
  });
  const [page, setPage] = useState(1);
  const [columnOpen, setColumnOpen] = useState(false);

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: TABLE_ID,
    defaultColumnOrder: DEFAULT_ORDER,
    defaultPageSize: 25,
    allowedPageSizes: [10, 25, 50, 100]
  });
  const visible = tablePrefs.visibleColumnOrder;

  const applyFilters = useCallback(() => {
    setApplied({
      warehouseId: draftWh,
      supplierId: draftSupplier,
      status: draftStatus,
      dateFrom: draftFrom,
      dateTo: draftTo,
      q: searchDraft.trim()
    });
    setPage(1);
  }, [draftWh, draftSupplier, draftStatus, draftFrom, draftTo, searchDraft]);

  const resetFilters = useCallback(() => {
    setDraftWh("");
    setDraftSupplier("");
    setDraftStatus("");
    setDraftFrom("");
    setDraftTo("");
    setSearchDraft("");
    setApplied({
      warehouseId: "",
      supplierId: "",
      status: "",
      dateFrom: "",
      dateTo: "",
      q: ""
    });
    setPage(1);
  }, []);

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/suppliers`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference
  });

  const listQ = useQuery({
    queryKey: [
      "goods-receipts",
      tenantSlug,
      applied,
      page,
      tablePrefs.pageSize
    ],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(tablePrefs.pageSize));
      if (applied.warehouseId) p.set("warehouse_id", applied.warehouseId);
      if (applied.supplierId) p.set("supplier_id", applied.supplierId);
      if (applied.status) p.set("status", applied.status);
      if (applied.dateFrom) p.set("date_from", applied.dateFrom);
      if (applied.dateTo) p.set("date_to", applied.dateTo);
      if (applied.q) p.set("q", applied.q);
      const { data } = await api.get<{ data: GoodsReceiptRow[]; total: number }>(
        `/api/${tenantSlug}/goods-receipts?${p.toString()}`
      );
      return data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / tablePrefs.pageSize));

  const exportCsv = useCallback(() => {
    const sep = ";";
    const head = visible.map(colLabel).join(sep);
    const lines = rows.map((row) =>
      visible
        .map((cid) => {
          const raw = String(
            (row as Record<string, unknown>)[cid] ?? ""
          ).replaceAll('"', '""');
          return `"${raw}"`;
        })
        .join(sep)
    );
    const blob = new Blob(["\ufeff" + head + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postupleniya.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, visible]);

  const colCount = Math.max(1, visible.length);

  return (
    <PageShell>
      <PageHeader
        title="Поступление"
        description="Документы оприходования на склад: связь со складом, остатками и каталогом (тип цены, номенклатура)."
        actions={
          canWrite ? (
            <Link
              href="/stock/receipts/new"
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-teal-600 text-white hover:bg-teal-700"
              )}
            >
              Добавить
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock">
          ← Kirim / qoldiq
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/balances">
          Остатки товаров
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/warehouses">
          Склады
        </Link>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фильтр</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
            <div className="grid min-w-[9rem] gap-1.5">
              <Label className="text-xs">Склад</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={draftWh}
                onChange={(e) => setDraftWh(e.target.value)}
              >
                <option value="">Все</option>
                {(warehousesQ.data ?? []).map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-[9rem] gap-1.5">
              <Label className="text-xs">Поставщики</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={draftSupplier}
                onChange={(e) => setDraftSupplier(e.target.value)}
              >
                <option value="">Все</option>
                {(suppliersQ.data ?? []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-[9rem] gap-1.5">
              <Label className="text-xs">Статус</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
              >
                <option value="">Все</option>
                <option value="posted">Проведён</option>
                <option value="draft">Черновик</option>
                <option value="cancelled">Отменён</option>
              </select>
            </div>
            <div className="grid min-w-[11rem] max-w-[16rem] gap-1.5">
              <Label className="text-xs">Период</Label>
              <button
                ref={draftRangeAnchorRef}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 w-full justify-start gap-2 font-normal",
                  draftRangeOpen && "border-primary/60 bg-primary/5"
                )}
                aria-expanded={draftRangeOpen}
                aria-haspopup="dialog"
                onClick={() => setDraftRangeOpen((o) => !o)}
              >
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm">{formatDateRangeButton(draftFrom, draftTo)}</span>
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Сбросить фильтры"
              onClick={() => resetFilters()}
            >
              <ListFilter className="size-4" />
            </Button>
            </div>
            <div className="flex shrink-0 items-end">
            <Button
              type="button"
              className="h-9 min-w-[7.5rem] shrink-0 bg-teal-600 px-4 text-white hover:bg-teal-700"
              onClick={() => applyFilters()}
            >
              Применить
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-2 border-b border-border/50 pb-3">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={String(tablePrefs.pageSize)}
          onChange={(e) => {
            tablePrefs.setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          title="Управление столбцами"
          onClick={() => setColumnOpen(true)}
        >
          <LayoutGrid className="size-4" />
        </Button>
        <div className="relative min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Поиск"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => exportCsv()}>
          <Download className="mr-1 size-3.5" />
          Excel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          title="Обновить"
          onClick={() => void listQ.refetch()}
        >
          <RefreshCw className={cn("size-4", listQ.isFetching && "animate-spin")} />
        </Button>
      </div>

      <TableColumnSettingsDialog
        open={columnOpen}
        onOpenChange={setColumnOpen}
        title="Управление столбцами"
        description="Видимые столбцы и порядок сохраняются для вашей учётной записи."
        columns={[...COLS]}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-sm">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          {visible.length === 0 ? (
            <tbody>
              <tr>
                <td className="p-8 text-center text-muted-foreground">
                  Нет видимых столбцов. Откройте «Управление столбцами».
                </td>
              </tr>
            </tbody>
          ) : (
            <>
              <thead className="app-table-thead">
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  {visible.map((colId) => (
                    <th
                      key={colId}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5",
                        NUMERIC.has(colId) && "text-right"
                      )}
                    >
                      {colLabel(colId)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading ? (
                  <tr>
                    <td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                      Загрузка…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                      Пусто
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/70 hover:bg-muted/20">
                      {visible.map((colId) => (
                        <td
                          key={colId}
                          className={cn("px-3 py-2", NUMERIC.has(colId) && "text-right")}
                        >
                          {renderCell(row, colId)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Всего: {total} · стр. {page} / {totalPages}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      </div>
      <DateRangePopover
        open={draftRangeOpen}
        onOpenChange={setDraftRangeOpen}
        anchorRef={draftRangeAnchorRef}
        dateFrom={draftFrom}
        dateTo={draftTo}
        onApply={({ dateFrom, dateTo }) => {
          setDraftFrom(dateFrom);
          setDraftTo(dateTo);
        }}
      />
    </PageShell>
  );
}
