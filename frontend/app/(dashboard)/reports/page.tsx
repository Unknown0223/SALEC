"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import * as XLSX from "xlsx";

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

/* ─── Helpers ───────────────────────────────────────────── */

function exportToXlsx(fileName: string, sheets: { name: string; data: unknown[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(s: string | number) {
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("uz-UZ").format(n);
}

function fmtMoney(s: string | number) {
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
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

function statusColor(status: string): string {
  const map: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    confirmed: "bg-yellow-100 text-yellow-700",
    picking: "bg-orange-100 text-orange-700",
    delivering: "bg-purple-100 text-purple-700",
    delivered: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700"
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

/* ─── Date Range ────────────────────────────────────────── */

function dateRangePresets() {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { label: "Bugun", from: fmt(today), to: fmt(today) },
    { label: "Bu hafta", from: fmt(new Date(Date.now() - 6 * 86400000)), to: fmt(today) },
    { label: "Bu oy", from: fmt(new Date(Date.now() - 29 * 86400000)), to: fmt(today) },
    { label: "90 kun", from: fmt(new Date(Date.now() - 89 * 86400000)), to: fmt(today) }
  ];
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
    queryFn: async () => {
      const { data } = await api.get<StatusDist[]>(
        `/api/${tenantSlug}/reports/status-distribution`
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

  return (
    <PageShell>
      <PageHeader
        title="Hisobotlar"
        description="Savdo tahlili, agent KPI, mahsulot va mijoz hisobotlari"
      />

      {/* Date range bar */}
      <Card className="shadow-panel">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Davr:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setDateRange(e.target.value, to)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setDateRange(from, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          {dateRangePresets().map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDateRange(p.from, p.to)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                from === p.from && to === p.to
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={changeTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="summary">Xulosa</TabsTrigger>
          <TabsTrigger value="trends">Dinamika</TabsTrigger>
          <TabsTrigger value="products">Mahsulotlar</TabsTrigger>
          <TabsTrigger value="clients">Mijozlar</TabsTrigger>
          <TabsTrigger value="agents">Agentlar</TabsTrigger>
        </TabsList>

        {/* ══════════════ SUMMARY ══════════════ */}
        <TabsContent value="summary" className="space-y-4">
          {/* Summary cards */}
          {salesQ.isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
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
                <CardTitle className="text-base">Agentlar bo'yicha sotuv</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[400px] border-collapse text-sm">
                    <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
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
              <CardContent className="space-y-2">
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
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{s.count}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ TRENDS ══════════════ */}
        <TabsContent value="trends" className="space-y-4">
          {trendsQ.isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
          {trendsQ.data && trendsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Ma'lumot topilmadi.</p>
          )}
          {trendsQ.data && trendsQ.data.length > 0 && (
            <div className="space-y-4">
              {/* Visual bars for orders */}
              <Card className="shadow-panel">
                <CardHeader>
                  <CardTitle className="text-base">Zakaz dinamikasi</CardTitle>
                  <CardDescription>Kunlik zakazlar soni</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {(() => {
                    const max = Math.max(...trendsQ.data.map((t) => t.orders), 1);
                    return trendsQ.data.map((t) => (
                      <div key={t.date} className="flex items-center gap-3">
                        <span className="w-24 text-xs tabular-nums text-muted-foreground">{t.date.slice(5)}</span>
                        <div className="flex min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-3 rounded-full bg-primary transition-all"
                            style={{ width: `${(t.orders / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums">{t.orders}</span>
                      </div>
                    ));
                  })()}
                </CardContent>
              </Card>

              {/* Revenue bars */}
              <Card className="shadow-panel">
                <CardHeader>
                  <CardTitle className="text-base">Daromad dinamikasi</CardTitle>
                  <CardDescription>Kunlik zakaz summasi (so'm)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {(() => {
                    const max = Math.max(...trendsQ.data.map((t) => parseFloat(t.revenue)), 1);
                    return trendsQ.data.map((t) => (
                      <div key={t.date} className="flex items-center gap-3">
                        <span className="w-24 text-xs tabular-nums text-muted-foreground">{t.date.slice(5)}</span>
                        <div className="flex min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-3 rounded-full bg-emerald-400 transition-all"
                            style={{ width: `${(parseFloat(t.revenue) / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-xs tabular-nums">{fmtMoney(t.revenue)}</span>
                      </div>
                    ));
                  })()}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ══════════════ PRODUCTS ══════════════ */}
        <TabsContent value="products" className="space-y-4">
          {productsQ.isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
          {productsQ.data && (
            <Card className="overflow-hidden shadow-panel">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Eng ko'p sotilgan mahsulotlar</CardTitle>
                    <CardDescription>{productsQ.data.length} ta mahsulot</CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = productsQ.data!.map((p, i) => [
                        i + 1, p.sku, p.product_name, parseFloat(p.total_qty), p.order_count, parseFloat(p.total_revenue)
                      ]);
                      exportToXlsx(`products-${formatDate(new Date())}`, [
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
                    <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
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
          {clientsQ.isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
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
                      exportToXlsx(`clients-${formatDate(new Date())}`, [
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
                    <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
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
          {agentsQ.isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}
          {agentsQ.data && agentsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Agent ma'lumoti topilmadi.</p>
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
                      const rows = agentsQ.data!.map((a, _) => [
                        a.user_name, a.clients_count, a.order_count, parseFloat(a.total_orders),
                        parseFloat(a.avg_order_sum), a.returns_count
                      ]);
                      exportToXlsx(`agent-kpi-${formatDate(new Date())}`, [
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
                    <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Agent</th>
                        <th className="px-3 py-2 text-right">Mijozlar</th>
                        <th className="px-3 py-2 text-right">Zakazlar</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                        <th className="px-3 py-2 text-right">O'rt. zakaz</th>
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
      </Tabs>
    </PageShell>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>}>
      <ReportsContent />
    </Suspense>
  );
}
