"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { FileSpreadsheet, Filter, LayoutGrid, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TabKey = "journal" | "correction" | "inventory";

type JournalRow = {
  id: number;
  occurred_at: string;
  created_at: string;
  kind: string;
  warehouse_id: number;
  warehouse_name: string;
  created_by_name: string | null;
  total_qty_delta: string;
  total_volume_m3: string;
  total_amount: string;
  currency: string;
  comment: string | null;
  line_count: number;
  price_type: string | null;
};

type WorkspaceRow = {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  qty: string;
  reserved_qty: string;
  available_qty: string;
  price: string | null;
  currency: string | null;
};

type ProductCategoryRow = { id: number; name: string; is_active?: boolean };

const JOURNAL_TABLE_ID = "stock.warehouse_correction_journal.v1";
const JOURNAL_COLS = [
  { id: "occurred_at", label: "Дата" },
  { id: "created_by_name", label: "Создано" },
  { id: "kind", label: "Тип" },
  { id: "warehouse_name", label: "Склад" },
  { id: "total_qty_delta", label: "Кол-во" },
  { id: "total_volume_m3", label: "Объём" },
  { id: "total_amount", label: "Сумма" },
  { id: "comment", label: "Комментарий" }
] as const;
const JOURNAL_DEFAULT_ORDER = JOURNAL_COLS.map((c) => c.id);
const JOURNAL_NUMERIC = new Set(["total_qty_delta", "total_volume_m3", "total_amount"]);

function kindLabel(kind: string): string {
  if (kind === "inventory_count") return "Инвентаризация";
  return "Корректировка";
}

