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
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import axios from "axios";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import { useUserTablePrefs } from "@/hooks/use-user-table-prefs";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { formatGroupedInteger, formatNumberGrouped } from "@/lib/format-numbers";
import {
  paymentMethodSelectOptions,
  type ProfilePaymentMethodEntry
} from "@/lib/payment-method-options";
import { STALE } from "@/lib/query-stale";
import {
  formatOrderListDebtAsClientLiability,
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
import { ORDER_TYPE_FILTER_OPTIONS, ORDER_TYPE_VALUES, orderTypeLabel, orderTypeColor } from "@/lib/order-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Calculator,
  CalendarDays,
  Copy,
  Download,
  Eye,
  ListOrdered,
  RefreshCw,
  Settings
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const VALID_STATUSES = new Set<string>(ORDER_STATUS_VALUES);
const VALID_ORDER_TYPES = new Set<string>(ORDER_TYPE_VALUES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_DATE_MODES = new Set<OrdersDateMode>(["created", "order", "ship"]);

type OrdersDateMode = "created" | "order" | "ship";

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
  date_mode: OrdersDateMode;
  /** URL: true | false | "" */
  is_consignment: "" | "true" | "false";
  product_category_id: string;
  payment_type: string;
  payment_method_ref: string;
};

type OrdersFilterVisibility = {
  status: boolean;
  orderType: boolean;
  nakladnoyType: boolean;
  paymentMethod: boolean;
  /** Платёж по заказу (client_payments.payment_type) */
  paymentLinkedType: boolean;
  priceType: boolean;
  day: boolean;
  clientCategory: boolean;
  clientId: boolean;
  productCategory: boolean;
  product: boolean;
  warehouse: boolean;
  agent: boolean;
  expeditor: boolean;
  consignment: boolean;
  tradeDirection: boolean;
  territory1: boolean;
  territory2: boolean;
  territory3: boolean;
};

const ORDERS_FILTER_VISIBILITY_STORAGE_KEY = "salesdoc.orders.filter-visibility.v1";
const DEFAULT_ORDERS_FILTER_VISIBILITY: OrdersFilterVisibility = {
  status: true,
  orderType: true,
  nakladnoyType: true,
  paymentMethod: true,
  paymentLinkedType: true,
  priceType: true,
  day: true,
  clientCategory: true,
  clientId: true,
  productCategory: true,
  product: true,
  warehouse: true,
  agent: true,
  expeditor: true,
  consignment: true,
  tradeDirection: true,
  territory1: true,
  territory2: true,
  territory3: true
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
  const rawDm = (searchParams.get("date_mode")?.trim().toLowerCase() ?? "") as OrdersDateMode;
  const date_mode: OrdersDateMode = VALID_DATE_MODES.has(rawDm) ? rawDm : "ship";
  const icRaw = searchParams.get("is_consignment")?.trim().toLowerCase() ?? "";
  const is_consignment: "" | "true" | "false" =
    icRaw === "true" || icRaw === "1" || icRaw === "yes"
      ? "true"
      : icRaw === "false" || icRaw === "0" || icRaw === "no"
        ? "false"
        : "";
  const pc = searchParams.get("product_category_id")?.trim() ?? "";
  const product_category_id = /^\d+$/.test(pc) ? pc : "";
  const payment_type = (searchParams.get("payment_type")?.trim() ?? "").slice(0, 64);
  const payment_method_ref = (searchParams.get("payment_method_ref")?.trim() ?? "").slice(0, 64);
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
    client_category,
    date_mode,
    is_consignment,
    product_category_id,
    payment_type,
    payment_method_ref
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
    <label className="orders-filter-field-label min-w-0">
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
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [nakladnoyTemplate, setNakladnoyTemplate] = useState<NakladnoyTemplateId>("nakladnoy_warehouse");
  const [nakladnoyPrefs, setNakladnoyPrefs] = useState<NakladnoyExportPrefs>(DEFAULT_NAKLADNOY_EXPORT_PREFS);
  const [nakladnoySettingsOpen, setNakladnoySettingsOpen] = useState(false);
  const [nakladnoyFeedback, setNakladnoyFeedback] = useState<string | null>(null);
  const [statusRowError, setStatusRowError] = useState<Record<number, string>>({});
  const [totalsDialogOpen, setTotalsDialogOpen] = useState(false);
  const [bulkExpeditorChoice, setBulkExpeditorChoice] = useState<string>("");
  const [bulkExpFeedback, setBulkExpFeedback] = useState<string | null>(null);
  const [filterVisibilityOpen, setFilterVisibilityOpen] = useState(false);
  const [filterVisibility, setFilterVisibility] = useState<OrdersFilterVisibility>(
    DEFAULT_ORDERS_FILTER_VISIBILITY
  );
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const ordersDateRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [ordersDateRangeOpen, setOrdersDateRangeOpen] = useState(false);

  useEffect(() => {
    setNakladnoyPrefs(loadNakladnoyExportPrefs());
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORDERS_FILTER_VISIBILITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<OrdersFilterVisibility>;
      setFilterVisibility({
        ...DEFAULT_ORDERS_FILTER_VISIBILITY,
        ...parsed,
        paymentLinkedType:
          parsed.paymentLinkedType ?? DEFAULT_ORDERS_FILTER_VISIBILITY.paymentLinkedType
      });
    } catch {
      setFilterVisibility(DEFAULT_ORDERS_FILTER_VISIBILITY);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ORDERS_FILTER_VISIBILITY_STORAGE_KEY,
        JSON.stringify(filterVisibility)
      );
    } catch {
      // noop: localStorage unavailable
    }
  }, [filterVisibility]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!filterVisibilityOpen) return;
      const target = e.target as Node | null;
      if (target && filterPanelRef.current?.contains(target)) return;
      setFilterVisibilityOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [filterVisibilityOpen]);

  const canBulkCatalog = effectiveRole === "admin" || effectiveRole === "operator";

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: ORDERS_LIST_TABLE_ID,
    defaultColumnOrder: [...ORDER_LIST_COLUMN_IDS],
    defaultPageSize: 30,
    allowedPageSizes: [15, 20, 30, 50, 100]
  });

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
          patch.client_category !== undefined ? patch.client_category : cur.client_category,
        date_mode: patch.date_mode !== undefined ? patch.date_mode : cur.date_mode,
        is_consignment: patch.is_consignment !== undefined ? patch.is_consignment : cur.is_consignment,
        product_category_id:
          patch.product_category_id !== undefined ? patch.product_category_id : cur.product_category_id,
        payment_type: patch.payment_type !== undefined ? patch.payment_type : cur.payment_type,
        payment_method_ref:
          patch.payment_method_ref !== undefined ? patch.payment_method_ref : cur.payment_method_ref
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
      if (next.date_mode !== "ship") p.set("date_mode", next.date_mode);
      if (next.is_consignment === "true") p.set("is_consignment", "true");
      if (next.is_consignment === "false") p.set("is_consignment", "false");
      if (next.product_category_id) p.set("product_category_id", next.product_category_id);
      if (next.payment_type) p.set("payment_type", next.payment_type);
      if (next.payment_method_ref) p.set("payment_method_ref", next.payment_method_ref);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
      filters.date_mode,
      filters.is_consignment,
      filters.product_category_id,
      filters.payment_type,
      filters.payment_method_ref,
      filters.product_id,
      filters.client_category,
      tablePrefs.pageSize
    ],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(tablePrefs.pageSize)
      });
      if (filters.status.trim()) params.set("status", filters.status.trim());
      if (filters.order_type) params.set("order_type", filters.order_type);
      if (filters.client_id) params.set("client_id", filters.client_id);
      if (filters.warehouse_id) params.set("warehouse_id", filters.warehouse_id);
      if (filters.agent_id) params.set("agent_id", filters.agent_id);
      if (filters.expeditor_id) params.set("expeditor_id", filters.expeditor_id);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.product_id) params.set("product_id", filters.product_id);
      if (filters.client_category) params.set("client_category", filters.client_category);
      params.set("date_mode", filters.date_mode);
      if (filters.is_consignment === "true") params.set("is_consignment", "true");
      if (filters.is_consignment === "false") params.set("is_consignment", "false");
      if (filters.product_category_id) params.set("product_category_id", filters.product_category_id);
      if (filters.payment_type.trim()) params.set("payment_type", filters.payment_type.trim());
      if (filters.payment_method_ref.trim()) {
        params.set("payment_method_ref", filters.payment_method_ref.trim());
      }
      const { data: body } = await api.get<OrdersResponse>(
        `/api/${tenantSlug}/orders?${params.toString()}`
      );
      return body;
    }
  });

  const rows = data?.data ?? [];

  const orderListTotalPages = useMemo(() => {
    if (!data) return 1;
    const lim = data.limit > 0 ? data.limit : tablePrefs.pageSize;
    return Math.max(1, Math.ceil(data.total / lim));
  }, [data, tablePrefs.pageSize]);

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "orders-toolbar"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
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
    staleTime: STALE.reference,
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
    staleTime: STALE.reference,
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
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: { id: number; name: string; sku: string }[];
      }>(`/api/${tenantSlug}/products?page=1&limit=100&is_active=true`);
      return body.data ?? [];
    }
  });

  const productCategoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "orders-filter"],
    enabled: Boolean(tenantSlug) && canBulkCatalog,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: { id: number; name: string; is_active?: boolean }[];
      }>(`/api/${tenantSlug}/product-categories`);
      return (body.data ?? []).filter((c) => c.is_active !== false);
    }
  });

  const ordersProfileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "orders-filters"],
    enabled: Boolean(tenantSlug) && canBulkCatalog,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          payment_types?: string[];
          payment_method_entries?: ProfilePaymentMethodEntry[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const paymentMethodFilterOpts = useMemo(
    () =>
      paymentMethodSelectOptions(
        ordersProfileRefsQ.data,
        ordersProfileRefsQ.data?.payment_types ?? null
      ),
    [ordersProfileRefsQ.data]
  );

  const paymentTypeFilterOpts = useMemo(() => {
    const raw = ordersProfileRefsQ.data?.payment_types;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const x of raw) {
      const t = String(x).trim().slice(0, 64);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push({ value: t, label: t });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [ordersProfileRefsQ.data?.payment_types]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedOrderIds.has(r.id)),
    [rows, selectedOrderIds]
  );

  const selectionTotals = useMemo(() => {
    let qty = 0;
    let total = 0;
    let discount = 0;
    let bonusQty = 0;
    let debt = 0;
    for (const r of selectedRows) {
      qty += parseNumField(r.qty);
      total += parseNumField(r.total_sum);
      discount += parseNumField(r.discount_sum ?? "0");
      bonusQty += parseNumField(r.bonus_qty ?? "0");
      if (r.debt != null && r.debt !== "") debt += parseNumField(r.debt);
    }
    return {
      count: selectedRows.length,
      qty,
      total,
      discount,
      bonusQty,
      debt
    };
  }, [selectedRows]);

  const paymentPrefill = useMemo(
    () => buildPaymentPrefillFromSelection(rows, selectedOrderIds),
    [rows, selectedOrderIds]
  );

  const filterVisibilityItems: Array<{ key: keyof OrdersFilterVisibility; label: string }> = [
    { key: "status", label: "Статус" },
    { key: "orderType", label: "Тип" },
    { key: "nakladnoyType", label: "Тип накладной" },
    { key: "paymentMethod", label: "Способ оплаты (заказ)" },
    { key: "paymentLinkedType", label: "Тип платежа (по заказу)" },
    { key: "priceType", label: "Тип цены" },
    { key: "day", label: "День" },
    { key: "clientCategory", label: "Категория клиента" },
    { key: "clientId", label: "Клиенты (ID)" },
    { key: "productCategory", label: "Категория продукта" },
    { key: "product", label: "Продукт" },
    { key: "warehouse", label: "Склад" },
    { key: "agent", label: "Агент" },
    { key: "expeditor", label: "Экспедиторы" },
    { key: "consignment", label: "Консигнация" },
    { key: "tradeDirection", label: "Направление торговли" },
    { key: "territory1", label: "Территория 1" },
    { key: "territory2", label: "Территория 2" },
    { key: "territory3", label: "Территория 3" }
  ];

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
    mutationFn: async (payload: {
      template: NakladnoyTemplateId;
      prefs: NakladnoyExportPrefs;
      format?: "xlsx" | "pdf";
    }) => {
      await downloadOrdersNakladnoyXlsx({
        tenantSlug: tenantSlug!,
        orderIds: Array.from(selectedOrderIds),
        template: payload.template,
        prefs: payload.prefs,
        format: payload.format ?? "xlsx"
      });
    },
    onSuccess: (_data, vars) => {
      setNakladnoyFeedback(vars.format === "pdf" ? "PDF fayl yuklab olindi." : "Excel fayl yuklab olindi.");
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
        const allowedRaw = o.allowed_next_statuses ?? [];
        const nextOnly = new Set(allowedRaw.filter((s) => s !== o.status));
        const nextStatuses = ORDER_STATUS_VALUES.filter((v) => nextOnly.has(v));
        const err = statusRowError[o.id];
        if (!canPatch || nextStatuses.length === 0) {
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
              <option value={o.status} disabled hidden>
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </option>
              {nextStatuses.map((s) => (
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
        return <span className="tabular-nums">{formatNumberGrouped(o.qty, { maxFractionDigits: 3 })}</span>;
      case "total_sum":
        return <span className="tabular-nums">{formatNumberGrouped(o.total_sum, { maxFractionDigits: 2 })}</span>;
      case "discount_sum": {
        const n = parseNumField(o.discount_sum ?? "0");
        return (
          <span className="tabular-nums text-xs text-amber-900 dark:text-amber-200">
            {n > 0 ? formatNumberGrouped(n, { maxFractionDigits: 0 }) : "—"}
          </span>
        );
      }
      case "bonus_qty": {
        const n = parseNumField(o.bonus_qty ?? "0");
        return (
          <span className="tabular-nums text-xs text-emerald-800 dark:text-emerald-300">
            {n > 0 ? formatNumberGrouped(n, { maxFractionDigits: 3 }) : "—"}
          </span>
        );
      }
      case "balance": {
        if (o.balance == null) return "—";
        const b = parseNumField(o.balance);
        return (
          <span
            className={cn("tabular-nums", b < 0 && "font-medium text-destructive")}
          >
            {formatNumberGrouped(o.balance, { maxFractionDigits: 2 })}
          </span>
        );
      }
      case "debt": {
        const debtTxt = formatOrderListDebtAsClientLiability(o.debt);
        return debtTxt ? (
          <span className="tabular-nums font-medium text-destructive">{debtTxt}</span>
        ) : (
          "—"
        );
      }
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

      <div className="orders-hub-section orders-hub-section--filters orders-hub-section--stack-tight">
        <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Заявки</h1>
              {data ? (
                <span className="text-sm text-foreground/75">
                  Всего: <span className="font-medium text-foreground">{formatNumberGrouped(data.total)}</span>
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-foreground xl:flex-1 xl:justify-center">
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={filters.date_mode === "order"}
                  onChange={() => replaceOrdersQuery({ date_mode: "order", page: 1 })}
                />
                <span>Дата заказа</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={filters.date_mode === "ship"}
                  onChange={() => replaceOrdersQuery({ date_mode: "ship", page: 1 })}
                />
                <span>Дата отгрузки</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                <input
                  type="radio"
                  name="orders-date-mode"
                  className="size-4 border-input"
                  checked={filters.date_mode === "created"}
                  onChange={() => replaceOrdersQuery({ date_mode: "created", page: 1 })}
                />
                <span>Дата создания</span>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
              <div ref={filterPanelRef} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1"
                  onClick={() => setFilterVisibilityOpen((v) => !v)}
                >
                  <Settings className="h-4 w-4" />
                  Фильтры
                </Button>
                {filterVisibilityOpen ? (
                  <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-border bg-popover p-2 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Показать поля</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setFilterVisibility(DEFAULT_ORDERS_FILTER_VISIBILITY)}
                        >
                          Все
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            setFilterVisibility((prev) =>
                              Object.fromEntries(Object.keys(prev).map((k) => [k, false])) as OrdersFilterVisibility
                            )
                          }
                        >
                          Скрыть
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                      {filterVisibilityItems.map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/70"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={filterVisibility[item.key]}
                            onChange={(e) =>
                              setFilterVisibility((prev) => ({ ...prev, [item.key]: e.target.checked }))
                            }
                          />
                          <span className="text-foreground/90">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                ref={ordersDateRangeAnchorRef}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 max-w-[min(100%,20rem)] gap-2 font-normal text-foreground",
                  ordersDateRangeOpen && "border-primary/60 bg-primary/5"
                )}
                aria-expanded={ordersDateRangeOpen}
                aria-haspopup="dialog"
                onClick={() => setOrdersDateRangeOpen((o) => !o)}
              >
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs sm:text-sm">
                  {formatDateRangeButton(filters.date_from, filters.date_to)}
                </span>
              </button>
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

          <p className="text-[11px] text-foreground/72">
            Интервал дат:{" "}
            {filters.date_mode === "ship" ? (
              <>
                по первому переходу в статус <span className="font-medium text-foreground">«Отгружен»</span>{" "}
                (лог <span className="font-mono">delivering</span>)
              </>
            ) : filters.date_mode === "order" ? (
              <>
                <span className="font-medium text-foreground">дата заказа</span> — как дата создания записи
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">дата создания</span> записи в системе
              </>
            )}
            . «Долг» — только для доставленных продаж (<span className="font-mono">delivered</span>): сумма
            заказа минус распределённые оплаты.
          </p>

          {tenantSlug ? (
            <>
              <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
                {filterVisibility.status ? (
                <label className="orders-filter-field-label">
                  Статус
                  <select
                    data-testid="orders-filter-status"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                ) : null}
                {filterVisibility.orderType ? (
                <label className="orders-filter-field-label">
                  Тип
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                ) : null}
                {filterVisibility.nakladnoyType ? <OrdersFilterStubSelect label="Тип накладной" /> : null}
                {filterVisibility.paymentMethod ? (
                <label className="orders-filter-field-label">
                  Способ оплаты (заказ)
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={filters.payment_method_ref}
                    onChange={(e) =>
                      replaceOrdersQuery({ payment_method_ref: e.target.value, page: 1 })
                    }
                    disabled={!canBulkCatalog && paymentMethodFilterOpts.length === 0}
                    title={
                      !canBulkCatalog
                        ? "Каталог способов оплаты доступен оператору/админу"
                        : undefined
                    }
                  >
                    <option value="">Все</option>
                    {paymentMethodFilterOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}
                {filterVisibility.paymentLinkedType ? (
                <label className="orders-filter-field-label">
                  Тип платежа (по заказу)
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={filters.payment_type}
                    onChange={(e) => replaceOrdersQuery({ payment_type: e.target.value, page: 1 })}
                    disabled={!canBulkCatalog && paymentTypeFilterOpts.length === 0}
                    title={
                      !canBulkCatalog
                        ? "Список типов платежей доступен оператору/админу"
                        : undefined
                    }
                  >
                    <option value="">Все</option>
                    {paymentTypeFilterOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}
                {filterVisibility.priceType ? <OrdersFilterStubSelect label="Тип цены" /> : null}
                {filterVisibility.day ? <OrdersFilterStubSelect label="День" /> : null}
                {filterVisibility.clientCategory ? (
                <OrdersFilterStubSelect label="Категория клиента" />
                ) : null}
                {filterVisibility.clientId ? (
                <OrdersFilterStubSelect label="Клиенты (ID)" />
                ) : null}
                {filterVisibility.productCategory ? (
                <label className="orders-filter-field-label">
                  Категория продукта
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={filters.product_category_id}
                    onChange={(e) =>
                      replaceOrdersQuery({ product_category_id: e.target.value, page: 1 })
                    }
                    disabled={!canBulkCatalog || productCategoriesQ.isLoading}
                    title={
                      !canBulkCatalog
                        ? "Список категорий доступен оператору/админу"
                        : undefined
                    }
                  >
                    <option value="">Все</option>
                    {(productCategoriesQ.data ?? []).map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}
                {filterVisibility.product ? (
                <label className="orders-filter-field-label">
                  Продукт
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 xl:items-end">
                <label className="orders-filter-field-label">
                  Склад
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                <label className="orders-filter-field-label">
                  Агент
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                <label className="orders-filter-field-label">
                  Экспедиторы
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                {filterVisibility.consignment ? (
                <label className="orders-filter-field-label">
                  Консигнация
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={filters.is_consignment}
                    onChange={(e) =>
                      replaceOrdersQuery({
                        is_consignment: e.target.value as "" | "true" | "false",
                        page: 1
                      })
                    }
                  >
                    <option value="">Все</option>
                    <option value="true">Да</option>
                    <option value="false">Нет</option>
                  </select>
                </label>
                ) : null}
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
                    !filters.status &&
                    filters.is_consignment === "" &&
                    !filters.product_category_id &&
                    !filters.payment_type &&
                    !filters.payment_method_ref &&
                    filters.date_mode === "ship"
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
                      is_consignment: "",
                      product_category_id: "",
                      payment_type: "",
                      payment_method_ref: "",
                      date_mode: "ship",
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
      </div>

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
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : (
        <div className="orders-hub-section orders-hub-section--table">
          <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
            <CardContent className="p-0">
              <div
                className="table-toolbar flex flex-wrap items-end gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4"
                role="toolbar"
                aria-label="Таблица: поиск и экспорт"
              >
                <label className="shrink-0 text-xs font-medium text-foreground/85">
                  <span className="sr-only">Строк на странице</span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1"
                  onClick={() => setColumnDialogOpen(true)}
                >
                  <ListOrdered className="h-4 w-4" />
                  Колонки
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 shrink-0 p-0"
                  onClick={() => void refetch()}
                >
                  <RefreshCw className="mx-auto h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <p className="px-3 py-6 text-sm text-muted-foreground sm:px-4">Загрузка…</p>
              ) : isError ? (
                <div className="p-4 sm:p-5">
                  <QueryErrorState
                    message={getUserFacingError(error, "Zakazlarni yuklab bo'lmadi.")}
                    onRetry={() => void refetch()}
                  />
                </div>
              ) : rows.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground sm:px-4">
                  {data?.total === 0
                    ? "Filtr yoki qidiruv bo‘yicha zakaz topilmadi."
                    : "Hozircha zakaz yo‘q."}
                </p>
              ) : (
                <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead className="app-table-thead">
                  <tr className="text-left">
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
                          colId === "bonus_qty" ||
                          colId === "balance" ||
                          colId === "debt";
                      return (
                        <th
                          key={colId}
                          className={cn("px-3 py-2", right && "text-right")}
                        >
                          {label}
                        </th>
                      );
                    })}
                    <th className={cn(dataTableStickyActionsThSingle)}>
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
                          colId === "bonus_qty" ||
                          colId === "balance" ||
                          colId === "debt";
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
                                staleTime: STALE.detail,
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
            {data ? (
              <div className="table-content-footer flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/25 px-3 py-3 text-sm sm:px-4">
                <span className="text-foreground/80">
                  Страница{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatGroupedInteger(Math.min(filters.page, orderListTotalPages))}
                  </span>{" "}
                  /{" "}
                  <span className="tabular-nums text-foreground">
                    {formatGroupedInteger(orderListTotalPages)}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => replaceOrdersQuery({ page: Math.max(1, filters.page - 1) })}
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page >= orderListTotalPages}
                    onClick={() => replaceOrdersQuery({ page: filters.page + 1 })}
                  >
                    Далее
                  </Button>
                </div>
              </div>
            ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tenantSlug && selectedOrderIds.size > 0 ? (
        <div className="flex flex-col gap-0 rounded-lg border border-border bg-muted/50 text-sm shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-medium text-foreground">
              Guruh ishlashi:{" "}
              <span className="tabular-nums">{formatGroupedInteger(selectedOrderIds.size)}</span> ta zakaz
            </span>
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Holatni o‘zgartirish</span>
              <select
                className="h-9 min-w-[11rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={nakladnoyMut.isPending}
                  onClick={() => {
                    setNakladnoyFeedback(null);
                    nakladnoyMut.mutate({
                      template: nakladnoyTemplate,
                      prefs: nakladnoyPrefs,
                      format: "pdf"
                    });
                  }}
                >
                  {nakladnoyMut.isPending ? "Tayyorlanmoqda…" : "PDF yuklab olish"}
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
              Joriy sahifadan tanlangan qatorlar. «Долг» — faqat tanlovda yetkazilgan savdo zakazlari
              ustunidagi qiymatlar yig‘indisi.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Zakazlar soni</dt>
              <dd className="font-medium tabular-nums">
                {formatGroupedInteger(selectionTotals.count)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami miqdor (qty)</dt>
              <dd className="font-medium tabular-nums">
                {formatNumberGrouped(selectionTotals.qty, { maxFractionDigits: 3 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami summa</dt>
              <dd className="font-medium tabular-nums">
                {formatNumberGrouped(selectionTotals.total, { maxFractionDigits: 2 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami skidka</dt>
              <dd className="font-medium tabular-nums">
                {formatNumberGrouped(selectionTotals.discount, { maxFractionDigits: 2 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Jami bonus (dona)</dt>
              <dd className="font-medium tabular-nums">
                {formatNumberGrouped(selectionTotals.bonusQty, { maxFractionDigits: 3 })}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Jami долг (tanlangan)</dt>
              <dd className="font-medium tabular-nums">
                {formatNumberGrouped(selectionTotals.debt, { maxFractionDigits: 2 })}
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

      <DateRangePopover
        open={ordersDateRangeOpen}
        onOpenChange={setOrdersDateRangeOpen}
        anchorRef={ordersDateRangeAnchorRef}
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onApply={({ dateFrom, dateTo }) => {
          replaceOrdersQuery({ date_from: dateFrom, date_to: dateTo, page: 1 });
        }}
      />
    </PageShell>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Загрузка…</div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
