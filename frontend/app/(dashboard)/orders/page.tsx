"use client";

import type { OrderDetailRow, OrderListRow } from "@/components/orders/order-detail-view";
import { NakladnoyExportSettingsDialog } from "@/components/orders/nakladnoy-export-settings-dialog";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import {
  dataTableStickyActionsTdSingle,
  dataTableStickyActionsThSingle,
  TableRowActionGroup
} from "@/components/data-table/table-row-actions";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import axios from "axios";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import {
  ORDER_LIST_COLUMNS,
  ORDER_LIST_COLUMN_IDS,
  ORDERS_LIST_TABLE_ID,
  orderListExportCell
} from "@/lib/orders-list-columns";
import {
  DEFAULT_NAKLADNOY_EXPORT_PREFS,
  downloadOrdersNakladnoyXlsx,
  loadNakladnoyExportPrefs,
  NAKLADNOY_TEMPLATE_OPTIONS,
  type NakladnoyExportPrefs,
  type NakladnoyTemplateId
} from "@/lib/order-nakladnoy";
import {
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VALUES
} from "@/lib/order-status";
import { ORDER_TYPE_FILTER_OPTIONS, ORDER_TYPE_LABELS, ORDER_TYPES, ORDER_TYPE_VALUES, orderTypeLabel, orderTypeColor } from "@/lib/order-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Calculator, Copy, Download, Eye, ListOrdered, RefreshCw, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const VALID_STATUSES = new Set<string>(ORDER_STATUS_VALUES);
const VALID_ORDER_TYPES = new Set<string>(ORDER_TYPE_VALUES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type OrdersUrlFilters = {
  status: string;
  order_type: string;
  page: number;
  warehouse_id: string;
  agent_id: string;
  expeditor_id: string;
  date_from: string;
  date_to: string;
  client_id: string;
  product_id: string;
  client_category: string;
};

function parseOrdersUrl(searchParams: URLSearchParams): OrdersUrlFilters {
  const rawStatus = searchParams.get("status")?.trim() ?? "";
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : "";
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const wh = searchParams.get("warehouse_id")?.trim() ?? "";
  const warehouse_id = /^\d+$/.test(wh) ? wh : "";
  const ag = searchParams.get("agent_id")?.trim() ?? "";
  const agent_id = /^\d+$/.test(ag) ? ag : "";
  const ex = searchParams.get("expeditor_id")?.trim() ?? "";
  const expeditor_id = /^\d+$/.test(ex) ? ex : "";
  const df = searchParams.get("date_from")?.trim() ?? "";
  const date_from = ISO_DATE_RE.test(df) ? df : "";
  const dt = searchParams.get("date_to")?.trim() ?? "";
  const date_to = ISO_DATE_RE.test(dt) ? dt : "";
  const cr = searchParams.get("client_id")?.trim() ?? "";
  const client_id = /^\d+$/.test(cr) ? cr : "";
  const pr = searchParams.get("product_id")?.trim() ?? "";
  const product_id = /^\d+$/.test(pr) ? pr : "";
  const client_category = (searchParams.get("client_category")?.trim() ?? "").slice(0, 128);
  const rawOrderType = searchParams.get("order_type")?.trim() ?? "";
  const order_type = VALID_ORDER_TYPES.has(rawOrderType) ? rawOrderType : "";
  return {
    status,
    order_type,
    page,
    warehouse_id,
    agent_id,
    expeditor_id,
    date_from,
    date_to,
    client_id,
    product_id,
    client_category
  };
}

type OrdersResponse = {
  data: OrderListRow[];
  total: number;
  page: number;
  limit: number;
};

type BulkOrderStatusResponse = {
  updated: number[];
  failed: { id: number; error: string; from?: string; to?: string }[];
};

type BulkExpeditorResponse = {
  updated: number[];
  failed: { id: number; error: string }[];
};

function parseNumField(s: string): number {
  const n = Number.parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function buildPaymentPrefillFromSelection(
  list: OrderListRow[],
  ids: Set<number>
): { href: string; note: string | null } {
  const sel = list.filter((r) => ids.has(r.id));
  if (sel.length === 0) {
    return { href: "/payments/new", note: null };
  }
  const clientSet = new Set(sel.map((r) => r.client_id));
  if (clientSet.size > 1) {
    return {
      href: "/payments/new",
      note: "Tanlov turli mijozlar — kassada mijozni qo‘lda tanlang."
    };
  }
  const clientId = sel[0]!.client_id;
  const sum = sel.reduce((acc, r) => acc + parseNumField(r.total_sum), 0);
  const p = new URLSearchParams();
  p.set("client_id", String(clientId));
  if (sel.length === 1) {
    p.set("order_id", String(sel[0]!.id));
  }
  if (sum > 0) {
    p.set("amount", sum.toFixed(2));
  }
  return {
    href: `/payments/new?${p.toString()}`,
    note: sel.length > 1 ? `${sel.length} ta zakaz yig‘indisi (summa maydonga qo‘yilgan).` : null
  };
}

function rowStatusPatchError(err: unknown): string {
  if (!axios.isAxiosError(err)) return getUserFacingError(err, "Holatni yangilab bo‘lmadi.");
  const code = (err.response?.data as { error?: string } | undefined)?.error;
  if (code === "InvalidTransition") return "Bu holatga o‘tish mumkin emas.";
  if (code === "ForbiddenRevert") return "Oldingi bosqichga qaytarish faqat admin uchun.";
  if (code === "ForbiddenReopenCancelled") return "Bekor qilingan zakazni qayta ochish faqat admin uchun.";
  if (code === "ForbiddenOperatorCancelLate") return "Bu bosqichda bekor qilish taqiqlangan.";
  if (code === "NotFound") return "Zakaz topilmadi.";
  return getUserFacingError(err, "Holatni yangilab bo‘lmadi.");
}

function OrdersFilterStubSelect({ label }: { label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span className="truncate">{label}</span>
      <select
        disabled
        className="h-9 w-full cursor-not-allowed rounded-md border border-input bg-muted/30 px-2 text-sm opacity-80"
        title="API — позже"
      >
        <option>—</option>
      </select>
    </label>
  );
}

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = useMemo(() => parseOrdersUrl(searchParams), [searchParams]);
  const clientIdFromUrl = filters.client_id;

  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const effectiveRole = useEffectiveRole();
  const qc = useQueryClient();
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [nakladnoyTemplate, setNakladnoyTemplate] = useState<NakladnoyTemplateId>("nakladnoy_warehouse");
  const [nakladnoyPrefs, setNakladnoyPrefs] = useState<NakladnoyExportPrefs>(DEFAULT_NAKLADNOY_EXPORT_PREFS);
  const [nakladnoySettingsOpen, setNakladnoySettingsOpen] = useState(false);
  const [nakladnoyFeedback, setNakladnoyFeedback] = useState<string | null>(null);
  const [statusRowError, setStatusRowError] = useState<Record<number, string>>({});
  /** UI: Lalaku — «Дата отгрузки»; API hozircha faqat `created_at` oralig‘i */
  const [dateFieldMode, setDateFieldMode] = useState<"created" | "order" | "ship">("ship");
  const [totalsDialogOpen, setTotalsDialogOpen] = useState(false);
  const [bulkExpeditorChoice, setBulkExpeditorChoice] = useState<string>("");
  const [bulkExpFeedback, setBulkExpFeedback] = useState<string | null>(null);

  useEffect(() => {
    setNakladnoyPrefs(loadNakladnoyExportPrefs());
  }, []);

  const canBulkCatalog = effectiveRole === "admin" || effectiveRole === "operator";

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: ORDERS_LIST_TABLE_ID,
    defaultColumnOrder: [...ORDER_LIST_COLUMN_IDS],
    defaultPageSize: 30,
    allowedPageSizes: [15, 20, 30, 50, 100]
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim().slice(0, 200)), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const replaceOrdersQuery = useCallback(
    (patch: Partial<OrdersUrlFilters>) => {
      const cur = parseOrdersUrl(searchParams);
      const next: OrdersUrlFilters = {
        status: patch.status !== undefined ? patch.status : cur.status,
        order_type: patch.order_type !== undefined ? patch.order_type : cur.order_type,
        page: patch.page !== undefined ? patch.page : cur.page,
        warehouse_id: patch.warehouse_id !== undefined ? patch.warehouse_id : cur.warehouse_id,
        agent_id: patch.agent_id !== undefined ? patch.agent_id : cur.agent_id,
        expeditor_id: patch.expeditor_id !== undefined ? patch.expeditor_id : cur.expeditor_id,
        date_from: patch.date_from !== undefined ? patch.date_from : cur.date_from,
        date_to: patch.date_to !== undefined ? patch.date_to : cur.date_to,
        client_id: patch.client_id !== undefined ? patch.client_id : cur.client_id,
        product_id: patch.product_id !== undefined ? patch.product_id : cur.product_id,
        client_category:
          patch.client_category !== undefined ? patch.client_category : cur.client_category
      };
      const p = new URLSearchParams();
      if (next.status) p.set("status", next.status);
      if (next.order_type) p.set("order_type", next.order_type);
      if (next.page > 1) p.set("page", String(next.page));
      if (next.warehouse_id) p.set("warehouse_id", next.warehouse_id);
      if (next.agent_id) p.set("agent_id", next.agent_id);
      if (next.expeditor_id) p.set("expeditor_id", next.expeditor_id);
      if (next.date_from) p.set("date_from", next.date_from);
      if (next.date_to) p.set("date_to", next.date_to);
      if (next.client_id) p.set("client_id", next.client_id);
      if (next.product_id) p.set("product_id", next.product_id);
      if (next.client_category) p.set("client_category", next.client_category);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const prevDebouncedSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDebouncedSearchRef.current === null) {
      prevDebouncedSearchRef.current = debouncedSearch;
      return;
    }
    if (prevDebouncedSearchRef.current === debouncedSearch) return;
    prevDebouncedSearchRef.current = debouncedSearch;
    const cur = parseOrdersUrl(searchParams);
    if (cur.page <= 1) return;
    replaceOrdersQuery({ page: 1 });
  }, [debouncedSearch, replaceOrdersQuery, searchParams]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "orders",
      tenantSlug,
      filters.page,
      filters.status,
      filters.order_type,
      filters.client_id,
      filters.warehouse_id,
      filters.agent_id,
      filters.expeditor_id,
      filters.date_from,
      filters.date_to,
      filters.product_id,
      filters.client_category,
      debouncedSearch,
      tablePrefs.pageSize,
      dateFieldMode
    ],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(tablePrefs.pageSize)
      });
      if (filters.status.trim()) params.set("status", filters.status.trim());
      if (filters.order_type) params.set("order_type", filters.order_type);
      if (filters.client_id) params.set("client_id", filters.client_id);
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (filters.warehouse_id) params.set("warehouse_id", filters.warehouse_id);
      if (filters.agent_id) params.set("agent_id", filters.agent_id);
      if (filters.expeditor_id) params.set("expeditor_id", filters.expeditor_id);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.product_id) params.set("product_id", filters.product_id);
      if (filters.client_category) params.set("client_category", filters.client_category);
      if (dateFieldMode !== "created") params.set("date_mode", dateFieldMode);
      const { data: body } = await api.get<OrdersResponse>(
        `/api/${tenantSlug}/orders?${params.toString()}`
      );
      return body;
    }
  });

  const rows = data?.data ?? [];

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "orders-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return body.data ?? [];
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "orders-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<{ data: { id: number; fio: string; code: string | null }[] }>(
        `/api/${tenantSlug}/agents`
      );
      return body.data ?? [];
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "orders-toolbar"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<{ data: { id: number; fio: string; code: string | null }[] }>(
        `/api/${tenantSlug}/expeditors`
      );
      return body.data ?? [];
    }
  });

  const productsFilterQ = useQuery({
    queryKey: ["products", tenantSlug, "orders-filter"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: { id: number; name: string; sku: string }[];
      }>(`/api/${tenantSlug}/products?page=1&limit=100&is_active=true`);
      return body.data ?? [];
    }
  });

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedOrderIds.has(r.id)),
    [rows, selectedOrderIds]
  );

  const selectionTotals = useMemo(() => {
    let qty = 0;
    let total = 0;
    let discount = 0;
    let bonusQty = 0;
    for (const r of selectedRows) {
      qty += parseNumField(r.qty);
      total += parseNumField(r.total_sum);
      discount += parseNumField(r.discount_sum ?? "0");
      bonusQty += parseNumField(r.bonus_qty ?? "0");
    }
    return {
      count: selectedRows.length,
      qty,
      total,
      discount,
      bonusQty
    };
  }, [selectedRows]);

  const paymentPrefill = useMemo(
    () => buildPaymentPrefillFromSelection(rows, selectedOrderIds),
    [rows, selectedOrderIds]
  );

  const rowStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await api.patch(`/api/${tenantSlug}/orders/${id}/status`, { status });
    },
    onSuccess: (_void, { id }) => {
      setStatusRowError((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["order", tenantSlug, id] });
    },
    onError: (err: unknown, { id }) => {
      setStatusRowError((prev) => ({ ...prev, [id]: rowStatusPatchError(err) }));
    }
  });

  const nakladnoyMut = useMutation({
    mutationFn: async (payload: { template: NakladnoyTemplateId; prefs: NakladnoyExportPrefs }) => {
      await downloadOrdersNakladnoyXlsx({
        tenantSlug: tenantSlug!,
        orderIds: Array.from(selectedOrderIds),
        template: payload.template,
        prefs: payload.prefs
      });
    },
    onSuccess: () => {
      setNakladnoyFeedback("Excel fayl yuklab olindi.");
    },
    onError: (err: unknown) => {
      setNakladnoyFeedback(getUserFacingError(err, "Nakladnoyni yuklab bo‘lmadi."));
    }
  });

  const bulkExpeditorMut = useMutation({
    mutationFn: async (payload: { order_ids: number[]; expeditor_user_id: number | null }) => {
      const { data } = await api.post<BulkExpeditorResponse>(
        `/api/${tenantSlug}/orders/bulk/expeditor`,
        payload
      );
      return data;
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      const n = res.failed.length;
      setBulkExpFeedback(
        n === 0
          ? `${res.updated.length} ta zakaz yangilandi.`
          : `${res.updated.length} ta OK, ${n} ta xato.`
      );
      setBulkExpeditorChoice("");
    },
    onError: (err: unknown) => {
      setBulkExpFeedback(getUserFacingError(err, "Ekspeditorni yangilab bo‘lmadi."));
    }
  });

  const bulkStatusMut = useMutation({
    mutationFn: async (payload: { order_ids: number[]; status: string }) => {
      const { data } = await api.post<BulkOrderStatusResponse>(
        `/api/${tenantSlug}/orders/bulk/status`,
        payload
      );
      return data;
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      setSelectedOrderIds(new Set());
      setBulkTargetStatus("");
      if (res.failed.length > 0) {
        setBulkFeedback(
          `Yangilandi: ${res.updated.length}. O‘tmadi: ${res.failed.length} (ID: ${res.failed
            .slice(0, 8)
            .map((f) => f.id)
            .join(", ")}${res.failed.length > 8 ? "…" : ""})`
        );
      } else {
        setBulkFeedback(null);
      }
    },
    onError: (err: unknown) => {
      setBulkFeedback(getUserFacingError(err, "Guruh holatini o‘zgartirib bo‘lmadi."));
    }
  });

  const allOnPageSelected =
    rows.length > 0 && rows.every((o) => selectedOrderIds.has(o.id));

  function toggleOrderSelect(id: number) {
    setSelectedOrderIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setBulkFeedback(null);
    setNakladnoyFeedback(null);
  }

  function toggleSelectAllOnPage() {
    setSelectedOrderIds((prev) => {
      const n = new Set(prev);
      const ids = rows.map((o) => o.id);
      if (allOnPageSelected) {
        ids.forEach((id) => n.delete(id));
      } else {
        ids.forEach((id) => n.add(id));
      }
      return n;
    });
    setBulkFeedback(null);
    setNakladnoyFeedback(null);
  }

  function renderOrderDataCell(colId: string, o: OrderListRow): ReactNode {
    switch (colId) {
      case "number":
        return (
          <div className="flex items-center gap-1">
            <Link
              href={`/orders/${o.id}`}
              className="font-mono text-xs text-primary underline-offset-2 hover:underline"
            >
              {o.number}
            </Link>
            <button
              type="button"
              className="inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Raqamni nusxalash"
              aria-label="Nusxa"
              onClick={() => void navigator.clipboard?.writeText(o.number)}
            >
              <Copy className="size-3.5 shrink-0" aria-hidden />
            </button>
          </div>
        );
      case "order_type": {
        const color = orderTypeColor(o.order_type);
        return <span className={`rounded-md px-2 py-0.5 text-xs ${color}`}>{orderTypeLabel(o.order_type)}</span>;
      }
      case "created_at":
        return <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</span>;
      case "expected_ship_date":
        return o.expected_ship_date ? new Date(o.expected_ship_date).toLocaleDateString() : "—";
      case "shipped_at":
        return o.shipped_at ? new Date(o.shipped_at).toLocaleDateString() : "—";
      case "delivered_at":
        return o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : "—";
      case "status": {
        const canPatch = effectiveRole === "admin" || effectiveRole === "operator";
        const allowed = o.allowed_next_statuses ?? [];
        const optionSet = new Set<string>([o.status, ...allowed]);
        const ordered = ORDER_STATUS_VALUES.filter((v) => optionSet.has(v));
        const err = statusRowError[o.id];
        if (!canPatch || ordered.length <= 1) {
          return (
            <span className="inline-flex flex-col gap-0.5 align-top">
              <span className="w-fit rounded-md bg-muted px-2 py-0.5 text-xs">
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </span>
              {err ? <span className="max-w-[12rem] text-[10px] text-destructive">{err}</span> : null}
            </span>
          );
        }
        return (
          <span className="inline-flex flex-col gap-0.5 align-top">
            <select
              className="h-8 min-w-[9rem] max-w-[14rem] rounded-md border border-input bg-background px-1.5 text-xs"
              value={o.status}
              disabled={
                rowStatusMut.isPending && rowStatusMut.variables?.id === o.id
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === o.status) return;
                rowStatusMut.mutate({ id: o.id, status: v });
              }}
              aria-label="Zakaz holati"
            >
              {ordered.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
            {err ? <span className="max-w-[12rem] text-[10px] text-destructive">{err}</span> : null}
          </span>
        );
      }
      case "client_name":
        return (
          <Link
            href={`/clients/${o.client_id}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {o.client_name}
          </Link>
        );
      case "client_legal_name":
        return o.client_legal_name ?? "—";
      case "client_id":
        return (
          <Link
            href={`/clients/${o.client_id}`}
            className="font-mono text-xs text-primary underline-offset-2 hover:underline"
          >
            #{o.client_id}
          </Link>
        );
      case "qty":
        return <span className="tabular-nums">{o.qty}</span>;
      case "total_sum":
        return <span className="tabular-nums">{o.total_sum}</span>;
      case "discount_sum": {
        const n = parseNumField(o.discount_sum ?? "0");
        return (
          <span className="tabular-nums text-xs text-amber-900 dark:text-amber-200">
            {n > 0 ? n.toLocaleString("uz-UZ", { maximumFractionDigits: 0 }) : "—"}
          </span>
        );
      }
      case "bonus_qty": {
        const n = parseNumField(o.bonus_qty ?? "0");
        return (
          <span className="tabular-nums text-xs text-emerald-800 dark:text-emerald-300">
            {n > 0 ? n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 }) : "—"}
          </span>
        );
      }
      case "balance":
        return o.balance ?? "—";
      case "debt":
        return o.debt ?? "—";
      case "price_type":
        return o.price_type ?? "—";
      case "warehouse_name":
        return o.warehouse_name ?? "—";
      case "agent_name":
        return o.agent_name ?? "—";
      case "agent_code":
        return o.agent_code ?? "—";
      case "expeditors":
        return o.expeditor_display ?? o.expeditors ?? "—";
      case "region":
        return o.region ?? "—";
      case "city":
        return o.city ?? "—";
      case "zone":
        return o.zone ?? "—";
      case "consignment":
        return o.consignment == null ? "—" : o.consignment ? "Ha" : "Yo‘q";
      case "day":
        return o.day ?? "—";
      case "created_by":
        return o.created_by ?? "—";
      case "comment":
        return o.comment ?? "—";
      case "created_by_role":
        return o.created_by_role ?? "—";
      default:
        return "—";
    }
  }

  return (
    <PageShell>
      {clientIdFromUrl ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm shadow-sm">
          <span className="text-xs text-muted-foreground">
            Фильтр: клиент <span className="font-mono font-medium text-foreground">#{clientIdFromUrl}</span>
          </span>
          <Link className="text-xs text-primary underline-offset-2 hover:underline" href="/orders">
            Все заявки
          </Link>
          <Link
            className="text-xs text-primary underline-offset-2 hover:underline"
            href={`/clients/${clientIdFromUrl}`}
          >
            Карточка клиента
          </Link>
        </div>
      ) : null}

      <Card className="border-border/90 bg-card/90 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Заявки</h1>
              {data ? (
                <span className="text-sm text-muted-foreground">
                  Всего: <span className="font-medium text-foreground">{data.total}</span>
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm xl:flex-1 xl:justify-center">
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={dateFieldMode === "order"}
                  onChange={() => setDateFieldMode("order")}
                />
                <span>Дата заказа</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={dateFieldMode === "ship"}
                  onChange={() => setDateFieldMode("ship")}
                />
                <span>Дата отгрузки</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={dateFieldMode === "created"}
                  onChange={() => setDateFieldMode("created")}
                />
                <span>Дата создания</span>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="sr-only">С даты</span>
                <Input
                  type="date"
                  className="h-9 w-[11rem]"
                  value={filters.date_from}
                  onChange={(e) => replaceOrdersQuery({ date_from: e.target.value, page: 1 })}
                />
              </label>
              <span className="pb-2 text-muted-foreground">—</span>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="sr-only">По дату</span>
                <Input
                  type="date"
                  className="h-9 w-[11rem]"
                  value={filters.date_to}
                  onChange={(e) => replaceOrdersQuery({ date_to: e.target.value, page: 1 })}
                />
              </label>
              {tenantSlug ? (
                <Link
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "h-9 shrink-0 border-0 bg-blue-600 text-white hover:bg-blue-700"
                  )}
                  href="/orders/new"
                >
                  + Создать заказ
                </Link>
              ) : (
                <Button type="button" size="sm" className="h-9 shrink-0" disabled>
                  + Создать заказ
                </Button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Интервал дат на сервере пока фильтрует по{" "}
            <span className="font-medium text-foreground">дате создания</span>; режимы «заказ / отгрузка» —
            подготовка под API.
          </p>

          {tenantSlug ? (
            <>
              <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Статус
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.status}
                    onChange={(e) => replaceOrdersQuery({ status: e.target.value, page: 1 })}
                  >
                    <option value="">Все статусы</option>
                    {ORDER_STATUS_FILTER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Тип
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.order_type}
                    onChange={(e) => replaceOrdersQuery({ order_type: e.target.value, page: 1 })}
                  >
                    <option value="">Все типы</option>
                    {ORDER_TYPE_FILTER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <OrdersFilterStubSelect label="Тип накладной" />
                <OrdersFilterStubSelect label="Способ оплаты" />
                <OrdersFilterStubSelect label="Тип цены" />
                <OrdersFilterStubSelect label="День" />
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Категория клиента
                  <Input
                    className="h-9"
                    placeholder="Напр. VIP"
                    maxLength={128}
                    value={filters.client_category}
                    onChange={(e) => replaceOrdersQuery({ client_category: e.target.value, page: 1 })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Клиенты (ID)
                  <Input
                    className="h-9 font-mono text-sm"
                    inputMode="numeric"
                    placeholder="ID"
                    value={filters.client_id}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                      replaceOrdersQuery({ client_id: v, page: 1 });
                    }}
                  />
                </label>
                <OrdersFilterStubSelect label="Категория продукта" />
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Продукт
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.product_id}
                    onChange={(e) => replaceOrdersQuery({ product_id: e.target.value, page: 1 })}
                    disabled={productsFilterQ.isLoading}
                  >
                    <option value="">Все</option>
                    {(productsFilterQ.data ?? []).map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.sku ? `${p.name} (${p.sku})` : p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 xl:items-end">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Склад
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.warehouse_id}
                    onChange={(e) => replaceOrdersQuery({ warehouse_id: e.target.value, page: 1 })}
                  >
                    <option value="">Все</option>
                    {(warehousesQ.data ?? []).map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Агент
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.agent_id}
                    onChange={(e) => replaceOrdersQuery({ agent_id: e.target.value, page: 1 })}
                  >
                    <option value="">Все</option>
                    {(agentsQ.data ?? []).map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.code ? `${a.fio} (${a.code})` : a.fio}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Экспедиторы
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filters.expeditor_id}
                    onChange={(e) => replaceOrdersQuery({ expeditor_id: e.target.value, page: 1 })}
                  >
                    <option value="">Все</option>
                    {(expeditorsQ.data ?? []).map((ex) => (
                      <option key={ex.id} value={String(ex.id)}>
                        {ex.code ? `${ex.fio} (${ex.code})` : ex.fio}
                      </option>
                    ))}
                  </select>
                </label>
                <OrdersFilterStubSelect label="Консигнация" />
                <OrdersFilterStubSelect label="Направление торговли" />
                <OrdersFilterStubSelect label="Территория 1" />
                <OrdersFilterStubSelect label="Территория 2" />
                <OrdersFilterStubSelect label="Территория 3" />
                <div className="flex items-end xl:col-span-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-full bg-teal-700 text-white hover:bg-teal-800 sm:w-auto"
                    onClick={() => void refetch()}
                  >
                    Применить
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={
                    !filters.warehouse_id &&
                    !filters.agent_id &&
                    !filters.expeditor_id &&
                    !filters.date_from &&
                    !filters.date_to &&
                    !filters.product_id &&
                    !filters.client_category &&
                    !filters.client_id &&
                    !filters.order_type &&
                    !filters.status
                  }
                  onClick={() =>
                    replaceOrdersQuery({
                      warehouse_id: "",
                      agent_id: "",
                      expeditor_id: "",
                      date_from: "",
                      date_to: "",
                      product_id: "",
                      client_category: "",
                      client_id: "",
                      order_type: "",
                      status: "",
                      page: 1
                    })
                  }
                >
                  Сбросить фильтры
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {tenantSlug ? (
        <div
          className="table-toolbar mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2"
          role="toolbar"
          aria-label="Таблица: поиск и экспорт"
        >
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={tablePrefs.pageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                tablePrefs.setPageSize(n);
                replaceOrdersQuery({ page: 1 });
              }}
            >
              {[15, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="relative min-w-[12rem] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 pl-9"
              title="Номер, клиент, комментарий"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setColumnDialogOpen(true)}>
            <ListOrdered className="mr-1 h-4 w-4" />
            Колонки
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => {
              const order = tablePrefs.visibleColumnOrder;
              const headers = order.map(
                (id) => ORDER_LIST_COLUMNS.find((c) => c.id === id)?.label ?? id
              );
              const dataRows = rows.map((o) => order.map((colId) => orderListExportCell(o, colId)));
              downloadXlsxSheet(
                `zakazlar_${new Date().toISOString().slice(0, 10)}.xlsx`,
                "Zakazlar",
                headers,
                dataRows
              );
            }}
          >
            Excel
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <TableColumnSettingsDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        title="Ustunlarni boshqarish"
        description="Ko‘rinadigan ustunlar va tartib. Sizning akkauntingiz uchun saqlanadi (server)."
        columns={ORDER_LIST_COLUMNS}
        columnOrder={tablePrefs.columnOrder}
        hiddenColumnIds={tablePrefs.hiddenColumnIds}
        saving={tablePrefs.saving}
        onSave={(next) => tablePrefs.saveColumnLayout(next)}
        onReset={() => tablePrefs.resetColumnLayout()}
      />

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <QueryErrorState message={getUserFacingError(error, "Zakazlarni yuklab bo'lmadi.")} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data?.total === 0
            ? "Filtr yoki qidiruv bo‘yicha zakaz topilmadi."
            : "Hozircha zakaz yo‘q."}
        </p>
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Joriy sahifadagi barcha zakazlarni tanlash"
                      />
                    </th>
                    {tablePrefs.visibleColumnOrder.map((colId) => {
                      const label = ORDER_LIST_COLUMNS.find((c) => c.id === colId)?.label ?? colId;
                      const right =
                        colId === "qty" ||
                          colId === "total_sum" ||
                          colId === "discount_sum" ||
                          colId === "bonus_qty";
                      return (
                        <th
                          key={colId}
                          className={cn("px-3 py-2", right && "text-right")}
                        >
                          {label}
                        </th>
                      );
                    })}
                    <th className={cn("text-muted-foreground", dataTableStickyActionsThSingle)}>
                      <span className="sr-only">Tafsilot</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={selectedOrderIds.has(o.id)}
                          onChange={() => toggleOrderSelect(o.id)}
                          aria-label={`Zakaz ${o.number} ni tanlash`}
                        />
                      </td>
                      {tablePrefs.visibleColumnOrder.map((colId) => {
                        const right =
                          colId === "qty" ||
                          colId === "total_sum" ||
                          colId === "discount_sum" ||
                          colId === "bonus_qty";
                        return (
                          <td
                            key={colId}
                            className={cn(
                              "px-3 py-2",
                              right && "text-right tabular-nums",
                              colId === "number" && "font-mono text-xs",
                              (colId === "created_at" ||
                                colId === "discount_sum" ||
                                colId === "bonus_qty") &&
                                "text-xs text-muted-foreground"
                            )}
                          >
                            {renderOrderDataCell(colId, o)}
                          </td>
                        );
                      })}
                      <td className={dataTableStickyActionsTdSingle}>
                        <TableRowActionGroup className="justify-end" ariaLabel="Zakaz">
                          <Link
                            href={`/orders/${o.id}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "icon-sm" }),
                              "text-primary hover:bg-primary/10 hover:text-primary"
                            )}
                            prefetch={false}
                            title="Tafsilot"
                            aria-label="Tafsilot"
                            onMouseEnter={() => {
                              if (!tenantSlug) return;
                              void qc.prefetchQuery({
                                queryKey: ["order", tenantSlug, o.id],
                                staleTime: 45 * 1000,
                                queryFn: async () => {
                                  const { data: body } = await api.get<OrderDetailRow>(
                                    `/api/${tenantSlug}/orders/${o.id}`
                                  );
                                  return body;
                                }
                              });
                            }}
                          >
                            <Eye className="size-3.5" aria-hidden />
                          </Link>
                        </TableRowActionGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.total > data.limit ? (
              <div className="table-content-footer flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/20 px-3 py-2 text-sm sm:px-4">
                <span className="text-muted-foreground">
                  Sahifa{" "}
                  <span className="font-medium tabular-nums text-foreground">{filters.page}</span> /{" "}
                  <span className="tabular-nums">{Math.max(1, Math.ceil(data.total / data.limit))}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => replaceOrdersQuery({ page: Math.max(1, filters.page - 1) })}
                  >
                    Oldingi
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page * data.limit >= data.total}
                    onClick={() => replaceOrdersQuery({ page: filters.page + 1 })}
                  >
                    Keyingi
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {tenantSlug && selectedOrderIds.size > 0 ? (
        <div className="flex flex-col gap-0 rounded-lg border border-border bg-muted/50 text-sm shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-medium text-foreground">
              Guruh ishlashi: <span className="tabular-nums">{selectedOrderIds.size}</span> ta zakaz
            </span>
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Holatni o‘zgartirish</span>
              <select
                className="h-9 min-w-[11rem] rounded-md border border-input bg-background px-2 text-sm"
                value={bulkTargetStatus}
                onChange={(e) => {
                  setBulkTargetStatus(e.target.value);
                  setBulkFeedback(null);
                }}
              >
                <option value="">— Holatni tanlang —</option>
                {ORDER_STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!bulkTargetStatus || bulkStatusMut.isPending}
              onClick={() => {
                setBulkFeedback(null);
                bulkStatusMut.mutate({
                  order_ids: Array.from(selectedOrderIds),
                  status: bulkTargetStatus
                });
              }}
            >
              Qo‘llash
            </Button>
            {canBulkCatalog ? (
              <>
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Ekspeditor (guruh)</span>
                  <select
                    className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
                    value={bulkExpeditorChoice}
                    onChange={(e) => {
                      setBulkExpeditorChoice(e.target.value);
                      setBulkExpFeedback(null);
                    }}
                  >
                    <option value="">— Tanlang —</option>
                    <option value="__clear__">Yechish (bo‘sh)</option>
                    {(expeditorsQ.data ?? []).map((ex) => (
                      <option key={ex.id} value={String(ex.id)}>
                        {ex.code ? `${ex.fio} (${ex.code})` : ex.fio}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="bg-orange-600 text-white hover:bg-orange-700"
                  disabled={!bulkExpeditorChoice || bulkExpeditorMut.isPending}
                  onClick={() => {
                    setBulkExpFeedback(null);
                    const v = bulkExpeditorChoice;
                    let expeditor_user_id: number | null;
                    if (v === "__clear__") {
                      expeditor_user_id = null;
                    } else {
                      const n = Number.parseInt(v, 10);
                      if (!Number.isFinite(n) || n < 1) return;
                      expeditor_user_id = n;
                    }
                    bulkExpeditorMut.mutate({
                      order_ids: Array.from(selectedOrderIds),
                      expeditor_user_id
                    });
                  }}
                >
                  Ekspeditorni qo‘llash
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="bg-sky-700 text-white hover:bg-sky-800"
              onClick={() => setTotalsDialogOpen(true)}
            >
              <Calculator className="mr-1 size-4" aria-hidden />
              Itoglar
            </Button>
            {canBulkCatalog ? (
              <Button
                type="button"
                size="sm"
                className="bg-teal-700 text-white hover:bg-teal-800"
                onClick={() => {
                  setDownloadsOpen((v) => !v);
                  setNakladnoyFeedback(null);
                }}
                aria-expanded={downloadsOpen}
              >
                <Download className="mr-1 size-4" aria-hidden />
                Yuklashlar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedOrderIds(new Set());
                setBulkTargetStatus("");
                setBulkFeedback(null);
                setBulkExpeditorChoice("");
                setBulkExpFeedback(null);
                setDownloadsOpen(false);
                setNakladnoySettingsOpen(false);
                setNakladnoyFeedback(null);
              }}
            >
              Tanlovni bekor qilish
            </Button>
            {bulkFeedback ? (
              <span className="w-full text-xs text-muted-foreground sm:w-auto">{bulkFeedback}</span>
            ) : null}
            {bulkExpFeedback ? (
              <span className="w-full text-xs text-muted-foreground sm:w-auto">{bulkExpFeedback}</span>
            ) : null}
          </div>

          {canBulkCatalog && downloadsOpen ? (
            <div className="space-y-3 border-t border-border/80 bg-background/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Excel (.xlsx): «Загруз зав.склада 5.1.8» yoki «Накладные 2.1.0». Sozlamalar (shtrix-kod, varaqlarga ajratish)
                pastdagi tishli tugma orqali — brauzerda saqlanadi.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-[14rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Накладные
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
                    value={nakladnoyTemplate}
                    onChange={(e) => {
                      setNakladnoyTemplate(e.target.value as NakladnoyTemplateId);
                      setNakladnoyFeedback(null);
                    }}
                  >
                    {NAKLADNOY_TEMPLATE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  title="Nakladnoy sozlamalari"
                  aria-label="Nakladnoy sozlamalari"
                  onClick={() => setNakladnoySettingsOpen(true)}
                >
                  <Settings className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-teal-700 text-white hover:bg-teal-800"
                  disabled={nakladnoyMut.isPending}
                  onClick={() => {
                    setNakladnoyFeedback(null);
                    nakladnoyMut.mutate({ template: nakladnoyTemplate, prefs: nakladnoyPrefs });
                  }}
                >
                  {nakladnoyMut.isPending ? "Tayyorlanmoqda…" : "Bitta faylda yuklab olish"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Joriy sozlamalar:</span>{" "}
                {nakladnoyPrefs.codeColumn === "barcode" ? "Штрих-код" : "Код (SKU)"}
                {" · "}
                {nakladnoyPrefs.separateSheets
                  ? `Varaqlarga ajratish: ${
                      nakladnoyPrefs.groupBy === "territory"
                        ? "hudud"
                        : nakladnoyPrefs.groupBy === "agent"
                          ? "agent"
                          : "ekspeditor"
                    }`
                  : nakladnoyTemplate === "nakladnoy_expeditor"
                    ? "Bitta varaqda barcha zakazlar (2.1.0, ustma-ust)"
                    : "Barcha zakazlar bitta jadvalda (5.1.8)"}
                {nakladnoyTemplate === "nakladnoy_expeditor" && nakladnoyPrefs.separateSheets
                  ? " · 2.1.0: har guruh alohida varaq, ichida zakazlar ustma-ust"
                  : null}
              </p>
              {nakladnoyFeedback ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  {nakladnoyFeedback}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tenantSlug && authHydrated ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 text-sm shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Moliya</span>
            <Link
              href="/payments"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-xs text-muted-foreground"
              )}
            >
              Barcha to‘lovlar
            </Link>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Link
              href={paymentPrefill.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-teal-700/60 font-medium text-teal-900 hover:bg-teal-50 dark:text-teal-100 dark:hover:bg-teal-950/50"
              )}
            >
              {selectedOrderIds.size > 0
                ? "Kassaga kirim (tanlanganlar)"
                : "Yangi to‘lov (kassa)"}
            </Link>
            {paymentPrefill.note ? (
              <span className="max-w-md text-[11px] text-muted-foreground">{paymentPrefill.note}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog open={totalsDialogOpen} onOpenChange={setTotalsDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Tanlangan zakazlar bo‘yicha itoglar</DialogTitle>
            <DialogDescription>
              Joriy sahifadan tanlangan qatorlar (serverdan qayta hisoblanmagan).
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Zakazlar soni</dt>
              <dd className="font-medium tabular-nums">{selectionTotals.count}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami miqdor (qty)</dt>
              <dd className="font-medium tabular-nums">
                {selectionTotals.qty.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami summa</dt>
              <dd className="font-medium tabular-nums">
                {selectionTotals.total.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami skidka</dt>
              <dd className="font-medium tabular-nums">
                {selectionTotals.discount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Jami bonus (dona)</dt>
              <dd className="font-medium tabular-nums">
                {selectionTotals.bonusQty.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>

      <NakladnoyExportSettingsDialog
        open={nakladnoySettingsOpen}
        onOpenChange={setNakladnoySettingsOpen}
        prefs={nakladnoyPrefs}
        onSave={setNakladnoyPrefs}
      />
    </PageShell>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
