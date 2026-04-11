"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";

const chartLoading = () => (
  <div className="h-[280px] animate-pulse rounded-lg bg-muted/30" aria-hidden />
);

const ReportsTrendCharts = dynamic(
  () => import("@/components/charts/analytics-charts").then((m) => ({ default: m.ReportsTrendCharts })),
  { ssr: false, loading: chartLoading }
);
const ReportsStatusPie = dynamic(
  () => import("@/components/charts/analytics-charts").then((m) => ({ default: m.ReportsStatusPie })),
  { ssr: false, loading: chartLoading }
);
const ReportsTopProductsBar = dynamic(
  () => import("@/components/charts/analytics-charts").then((m) => ({ default: m.ReportsTopProductsBar })),
  { ssr: false, loading: chartLoading }
);
const ReportsChannelOrdersBar = dynamic(
  () => import("@/components/charts/analytics-charts").then((m) => ({ default: m.ReportsChannelOrdersBar })),
  { ssr: false, loading: chartLoading }
);

/* ─── Types ─────────────────────────────────────────────── */

type SalesSummary = {
  agents?: Array<{ agent_id: number; agent_name: string; order_count: number; total_sum: string }>;
  data: Array<{
    period: string;
    order_count: number;
    total_sum: string;
    payment_count: number;
    payment_sum: string;
    return_count: number;
    return_amount: string;
    net_revenue: string;
  }>;
};

type TrendPoint = { date: string; orders: number; revenue: string };
type ProductSale = {
  product_id: number;
  product_name: string;
  sku: string;
  unit: string;
  total_qty: string;
  total_revenue: string;
  order_count: number;
};
type ClientKpi = {
  client_id: number;
  client_name: string;
  order_count: number;
  total_spent: string;
  last_order_date: string | null;
  balance: string;
};
type AgentKpi = {
  user_id: number;
  user_name: string;
  role: string;
  clients_count: number;
  order_count: number;
  total_orders: string;
  avg_order_sum: string;
  payments_count: number;
  payments_sum: string;
  returns_count: number;
};
type StatusDist = { status: string; count: number };

type ChannelStats = {
  channels: Array<{ channel: string; order_count: number; total_sum: string }>;
  tradeDirections: Array<{ direction: string; order_count: number; total_sum: string }>;
};

type AbcRow = { client_id: number; client_name: string; total: string; pct: number };
type AbcAnalysis = { categoryA: AbcRow[]; categoryB: AbcRow[]; categoryC: AbcRow[] };

type XyzRow = { client_id: number; client_name: string; avg: string; cv: number };
type XyzAnalysis = { xClients: XyzRow[]; yClients: XyzRow[]; zClients: XyzRow[] };

type ClientChurn = {
  churnedClients: Array<{
    client_id: number;
    client_name: string;
    last_order: string;
    total_historical: string;
  }>;
  totalClients: number;
  activeClients: number;
  churnRate: number;
};

type ClientReceivableRow = {
  client_id: number;
  name: string;
  phone: string | null;
  is_active: boolean;
  credit_limit: string;
  account_balance: string;
  outstanding: string;
  headroom: string;
  headroom_remaining: string;
  over_limit: boolean;
};

type ClientReceivablesResponse = {
  data: ClientReceivableRow[];
  total: number;
  page: number;
  limit: number;
};

/* ─── Helpers ───────────────────────────────────────────── */

function labelRefCode(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (!t || t === "null" || t === "undefined") return "—";
  return t;
}