function parseNum(s: string): number {
  const n = Number.parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Sinxron maydonlar uchun qisqa matn (delta / fakt). */
function qtyToInputString(n: number): string {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 1e6) / 1e6;
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
  const s = r.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

/** Joriy qoldiq + korreksiya / fakt qatoridan delta. */
function resolveWorkspaceDelta(
  qty: number,
  productId: number,
  rowCorrection: Record<number, string>,
  rowFact: Record<number, string>
): { delta: number; hasInput: boolean } {
  const dStr = rowCorrection[productId]?.trim();
  const fStr = rowFact[productId]?.trim();
  if (dStr) {
    const d = Number.parseFloat(dStr.replace(",", "."));
    if (Number.isFinite(d)) return { delta: d, hasInput: true };
  }
  if (fStr) {
    const f = Number.parseFloat(fStr.replace(",", "."));
    if (Number.isFinite(f)) return { delta: f - qty, hasInput: true };
  }
  return { delta: 0, hasInput: false };
}

function formatDateTimeRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function colLabelJournal(id: string): string {
  return JOURNAL_COLS.find((c) => c.id === id)?.label ?? id;
}

function renderJournalCell(row: JournalRow, colId: string): ReactNode {
  switch (colId) {
    case "occurred_at":
      return (
        <span className="text-primary font-medium">{formatDateTimeRu(row.occurred_at)}</span>
      );
    case "created_by_name":
      return row.created_by_name ?? "—";
    case "kind":
      return kindLabel(row.kind);
    case "warehouse_name":
      return row.warehouse_name;
    case "total_qty_delta":
      return (
        <span
          className={cn(
            "tabular-nums",
            parseNum(row.total_qty_delta) < 0 && "text-destructive font-medium"
          )}
        >
          {formatNumberGrouped(row.total_qty_delta, { maxFractionDigits: 3 })}
        </span>
      );
    case "total_volume_m3":
      return (
        <span className="tabular-nums">
          {formatNumberGrouped(row.total_volume_m3, { maxFractionDigits: 6 })}
        </span>
      );
    case "total_amount":
      return (
        <span
          className={cn(
            "tabular-nums",
            parseNum(row.total_amount) < 0 && "text-destructive font-medium"
          )}
        >
          {formatNumberGrouped(row.total_amount, { minFractionDigits: 0, maxFractionDigits: 2 })}{" "}
          {row.currency}
        </span>
      );
    case "comment":
      return row.comment?.trim() ? row.comment : "—";
    default:
      return "—";
  }
}

export default function StockCorrectionPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const tabParam = (searchParams.get("tab") as TabKey | null) ?? "journal";
  const tab: TabKey =
    tabParam === "correction" || tabParam === "inventory" ? tabParam : "journal";

  const setTab = useCallback(
    (next: TabKey) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", next);
      router.replace(`/stock/correction?${p.toString()}`);
    },
    [router, searchParams]
  );

  const journalPrefs = useUserTablePrefs({
    tenantSlug,
    tableId: JOURNAL_TABLE_ID,
    defaultColumnOrder: JOURNAL_DEFAULT_ORDER,
    defaultPageSize: 10,
    allowedPageSizes: [10, 20, 25, 50, 100]
  });
  const visibleJournalCols = journalPrefs.visibleColumnOrder;
  const [journalDialogOpen, setJournalDialogOpen] = useState(false);
  const [journalPage, setJournalPage] = useState(1);
  const journalPageSizes = [10, 20, 25, 50, 100] as const;

  const [jWarehouseId, setJWarehouseId] = useState("");
  const [jKind, setJKind] = useState<string>("");
  const [jSearch, setJSearch] = useState("");
  const [jDebounced, setJDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setJDebounced(jSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [jSearch]);

  useEffect(() => {
    setJournalPage(1);
  }, [jDebounced]);

  const [wWarehouseId, setWWarehouseId] = useState("");
  const [wPriceType, setWPriceType] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDebounced, setCategoryDebounced] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [rowCorrection, setRowCorrection] = useState<Record<number, string>>({});
  const [rowPrice, setRowPrice] = useState<Record<number, string>>({});
  /** Корр. rejimida: остаток после; инв. — реальный остаток (delta bilan sinxron). */
  const [rowFact, setRowFact] = useState<Record<number, string>>({});
  const [occurredAtLocal, setOccurredAtLocal] = useState("");
  const [wComment, setWComment] = useState("");
  const [wError, setWError] = useState<string | null>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug) && role === "admin",
    staleTime: STALE.reference
  });

  const { data: journalResult, isFetching: journalFetching, refetch: refetchJournal } = useQuery({
    queryKey: [
      "stock-corrections",
      tenantSlug,
      jWarehouseId,
      jKind,
      jDebounced,
      journalPrefs.pageSize,
      journalPage
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(journalPage));
      params.set("limit", String(journalPrefs.pageSize));
      if (jWarehouseId) params.set("warehouse_id", jWarehouseId);
      if (jKind) params.set("kind", jKind);
      if (jDebounced) params.set("q", jDebounced);
      const { data } = await api.get<{ data: JournalRow[]; total: number }>(
        `/api/${tenantSlug}/stock/corrections?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(tenantSlug) && role === "admin" && tab === "journal",
    staleTime: STALE.list
  });

  const { data: priceTypes = [] } = useQuery({
    queryKey: ["correction-price-types", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(
        `/api/${tenantSlug}/stock/correction-price-types`
      );
      return data.data;
    },
    enabled: Boolean(tenantSlug) && role === "admin" && (tab === "correction" || tab === "inventory"),
    staleTime: STALE.reference
  });

  useEffect(() => {
    if (categorySearch === "") {
      setCategoryDebounced("");
      return;
    }
    const t = window.setTimeout(() => setCategoryDebounced(categorySearch.trim()), 280);
    return () => window.clearTimeout(t);
  }, [categorySearch]);

  const { data: categoriesRaw = [] } = useQuery({
    queryKey: ["product-categories-correction", tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductCategoryRow[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data.filter((c) => c.is_active !== false);
    },
    enabled:
      Boolean(tenantSlug) && role === "admin" && (tab === "correction" || tab === "inventory"),
    staleTime: STALE.reference
  });

  const categoriesFiltered = useMemo(() => {
    const q = categoryDebounced.toLowerCase().trim();
    if (!q) return categoriesRaw;
    return categoriesRaw.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesRaw, categoryDebounced]);

  const wid = Number.parseInt(wWarehouseId, 10);
  const {
    data: workspaceRows = [],
    isLoading: workspaceLoading,
    isFetching: workspaceFetching,
    isPlaceholderData: workspaceIsPlaceholder,
    isError: workspaceIsError,
    error: workspaceError,
    refetch: refetchWorkspace
  } = useQuery({
    queryKey: ["correction-workspace", tenantSlug, wWarehouseId, selectedCategoryId, wPriceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("warehouse_id", wWarehouseId);
      params.set("category_id", String(selectedCategoryId));
      if (wPriceType.trim()) params.set("price_type", wPriceType.trim());
      const { data } = await api.get<{ data: WorkspaceRow[] }>(
        `/api/${tenantSlug}/stock/correction-workspace?${params.toString()}`
      );
      return data.data;
    },
    enabled:
      Boolean(tenantSlug) &&
      role === "admin" &&
      (tab === "correction" || tab === "inventory") &&
      Number.isFinite(wid) &&
      wid > 0 &&
      selectedCategoryId != null &&
      selectedCategoryId > 0,
    staleTime: STALE.detail,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData
  });

  function workspaceErrorText(): string {
    type ErrBody = {
      error?: string;
      message?: string;
      details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    };
    const ax = workspaceError as AxiosError<ErrBody> | undefined;
    const st = ax?.response?.status;
    const body = ax?.response?.data;
    const code = body?.error;
    if (st === 403) return "Ruxsat yo‘q (faqat administrator).";
    if (code === "BadWarehouse") return "Ombor topilmadi yoki boshqa tashkilotga tegishli.";
    if (code === "ValidationError") {
      const fe = body?.details?.fieldErrors;
      const firstField = fe && Object.values(fe).find((a) => a?.length)?.[0];
      const formErr = body?.details?.formErrors?.[0];
      const hint = firstField ?? formErr;
      return hint
        ? `So‘rov tekshiruvi: ${hint}`
        : "Filtrlarni tekshiring (ombor, kategoriya).";
    }
    if (st === 400) return "So‘rov noto‘g‘ri yoki filtr tanlanmagan.";
    if (st === 404) return "API topilmadi — backend yangilanganligini tekshiring.";
    return ax?.message ?? "Ma’lumot yuklanmadi (tarmoq yoki server).";
  }

  useEffect(() => {
    if (!workspaceRows.length) return;
    setRowPrice((prev) => {
      const next = { ...prev };
      for (const r of workspaceRows) {
        if (next[r.product_id] === undefined && r.price != null) {
          next[r.product_id] = r.price.replace(/\s/g, "").replace(",", ".");
        }
      }
      return next;
    });
  }, [workspaceRows]);

  useEffect(() => {
    if (tab !== "correction" && tab !== "inventory") return;
    if (!occurredAtLocal) {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setOccurredAtLocal(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
  }, [tab, occurredAtLocal]);

  const handleDeltaInput = useCallback((productId: number, qty: number, value: string) => {
    setRowCorrection((prev) => ({ ...prev, [productId]: value }));
    const t = value.trim();
    if (t === "") {
      setRowFact((prev) => {
        const n = { ...prev };
        delete n[productId];
        return n;
      });
      return;
    }
    const d = Number.parseFloat(t.replace(",", "."));
    if (!Number.isFinite(d)) return;
    setRowFact((prev) => ({ ...prev, [productId]: qtyToInputString(qty + d) }));
  }, []);

  const handleFactInput = useCallback((productId: number, qty: number, value: string) => {
    setRowFact((prev) => ({ ...prev, [productId]: value }));
    const t = value.trim();
    if (t === "") {
      setRowCorrection((prev) => {
        const n = { ...prev };
        delete n[productId];
        return n;
      });
      return;
    }
    const f = Number.parseFloat(t.replace(",", "."));
    if (!Number.isFinite(f)) return;
    setRowCorrection((prev) => ({ ...prev, [productId]: qtyToInputString(f - qty) }));
  }, []);

  const resetRowInputs = useCallback(() => {
    setRowCorrection({});
    setRowFact({});
    setWError(null);
  }, []);

  useEffect(() => {
    setWWarehouseId("");
    setJWarehouseId("");
    setSelectedCategoryId(null);
  }, [tenantSlug]);

  /** Korrektirovka / inventarizatsiya: ombor bo‘sh bo‘lsa, ro‘yxatdan birinchisini tanlash (xatosiz workspace so‘rovi). */
  useEffect(() => {
    if (tab !== "correction" && tab !== "inventory") return;
    if (wWarehouseId) return;
    const first = warehouses[0];
    if (first) setWWarehouseId(String(first.id));
  }, [tab, warehouses, wWarehouseId]);

  useEffect(() => {
    resetRowInputs();
  }, [selectedCategoryId, wWarehouseId, wPriceType, tab, resetRowInputs]);

  const bulkMutation = useMutation({
    mutationFn: async (payload: {
      kind: "correction" | "inventory_count";
      items: { product_id: number; delta: number; price_unit?: number | null }[];
    }) => {
      const wh = Number.parseInt(wWarehouseId, 10);
      const iso =
        occurredAtLocal && !Number.isNaN(new Date(occurredAtLocal).getTime())
          ? new Date(occurredAtLocal).toISOString()
          : new Date().toISOString();
      await api.post(`/api/${tenantSlug}/stock/corrections/bulk`, {
        warehouse_id: wh,
        kind: payload.kind,
        price_type: wPriceType.trim() || null,
        occurred_at: iso,
        comment: wComment.trim() || null,
        items: payload.items
      });
    },
    onSuccess: async () => {
      setWError(null);
      setWComment("");
      resetRowInputs();
      await qc.invalidateQueries({ queryKey: ["correction-workspace", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["stock", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["stock-corrections", tenantSlug] });
      setJournalPage(1);
      setTab("journal");
    },
    onError: (err) => {
      const ax = err as AxiosError<{ error?: string }>;
      const code = ax.response?.data?.error;
      const st = ax.response?.status;
      if (st === 403) {
        setWError("Saqlashga ruxsat yo‘q.");
        return;
      }
      if (code === "ValidationError") {
        setWError("Ma’lumotlarni tekshiring (delta, ombor).");
        return;
      }
      const map: Record<string, string> = {
        NegativeQty: "Qoldiq manfiy bo‘lib qoladi.",
        BelowReserved: "Qoldiq rezervdan past.",
        BadDelta: "Noto‘g‘ri delta.",
        BadWarehouse: "Ombor noto‘g‘ri.",
        BadProduct: "Mahsulot topilmadi.",
        TooManyLines: "Juda ko‘p qator (max 500).",
        EmptyItems: "Bo‘sh ro‘yxat."
      };
      setWError(map[code ?? ""] ?? `Saqlashda xato${st ? ` (${st})` : ""}. DB migratsiyasi qo‘llanganmi?`);
    }
  });

  const buildItemsFromWorkspace = useMemo(() => {
    return (): { product_id: number; delta: number; price_unit?: number | null }[] => {
      const out: { product_id: number; delta: number; price_unit?: number | null }[] = [];
      for (const r of workspaceRows) {
        const qty = parseNum(r.qty);
        const { delta, hasInput } = resolveWorkspaceDelta(
          qty,
          r.product_id,
          rowCorrection,
          rowFact
        );
        if (!hasInput || !Number.isFinite(delta) || delta === 0) continue;
        const avail = parseNum(r.available_qty);
        if (delta < 0 && delta < -avail - 1e-9) continue;
        const pRaw = rowPrice[r.product_id]?.trim();
        const price_unit =
          pRaw != null && pRaw !== "" && Number.isFinite(Number.parseFloat(pRaw.replace(",", ".")))
            ? Number.parseFloat(pRaw.replace(",", "."))
            : null;
        out.push({ product_id: r.product_id, delta, price_unit });
      }
      return out;
    };
  }, [workspaceRows, rowCorrection, rowFact, rowPrice]);

  const workspaceTotals = useMemo(() => {
    let sumDelta = 0;
    let sumAmount = 0;
    let linesTouched = 0;
    for (const r of workspaceRows) {
      const qty = parseNum(r.qty);
      const avail = parseNum(r.available_qty);
      const minDelta = -avail;
      const { delta, hasInput } = resolveWorkspaceDelta(
        qty,
        r.product_id,
        rowCorrection,
        rowFact
      );
      if (!hasInput || !Number.isFinite(delta) || delta === 0 || delta < minDelta - 1e-9) continue;
      linesTouched += 1;
      sumDelta += delta;
      const pStr = rowPrice[r.product_id] ?? "";
      const pu = Number.parseFloat(pStr.replace(",", "."));
      if (pStr.trim() !== "" && Number.isFinite(pu)) sumAmount += delta * pu;
    }
    return { sumDelta, sumAmount, linesTouched };
  }, [workspaceRows, rowCorrection, rowFact, rowPrice]);

  const journalTotal = journalResult?.total ?? 0;
  const journalPages = Math.max(1, Math.ceil(journalTotal / journalPrefs.pageSize));

  useEffect(() => {
    if (journalPage > journalPages) setJournalPage(journalPages);
  }, [journalPage, journalPages]);

  function handleSaveBulk() {
    const items = buildItemsFromWorkspace();
    if (!items.length) {
      setWError("Укажите корректировку или фактический остаток хотя бы в одной строке.");
      return;
    }
    bulkMutation.mutate({
      kind: tab === "inventory" ? "inventory_count" : "correction",
      items
    });
  }

  function exportJournalExcel() {
    const rows = journalResult?.data ?? [];
    const headers = visibleJournalCols.map(colLabelJournal);
    const lines = rows.map((row) =>
      visibleJournalCols.map((colId) => {
        if (colId === "occurred_at") return formatDateTimeRu(row.occurred_at);
        if (colId === "kind") return kindLabel(row.kind);
        if (colId === "total_qty_delta") return row.total_qty_delta;
        if (colId === "total_volume_m3") return row.total_volume_m3;
        if (colId === "total_amount") return `${row.total_amount} ${row.currency}`;
        const cell = renderJournalCell(row, colId);
        if (typeof cell === "string" || typeof cell === "number") return cell;
        return String(cell);
      })
    );
    downloadXlsxSheet(
      `korrektirovka_zhurnal_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Журнал",
      headers,
      lines
    );
  }

  if (!authHydrated) {
    return (
      <PageShell>
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </PageShell>
    );
  }

  if (!tenantSlug || role !== "admin") {
    return (
      <PageShell>
        <PageHeader title="Корректировка склада" description="Faqat administrator." />
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock">
          ← Ombor
        </Link>
      </PageShell>
    );
  }

  const journalRows = journalResult?.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Корректировка склада"
        description="Журнал проведённых документов, ввод корректировки по дельте/факту и инвентаризация по физическому остатку."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock">
          ← Склад
        </Link>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/inventory-counts">
          Инвентаризация (документы)
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        {(
          [
            ["journal", "Журнал"],
            ["correction", "Корректировка склада"],
            ["inventory", "Инвентаризация склада"]
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "default" : "ghost"}
            size="sm"
            className={cn("flex-1 sm:flex-none", tab === key && "shadow-sm")}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "journal" ? (
        <Card className="border-border/80 overflow-hidden shadow-sm">
          <div className="border-border/60 border-b bg-gradient-to-r from-slate-200/90 via-slate-100/70 to-background px-4 py-2.5 dark:from-slate-900 dark:via-slate-950/80 dark:to-background">
            <h2 className="text-sm font-semibold">Журнал корректировок</h2>
            <p className="text-muted-foreground text-xs">Проведённые документы по складу</p>
          </div>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Склад</Label>
                  <select
                    className="border-input bg-background h-10 min-w-[11rem] rounded-md border px-3 text-sm"
                    value={jWarehouseId}
                    onChange={(e) => {
                      setJWarehouseId(e.target.value);
                      setJournalPage(1);
                    }}
                  >
                    <option value="">Все</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Filter className="size-3.5 opacity-70" />
                    Тип документа
                  </Label>
                  <div className="flex rounded-md border border-border/60 bg-background p-0.5">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                        jKind === "" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted/80"
                      )}
                      onClick={() => {
                        setJKind("");
                        setJournalPage(1);
                      }}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                        jKind === "correction"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-muted/80"
                      )}
                      onClick={() => {
                        setJKind("correction");
                        setJournalPage(1);
                      }}
                    >
                      Корректировка склада
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                        jKind === "inventory_count"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-muted/80"
                      )}
                      onClick={() => {
                        setJKind("inventory_count");
                        setJournalPage(1);
                      }}
                    >
                      Инвентаризация склада
                    </button>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                onClick={() => void refetchJournal()}
              >
                Применить
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-b border-border/50 pb-3">
              <div className="flex items-end gap-2 text-sm">
                <span className="pb-2 text-muted-foreground">На странице</span>
                <select
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={journalPrefs.pageSize}
                  onChange={(e) => {
                    journalPrefs.setPageSize(Number.parseInt(e.target.value, 10));
                    setJournalPage(1);
                  }}
                >
                  {journalPageSizes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title="Столбцы"
                onClick={() => setJournalDialogOpen(true)}
              >
                <LayoutGrid className="size-4" />
              </Button>
              <div className="relative min-w-[12rem] max-w-xs flex-1">
                <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Поиск"
                  value={jSearch}
                  onChange={(e) => setJSearch(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={exportJournalExcel}>
                <FileSpreadsheet className="mr-1 size-4" />
                Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => void refetchJournal()}
              >
                <RefreshCw className={cn("size-4", journalFetching && "animate-spin")} />
              </Button>
            </div>

            <TableColumnSettingsDialog
              open={journalDialogOpen}
              onOpenChange={setJournalDialogOpen}
              title="Столбцы журнала"
              description="Порядок и видимость сохраняются в профиле."
              columns={[...JOURNAL_COLS]}
              columnOrder={journalPrefs.columnOrder}
              hiddenColumnIds={journalPrefs.hiddenColumnIds}
              saving={journalPrefs.saving}
              onSave={(next) => journalPrefs.saveColumnLayout(next)}
              onReset={() => journalPrefs.resetColumnLayout()}
            />

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="app-table-thead text-xs">
                  <tr>
                    {visibleJournalCols.map((colId) => (
                      <th
                        key={colId}
                        className={cn(
                          "px-3 py-2.5",
                          JOURNAL_NUMERIC.has(colId) && "text-right"
                        )}
                      >
                        {colLabelJournal(colId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journalRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(1, visibleJournalCols.length)}
                        className="text-muted-foreground p-6 text-center"
                      >
                        Записей нет
                      </td>
                    </tr>
                  ) : (
                    journalRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-border/50 even:bg-muted/15 hover:bg-muted/30"
                      >
                        {visibleJournalCols.map((colId) => (
                          <td
                            key={colId}
                            className={cn("px-3 py-2", JOURNAL_NUMERIC.has(colId) && "text-right")}
                          >
                            {renderJournalCell(row, colId)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Показано{" "}
                {journalTotal === 0
                  ? "0 — 0"
                  : `${(journalPage - 1) * journalPrefs.pageSize + 1} — ${Math.min(journalPage * journalPrefs.pageSize, journalTotal)}`}{" "}
                / {journalTotal}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={journalPage <= 1}
                  onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                <span>
                  {journalPage} / {journalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={journalPage >= journalPages}
                  onClick={() => setJournalPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-sm">
          <div className="border-border/60 flex flex-col gap-2 border-b bg-gradient-to-r from-slate-200/90 via-slate-100/80 to-background px-4 py-3 dark:from-slate-900 dark:via-slate-950/90 dark:to-background sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                {tab === "inventory" ? "Инвентаризация склада" : "Корректировка склада"}
              </h2>
              <p className="text-muted-foreground text-xs">
                {tab === "inventory"
                  ? "Поля «реальный остаток» и «корректировка» связаны с текущим остатком на складе."
                  : "Поля «корректировка» (Δ) и «остаток после» взаимно пересчитываются от текущего остатка."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!wWarehouseId || selectedCategoryId == null || workspaceLoading || workspaceFetching}
              onClick={() => void refetchWorkspace()}
            >
              <RefreshCw
                className={cn("mr-1.5 size-4", (workspaceLoading || workspaceFetching) && "animate-spin")} />
              Обновить таблицу
            </Button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(240px,288px)_1fr]">
            <aside className="border-border/60 bg-muted/10 border-b lg:border-b-0 lg:border-r">
              <div className="text-muted-foreground border-border/50 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                Категории
              </div>
              <div className="space-y-3 p-3">
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Выберите <strong>категорию</strong> в списке ниже.
                </p>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    className="pl-8 text-sm"
                    placeholder="Поиск категории"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[min(60vh,520px)] overflow-auto text-sm">
                  {categoriesFiltered.length === 0 ? (
                    <p className="text-muted-foreground p-2">Категории не найдены</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {categoriesFiltered.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={cn(
                              "hover:bg-muted/80 w-full rounded-r-md border-l-2 border-transparent py-1.5 pl-2 pr-2 text-left text-sm transition-colors",
                              selectedCategoryId === c.id &&
                                "border-primary bg-primary/10 font-medium text-foreground"
                            )}
                            onClick={() => setSelectedCategoryId(c.id)}
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="border-border/50 flex flex-wrap items-end gap-3 border-b bg-background px-3 py-3">
                <div className="space-y-1.5">
                  <Label>Склад</Label>
                  <select
                    className="border-input bg-background h-10 min-w-[12rem] rounded-md border px-3 text-sm"
                    value={wWarehouseId}
                    onChange={(e) => setWWarehouseId(e.target.value)}
                  >
                    <option value="">—</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Тип цены</Label>
                  <select
                    className="border-input bg-background h-10 min-w-[12rem] rounded-md border px-3 text-sm"
                    value={wPriceType}
                    onChange={(e) => setWPriceType(e.target.value)}
                  >
                    <option value="">—</option>
                    {priceTypes.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 p-3">
              {!wWarehouseId || selectedCategoryId == null ? (
                <p className="text-muted-foreground text-sm">
                  Выберите <strong>склад</strong> и слева <strong>категорию</strong>.
                </p>
              ) : workspaceIsError ? (
                <div className="border-destructive/50 bg-destructive/5 space-y-2 rounded-lg border p-4 text-sm">
                  <p className="text-destructive font-medium">{workspaceErrorText()}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void refetchWorkspace()}>
                    Qayta urinish
                  </Button>
                </div>
              ) : workspaceLoading || (workspaceFetching && workspaceRows.length === 0) ? (
                <p className="text-muted-foreground text-sm">Загрузка…</p>
              ) : workspaceRows.length === 0 ? (
                <div className="text-muted-foreground space-y-2 text-sm">
                  <p>
                    В выбранной <strong>категории</strong> нет активных товаров или они привязаны к другой
                    категории.
                  </p>
                  <p>Попробуйте другую категорию или поиск.</p>
                </div>
              ) : (
                <div
                  className={cn(
                    "overflow-x-auto rounded-md border border-border/80 shadow-sm transition-opacity",
                    workspaceIsPlaceholder && workspaceFetching && "pointer-events-none opacity-60"
                  )}
                >
                  <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="app-table-thead sticky top-0 z-[1] text-xs">
                      <tr>
                        <th className="px-2 py-2.5">Код</th>
                        <th className="px-2 py-2.5">Наименование</th>
                        <th className="px-2 py-2.5 text-center">Ед.</th>
                        <th className="px-2 py-2.5 text-right">Остаток (текущий)</th>
                        <th className="px-2 py-2.5 text-right">Бронь</th>
                        <th className="px-2 py-2.5 text-right">Доступный</th>
                        {tab === "inventory" ? (
                          <th className="px-2 py-2.5 text-right">Реальный остаток (инв.)</th>
                        ) : null}
                        <th className="px-2 py-2.5 text-right">Корректировка</th>
                        {tab === "correction" ? (
                          <th className="px-2 py-2.5 text-right">Остаток после корр.</th>
                        ) : null}
                        <th className="px-2 py-2.5 text-right">Цена</th>
                        <th className="px-2 py-2.5 text-right">Сумма корр.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspaceRows.map((r) => {
                        const qty = parseNum(r.qty);
                        const avail = parseNum(r.available_qty);
                        const minDelta = -avail;
                        const { delta, hasInput } = resolveWorkspaceDelta(
                          qty,
                          r.product_id,
                          rowCorrection,
                          rowFact
                        );
                        const deltaInvalid =
                          hasInput && Number.isFinite(delta) && delta < minDelta - 1e-9;
                        const pStr = rowPrice[r.product_id] ?? "";
                        const pu = Number.parseFloat(pStr.replace(",", "."));
                        const sum =
                          hasInput &&
                          Number.isFinite(delta) &&
                          delta !== 0 &&
                          Number.isFinite(pu) &&
                          pStr.trim() !== ""
                            ? delta * pu
                            : null;
                        return (
                          <tr
                            key={r.product_id}
                            className="border-t border-border/50 even:bg-muted/20 hover:bg-muted/40"
                          >
                            <td className="px-2 py-1.5 font-mono text-xs">{r.sku}</td>
                            <td className="max-w-[200px] truncate px-2 py-1.5" title={r.name}>
                              {r.name}
                            </td>
                            <td className="text-muted-foreground px-2 py-1.5 text-center text-xs">
                              {r.unit}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatNumberGrouped(r.qty, { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatNumberGrouped(r.reserved_qty, { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatNumberGrouped(r.available_qty, { maxFractionDigits: 3 })}
                            </td>
                            {tab === "inventory" ? (
                              <td className="px-1 py-1">
                                <Input
                                  className={cn(
                                    "h-8 text-right tabular-nums",
                                    deltaInvalid && "border-destructive"
                                  )}
                                  inputMode="decimal"
                                  title={
                                    deltaInvalid
                                      ? `Мин. Δ ${formatNumberGrouped(minDelta, { maxFractionDigits: 3 })}`
                                      : undefined
                                  }
                                  value={rowFact[r.product_id] ?? ""}
                                  onChange={(e) =>
                                    handleFactInput(r.product_id, qty, e.target.value)
                                  }
                                />
                              </td>
                            ) : null}
                            <td className="px-1 py-1">
                              <Input
                                className={cn(
                                  "h-8 text-right tabular-nums",
                                  deltaInvalid && "border-destructive"
                                )}
                                inputMode="decimal"
                                title={
                                  deltaInvalid
                                    ? `Мин. Δ ${formatNumberGrouped(minDelta, { maxFractionDigits: 3 })}`
                                    : undefined
                                }
                                value={rowCorrection[r.product_id] ?? ""}
                                onChange={(e) =>
                                  handleDeltaInput(r.product_id, qty, e.target.value)
                                }
                              />
                            </td>
                            {tab === "correction" ? (
                              <td className="px-1 py-1">
                                <Input
                                  className={cn(
                                    "h-8 text-right tabular-nums",
                                    deltaInvalid && "border-destructive"
                                  )}
                                  inputMode="decimal"
                                  value={rowFact[r.product_id] ?? ""}
                                  onChange={(e) =>
                                    handleFactInput(r.product_id, qty, e.target.value)
                                  }
                                />
                              </td>
                            ) : null}
                            <td className="px-1 py-1">
                              <Input
                                className="h-8 text-right tabular-nums"
                                inputMode="decimal"
                                value={rowPrice[r.product_id] ?? ""}
                                onChange={(e) =>
                                  setRowPrice((prev) => ({
                                    ...prev,
                                    [r.product_id]: e.target.value
                                  }))
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {sum != null && sum !== 0
                                ? formatNumberGrouped(sum, { maxFractionDigits: 2 })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {workspaceRows.length > 0 && !workspaceLoading && !workspaceIsError && wWarehouseId && selectedCategoryId != null ? (
                <div className="bg-muted/40 border-border/60 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    Строк с изменением:{" "}
                    <strong className="text-foreground">{workspaceTotals.linesTouched}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Σ Δ:{" "}
                    <strong
                      className={cn(
                        "tabular-nums text-foreground",
                        workspaceTotals.sumDelta < 0 && "text-destructive",
                        workspaceTotals.sumDelta > 0 && "text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      {formatNumberGrouped(workspaceTotals.sumDelta, { maxFractionDigits: 3 })}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Σ сумма:{" "}
                    <strong className="tabular-nums text-foreground">
                      {formatNumberGrouped(workspaceTotals.sumAmount, { maxFractionDigits: 2 })}
                    </strong>
                  </span>
                </div>
              ) : null}
              </div>

              <div className="border-border/60 bg-muted/15 flex flex-wrap items-end justify-end gap-3 border-t px-3 py-4">
                <div className="space-y-1.5">
                  <Label>Дата / время</Label>
                  <Input
                    type="datetime-local"
                    className="w-auto"
                    value={occurredAtLocal}
                    onChange={(e) => setOccurredAtLocal(e.target.value)}
                  />
                </div>
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  <Label>Комментарий</Label>
                  <Input
                    value={wComment}
                    onChange={(e) => setWComment(e.target.value)}
                    maxLength={2000}
                  />
                </div>
                <Button
                  type="button"
                  className="min-w-[8rem] bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
                  disabled={
                    bulkMutation.isPending ||
                    !wWarehouseId ||
                    selectedCategoryId == null ||
                    selectedCategoryId <= 0 ||
                    workspaceLoading ||
                    workspaceFetching
                  }
                  onClick={handleSaveBulk}
                >
                  {bulkMutation.isPending ? "…" : "Сохранить"}
                </Button>
              </div>
              {wError ? (
                <p className="text-destructive px-3 pb-3 text-sm">{wError}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
