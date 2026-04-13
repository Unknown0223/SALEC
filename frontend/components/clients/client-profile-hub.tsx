"use client";

import { ClientHubBalanceStrip } from "@/components/clients/client-hub-balance-strip";
import { ClientBalanceLedgerView } from "@/components/clients/client-balance-ledger-view";
import {
  ClientProfileLedgerFiltersProvider,
  useClientProfileLedgerFilters,
  type ProfileLedgerAgentFilter
} from "@/components/clients/client-profile-ledger-filters-context";
import { ClientProfileEquipmentTab } from "@/components/clients/client-profile-equipment-tab";
import { ClientProfilePhotoReportsTab } from "@/components/clients/client-profile-photo-reports-tab";
import type { ClientMapPoint } from "@/components/clients/clients-leaflet-map";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { formatRuDateButton } from "@/components/ui/date-picker-popover";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { OrderListRow } from "@/components/orders/order-detail-view";
import type { ClientDetailApiRow } from "@/components/clients/client-detail-view";
import type { ClientSalesAnalyticsResponse } from "@/lib/client-sales-analytics-types";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { formatDigitsGroupedLoose, formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { ORDER_STATUS_FILTER_OPTIONS, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ProductCategoryOption = { id: number; name: string; is_active: boolean };
import {
  CalendarDays,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  Filter,
  MapPin,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  Wallet
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const ClientsLeafletMapDynamic = dynamic(
  () =>
    import("@/components/clients/clients-leaflet-map").then((m) => ({
      default: m.ClientsLeafletMap
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
        Карта…
      </div>
    )
  }
);

const ORDER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все типы" },
  { value: "order", label: "Заказ" },
  { value: "return", label: "Возврат" },
  { value: "exchange", label: "Обмен" },
  { value: "partial_return", label: "Частичный возврат" },
  { value: "return_by_order", label: "Возврат по заказу" }
];

const CONSIGNMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все" },
  { value: "yes", label: "Консигнация: да" },
  { value: "no", label: "Консигнация: нет" }
];

const PAYMENT_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все способы оплаты" },
  { value: "naqd", label: "Наличные (naqd)" },
  { value: "plastik", label: "Пластик" },
  { value: "terminal", label: "Терминал" },
  { value: "perechis", label: "Перечисление" },
  { value: "bank", label: "Банк" }
];

const PRODUCT_BAR_COLORS = [
  "#0d9488",
  "#2563eb",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#ea580c",
  "#4f46e5",
  "#64748b"
];

const hubTabTriggerClass =
  "rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600 sm:px-3 sm:text-sm";

type HubAnalyticsFilters = {
  dateFrom: string;
  dateTo: string;
  orderStatus: string;
  orderType: string;
  consignmentFilter: string;
  productCategoryId: string;
  paymentTypeFilter: string;
};

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function appendProfileAgentLedgerParams(p: URLSearchParams, f: ProfileLedgerAgentFilter) {
  if (f.agentIds.length > 0) {
    p.set("agent_ids", [...f.agentIds].sort((a, b) => a - b).join(","));
  }
  if (f.noAgent) p.set("no_agent", "1");
}

function initialHubAnalyticsFilters(): HubAnalyticsFilters {
  const d = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return {
    dateFrom: localYmd(from),
    dateTo: localYmd(d),
    orderStatus: "",
    orderType: "",
    consignmentFilter: "",
    productCategoryId: "",
    paymentTypeFilter: ""
  };
}

function hubPeriodButtonLabel(dateFrom: string, dateTo: string): string {
  const f = dateFrom.trim();
  const t = dateTo.trim();
  if (f && t) return formatDateRangeButton(f, t);
  if (f) return `${formatRuDateButton(f)} — …`;
  if (t) return `… — ${formatRuDateButton(t)}`;
  return "дд.мм.гггг — дд.мм.гггг";
}

function parseSum(s: string): number {
  const t = String(s)
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function parseCoord(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const n = Number.parseFloat(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function territoryLine(c: ClientDetailApiRow): string {
  const parts = [c.region, c.city, c.district, c.zone].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

function statusBadgeClass(status: string): string {
  if (status === "delivered") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  if (status === "returned") return "bg-red-500/15 text-red-800 dark:text-red-300";
  if (status === "cancelled") return "bg-muted text-muted-foreground";
  return "bg-blue-500/10 text-blue-900 dark:text-blue-200";
}

type RequisitesAsideProps = {
  client: ClientDetailApiRow;
  clientId: number;
  territoryWithZone: string;
  addressMerged: string;
  lastAuditPatch:
    | { id: number; action: string; user_login: string | null; created_at: string }
    | undefined;
  auditLoading: boolean;
};

function ClientProfileRequisitesAside({
  client: c,
  clientId,
  territoryWithZone,
  addressMerged,
  lastAuditPatch,
  auditLoading
}: RequisitesAsideProps) {
  const phone = c.phone?.trim() ?? "";
  const digits = phone.replace(/\D/g, "");
  const telHref = digits.length >= 5 ? `tel:${phone.replace(/\s/g, "")}` : null;

  const attrPairs: { k: string; v: string }[] = [{ k: "Категория", v: c.category?.trim() || "—" }];
  if (c.product_category_ref?.trim()) attrPairs.push({ k: "Продукт", v: c.product_category_ref.trim() });
  if (c.sales_channel?.trim()) attrPairs.push({ k: "Канал", v: c.sales_channel.trim() });
  if (c.client_type_code?.trim()) attrPairs.push({ k: "Тип", v: c.client_type_code.trim() });
  if (c.client_format?.trim()) attrPairs.push({ k: "Формат", v: c.client_format.trim() });

  const created = new Date(c.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  const updated = new Date(c.updated_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

  return (
    <aside className="min-w-0 self-start lg:sticky lg:top-4 lg:col-span-1">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Реквизиты</span>
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              c.is_active
                ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            {c.is_active ? "Активный" : "Неактивный"}
          </span>
        </div>

        <div className="space-y-1.5 px-2 py-2">
          {phone ? (
            telHref ? (
              <a href={telHref} className="block text-sm font-semibold leading-tight text-primary underline-offset-2 hover:underline">
                {formatDigitsGroupedLoose(phone)}
              </a>
            ) : (
              <span className="text-sm font-semibold leading-tight">{formatDigitsGroupedLoose(phone)}</span>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground">Телефон не указан</span>
          )}

          {territoryWithZone ? (
            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={territoryWithZone}>
              {territoryWithZone}
            </p>
          ) : null}

          {addressMerged ? (
            <p className="line-clamp-3 text-[11px] font-medium leading-snug text-foreground" title={addressMerged}>
              {addressMerged}
            </p>
          ) : null}

          {c.landmark?.trim() ? (
            <p className="line-clamp-2 border-l-2 border-primary/25 pl-1.5 text-[10px] leading-snug text-muted-foreground">
              {c.landmark.trim()}
            </p>
          ) : null}

          <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-1.5">
            <span className="text-[10px] text-muted-foreground">Долг (дост., не опл.)</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-amber-900 dark:text-amber-200">
              {formatNumberGrouped(c.delivered_unpaid_total ?? "0", { maxFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-1.5">
            <span className="text-[10px] text-muted-foreground">Откр. заказы (конвейер)</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatNumberGrouped(c.open_orders_total, { maxFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-border/50 pt-1.5 text-[10px]">
            {attrPairs.map(({ k, v }) => (
              <div key={k} className="min-w-0">
                <span className="text-muted-foreground">{k}</span>
                <p className="truncate font-medium text-foreground" title={v}>
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-border/50 pt-1.5 text-[10px] leading-tight text-muted-foreground">
            <div>
              <span className="block text-[9px] uppercase tracking-wide">Создан</span>
              <span className="font-mono text-[10px] text-foreground">{created}</span>
            </div>
            <div>
              <span className="block text-[9px] uppercase tracking-wide">Обновлён</span>
              <span className="font-mono text-[10px] text-foreground">{updated}</span>
            </div>
          </div>

          <div className="text-[10px] leading-tight text-muted-foreground">
            <span className="text-[9px] uppercase tracking-wide">Журнал</span>
            <div className="mt-0.5 min-h-[1rem] text-foreground">
              {auditLoading ? (
                "…"
              ) : lastAuditPatch ? (
                <span className="break-words">
                  {lastAuditPatch.user_login ?? "—"}
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {new Date(lastAuditPatch.created_at).toLocaleString("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </span>
                </span>
              ) : (
                "—"
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0 border-t border-border/50 pt-1.5">
            <Link
              href={`/clients/${clientId}/details`}
              className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Карточка / журнал
            </Link>
            {(c.latitude && c.longitude) || c.gps_text?.trim() ? (
              <Link href="/clients/map" className="text-[10px] font-medium text-primary underline-offset-2 hover:underline">
                Карта
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

type HubTab =
  | "orders"
  | "products"
  | "sales"
  | "debts"
  | "equipment"
  | "photos"
  | "map"
  | "service";

type Props = { tenantSlug: string; clientId: number };

const ANALYTICS_TABS: HubTab[] = ["orders", "products", "sales"];

function ClientProfileHubInner({ tenantSlug, clientId }: Props) {
  const queryClient = useQueryClient();
  const { agentFilter } = useClientProfileLedgerFilters();
  const [hubTab, setHubTab] = useState<HubTab>("orders");
  const [filterDraft, setFilterDraft] = useState<HubAnalyticsFilters>(() => initialHubAnalyticsFilters());
  const [filterApplied, setFilterApplied] = useState<HubAnalyticsFilters>(() => initialHubAnalyticsFilters());
  /** В API пока фильтр только по `created_at`; «дата заказа» = то же; «отправка» — когда появится поле в заказе. */
  const [orderDateBasis, setOrderDateBasis] = useState<"order" | "created">("created");
  const dateRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderLimit, setOrderLimit] = useState(10);
  const [orderSearchInput, setOrderSearchInput] = useState("");
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
  const [ordersExcelBusy, setOrdersExcelBusy] = useState(false);

  const showAnalyticsChrome = ANALYTICS_TABS.includes(hubTab);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedOrderSearch(orderSearchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [orderSearchInput]);

  useEffect(() => {
    setOrderPage(1);
  }, [debouncedOrderSearch, orderLimit]);

  useEffect(() => {
    setOrderPage(1);
  }, [agentFilter.agentIds, agentFilter.noAgent]);

  const agentFilterQsKey = useMemo(
    () => `${[...agentFilter.agentIds].sort((a, b) => a - b).join(",")}_${agentFilter.noAgent ? "na" : ""}`,
    [agentFilter.agentIds, agentFilter.noAgent]
  );

  const applyAnalyticsFilters = () => {
    setFilterApplied({ ...filterDraft });
    setOrderPage(1);
  };

  const resetHubFilters = useCallback(() => {
    const init = initialHubAnalyticsFilters();
    setFilterDraft(init);
    setFilterApplied(init);
    setOrderDateBasis("created");
    setDateRangeOpen(false);
    setOrderSearchInput("");
    setDebouncedOrderSearch("");
    setOrderPage(1);
  }, []);

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "client-hub"],
    staleTime: STALE.list,
    enabled: showAnalyticsChrome && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductCategoryOption[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data.filter((c) => c.is_active);
    }
  });

  const clientQ = useQuery({
    queryKey: ["client", tenantSlug, clientId],
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<ClientDetailApiRow>(`/api/${tenantSlug}/clients/${clientId}`);
      return data;
    }
  });

  type ClientAuditMetaResponse = {
    data: Array<{ id: number; action: string; user_login: string | null; created_at: string }>;
  };

  const clientAuditMetaQ = useQuery({
    queryKey: ["client-audit-meta", tenantSlug, clientId],
    staleTime: STALE.list,
    enabled: Boolean(tenantSlug && clientId > 0),
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "50" });
      const { data } = await api.get<ClientAuditMetaResponse>(`/api/${tenantSlug}/clients/${clientId}/audit?${params}`);
      return data;
    }
  });

  const analyticsQs = useMemo(() => {
    const p = new URLSearchParams();
    const f = filterApplied;
    if (f.dateFrom.trim()) p.set("date_from", f.dateFrom.trim());
    if (f.dateTo.trim()) p.set("date_to", f.dateTo.trim());
    if (f.orderStatus.trim()) p.set("status", f.orderStatus.trim());
    if (f.orderType.trim()) p.set("order_type", f.orderType.trim());
    if (f.consignmentFilter.trim()) p.set("consignment", f.consignmentFilter.trim());
    if (f.productCategoryId.trim()) p.set("product_category_id", f.productCategoryId.trim());
    if (f.paymentTypeFilter.trim()) p.set("payment_type", f.paymentTypeFilter.trim());
    appendProfileAgentLedgerParams(p, agentFilter);
    return p.toString();
  }, [filterApplied, agentFilter]);

  const analyticsQ = useQuery({
    queryKey: ["client-sales-analytics", tenantSlug, clientId, analyticsQs, agentFilterQsKey],
    staleTime: STALE.list,
    enabled: showAnalyticsChrome && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<ClientSalesAnalyticsResponse>(
        `/api/${tenantSlug}/clients/${clientId}/sales-analytics?${analyticsQs}`
      );
      return data;
    }
  });

  const ordersQs = useMemo(() => {
    const p = new URLSearchParams({
      page: String(orderPage),
      limit: String(orderLimit),
      client_id: String(clientId)
    });
    const f = filterApplied;
    if (f.orderStatus.trim()) p.set("status", f.orderStatus.trim());
    if (f.orderType.trim()) p.set("order_type", f.orderType.trim());
    if (f.dateFrom.trim()) p.set("date_from", f.dateFrom.trim());
    if (f.dateTo.trim()) p.set("date_to", f.dateTo.trim());
    if (f.consignmentFilter === "yes") p.set("is_consignment", "true");
    if (f.consignmentFilter === "no") p.set("is_consignment", "false");
    if (f.productCategoryId.trim()) p.set("product_category_id", f.productCategoryId.trim());
    if (f.paymentTypeFilter.trim()) p.set("payment_type", f.paymentTypeFilter.trim());
    if (debouncedOrderSearch) p.set("search", debouncedOrderSearch);
    appendProfileAgentLedgerParams(p, agentFilter);
    return p.toString();
  }, [orderPage, orderLimit, clientId, filterApplied, debouncedOrderSearch, agentFilter]);

  const ordersQ = useQuery({
    queryKey: ["client-hub-orders", tenantSlug, ordersQs, agentFilterQsKey],
    staleTime: STALE.list,
    enabled: hubTab === "orders" && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: OrderListRow[]; total: number; page: number; limit: number }>(
        `/api/${tenantSlug}/orders?${ordersQs}`
      );
      return data;
    }
  });

  const exportClientOrdersExcel = useCallback(async () => {
    if (!tenantSlug) return;
    setOrdersExcelBusy(true);
    try {
      const p = new URLSearchParams({
        page: "1",
        limit: "5000",
        client_id: String(clientId)
      });
      const f = filterApplied;
      if (f.orderStatus.trim()) p.set("status", f.orderStatus.trim());
      if (f.orderType.trim()) p.set("order_type", f.orderType.trim());
      if (f.dateFrom.trim()) p.set("date_from", f.dateFrom.trim());
      if (f.dateTo.trim()) p.set("date_to", f.dateTo.trim());
      if (f.consignmentFilter === "yes") p.set("is_consignment", "true");
      if (f.consignmentFilter === "no") p.set("is_consignment", "false");
      if (f.productCategoryId.trim()) p.set("product_category_id", f.productCategoryId.trim());
      if (f.paymentTypeFilter.trim()) p.set("payment_type", f.paymentTypeFilter.trim());
      if (debouncedOrderSearch) p.set("search", debouncedOrderSearch);
      appendProfileAgentLedgerParams(p, agentFilter);
      const { data } = await api.get<{ data: OrderListRow[] }>(`/api/${tenantSlug}/orders?${p}`);
      const rows = data.data.map((o) => [
        o.id,
        ORDER_TYPE_OPTIONS.find((x) => x.value === (o.order_type ?? ""))?.label ?? o.order_type ?? "",
        new Date(o.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }),
        o.qty,
        "",
        parseSum(o.total_sum),
        o.is_consignment === true ? "Да" : "Нет",
        ORDER_STATUS_LABELS[o.status] ?? o.status,
        o.comment ?? ""
      ]);
      const fname = `zakazy-klient-${clientId}-${localYmd(new Date())}.xlsx`;
      await downloadXlsxSheet(
        fname,
        "Заявки",
        ["ID", "Тип", "Дата", "Кол-во", "Объём", "Сумма", "Консигнация", "Статус", "Комментарий"],
        rows,
        { colWidths: [8, 16, 20, 10, 8, 14, 14, 16, 32] }
      );
    } finally {
      setOrdersExcelBusy(false);
    }
  }, [tenantSlug, clientId, filterApplied, debouncedOrderSearch, agentFilter]);

  const refreshOrdersAndAnalytics = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["client-hub-orders", tenantSlug] });
    void queryClient.invalidateQueries({ queryKey: ["client-sales-analytics", tenantSlug, clientId] });
  }, [queryClient, tenantSlug, clientId]);

  const c = clientQ.data;

  const mapPoint: ClientMapPoint | null = useMemo(() => {
    if (!c) return null;
    const lat = parseCoord(c.latitude ?? null);
    const lon = parseCoord(c.longitude ?? null);
    if (lat == null || lon == null) return null;
    return { ...c, lat, lon };
  }, [c]);

  if (clientQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (clientQ.isError || !c) {
    return <p className="text-sm text-destructive">Клиент не найден или нет доступа.</p>;
  }

  const title = c.client_code?.trim() ? `${c.client_code.trim()} ${c.name}` : c.name;
  const sub = [territoryLine(c), c.phone?.trim()].filter(Boolean).join(" · ") || undefined;

  const lastAuditPatch = clientAuditMetaQ.data?.data.find((r) => r.action === "client.patch");
  const fullAddressLine = [c.neighborhood, c.street, c.house_number, c.apartment]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const territoryWithZone = [territoryLine(c), c.zone?.trim()].filter(Boolean).join(" · ");
  const addressMerged = (c.address ?? "").trim() || fullAddressLine;

  const chartRows = (analyticsQ.data?.daily ?? []).map((r) => ({
    dayShort: r.day.slice(5).replace("-", "."),
    revenue: parseSum(r.total_sum),
    orders: r.order_count
  }));

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Навигация">
        <Link href="/clients" className="rounded-md hover:text-primary hover:underline underline-offset-4">
          Клиенты
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
        <Link href="/client-balances" className="rounded-md hover:text-primary hover:underline underline-offset-4">
          Балансы клиентов
        </Link>
      </nav>

      <PageHeader
        className="pb-3"
        title={title}
        description={sub}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/clients/${clientId}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Pencil className="h-4 w-4" />
              Изменить
            </Link>
            <Link
              href={`/orders/new?client_id=${clientId}`}
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5 bg-teal-600 text-white hover:bg-teal-700")}
            >
              <PlusCircle className="h-4 w-4" />
              Новый заказ
            </Link>
            <Link
              href={`/payments/new?client_id=${clientId}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <CreditCard className="h-4 w-4" />
              Оплата
            </Link>
            <Link
              href={`/clients/${clientId}/balances`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Wallet className="h-4 w-4" />
              Баланс
            </Link>
            <Link
              href={`/clients/${clientId}/details`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
            >
              PDF, админ…
            </Link>
          </div>
        }
      />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ClientHubBalanceStrip
              tenantSlug={tenantSlug}
              clientId={clientId}
              onOpenDebtsTab={() => setHubTab("debts")}
            />

            <Tabs
              value={hubTab}
              onValueChange={(v) => {
                setHubTab(v as HubTab);
                setOrderPage(1);
              }}
              className="gap-3"
            >
            <TabsList className="inline-flex h-auto min-h-9 w-full flex-wrap gap-0.5 rounded-lg border border-border bg-slate-100 p-1 dark:bg-zinc-900/60">
              <TabsTrigger value="orders" className={hubTabTriggerClass}>
                Заявки
              </TabsTrigger>
              <TabsTrigger value="products" className={hubTabTriggerClass}>
                Продукт
              </TabsTrigger>
              <TabsTrigger value="sales" className={hubTabTriggerClass}>
                Динамика продаж
              </TabsTrigger>
              <TabsTrigger value="debts" className={hubTabTriggerClass}>
                Долги
              </TabsTrigger>
              <TabsTrigger value="equipment" className={hubTabTriggerClass}>
                Оборудование
              </TabsTrigger>
              <TabsTrigger value="photos" className={hubTabTriggerClass}>
                Фотоотчёт
              </TabsTrigger>
              <TabsTrigger value="map" className={hubTabTriggerClass}>
                Координаты
              </TabsTrigger>
              <TabsTrigger value="service" className={hubTabTriggerClass}>
                Служебное
              </TabsTrigger>
            </TabsList>

            {showAnalyticsChrome ? (
              <Card className="mt-3 border border-border/90 shadow-panel">
                <CardContent className="space-y-3 p-3 sm:p-4">
                  <p className="text-sm font-semibold text-foreground">Фильтр</p>

                  <p className="text-[11px] font-medium text-foreground">Дата применяется по</p>
                  <div
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm"
                    role="radiogroup"
                    aria-label="Поле даты для периода"
                  >
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="hub-order-date-field"
                        className="h-3.5 w-3.5 accent-blue-600"
                        checked={orderDateBasis === "order"}
                        onChange={() => setOrderDateBasis("order")}
                      />
                      <span>Дата заказа</span>
                    </label>
                    <label
                      className="inline-flex cursor-not-allowed items-center gap-2 text-muted-foreground opacity-60"
                      title="В заказе пока нет отдельного поля даты отправки"
                    >
                      <input type="radio" name="hub-order-date-field" className="h-3.5 w-3.5" disabled />
                      <span>Дата отправки</span>
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="hub-order-date-field"
                        className="h-3.5 w-3.5 accent-blue-600"
                        checked={orderDateBasis === "created"}
                        onChange={() => setOrderDateBasis("created")}
                      />
                      <span>Дата создания</span>
                    </label>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Сейчас период всегда считается по дате создания документа в системе (как в API). Выше — подготовка
                    под отдельные поля заказа.
                  </p>

                  <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Период</Label>
                      <div className="flex items-center gap-0">
                        <button
                          ref={dateRangeAnchorRef}
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-9 min-w-[12rem] max-w-[22rem] justify-start gap-2 border-border bg-background font-normal tabular-nums",
                            dateRangeOpen && "border-blue-500/60 bg-blue-500/5"
                          )}
                          aria-expanded={dateRangeOpen}
                          aria-haspopup="dialog"
                          onClick={() => setDateRangeOpen((o) => !o)}
                        >
                          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate text-sm">
                            {hubPeriodButtonLabel(filterDraft.dateFrom, filterDraft.dateTo)}
                          </span>
                        </button>
                        <DateRangePopover
                          open={dateRangeOpen}
                          onOpenChange={setDateRangeOpen}
                          anchorRef={dateRangeAnchorRef}
                          dateFrom={filterDraft.dateFrom}
                          dateTo={filterDraft.dateTo}
                          onApply={({ dateFrom: df, dateTo: dt }) => {
                            setFilterDraft((prev) => ({ ...prev, dateFrom: df, dateTo: dt }));
                            setFilterApplied((prev) => ({ ...prev, dateFrom: df, dateTo: dt }));
                            setOrderPage(1);
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Статус</Label>
                      <select
                        className={cn(filterPanelSelectClassName, "h-9 min-w-[9.5rem] py-0 text-sm")}
                        value={filterDraft.orderStatus}
                        onChange={(e) =>
                          setFilterDraft((prev) => ({ ...prev, orderStatus: e.target.value }))
                        }
                      >
                        <option value="">Все</option>
                        {ORDER_STATUS_FILTER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Категория продукта
                      </Label>
                      <select
                        className={cn(filterPanelSelectClassName, "h-9 min-w-[11rem] py-0 text-sm")}
                        value={filterDraft.productCategoryId}
                        onChange={(e) =>
                          setFilterDraft((prev) => ({ ...prev, productCategoryId: e.target.value }))
                        }
                      >
                        <option value="">Все</option>
                        {(categoriesQ.data ?? []).map((cat) => (
                          <option key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      {categoriesQ.isError ? (
                        <p className="text-[10px] text-muted-foreground">Категории недоступны</p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Способ оплаты
                      </Label>
                      <select
                        className={cn(filterPanelSelectClassName, "h-9 min-w-[11rem] py-0 text-sm")}
                        value={filterDraft.paymentTypeFilter}
                        onChange={(e) =>
                          setFilterDraft((prev) => ({ ...prev, paymentTypeFilter: e.target.value }))
                        }
                      >
                        {PAYMENT_TYPE_FILTER_OPTIONS.map((o) => (
                          <option key={o.value || "all"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      className="h-9 shrink-0 bg-teal-600 px-5 text-white hover:bg-teal-700"
                      onClick={() => applyAnalyticsFilters()}
                    >
                      Применить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 border-border"
                      title="Сбросить фильтры периода и заказов"
                      aria-label="Сбросить фильтры"
                      onClick={() => resetHubFilters()}
                    >
                      <Filter className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3 sm:gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Тип документа</Label>
                      <select
                        className={cn(filterPanelSelectClassName, "h-8 min-w-[10rem] py-0 text-sm")}
                        value={filterDraft.orderType}
                        onChange={(e) =>
                          setFilterDraft((prev) => ({ ...prev, orderType: e.target.value }))
                        }
                      >
                        {ORDER_TYPE_OPTIONS.map((o) => (
                          <option key={o.value || "all"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Консигнация</Label>
                      <select
                        className={cn(filterPanelSelectClassName, "h-8 min-w-[10rem] py-0 text-sm")}
                        value={filterDraft.consignmentFilter}
                        onChange={(e) =>
                          setFilterDraft((prev) => ({ ...prev, consignmentFilter: e.target.value }))
                        }
                      >
                        {CONSIGNMENT_OPTIONS.map((o) => (
                          <option key={o.value || "all"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {showAnalyticsChrome ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2.5 text-xs sm:text-sm dark:bg-muted/25">
                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Доставлено:</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {analyticsQ.isLoading ? "…" : analyticsQ.data?.kpi.delivered_count ?? "—"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Сумма продаж:</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {analyticsQ.isLoading
                      ? "…"
                      : analyticsQ.data
                        ? `${formatNumberGrouped(parseSum(analyticsQ.data.kpi.delivered_sales_sum), {
                            maxFractionDigits: 2
                          })} So'm`
                        : "—"}
                  </span>
                </span>
              </div>
            ) : null}

            <TabsContent value="orders" className="mt-3 space-y-3 outline-none">
              <Card className="overflow-hidden border border-border/90 shadow-panel">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-2 border-b border-border bg-muted/30 p-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:bg-muted/20">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Label htmlFor="hub-order-page-size" className="sr-only">
                        Строк на странице
                      </Label>
                      <select
                        id="hub-order-page-size"
                        className={cn(filterPanelSelectClassName, "h-8 w-[4.5rem] py-0 text-xs")}
                        value={String(orderLimit)}
                        title="Строк на странице"
                        onChange={(e) => {
                          setOrderLimit(Number.parseInt(e.target.value, 10) || 10);
                          setOrderPage(1);
                        }}
                      >
                        <option value="10">10</option>
                        <option value="30">30</option>
                        <option value="50">50</option>
                      </select>
                      <div className="relative min-w-[10rem] flex-1 sm:max-w-[16rem]">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="h-8 border-border bg-background pl-7 text-xs"
                          placeholder="Поиск"
                          value={orderSearchInput}
                          onChange={(e) => setOrderSearchInput(e.target.value)}
                          aria-label="Поиск по заявкам"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8 gap-1 border-border bg-background px-2.5 text-xs"
                        )}
                        disabled={ordersExcelBusy}
                        title="Экспорт в Excel (до 5000 строк по текущим фильтрам)"
                        onClick={() => void exportClientOrdersExcel()}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {ordersExcelBusy ? "…" : "Excel"}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8 gap-1.5 border-border bg-background px-3 text-xs"
                        )}
                        title="Обновить заявки и KPI"
                        onClick={() => {
                          void ordersQ.refetch();
                          refreshOrdersAndAnalytics();
                        }}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", ordersQ.isFetching && "animate-spin")} />
                        Обновить
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/60 text-left text-xs font-medium text-muted-foreground dark:bg-muted/40">
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Тип</th>
                          <th className="px-3 py-2">Дата</th>
                          <th className="px-3 py-2 text-right">Кол-во</th>
                          <th className="px-3 py-2 text-right">Объём</th>
                          <th className="px-3 py-2 text-right">Сумма</th>
                          <th className="px-3 py-2">Консигнация</th>
                          <th className="px-3 py-2">Статус</th>
                          <th className="px-3 py-2">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersQ.isLoading ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                              Загрузка…
                            </td>
                          </tr>
                        ) : (ordersQ.data?.data.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                              Нет заказов по фильтру
                            </td>
                          </tr>
                        ) : (
                          ordersQ.data!.data.map((o, i) => (
                            <tr
                              key={o.id}
                              className={cn(
                                "border-b border-border/80",
                                i % 2 === 1 && "bg-sky-50/30 dark:bg-sky-950/15"
                              )}
                            >
                              <td className="px-3 py-2 font-mono text-xs">
                                <Link className="text-primary underline-offset-2 hover:underline" href={`/orders/${o.id}`}>
                                  {o.id}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {ORDER_TYPE_OPTIONS.find((x) => x.value === (o.order_type ?? ""))?.label ??
                                  (o.order_type ?? "—")}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                {new Date(o.created_at).toLocaleString("ru-RU", {
                                  dateStyle: "short",
                                  timeStyle: "short"
                                })}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs">{o.qty}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">
                                {formatNumberGrouped(o.total_sum, { maxFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-xs">{o.is_consignment === true ? "Есть" : "Нет"}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
                                    statusBadgeClass(o.status)
                                  )}
                                >
                                  {ORDER_STATUS_LABELS[o.status] ?? o.status}
                                </span>
                              </td>
                              <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted-foreground">
                                {o.comment ?? "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {ordersQ.data && ordersQ.data.total > orderLimit ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5 text-sm dark:bg-muted/10">
                      <span className="text-muted-foreground">
                        Стр. {ordersQ.data.page} · Всего {ordersQ.data.total}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          disabled={orderPage <= 1}
                          onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          disabled={orderPage * orderLimit >= ordersQ.data.total}
                          onClick={() => setOrderPage((p) => p + 1)}
                        >
                          Вперёд
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="border-t border-border/70 px-3 py-2">
                    <Link
                      href={`/orders?client_id=${clientId}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
                    >
                      Все заказы
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="mt-3 outline-none">
              <Card className="border border-border/90 shadow-panel">
                <CardContent className="space-y-3 p-3 sm:p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">Структура заказов по SKU</p>
                    <span className="text-xs text-muted-foreground">
                      Всего шт (без бонусов):{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {analyticsQ.isLoading ? "…" : formatNumberGrouped(analyticsQ.data?.total_qty ?? "0", { maxFractionDigits: 3 })}
                      </span>
                    </span>
                  </div>
                  {analyticsQ.isLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
                  ) : (analyticsQ.data?.products.length ?? 0) === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Нет данных по фильтру</p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {analyticsQ.data!.products.map((p, idx) => (
                        <li
                          key={p.product_id}
                          className="rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2 text-sm">
                            <span className="min-w-0 font-medium leading-snug">{p.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatNumberGrouped(p.qty, { maxFractionDigits: 3 })} шт ·{" "}
                              <span className="font-semibold text-foreground">{p.share_percent.toFixed(2)}%</span>
                            </span>
                          </div>
                          {p.sku ? <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.sku}</p> : null}
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, Math.max(0, p.share_percent))}%`,
                                backgroundColor: PRODUCT_BAR_COLORS[idx % PRODUCT_BAR_COLORS.length]
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="mt-3 outline-none">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-border/90 shadow-panel">
                  <CardContent className="p-3 sm:p-4">
                    <p className="mb-2 text-sm font-medium">Сумма по дням</p>
                    {analyticsQ.isLoading ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">Загрузка…</p>
                    ) : chartRows.length === 0 ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">Нет данных по фильтру</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <RechartsLine data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                          <XAxis dataKey="dayShort" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            width={40}
                            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)}
                          />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => [formatNumberGrouped(v, { maxFractionDigits: 0 }), "Сумма"]}
                          />
                          <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} dot={false} name="Сумма" />
                        </RechartsLine>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card className="border border-border/90 shadow-panel">
                  <CardContent className="p-3 sm:p-4">
                    <p className="mb-2 text-sm font-medium">Количество заказов по дням</p>
                    {analyticsQ.isLoading ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">Загрузка…</p>
                    ) : chartRows.length === 0 ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">Нет данных по фильтру</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                          <XAxis dataKey="dayShort" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => [String(v), "Заказы"]}
                          />
                          <Bar dataKey="orders" fill="#dc2626" radius={[3, 3, 0, 0]} name="Заказы" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
              {analyticsQ.data?.daily_truncated ? (
                <p className="mt-2 text-center text-[11px] text-amber-700 dark:text-amber-400">
                  График усечён: в периоде очень много заказов; агрегаты SKU и KPI полные.
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="debts" className="mt-3 outline-none">
              <ClientBalanceLedgerView clientId={clientId} embedded />
            </TabsContent>

            <TabsContent value="equipment" className="mt-3 outline-none">
              <ClientProfileEquipmentTab tenantSlug={tenantSlug} clientId={clientId} />
            </TabsContent>

            <TabsContent value="photos" className="mt-3 outline-none">
              <ClientProfilePhotoReportsTab tenantSlug={tenantSlug} clientId={clientId} />
            </TabsContent>

            <TabsContent value="map" className="mt-3 outline-none">
              <Card className="border border-border/90 shadow-panel">
                <CardContent className="space-y-3 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Координаты
                  </div>
                  {mapPoint ? (
                    <>
                      <ClientsLeafletMapDynamic clients={[mapPoint]} />
                      <p className="text-xs text-muted-foreground">
                        {c.gps_text?.trim() ? <>Адрес/примечание: {c.gps_text.trim()}</> : null}
                      </p>
                    </>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Нет координат у клиента. Укажите широту и долготу в карточке редактирования.
                    </p>
                  )}
                  <Link href="/clients/map" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
                    Все клиенты на карте
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="service" className="mt-3 outline-none">
              <Card className="border border-border/90 p-6 shadow-panel">
                <p className="text-sm text-muted-foreground">
                  Акт-сверка PDF, ручные движения счёта, журнал изменений и полная таблица реквизитов.
                </p>
                <Link
                  href={`/clients/${clientId}/details`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
                >
                  Открыть служебную карточку
                </Link>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <ClientProfileRequisitesAside
          client={c}
          clientId={clientId}
          territoryWithZone={territoryWithZone}
          addressMerged={addressMerged}
          lastAuditPatch={lastAuditPatch}
          auditLoading={clientAuditMetaQ.isLoading}
        />
        </div>
    </div>
  );
}

export function ClientProfileHub(props: Props) {
  return (
    <ClientProfileLedgerFiltersProvider clientId={props.clientId}>
      <ClientProfileHubInner {...props} />
    </ClientProfileLedgerFiltersProvider>
  );
}