function renderAbcTable(title: string, rows: AbcRow[], tone: "amber" | "slate" | "zinc") {
  const border =
    tone === "amber"
      ? "border-amber-200/80"
      : tone === "slate"
        ? "border-slate-200/80"
        : "border-zinc-200/80";
  const badge =
    tone === "amber"
      ? "bg-amber-100 text-amber-900"
      : tone === "slate"
        ? "bg-slate-100 text-slate-800"
        : "bg-zinc-100 text-zinc-800";
  return (
    <Card className={`shadow-panel ${border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>{title}</span>
          <CardDescription className="text-xs">{rows.length} ta mijoz</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Bo‘sh.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead className="app-table-thead text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Mijoz</th>
                  <th className="px-3 py-2 text-right">Summa</th>
                  <th className="px-3 py-2 text-right">% ulush</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.client_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/clients/${r.client_id}`} className="text-primary hover:underline">
                        {r.client_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderXyzTable(title: string, desc: string, rows: XyzRow[], tone: "emerald" | "sky" | "rose") {
  const border =
    tone === "emerald"
      ? "border-emerald-200/80"
      : tone === "sky"
        ? "border-sky-200/80"
        : "border-rose-200/80";
  const badge =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "sky"
        ? "bg-sky-100 text-sky-900"
        : "bg-rose-100 text-rose-900";
  return (
    <Card className={`shadow-panel ${border}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>{title}</span>
          <CardDescription className="text-xs">{desc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Bo‘sh.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead className="app-table-thead text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Mijoz</th>
                  <th className="px-3 py-2 text-right">O‘rtacha</th>
                  <th className="px-3 py-2 text-right">CV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.client_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/clients/${r.client_id}`} className="text-primary hover:underline">
                        {r.client_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.avg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatNumberGrouped(r.cv, { minFractionDigits: 3, maxFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function exportReportsToXlsx(fileName: string, sheets: { name: string; data: unknown[][] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, `${fileName}.xlsx`, { bookType: "xlsx", compression: true });
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(s: string | number) {
  return formatNumberGrouped(s, { maxFractionDigits: 0 });
}

function fmtMoney(s: string | number) {
  return formatNumberGrouped(s, { minFractionDigits: 2, maxFractionDigits: 2 });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "Yangi",
    confirmed: "Tasdiqlangan",
    picking: "Yig'ilmoqda",
    delivering: "Yetkazilmoqda",
    delivered: "Topshirilgan",
    cancelled: "Bekor qilingan"
  };
  return map[status] ?? status;
}

/* ─── Page ──────────────────────────────────────────────── */

function useDateRange() {
  const params = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const from30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return {
    from: params.get("from") ?? from30,
    to: params.get("to") ?? today
  };
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "summary";
  const { from, to } = useDateRange();
  const [davrOpen, setDavrOpen] = useState(false);
  const davrRef = useRef<HTMLButtonElement>(null);
  const churnMonths = Math.min(24, Math.max(1, Number(searchParams.get("churn_months") ?? "3") || 3));

  const recLimit = 50;
  const [recPage, setRecPage] = useState(1);
  const [recSearchDraft, setRecSearchDraft] = useState("");
  const [recSearch, setRecSearch] = useState("");
  const [recOver, setRecOver] = useState(false);
  const [recActive, setRecActive] = useState(false);
  const [recExporting, setRecExporting] = useState(false);

  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const enabled = Boolean(tenantSlug && hydrated);

  const changeTab = (v: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (!v || v === "summary") { p.set("tab", "summary"); } else { p.set("tab", v); }
    router.push("?" + p.toString(), { scroll: false });
  };

  // ──────── Queries ────────
  const salesQ = useQuery({
    queryKey: ["reports", "sales", tenantSlug, from, to],
    enabled: enabled && activeTab === "summary",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<SalesSummary>(
        `/api/${tenantSlug}/reports/sales?from=${from}&to=${to}`
      );
      return data;
    }
  });

  const trendsQ = useQuery({
    queryKey: ["reports", "trends", tenantSlug, from, to],
    enabled: enabled && activeTab === "trends",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<TrendPoint[]>(
        `/api/${tenantSlug}/reports/order-trends?from=${from}&to=${to}`
      );
      return data;
    }
  });

  const productsQ = useQuery({
    queryKey: ["reports", "products", tenantSlug, from, to],
    enabled: enabled && activeTab === "products",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductSale[] }>(
        `/api/${tenantSlug}/reports/products?from=${from}&to=${to}`
      );
      return data.data;
    }
  });

  const clientsQ = useQuery({
    queryKey: ["reports", "clients", tenantSlug, from, to],
    enabled: enabled && activeTab === "clients",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientKpi[] }>(
        `/api/${tenantSlug}/reports/clients?from=${from}&to=${to}`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["reports", "agents", tenantSlug, from, to],
    enabled: enabled && activeTab === "agents",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<{ data: AgentKpi[] }>(
        `/api/${tenantSlug}/reports/agent-kpi?from=${from}&to=${to}`
      );
      return data.data;
    }
  });

  const statusQ = useQuery({
    queryKey: ["reports", "status", tenantSlug],
    enabled: enabled && activeTab === "summary",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<StatusDist[]>(
        `/api/${tenantSlug}/reports/status-distribution`
      );
      return data;
    }
  });

  const channelsQ = useQuery({
    queryKey: ["reports", "channels", tenantSlug, from, to],
    enabled: enabled && activeTab === "channels",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<ChannelStats>(
        `/api/${tenantSlug}/reports/channels?from=${from}&to=${to}`
      );
      return data;
    }
  });

  const abcQ = useQuery({
    queryKey: ["reports", "abc", tenantSlug, from, to],
    enabled: enabled && activeTab === "abc",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<AbcAnalysis>(
        `/api/${tenantSlug}/reports/abc-analysis?from=${from}&to=${to}`
      );
      return data;
    }
  });

  const xyzQ = useQuery({
    queryKey: ["reports", "xyz", tenantSlug, from, to],
    enabled: enabled && activeTab === "xyz",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<XyzAnalysis>(
        `/api/${tenantSlug}/reports/xyz-analysis?from=${from}&to=${to}`
      );
      return data;
    }
  });

  const churnQ = useQuery({
    queryKey: ["reports", "churn", tenantSlug, churnMonths],
    enabled: enabled && activeTab === "churn",
    staleTime: STALE.report,
    queryFn: async () => {
      const { data } = await api.get<ClientChurn>(
        `/api/${tenantSlug}/reports/client-churn?monthsAgo=${churnMonths}`
      );
      return data;
    }
  });

  const receivablesQ = useQuery({
    queryKey: [
      "reports",
      "receivables",
      tenantSlug,
      recPage,
      recSearch,
      recOver,
      recActive,
      recLimit
    ],
    enabled: enabled && activeTab === "receivables",
    staleTime: STALE.report,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const p = new URLSearchParams({
        page: String(recPage),
        limit: String(recLimit)
      });
      if (recSearch.trim()) p.set("search", recSearch.trim());
      if (recOver) p.set("only_over_limit", "1");
      if (recActive) p.set("active_only", "1");
      const { data } = await api.get<ClientReceivablesResponse>(
        `/api/${tenantSlug}/reports/receivables?${p}`
      );
      return data;
    }
  });

  const totalStatusCount = (statusQ.data ?? []).reduce((s, d) => s + d.count, 0);

  const setDateRange = (f: string, t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("from", f);
    p.set("to", t);
    router.push("?" + p.toString(), { scroll: false });
  };

  const setChurnMonths = (m: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("churn_months", String(m));
    router.push("?" + p.toString(), { scroll: false });
  };

  const applyReceivablesFilters = () => {
    setRecSearch(recSearchDraft.trim());
    setRecPage(1);
  };

  const downloadReceivablesXlsx = async () => {
    if (!tenantSlug) return;
    setRecExporting(true);
    try {
      const p = new URLSearchParams();
      if (recSearch.trim()) p.set("search", recSearch.trim());
      if (recOver) p.set("only_over_limit", "1");
      if (recActive) p.set("active_only", "1");
      const res = await api.get<Blob>(
        `/api/${tenantSlug}/reports/receivables/export?${p}`,
        { responseType: "blob" }
      );
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qarzdorlik.xlsx";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setRecExporting(false);
    }
  };

  const trendChartRows = useMemo(() => {
    const d = trendsQ.data;
    if (!d?.length) return [];
    return d.map((t) => ({
      dateShort: t.date.slice(5),
      orders: t.orders,
      revenue: Number.parseFloat(t.revenue) || 0
    }));
  }, [trendsQ.data]);

  const statusPieSlices = useMemo(() => {
    const d = statusQ.data;
    if (!d?.length) return [];
    return [...d]
      .sort((a, b) => b.count - a.count)
      .map((s) => ({ status: s.status, name: statusLabel(s.status), value: s.count }));
  }, [statusQ.data]);

  const topProductsChart = useMemo(() => {
    const d = productsQ.data;
    if (!d?.length) return [];
    return d.slice(0, 10).map((p) => ({
      label: p.product_name.length > 28 ? `${p.product_name.slice(0, 26)}…` : p.product_name,
      revenue: Number.parseFloat(p.total_revenue) || 0
    }));
  }, [productsQ.data]);

  const channelOrdersChart = useMemo(() => {
    const ch = channelsQ.data?.channels;
    if (!ch?.length) return [];
    return [...ch]
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 12)
      .map((c) => ({
        label: labelRefCode(c.channel),
        orders: c.order_count
      }));
  }, [channelsQ.data]);

  return (
    <PageShell>
      <PageHeader
        title="Hisobotlar"
        description="Savdo tahlili, agent KPI, mahsulot va mijoz hisobotlari"
      />

      {/* Date range bar */}
      <Card className="shadow-panel">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Davr:</span>
          <button
            ref={davrRef}
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-2 font-normal",
              davrOpen && "border-primary/60 bg-primary/5"
            )}
            aria-expanded={davrOpen}
            aria-haspopup="dialog"
            onClick={() => setDavrOpen((o) => !o)}
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="text-sm">{formatDateRangeButton(from, to)}</span>
          </button>
          <DateRangePopover
            open={davrOpen}
            onOpenChange={setDavrOpen}
            anchorRef={davrRef}
            dateFrom={from}
            dateTo={to}
            onApply={({ dateFrom, dateTo }) => setDateRange(dateFrom, dateTo)}
          />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={changeTab} className="mb-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="summary">Xulosa</TabsTrigger>
          <TabsTrigger value="trends">Dinamika</TabsTrigger>
          <TabsTrigger value="products">Mahsulotlar</TabsTrigger>
          <TabsTrigger value="clients">Mijozlar</TabsTrigger>
          <TabsTrigger value="receivables">Qarzdorlik</TabsTrigger>
          <TabsTrigger value="agents">Agentlar</TabsTrigger>
          <TabsTrigger value="channels">Kanallar</TabsTrigger>
          <TabsTrigger value="abc">ABC</TabsTrigger>
          <TabsTrigger value="xyz">XYZ</TabsTrigger>
          <TabsTrigger value="churn">Churn</TabsTrigger>
        </TabsList>

        {/* ══════════════ SUMMARY ══════════════ */}
        <TabsContent value="summary" className="space-y-4">
          {/* Summary cards */}
          {salesQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {salesQ.data && salesQ.data.data[0] && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                () => {
                  const s = salesQ.data.data[0];
                  return [
                    { label: "Zakazlar", value: fmt(s.order_count), sub: `${fmtMoney(s.total_sum)} so'm` },
                    { label: "To'lovlar", value: fmt(s.payment_count), sub: `${fmtMoney(s.payment_sum)} so'm` },
                    { label: "Qaytarish", value: fmt(s.return_count), sub: `${fmtMoney(s.return_amount)} so'm` },
                    {
                      label: "Sof daromad",
                      value: fmtMoney(s.net_revenue),
                      sub: "so'm",
                      highlight: true
                    }
                  ].map((c) => (
                    <Card key={c.label} className={`border-border/90 ${c.highlight ? "border-emerald-200 bg-emerald-50/50" : ""}`}>
                      <CardHeader className="pb-1">
                        <CardDescription className="text-xs">{c.label}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{c.value}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">{c.sub}</CardContent>
                    </Card>
                  ));
                }
              )()}
            </div>
          )}

          {/* Agent breakdown */}
          {salesQ.data?.agents && salesQ.data.agents.length > 0 && (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Agentlar bo‘yicha sotuv</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[400px] border-collapse text-sm">
                    <thead className="app-table-thead text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Agent</th>
                        <th className="px-3 py-2 text-right">Zakazlar</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesQ.data.agents.map((a) => (
                        <tr key={a.agent_id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <Link href={`/settings/spravochnik/agents`} className="text-primary hover:underline">
                              {a.agent_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(a.order_count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(a.total_sum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status distribution */}
          {statusQ.data && statusQ.data.length > 0 && (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Zakaz holatlari taqsimoti</CardTitle>
                <CardDescription>Jami: {fmt(totalStatusCount)} ta zakaz</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2 lg:items-center">
                <ReportsStatusPie slices={statusPieSlices} />
                <div className="space-y-2">
                  {statusQ.data
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <div key={s.status} className="flex items-center gap-3">
                        <Badge variant={s.status === "cancelled" ? "destructive" : "default"}>
                          {statusLabel(s.status)}
                        </Badge>
                        <div className="flex min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full ${
                              s.status === "delivered"
                                ? "bg-emerald-500"
                                : s.status === "cancelled"
                                  ? "bg-red-400"
                                  : "bg-primary/50"
                            }`}
                            style={{ width: `${totalStatusCount > 0 ? (s.count / totalStatusCount) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                          {fmt(s.count)}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ TRENDS ══════════════ */}
        <TabsContent value="trends" className="space-y-4">
          {trendsQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {trendsQ.data && trendsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Ma’lumot topilmadi.</p>
          )}
          {trendsQ.data && trendsQ.data.length > 0 && (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Dinamika</CardTitle>
                <CardDescription>Kunlik zakazlar va daromad (tanlangan davr)</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsTrendCharts rows={trendChartRows} />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Chap: zakazlar soni · O‘ng: daromad (so‘m)
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ PRODUCTS ══════════════ */}
        <TabsContent value="products" className="space-y-4">
          {productsQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {productsQ.data && topProductsChart.length > 0 && (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Top 10 mahsulot (summa)</CardTitle>
                <CardDescription>Tanlangan davr bo‘yicha</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsTopProductsBar items={topProductsChart} />
              </CardContent>
            </Card>
          )}
          {productsQ.data && (
            <Card className="overflow-hidden shadow-panel">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Eng ko‘p sotilgan mahsulotlar</CardTitle>
                    <CardDescription>{productsQ.data.length} ta mahsulot</CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = productsQ.data!.map((p, i) => [
                        i + 1, p.sku, p.product_name, parseFloat(p.total_qty), p.order_count, parseFloat(p.total_revenue)
                      ]);
                      void exportReportsToXlsx(`products-${formatDate(new Date())}`, [
                        { name: "Mahsulotlar", data: [["#", "Kod", "Mahsulot", "Sotilgan", "Zakazlar", "Summa"], ...rows] }
                      ]);
                    }}
                    className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    Excel
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-sm">
                    <thead className="app-table-thead text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Kod</th>
                        <th className="px-3 py-2 text-left">Mahsulot</th>
                        <th className="px-3 py-2 text-right">Sotilgan</th>
                        <th className="px-3 py-2 text-center">Zakazlar</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsQ.data.map((p, i) => (
                        <tr key={p.product_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="w-10 px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                          <td className="px-3 py-2">
                            {p.product_name}
                            <span className="ml-1 text-[10px] text-muted-foreground">({p.unit})</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(p.total_qty)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{fmt(p.order_count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(p.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 text-xs font-medium">
                      <tr>
                        <td colSpan={3} className="px-3 py-2">Jami</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(productsQ.data.reduce((s, p) => s + parseFloat(p.total_qty), 0))}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {fmt(productsQ.data.reduce((s, p) => s + p.order_count, 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtMoney(
                            productsQ.data.reduce((s, p) => s + parseFloat(p.total_revenue), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ CLIENTS ══════════════ */}
        <TabsContent value="clients" className="space-y-4">
          {clientsQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {clientsQ.data && (
            <Card className="overflow-hidden shadow-panel">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Top mijozlar</CardTitle>
                    <CardDescription>{clientsQ.data.length} ta mijoz</CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = clientsQ.data!.map((c, i) => [
                        i + 1, c.client_name, c.order_count, parseFloat(c.total_spent),
                        c.last_order_date ? new Date(c.last_order_date).toLocaleDateString("uz-UZ") : "—",
                        parseFloat(c.balance)
                      ]);
                      void exportReportsToXlsx(`clients-${formatDate(new Date())}`, [
                        { name: "Mijozlar", data: [["#", "Mijoz", "Zakazlar", "Xarajat", "Oxirgi", "Balans"], ...rows] }
                      ]);
                    }}
                    className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    Excel
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead className="app-table-thead text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Mijoz</th>
                        <th className="px-3 py-2 text-right">Zakazlar</th>
                        <th className="px-3 py-2 text-right">Xarajat</th>
                        <th className="px-3 py-2 text-left">Oxirgi zakaz</th>
                        <th className="px-3 py-2 text-right">Balans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsQ.data.map((c, i) => {
                        const bal = parseFloat(c.balance);
                        return (
                          <tr key={c.client_id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="w-10 px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">
                              <Link href={`/clients/${c.client_id}`} className="text-primary hover:underline font-medium">
                                {c.client_name}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(c.order_count)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(c.total_spent)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString("uz-UZ") : "—"}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${bal > 0 ? "text-red-600 font-medium" : "text-emerald-600"}`}>
                              {fmtMoney(c.balance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ AGENTS ══════════════ */}
        <TabsContent value="agents" className="space-y-4">
          {agentsQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {agentsQ.data && agentsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Agent ma’lumoti topilmadi.</p>
          )}
          {agentsQ.data && agentsQ.data.length > 0 && (
            <Card className="overflow-hidden shadow-panel">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Agent KPI</CardTitle>
                    <CardDescription>{agentsQ.data.length} agent</CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = agentsQ.data!.map((a) => [
                        a.user_name, a.clients_count, a.order_count, parseFloat(a.total_orders),
                        parseFloat(a.avg_order_sum), a.returns_count
                      ]);
                      void exportReportsToXlsx(`agent-kpi-${formatDate(new Date())}`, [
                        { name: "Agent KPI", data: [["Agent", "Mijozlar", "Zakazlar", "Summa", "Avg", "Qaytarish"], ...rows] }
                      ]);
                    }}
                    className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    Excel
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[750px] border-collapse text-sm">
                    <thead className="app-table-thead text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Agent</th>
                        <th className="px-3 py-2 text-right">Mijozlar</th>
                        <th className="px-3 py-2 text-right">Zakazlar</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                        <th className="px-3 py-2 text-right">O‘rt. zakaz</th>
                        <th className="px-3 py-2 text-right">Qaytarish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentsQ.data.map((a) => (
                        <tr key={a.user_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link href={`/settings/spravochnik/agents`} className="text-primary hover:underline font-medium">
                              {a.user_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(a.clients_count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(a.order_count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(a.total_orders)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.avg_order_sum)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${a.returns_count > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {fmt(a.returns_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ CHANNELS ══════════════ */}
        <TabsContent value="channels" className="space-y-4">
          {channelsQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {channelsQ.data && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const ch = channelsQ.data!.channels.map((c) => [
                      labelRefCode(c.channel),
                      c.order_count,
                      parseFloat(c.total_sum)
                    ]);
                    const td = channelsQ.data!.tradeDirections.map((d) => [
                      labelRefCode(d.direction),
                      d.order_count,
                      parseFloat(d.total_sum)
                    ]);
                    void exportReportsToXlsx(`kanallar-${from}-${to}`, [
                      { name: "Kanallar", data: [["Kanal", "Zakazlar", "Summa"], ...ch] },
                      { name: "Savdo yo‘nalishi", data: [["Yo‘nalish", "Zakazlar", "Summa"], ...td] }
                    ]);
                  }}
                  className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Excel
                </button>
              </div>
              {channelOrdersChart.length > 0 && (
                <Card className="shadow-panel">
                  <CardHeader>
                    <CardTitle className="text-base">Kanallar bo‘yicha zakazlar</CardTitle>
                    <CardDescription>{from} — {to}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ReportsChannelOrdersBar items={channelOrdersChart} />
                  </CardContent>
                </Card>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden shadow-panel">
                  <CardHeader>
                    <CardTitle className="text-base">Savdo kanali</CardTitle>
                    <CardDescription>{from} — {to}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(channelsQ.data.channels ?? []).length === 0 ? (
                      <p className="px-4 pb-4 text-sm text-muted-foreground">Ma’lumot yo‘q.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[400px] border-collapse text-sm">
                          <thead className="app-table-thead text-xs">
                            <tr>
                              <th className="px-3 py-2 text-left">Kanal</th>
                              <th className="px-3 py-2 text-right">Zakazlar</th>
                              <th className="px-3 py-2 text-right">Summa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(channelsQ.data.channels ?? []).map((c, i) => (
                              <tr key={`${c.channel}-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2">{labelRefCode(c.channel)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(c.order_count)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(c.total_sum)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="overflow-hidden shadow-panel">
                  <CardHeader>
                    <CardTitle className="text-base">Savdo yo‘nalishi</CardTitle>
                    <CardDescription>{from} — {to}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(channelsQ.data.tradeDirections ?? []).length === 0 ? (
                      <p className="px-4 pb-4 text-sm text-muted-foreground">Ma’lumot yo‘q.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[400px] border-collapse text-sm">
                          <thead className="app-table-thead text-xs">
                            <tr>
                              <th className="px-3 py-2 text-left">Yo‘nalish</th>
                              <th className="px-3 py-2 text-right">Zakazlar</th>
                              <th className="px-3 py-2 text-right">Summa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(channelsQ.data.tradeDirections ?? []).map((d, i) => (
                              <tr key={`${d.direction}-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2">{labelRefCode(d.direction)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(d.order_count)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(d.total_sum)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════ ABC ══════════════ */}
        <TabsContent value="abc" className="space-y-4">
          {abcQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {abcQ.data && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = abcQ.data!;
                    const toSheet = (rows: AbcRow[]) =>
                      [["Mijoz", "Summa", "%"], ...rows.map((r) => [r.client_name, parseFloat(r.total), r.pct])];
                    void exportReportsToXlsx(`abc-${from}-${to}`, [
                      { name: "A", data: toSheet(d.categoryA ?? []) },
                      { name: "B", data: toSheet(d.categoryB ?? []) },
                      { name: "C", data: toSheet(d.categoryC ?? []) }
                    ]);
                  }}
                  className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Excel
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                A / B / C — tushum bo‘yicha 80/95 qoidasi (davr: {from} — {to}).
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                {renderAbcTable("A — yadro", abcQ.data.categoryA ?? [], "amber")}
                {renderAbcTable("B — o‘rta", abcQ.data.categoryB ?? [], "slate")}
                {renderAbcTable("C — uzun qurt", abcQ.data.categoryC ?? [], "zinc")}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════ XYZ ══════════════ */}
        <TabsContent value="xyz" className="space-y-4">
          {xyzQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {xyzQ.data && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = xyzQ.data!;
                    const toSheet = (rows: XyzRow[]) =>
                      [["Mijoz", "O‘rtacha", "CV"], ...rows.map((r) => [r.client_name, parseFloat(r.avg), r.cv])];
                    void exportReportsToXlsx(`xyz-${from}-${to}`, [
                      { name: "X", data: toSheet(d.xClients ?? []) },
                      { name: "Y", data: toSheet(d.yClients ?? []) },
                      { name: "Z", data: toSheet(d.zClients ?? []) }
                    ]);
                  }}
                  className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Excel
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                X — barqaror (CV {'<'} 0,1), Y — o‘rta (0,1–0,25), Z — o‘zgaruvchan (CV ≥ 0,25). Davr: {from} — {to}.
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                {renderXyzTable(
                  "X",
                  "Barqaror talab",
                  xyzQ.data.xClients ?? [],
                  "emerald"
                )}
                {renderXyzTable(
                  "Y",
                  "O‘rta barqarorlik",
                  xyzQ.data.yClients ?? [],
                  "sky"
                )}
                {renderXyzTable(
                  "Z",
                  "Noaniq talab",
                  xyzQ.data.zClients ?? [],
                  "rose"
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════ QARZDORLIK (ochiq zakazlar / kredit) ══════════════ */}
        <TabsContent value="receivables" className="space-y-4">
          <Card className="shadow-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Qarzdorlik va kredit yuki</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Ro‘yxatda <strong>faqat qarzdorlar</strong>: ochiq zakazlar yig‘indisi noldan katta bo‘lgan mijozlar
                (bekor/qaytarilgan zakazlar hisobga olinmaydi).{" "}
                <strong>Headroom</strong> — kredit limiti + hisob saldosi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Qidiruv (nom / telefon)</span>
                  <Input
                    value={recSearchDraft}
                    onChange={(e) => setRecSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyReceivablesFilters();
                    }}
                    placeholder="Mijoz…"
                    className="h-9"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyReceivablesFilters}
                  className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Qo‘llash
                </button>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={recOver}
                    onChange={(e) => {
                      setRecOver(e.target.checked);
                      setRecPage(1);
                    }}
                  />
                  Faqat limitdan oshgan
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={recActive}
                    onChange={(e) => {
                      setRecActive(e.target.checked);
                      setRecPage(1);
                    }}
                  />
                  Faqat faol mijozlar
                </label>
                <button
                  type="button"
                  disabled={recExporting || !tenantSlug}
                  onClick={() => void downloadReceivablesXlsx()}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {recExporting ? "Excel…" : "Excel (max 5000)"}
                </button>
              </div>

              {receivablesQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
              {receivablesQ.isError && (
                <p className="text-sm text-destructive">Ma’lumot yuklanmadi.</p>
              )}
              {receivablesQ.data && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Jami mos keluvchilar:{" "}
                    <span className="font-mono tabular-nums">{fmt(receivablesQ.data.total)}</span> ta
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead className="app-table-thead text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">Mijoz</th>
                          <th className="px-3 py-2 text-left">Telefon</th>
                          <th className="px-3 py-2 text-right">Ochiq zakazlar</th>
                          <th className="px-3 py-2 text-right">Hisob</th>
                          <th className="px-3 py-2 text-right">K. limit</th>
                          <th className="px-3 py-2 text-right">Headroom</th>
                          <th className="px-3 py-2 text-right">Qoldiq</th>
                          <th className="px-3 py-2 text-center">Oshgan?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(receivablesQ.data.data ?? []).map((r) => (
                          <tr
                            key={r.client_id}
                            className={`border-b last:border-0 ${r.over_limit ? "bg-red-50/80 dark:bg-red-950/25" : "hover:bg-muted/20"}`}
                          >
                            <td className="px-3 py-2">
                              <Link
                                href={`/clients/${r.client_id}`}
                                className="text-primary hover:underline"
                              >
                                {r.name}
                              </Link>
                              {!r.is_active ? (
                                <Badge variant="secondary" className="ml-2 text-[10px]">
                                  nofaol
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {r.phone ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {fmtMoney(r.outstanding)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.account_balance)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.credit_limit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.headroom)}</td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${
                                Number.parseFloat(r.headroom_remaining) < 0 ? "font-medium text-red-600" : ""
                              }`}
                            >
                              {fmtMoney(r.headroom_remaining)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.over_limit ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  ha
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {receivablesQ.data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Sahifa {recPage} /{" "}
                        {Math.max(1, Math.ceil(receivablesQ.data.total / receivablesQ.data.limit))}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={recPage <= 1}
                          onClick={() => setRecPage((p) => Math.max(1, p - 1))}
                          className="h-8 rounded-md border px-3 disabled:opacity-40"
                        >
                          Oldingi
                        </button>
                        <button
                          type="button"
                          disabled={recPage * recLimit >= receivablesQ.data.total}
                          onClick={() => setRecPage((p) => p + 1)}
                          className="h-8 rounded-md border px-3 disabled:opacity-40"
                        >
                          Keyingi
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════ CHURN ══════════════ */}
        <TabsContent value="churn" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Nofaollik oyni:</span>
            {[1, 3, 6, 12, 24].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChurnMonths(m)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                  churnMonths === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {m} oy
              </button>
            ))}
          </div>
          {churnQ.isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {churnQ.data && (
            <div className="space-y-4">
              {(() => {
                const d = churnQ.data;
                const inactive = Math.max(0, d.totalClients - d.activeClients);
                return (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="shadow-panel">
                      <CardHeader className="pb-2">
                        <CardDescription>Jami mijozlar (yil ichida zakaz)</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{fmt(d.totalClients)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="shadow-panel">
                      <CardHeader className="pb-2">
                        <CardDescription>Faol (oxirgi {churnMonths} oy)</CardDescription>
                        <CardTitle className="text-2xl tabular-nums text-emerald-700">{fmt(d.activeClients)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="shadow-panel">
                      <CardHeader className="pb-2">
                        <CardDescription>Nofaol ulush</CardDescription>
                        <CardTitle className="text-2xl tabular-nums text-amber-700">{d.churnRate.toFixed(1)}%</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="shadow-panel">
                      <CardHeader className="pb-2">
                        <CardDescription>Nofaol (hisob)</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{fmt(inactive)}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = churnQ.data!;
                    const rows = (d.churnedClients ?? []).map((c) => [
                      c.client_name,
                      c.last_order ? new Date(c.last_order).toLocaleDateString("uz-UZ") : "—",
                      parseFloat(c.total_historical)
                    ]);
                    void exportReportsToXlsx(`churn-${churnMonths}oy`, [
                      {
                        name: "Nofaol",
                        data: [["Mijoz", "Oxirgi zakaz", "Tarixiy summa"], ...rows]
                      }
                    ]);
                  }}
                  className="h-8 rounded-md px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Excel
                </button>
              </div>
              <Card className="overflow-hidden shadow-panel">
                <CardHeader>
                  <CardTitle className="text-base">Nofaol mijozlar (jadval)</CardTitle>
                  <CardDescription>
                    Oxirgi {churnMonths} oyda zakaz qilmagan; ro‘yxat — oxirgi zakaz bo‘yicha (max. 50).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {(churnQ.data.churnedClients ?? []).length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-muted-foreground">Ro‘yxat bo‘sh.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-sm">
                        <thead className="app-table-thead text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">Mijoz</th>
                            <th className="px-3 py-2 text-right">Oxirgi zakaz</th>
                            <th className="px-3 py-2 text-right">Tarixiy summa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(churnQ.data.churnedClients ?? []).map((c) => (
                            <tr key={c.client_id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <Link href={`/clients/${c.client_id}`} className="text-primary hover:underline">
                                  {c.client_name}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {c.last_order ? new Date(c.last_order).toLocaleDateString("uz-UZ") : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(c.total_historical)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Загрузка…</div>}>
      <ReportsContent />
    </Suspense>
  );
}
