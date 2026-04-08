"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api, apiBaseURL } from "@/lib/api";
import { readPersistedAuth } from "@/lib/persisted-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, ListFilter, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type StockRow = {
  id: number;
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  sku: string;
  product_name: string;
  qty: string;
  reserved_qty: string;
};

type ProductOption = { id: number; sku: string; name: string };

/** useQuery `data` undefined bo‘lganda `= []` har renderda yangi referens — useEffect cheksiz aylanadi. */
const EMPTY_PRODUCTS: ProductOption[] = [];

const STOCK_TABLE_ID = "stock.kirim_qoldiq.v1";
const STOCK_COLS = [
  { id: "warehouse_name", label: "Ombor" },
  { id: "sku", label: "SKU" },
  { id: "product_name", label: "Mahsulot" },
  { id: "qty", label: "Miqdor" },
  { id: "reserved_qty", label: "Rezerv" }
] as const;
const STOCK_DEFAULT_ORDER = STOCK_COLS.map((c) => c.id);
const STOCK_NUMERIC = new Set<string>(["qty", "reserved_qty"]);

function colLabelStock(id: string): string {
  return STOCK_COLS.find((c) => c.id === id)?.label ?? id;
}

function renderStockCell(row: StockRow, colId: string): ReactNode {
  switch (colId) {
    case "warehouse_name":
      return row.warehouse_name;
    case "sku":
      return <span className="font-mono text-xs">{row.sku}</span>;
    case "product_name":
      return row.product_name;
    case "qty":
      return <span className="tabular-nums">{formatNumberGrouped(row.qty, { maxFractionDigits: 3 })}</span>;
    case "reserved_qty":
      return (
        <span className="tabular-nums">{formatNumberGrouped(row.reserved_qty, { maxFractionDigits: 3 })}</span>
      );
    default:
      return "—";
  }
}

function StockPageContent() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>("");
  const [receiptWarehouseId, setReceiptWarehouseId] = useState<string>("");
  /** Ombor tanlanganda har bir mahsulot uchun avtomatik; faqat miqdor kiritiladi */
  const [lines, setLines] = useState<{ product_id: string; qty: string }[]>([]);
  const excelRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [importWarehouseId, setImportWarehouseId] = useState<string>("");

  const stockTablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: STOCK_TABLE_ID,
    defaultColumnOrder: STOCK_DEFAULT_ORDER,
    defaultPageSize: 100,
    allowedPageSizes: [50, 100, 200, 500]
  });
  const visibleStockCols = stockTablePrefs.visibleColumnOrder;

  const resetStockFilters = useCallback(() => {
    setFilterWarehouseId("");
  }, []);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const { data: products = EMPTY_PRODUCTS, isLoading: productsLoading } = useQuery({
    queryKey: ["products-stock-receipt", tenantSlug],
    queryFn: async () => {
      const out: ProductOption[] = [];
      let page = 1;
      const limit = 100;
      for (;;) {
        const { data } = await api.get<{
          data: { id: number; sku: string; name: string }[];
          total: number;
        }>(`/api/${tenantSlug}/products?limit=${limit}&page=${page}`);
        out.push(...data.data);
        if (data.data.length < limit || out.length >= data.total) break;
        page += 1;
      }
      return out.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    },
    enabled: Boolean(tenantSlug) && role === "admin"
  });

  useEffect(() => {
    if (!receiptWarehouseId) {
      setLines([]);
      return;
    }
    if (!products.length) {
      setLines([]);
      return;
    }
    setLines(products.map((p) => ({ product_id: String(p.id), qty: "" })));
  }, [receiptWarehouseId, products]);

  const { data: stock = [], isLoading, isFetching, refetch: refetchStock } = useQuery({
    queryKey: ["stock", tenantSlug, filterWarehouseId],
    queryFn: async () => {
      const qs = filterWarehouseId
        ? `?warehouse_id=${encodeURIComponent(filterWarehouseId)}`
        : "";
      const { data } = await api.get<{ data: StockRow[] }>(`/api/${tenantSlug}/stock${qs}`);
      return data.data;
    },
    enabled: Boolean(tenantSlug)
  });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const wid = Number.parseInt(receiptWarehouseId, 10);
      if (Number.isNaN(wid)) throw new Error("warehouse");
      const items = lines
        .map((l) => ({
          product_id: Number.parseInt(l.product_id, 10),
          qty: Number.parseFloat(l.qty.replace(",", "."))
        }))
        .filter((l) => Number.isFinite(l.product_id) && l.product_id > 0 && Number.isFinite(l.qty) && l.qty > 0);
      if (!items.length) throw new Error("items");
      await api.post(`/api/${tenantSlug}/stock/receipts`, {
        warehouse_id: wid,
        items
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["stock", tenantSlug] });
      setLines((prev) => prev.map((l) => ({ ...l, qty: "" })));
    }
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, warehouseId }: { file: File; warehouseId: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      const w = warehouseId.trim();
      if (w) fd.append("warehouse_id", w);
      const { data } = await api.post<{
        applied: number;
        errors: string[];
        warnings: string[];
      }>(`/api/${tenantSlug}/stock/import`, fd);
      return data;
    },
    onSuccess: async (data) => {
      setImportErrors(data.errors);
      setImportWarnings(data.warnings);
      setImportSummary(
        `Qo‘llanildi: ${data.applied} qator. Xatolar: ${data.errors.length}, ogohlantirishlar: ${data.warnings.length}.`
      );
      await qc.invalidateQueries({ queryKey: ["stock", tenantSlug] });
    },
    onError: () => {
      setImportSummary(null);
      setImportErrors(["Import so‘rovida xato (tarmoq yoki fayl)."]);
      setImportWarnings([]);
    }
  });

  async function downloadTemplate(kind: "classic" | "postupleniya2") {
    if (!tenantSlug) return;
    const accessToken = useAuthStore.getState().accessToken ?? readPersistedAuth().accessToken;
    if (!accessToken) return;
    const qs = kind === "postupleniya2" ? "?kind=postupleniya2" : "";
    const res = await fetch(`${apiBaseURL}/api/${tenantSlug}/stock/import-template${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      setImportSummary(null);
      setImportErrors(["Shablonni yuklab bo‘lmadi."]);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      kind === "postupleniya2" ? "postupleniya-kirim-shablon.xlsx" : "ombor-kirim-shablon.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authHydrated) {
    return (
      <PageShell>
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-muted-foreground text-sm">Kirish kerak.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Ombor"
        description="Qoldiqlar, prihod va Excel orqali kirim (SKU / shtrix kod bo‘yicha moslashadi). Omborlarni boshqarish alohida sahifada."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
          ← Панель управления
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/warehouses">
          Omborlar boshqaruvi
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/balances">
          Остатки товаров
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/picking">
          Комплектация
        </Link>
        {role === "admin" ? (
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/correction">
            Корректировка склада
          </Link>
        ) : null}
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/receipts">
          Поступление
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-2">
                <Label htmlFor="wh-filter">Filtr: ombor</Label>
                <select
                  id="wh-filter"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  value={filterWarehouseId}
                  onChange={(e) => setFilterWarehouseId(e.target.value)}
                >
                  <option value="">Barcha omborlar</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                title="Filtrlarni standart holatga"
                onClick={() => resetStockFilters()}
              >
                <ListFilter className="size-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-3">
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                title="Yangilash"
                onClick={() => void refetchStock()}
              >
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              </Button>
            </div>

            <TableColumnSettingsDialog
              open={columnDialogOpen}
              onOpenChange={setColumnDialogOpen}
              title="Управление столбцами"
              description="Видимые столбцы и порядок сохраняются для вашей учётной записи."
              columns={[...STOCK_COLS]}
              columnOrder={stockTablePrefs.columnOrder}
              hiddenColumnIds={stockTablePrefs.hiddenColumnIds}
              saving={stockTablePrefs.saving}
              onSave={(next) => stockTablePrefs.saveColumnLayout(next)}
              onReset={() => stockTablePrefs.resetColumnLayout()}
            />

            <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                {visibleStockCols.length === 0 ? (
                  <tbody>
                    <tr>
                      <td className="text-muted-foreground p-8 text-center">
                        Ustunlar yashirilgan. «Управление столбцами» (panjara tugmasi) orqali yoqing.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <>
                    <thead className="app-table-thead text-xs">
                      <tr>
                        {visibleStockCols.map((colId) => (
                          <th
                            key={colId}
                            className={cn(
                              "whitespace-nowrap px-3 py-2.5",
                              STOCK_NUMERIC.has(colId) && "text-right"
                            )}
                          >
                            {colLabelStock(colId)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td
                            colSpan={visibleStockCols.length}
                            className="text-muted-foreground p-6 text-center"
                          >
                            Загрузка…
                          </td>
                        </tr>
                      ) : stock.length === 0 ? (
                        <tr>
                          <td
                            colSpan={visibleStockCols.length}
                            className="text-muted-foreground p-6 text-center"
                          >
                            Qoldiq yo‘q yoki filtr qattiq.
                          </td>
                        </tr>
                      ) : (
                        stock.map((row) => (
                          <tr key={row.id} className="border-t border-border/60">
                            {visibleStockCols.map((colId) => (
                              <td
                                key={colId}
                                className={cn(
                                  "px-3 py-2",
                                  STOCK_NUMERIC.has(colId) && "text-right"
                                )}
                              >
                                {renderStockCell(row, colId)}
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
          </CardContent>
        </Card>

        {role === "admin" && (
          <div className="flex flex-col gap-6">
            <Card className="border-border/60 shadow-sm">
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-sm font-medium">Excel orqali kirim</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <strong>Klassik</strong> shablon: ombor, SKU / shtrix kod, tovar nomi (tekshiruv), miqdor, sana.
                  <strong className="ms-1">«Поступление» (2)</strong> shablon: №, Kod tovar, Kategoriya, Mahsulot,
                  Narx, Miqdor prihod, Miqdor blokda — umumiy dona = prihod × blok (blok bo‘sh yoki 1 bo‘lsa faqat
                  prihod). Agar faylda «Склад» ustuni bo‘lmasa, pastdagi omborni tanlang.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="import-wh">Import: ombor (postupleniya fayli uchun, ixtiyoriy)</Label>
                  <select
                    id="import-wh"
                    className="border-input bg-background flex h-10 w-full max-w-md rounded-md border px-3 py-2 text-sm"
                    value={importWarehouseId}
                    onChange={(e) => setImportWarehouseId(e.target.value)}
                  >
                    <option value="">— fayldagi «Склад» ishlatiladi —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadTemplate("classic")}
                  >
                    Shablon (klassik)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadTemplate("postupleniya2")}
                  >
                    Shablon «Поступление»
                  </Button>
                  <input
                    ref={excelRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) importMutation.mutate({ file: f, warehouseId: importWarehouseId });
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={importMutation.isPending}
                    onClick={() => excelRef.current?.click()}
                  >
                    {importMutation.isPending ? "Import…" : "Excel faylni tanlash"}
                  </Button>
                </div>
                {importSummary && (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{importSummary}</p>
                )}
                {importWarnings.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                    <p className="font-medium text-amber-900 dark:text-amber-200">Ogohlantirishlar</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                      {importWarnings.slice(0, 12).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                      {importWarnings.length > 12 && (
                        <li>… yana {importWarnings.length - 12} ta</li>
                      )}
                    </ul>
                  </div>
                )}
                {importErrors.length > 0 && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-900 dark:bg-rose-950/40">
                    <p className="font-medium text-rose-900 dark:text-rose-200">Xatolar</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-rose-900/90 dark:text-rose-200/90">
                      {importErrors.slice(0, 15).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                      {importErrors.length > 15 && <li>… yana {importErrors.length - 15} ta</li>}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-sm font-medium">Qo‘lda prihod (kirim)</h3>
                <div className="space-y-2">
                  <Label htmlFor="wh-receipt">Ombor</Label>
                  <FilterSelect
                    id="wh-receipt"
                    className="flex h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    emptyLabel="Ombor"
                    aria-label="Ombor"
                    value={receiptWarehouseId}
                    onChange={(e) => setReceiptWarehouseId(e.target.value)}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </FilterSelect>
                  <p className="text-muted-foreground text-xs">
                    Ombor tanlanganda barcha mahsulotlar ro‘yxatga chiqadi — faqat kerakli qatorlarga miqdor yozing (0
                    yoki bo‘sh qatorlar yuborilmaydi).
                  </p>
                </div>

                {!receiptWarehouseId ? (
                  <p className="text-muted-foreground text-sm">Avval omborni tanlang.</p>
                ) : productsLoading ? (
                  <p className="text-muted-foreground text-sm">Mahsulotlar Загрузка…</p>
                ) : lines.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Mahsulot yo‘q — avval katalogga SKU qo‘shing.</p>
                ) : (
                  <div className="max-h-[min(28rem,55vh)] space-y-2 overflow-y-auto rounded-md border p-2">
                    <div className="text-muted-foreground grid grid-cols-[1fr_auto] gap-2 border-b pb-2 text-xs font-medium">
                      <span>Mahsulot</span>
                      <span className="w-28 text-right">Miqdor</span>
                    </div>
                    {lines.map((line) => {
                      const p = products.find((x) => String(x.id) === line.product_id);
                      return (
                        <div key={line.product_id} className="grid grid-cols-[1fr_auto] items-center gap-2 py-1">
                          <span className="truncate text-sm" title={p ? `${p.sku} — ${p.name}` : line.product_id}>
                            {p ? (
                              <>
                                <span className="font-mono text-xs">{p.sku}</span>
                                <span className="text-muted-foreground"> — </span>
                                {p.name}
                              </>
                            ) : (
                              line.product_id
                            )}
                          </span>
                          <Input
                            className="h-9 w-28"
                            inputMode="decimal"
                            value={line.qty}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) =>
                                prev.map((l) => (l.product_id === line.product_id ? { ...l, qty: v } : l))
                              );
                            }}
                            placeholder="0"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {receiptMutation.isError && (
                  <p className="text-destructive text-sm">
                    Kirimni saqlab bo‘lmadi (ombor, mahsulot yoki miqdorni tekshiring).
                  </p>
                )}
                {receiptMutation.isSuccess && (
                  <p className="text-sm text-emerald-600">Prihod qo‘llandi.</p>
                )}

                <Button
                  type="button"
                  disabled={receiptMutation.isPending || !receiptWarehouseId}
                  onClick={() => receiptMutation.mutate()}
                >
                  {receiptMutation.isPending ? "Saqlanmoqda…" : "Prihodni tasdiqlash"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export default function StockPage() {
  return <StockPageContent />;
}
