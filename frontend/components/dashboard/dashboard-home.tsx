"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterSelect, filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, RotateCcw } from "lucide-react";
import { localYmd } from "@/components/ui/date-picker-popover";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

type StaffPick = { id: number; fio: string; code?: string | null };
type SupervisorFilterDraft = {
  date: string;
  payment_type: string;
  agent_id: string;
  supervisor_id: string;
  trade_direction: string;
  client_category: string;
  territory_1: string;
  territory_2: string;
  territory_3: string;
};

type SupervisorDashboardData = {
  kpi: {
    total_sales_sum: string;
    cash_sales_sum: string;
    planned_visits: number;
    visited_planned: number;
    visited_total: number;
    successful_visits: number;
    gps_visits: number;
    photo_reports: number;
    visit_pct: number;
    success_pct: number;
    gps_pct: number;
    photo_pct: number;
  };
  product_analytics: {
    by_category: ProductRow[];
    by_group: ProductRow[];
    by_brand: ProductRow[];
  };
  product_matrix: {
    by_category: ProductMatrixBlock;
    by_group: ProductMatrixBlock;
    by_brand: ProductMatrixBlock;
  };
  visit_report: {
    rows: VisitRow[];
    totals: VisitTotals;
  };
  efficiency_report: {
    by_agents: EfficiencyRow[];
    by_supervisors: EfficiencyRow[];
  };
};

type ProductRow = {
  dimension: string;
  share_pct: number;
  revenue: string;
  quantity: string;
  akb: number;
};

type ProductMatrixValue = {
  revenue: string;
  quantity: string;
  akb: number;
  orders: number;
};

type ProductMatrixActorRow = {
  id: number;
  name: string;
  values: Record<string, ProductMatrixValue>;
};

type ProductMatrixBlock = {
  dimensions: string[];
  by_agents: ProductMatrixActorRow[];
  by_supervisors: ProductMatrixActorRow[];
};

type VisitRow = {
  agent_id: number;
  agent_name: string;
  planned_visits: number;
  visited_planned: number;
  visited_unplanned: number;
  visited_total: number;
  not_visited: number;
  visits_with_orders: number;
  visits_without_orders: number;
  gps_visits: number;
  photo_reports: number;
  sales_sum: string;
  sales_qty: string;
};

type VisitTotals = Omit<VisitRow, "agent_id" | "agent_name">;

type EfficiencyRow = {
  id: number;
  name: string;
  order_count: number;
  cancelled_count: number;
  planned_visits: number;
  visited_total: number;
  rejected_visits: number;
  unvisited: number;
  visit_pct: number;
  photo_reports: number;
  total_sales_sum: string;
};

type CollapsibleSection = "products" | "visits" | "efficiency" | null;

function emptyFilters(): SupervisorFilterDraft {
  return {
    date: localYmd(new Date()),
    payment_type: "",
    agent_id: "",
    supervisor_id: "",
    trade_direction: "",
    client_category: "",
    territory_1: "",
    territory_2: "",
    territory_3: ""
  };
}

export type DashboardHomeProps = {
  headerTitle?: string;
  headerDescription?: string;
};

export function DashboardHome({
  headerTitle = "Дашборд - Супервайзер",
  headerDescription = "Real-time monitoring, plan/fact va KPI nazorati."
}: DashboardHomeProps) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [draft, setDraft] = useState<SupervisorFilterDraft>(() => emptyFilters());
  const [applied, setApplied] = useState<SupervisorFilterDraft>(() => emptyFilters());
  const [productTab, setProductTab] = useState<string | null>("category");
  const [productAxis, setProductAxis] = useState<string | null>("agents");
  const [productMetric, setProductMetric] = useState<string | null>("revenue");
  const [effTab, setEffTab] = useState<string | null>("agents");
  const [activeSection, setActiveSection] = useState<CollapsibleSection>("products");
  const [productPage, setProductPage] = useState(1);
  const [productLimit, setProductLimit] = useState(20);
  const [productSearch, setProductSearch] = useState("");
  const [visitPage, setVisitPage] = useState(1);
  const [visitLimit, setVisitLimit] = useState(20);
  const [visitSearch, setVisitSearch] = useState("");
  const [effPage, setEffPage] = useState(1);
  const [effLimit, setEffLimit] = useState(20);
  const [effSearch, setEffSearch] = useState("");

  const agentsQ = useQuery({
    queryKey: ["dashboard-supervisor", "agents", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data ?? [];
    }
  });

  const supervisorsQ = useQuery({
    queryKey: ["dashboard-supervisor", "supervisors", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/supervisors?is_active=true`);
      return data.data ?? [];
    }
  });

  const profileQ = useQuery({
    queryKey: ["dashboard-supervisor", "profile", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          payment_types?: string[];
          trade_directions?: string[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const clientRefsQ = useQuery({
    queryKey: ["dashboard-supervisor", "client-refs", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        categories?: string[];
        category_options?: Array<string | { value?: string; label?: string }>;
        zones?: string[];
        regions?: string[];
        cities?: string[];
      }>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const effectiveQs = useMemo(() => {
    const q = new URLSearchParams();
    q.set("date", applied.date);
    if (applied.payment_type) q.set("payment_type", applied.payment_type);
    if (applied.agent_id) q.set("agent_ids", applied.agent_id);
    if (applied.supervisor_id) q.set("supervisor_ids", applied.supervisor_id);
    if (applied.trade_direction) q.set("trade_direction", applied.trade_direction);
    if (applied.client_category) q.set("client_category", applied.client_category);
    if (applied.territory_1) q.set("territory_1", applied.territory_1);
    if (applied.territory_2) q.set("territory_2", applied.territory_2);
    if (applied.territory_3) q.set("territory_3", applied.territory_3);
    return q.toString();
  }, [applied]);

  const dataQ = useQuery({
    queryKey: ["dashboard-supervisor", tenantSlug, effectiveQs],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<SupervisorDashboardData>(`/api/${tenantSlug}/dashboard/supervisor?${effectiveQs}`);
      return data;
    }
  });

  const categoryOptions = useMemo(() => {
    const fromOptions = (clientRefsQ.data?.category_options ?? [])
      .map((o) => (typeof o === "string" ? o : (o?.label ?? o?.value ?? "")))
      .map((x) => String(x).trim())
      .filter(Boolean);
    const fromList = (clientRefsQ.data?.categories ?? []).map((x) => String(x).trim()).filter(Boolean);
    return Array.from(new Set([...fromOptions, ...fromList])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [clientRefsQ.data]);

  const compactSelect = `${filterPanelSelectClassName} h-10 min-w-0 max-w-full text-xs`;
  const filterLbl = "text-xs font-medium text-muted-foreground";

  const effRows =
    effTab === "supervisors"
      ? (dataQ.data?.efficiency_report.by_supervisors ?? [])
      : (dataQ.data?.efficiency_report.by_agents ?? []);

  const productMatrixBlock =
    productTab === "group"
      ? dataQ.data?.product_matrix.by_group
      : productTab === "brand"
        ? dataQ.data?.product_matrix.by_brand
        : dataQ.data?.product_matrix.by_category;
  const productMatrixRows =
    productAxis === "supervisors"
      ? (productMatrixBlock?.by_supervisors ?? [])
      : (productMatrixBlock?.by_agents ?? []);
  const productFiltered = productMatrixRows.filter((r) =>
    !productSearch.trim() || r.name.toLowerCase().includes(productSearch.trim().toLowerCase())
  );
  const visitFiltered = (dataQ.data?.visit_report.rows ?? []).filter((r) =>
    !visitSearch.trim() || r.agent_name.toLowerCase().includes(visitSearch.trim().toLowerCase())
  );
  const effFiltered = effRows.filter((r) =>
    !effSearch.trim() || r.name.toLowerCase().includes(effSearch.trim().toLowerCase())
  );
  const productPaged = paginateRows(productFiltered, productPage, productLimit);
  const visitPaged = paginateRows(visitFiltered, visitPage, visitLimit);
  const effPaged = paginateRows(effFiltered, effPage, effLimit);

  const toggleSection = (key: Exclude<CollapsibleSection, null>) => {
    setActiveSection((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    setProductPage(1);
  }, [productTab]);

  useEffect(() => {
    setProductPage(1);
  }, [productAxis, productMetric]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch]);

  useEffect(() => {
    setVisitPage(1);
  }, [visitSearch]);

  useEffect(() => {
    setEffPage(1);
  }, [effSearch]);

  useEffect(() => {
    setEffPage(1);
  }, [effTab]);

  return (
    <PageShell>
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3 text-xs font-medium hover:bg-muted"
              onClick={() => {
                const fresh = emptyFilters();
                setDraft(fresh);
                setApplied(fresh);
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Сброс
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-95"
              onClick={() => setApplied({ ...draft })}
            >
              Применить
            </button>
          </div>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">Сессия не найдена. Войдите заново.</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <div className="space-y-1">
                <Label className={filterLbl}>Дата</Label>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Способ оплаты</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.payment_type}
                  onChange={(e) => setDraft((p) => ({ ...p, payment_type: e.target.value }))}
                >
                  {(profileQ.data?.payment_types ?? []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Агент</Label>
                <FilterSelect
                  emptyLabel="Все агенты"
                  className={compactSelect}
                  value={draft.agent_id}
                  onChange={(e) => setDraft((p) => ({ ...p, agent_id: e.target.value }))}
                >
                  {(agentsQ.data ?? []).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.code ? `${a.fio} (${a.code})` : a.fio}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Супервайзер</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.supervisor_id}
                  onChange={(e) => setDraft((p) => ({ ...p, supervisor_id: e.target.value }))}
                >
                  {(supervisorsQ.data ?? []).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.code ? `${a.fio} (${a.code})` : a.fio}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Направление торговли</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.trade_direction}
                  onChange={(e) => setDraft((p) => ({ ...p, trade_direction: e.target.value }))}
                >
                  {(profileQ.data?.trade_directions ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Категория клиента</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.client_category}
                  onChange={(e) => setDraft((p) => ({ ...p, client_category: e.target.value }))}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Территория 1</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.territory_1}
                  onChange={(e) => setDraft((p) => ({ ...p, territory_1: e.target.value }))}
                >
                  {(clientRefsQ.data?.zones ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Территория 2</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.territory_2}
                  onChange={(e) => setDraft((p) => ({ ...p, territory_2: e.target.value }))}
                >
                  {(clientRefsQ.data?.regions ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1">
                <Label className={filterLbl}>Территория 3</Label>
                <FilterSelect
                  emptyLabel="Все"
                  className={compactSelect}
                  value={draft.territory_3}
                  onChange={(e) => setDraft((p) => ({ ...p, territory_3: e.target.value }))}
                >
                  {(clientRefsQ.data?.cities ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </CardContent>
          </Card>

          {dataQ.isLoading ? <p className="text-sm text-muted-foreground">Загрузка данных…</p> : null}
          {dataQ.isError ? <p className="text-sm text-destructive">Не удалось загрузить dashboard.</p> : null}

          {dataQ.data ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection("products")}
                      className="flex items-center gap-2 text-left"
                    >
                      {activeSection === "products" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle>Ключевые показатели</CardTitle>
                    </button>
                    <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Полный отчет <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardHeader>
                {activeSection === "products" && <CardContent>
                  <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Card><CardHeader className="pb-2"><CardDescription>Общая сумма</CardDescription><CardTitle>{formatNumberGrouped(dataQ.data.kpi.total_sales_sum, { maxFractionDigits: 2 })}</CardTitle></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Naqd</CardDescription><CardTitle>{formatNumberGrouped(dataQ.data.kpi.cash_sales_sum, { maxFractionDigits: 2 })}</CardTitle></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Посещения (по визитам)</CardDescription><CardTitle>{dataQ.data.kpi.visit_pct}%</CardTitle><CardDescription>План {dataQ.data.kpi.planned_visits} · Факт {dataQ.data.kpi.visited_planned}</CardDescription></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Успешные визиты</CardDescription><CardTitle>{dataQ.data.kpi.success_pct}%</CardTitle><CardDescription>{dataQ.data.kpi.successful_visits} / {dataQ.data.kpi.visited_total}</CardDescription></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Посещения (по GPS)</CardDescription><CardTitle>{dataQ.data.kpi.gps_pct}%</CardTitle><CardDescription>{dataQ.data.kpi.gps_visits} из {dataQ.data.kpi.planned_visits}</CardDescription></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Фото отчеты</CardDescription><CardTitle>{dataQ.data.kpi.photo_pct}%</CardTitle><CardDescription>{dataQ.data.kpi.photo_reports} из {dataQ.data.kpi.planned_visits}</CardDescription></CardHeader></Card>
                  </div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        Строк на странице{" "}
                        <select
                          className="ml-1 h-8 rounded border border-input bg-background px-1 text-xs"
                          value={String(productLimit)}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10) || 20;
                            setProductLimit(next);
                            setProductPage(1);
                          }}
                        >
                          {[10, 20, 30, 50, 100].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Поиск"
                        className="h-8 w-[180px] text-xs"
                      />
                      <button
                        type="button"
                        className="h-8 rounded border border-input bg-background px-2 text-xs hover:bg-muted"
                        onClick={() =>
                          exportRowsToXlsx(
                            toProductExportRows(productFiltered, productMatrixBlock?.dimensions ?? [], productMetric ?? "revenue"),
                            "po-kategorii-produktov.xlsx"
                          )
                        }
                      >
                        Excel
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Всего: {productFiltered.length}
                    </span>
                  </div>
                  <Tabs value={productTab} onValueChange={setProductTab}>
                    <TabsList>
                      <TabsTrigger value="category">По категории продуктов</TabsTrigger>
                      <TabsTrigger value="group">По группам товаров</TabsTrigger>
                      <TabsTrigger value="brand">По брендам</TabsTrigger>
                    </TabsList>
                    <TabsContent value="category">
                      {renderProductMatrixBlock(
                        productPaged.rows,
                        productMatrixBlock?.dimensions ?? [],
                        productAxis ?? "agents",
                        productMetric ?? "revenue",
                        setProductAxis,
                        setProductMetric
                      )}
                    </TabsContent>
                    <TabsContent value="group">
                      {renderProductMatrixBlock(
                        productPaged.rows,
                        productMatrixBlock?.dimensions ?? [],
                        productAxis ?? "agents",
                        productMetric ?? "revenue",
                        setProductAxis,
                        setProductMetric
                      )}
                    </TabsContent>
                    <TabsContent value="brand">
                      {renderProductMatrixBlock(
                        productPaged.rows,
                        productMatrixBlock?.dimensions ?? [],
                        productAxis ?? "agents",
                        productMetric ?? "revenue",
                        setProductAxis,
                        setProductMetric
                      )}
                    </TabsContent>
                  </Tabs>
                  {renderPager(productPaged.page, productPaged.totalPages, setProductPage)}
                </CardContent>}
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection("visits")}
                      className="flex items-center gap-2 text-left"
                    >
                      {activeSection === "visits" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle>Дневной отчет по визитам</CardTitle>
                    </button>
                    <Link href="/visits" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Открыть визиты <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardHeader>
                {activeSection === "visits" && <CardContent className="overflow-x-auto">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        Строк на странице{" "}
                        <select
                          className="ml-1 h-8 rounded border border-input bg-background px-1 text-xs"
                          value={String(visitLimit)}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10) || 20;
                            setVisitLimit(next);
                            setVisitPage(1);
                          }}
                        >
                          {[10, 20, 30, 50, 100].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        value={visitSearch}
                        onChange={(e) => setVisitSearch(e.target.value)}
                        placeholder="Поиск агента"
                        className="h-8 w-[180px] text-xs"
                      />
                      <button
                        type="button"
                        className="h-8 rounded border border-input bg-background px-2 text-xs hover:bg-muted"
                        onClick={() => exportRowsToXlsx(visitFiltered, "dnevnoy-otchet-po-vizitam.xlsx")}
                      >
                        Excel
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Всего: {visitFiltered.length}
                    </span>
                  </div>
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="app-table-thead">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs">Агент</th>
                        <th className="px-2 py-2 text-right text-xs">План</th>
                        <th className="px-2 py-2 text-right text-xs">Посещено (план)</th>
                        <th className="px-2 py-2 text-right text-xs">Посещено (вне плана)</th>
                        <th className="px-2 py-2 text-right text-xs">Непосещено</th>
                        <th className="px-2 py-2 text-right text-xs">Заказы</th>
                        <th className="px-2 py-2 text-right text-xs">Нет заказа</th>
                        <th className="px-2 py-2 text-right text-xs">Фото</th>
                        <th className="px-2 py-2 text-right text-xs">Сумма</th>
                        <th className="px-2 py-2 text-right text-xs">Кол-во</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitPaged.rows.map((r) => (
                        <tr key={r.agent_id} className="border-b border-border/60">
                          <td className="px-2 py-1.5">{r.agent_name}</td>
                          <td className="px-2 py-1.5 text-right">{r.planned_visits}</td>
                          <td className="px-2 py-1.5 text-right">{r.visited_planned}</td>
                          <td className="px-2 py-1.5 text-right">{r.visited_unplanned}</td>
                          <td className="px-2 py-1.5 text-right">{r.not_visited}</td>
                          <td className="px-2 py-1.5 text-right">{r.visits_with_orders}</td>
                          <td className="px-2 py-1.5 text-right">{r.visits_without_orders}</td>
                          <td className="px-2 py-1.5 text-right">{r.photo_reports}</td>
                          <td className="px-2 py-1.5 text-right">{formatNumberGrouped(r.sales_sum, { maxFractionDigits: 2 })}</td>
                          <td className="px-2 py-1.5 text-right">{formatNumberGrouped(r.sales_qty, { maxFractionDigits: 3 })}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="px-2 py-2">Общий</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.planned_visits}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.visited_planned}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.visited_unplanned}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.not_visited}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.visits_with_orders}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.visits_without_orders}</td>
                        <td className="px-2 py-2 text-right">{dataQ.data.visit_report.totals.photo_reports}</td>
                        <td className="px-2 py-2 text-right">{formatNumberGrouped(dataQ.data.visit_report.totals.sales_sum, { maxFractionDigits: 2 })}</td>
                        <td className="px-2 py-2 text-right">{formatNumberGrouped(dataQ.data.visit_report.totals.sales_qty, { maxFractionDigits: 3 })}</td>
                      </tr>
                    </tbody>
                  </table>
                  {renderPager(visitPaged.page, visitPaged.totalPages, setVisitPage)}
                </CardContent>}
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection("efficiency")}
                      className="flex items-center gap-2 text-left"
                    >
                      {activeSection === "efficiency" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle>Отчет по эффективности</CardTitle>
                    </button>
                    <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Детальный отчет <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardHeader>
                {activeSection === "efficiency" && <CardContent>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        Строк на странице{" "}
                        <select
                          className="ml-1 h-8 rounded border border-input bg-background px-1 text-xs"
                          value={String(effLimit)}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10) || 20;
                            setEffLimit(next);
                            setEffPage(1);
                          }}
                        >
                          {[10, 20, 30, 50, 100].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        value={effSearch}
                        onChange={(e) => setEffSearch(e.target.value)}
                        placeholder="Поиск"
                        className="h-8 w-[180px] text-xs"
                      />
                      <button
                        type="button"
                        className="h-8 rounded border border-input bg-background px-2 text-xs hover:bg-muted"
                        onClick={() => exportRowsToXlsx(effFiltered, "torgovye-agenty.xlsx")}
                      >
                        Excel
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Всего: {effFiltered.length}
                    </span>
                  </div>
                  <Tabs value={effTab} onValueChange={setEffTab}>
                    <TabsList>
                      <TabsTrigger value="agents">Торговые агенты</TabsTrigger>
                      <TabsTrigger value="supervisors">Супервайзеры</TabsTrigger>
                    </TabsList>
                    <TabsContent value="agents">{renderEfficiencyTable(effPaged.rows)}</TabsContent>
                    <TabsContent value="supervisors">{renderEfficiencyTable(effPaged.rows)}</TabsContent>
                  </Tabs>
                  {renderPager(effPaged.page, effPaged.totalPages, setEffPage)}
                </CardContent>}
              </Card>
            </>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

function paginateRows<T>(rows: T[], page: number, limit: number): { rows: T[]; page: number; totalPages: number } {
  const safeLimit = Math.min(100, Math.max(1, limit || 20));
  const totalPages = Math.max(1, Math.ceil(rows.length / safeLimit));
  const safePage = Math.min(totalPages, Math.max(1, page || 1));
  const from = (safePage - 1) * safeLimit;
  return {
    rows: rows.slice(from, from + safeLimit),
    page: safePage,
    totalPages
  };
}

function renderPager(page: number, totalPages: number, onPage: (next: number) => void) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
      <button
        type="button"
        className="h-8 rounded border border-input bg-background px-2 disabled:opacity-50"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Назад
      </button>
      <span className="text-muted-foreground">
        Стр. {page} / {totalPages}
      </span>
      <button
        type="button"
        className="h-8 rounded border border-input bg-background px-2 disabled:opacity-50"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Вперёд
      </button>
    </div>
  );
}

function exportRowsToXlsx(rows: Array<Record<string, unknown>>, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

function toProductExportRows(
  rows: ProductMatrixActorRow[],
  dimensions: string[],
  metric: string
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = { actor: row.name };
    for (const d of dimensions) {
      const v = row.values[d];
      if (!v) out[d] = 0;
      else if (metric === "akb") out[d] = v.akb;
      else if (metric === "quantity") out[d] = v.quantity;
      else if (metric === "orders") out[d] = v.orders;
      else out[d] = v.revenue;
    }
    return out;
  });
}

function renderProductMatrixBlock(
  rows: ProductMatrixActorRow[],
  dimensions: string[],
  axis: string,
  metric: string,
  setAxis: (value: string | null) => void,
  setMetric: (value: string | null) => void
) {
  const metricTitle =
    metric === "akb" ? "АКБ" : metric === "quantity" ? "Объем" : metric === "orders" ? "Количество" : "Сумма";
  const actorLabel = axis === "supervisors" ? "Супервайзеры" : "Агенты";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={axis} onValueChange={setAxis}>
          <TabsList className="h-8">
            <TabsTrigger value="agents" className="h-6 px-2 text-xs">По агентам</TabsTrigger>
            <TabsTrigger value="supervisors" className="h-6 px-2 text-xs">По супервайзерам</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={metric} onValueChange={setMetric}>
          <TabsList className="h-8">
            <TabsTrigger value="akb" className="h-6 px-2 text-xs">АКБ</TabsTrigger>
            <TabsTrigger value="quantity" className="h-6 px-2 text-xs">Объем</TabsTrigger>
            <TabsTrigger value="revenue" className="h-6 px-2 text-xs">Сумма</TabsTrigger>
            <TabsTrigger value="orders" className="h-6 px-2 text-xs">Количество</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="app-table-thead">
            <tr>
              <th className="px-2 py-2 text-left text-xs">{actorLabel}</th>
              {dimensions.map((d) => (
                <th key={d} className="px-2 py-2 text-right text-xs">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="px-2 py-1.5">{r.name}</td>
                {dimensions.map((d) => {
                  const cell = r.values[d];
                  let value = "0";
                  if (cell) {
                    if (metric === "akb") value = String(cell.akb);
                    else if (metric === "quantity") value = formatNumberGrouped(cell.quantity, { maxFractionDigits: 3 });
                    else if (metric === "orders") value = String(cell.orders);
                    else value = formatNumberGrouped(cell.revenue, { maxFractionDigits: 2 });
                  }
                  return (
                    <td key={`${r.id}-${d}`} className="px-2 py-1.5 text-right tabular-nums">
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center text-muted-foreground" colSpan={Math.max(2, dimensions.length + 1)}>
                  Пусто ({metricTitle})
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderEfficiencyTable(rows: EfficiencyRow[]) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="app-table-thead">
          <tr>
            <th className="px-2 py-2 text-left text-xs">Сотрудник</th>
            <th className="px-2 py-2 text-right text-xs">Заказы</th>
            <th className="px-2 py-2 text-right text-xs">План</th>
            <th className="px-2 py-2 text-right text-xs">Визиты</th>
            <th className="px-2 py-2 text-right text-xs">Отказы</th>
            <th className="px-2 py-2 text-right text-xs">Непосещено</th>
            <th className="px-2 py-2 text-right text-xs">Посещения %</th>
            <th className="px-2 py-2 text-right text-xs">Фото</th>
            <th className="px-2 py-2 text-right text-xs">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60">
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-right">{r.order_count}</td>
              <td className="px-2 py-1.5 text-right">{r.planned_visits}</td>
              <td className="px-2 py-1.5 text-right">{r.visited_total}</td>
              <td className="px-2 py-1.5 text-right">{r.rejected_visits}</td>
              <td className="px-2 py-1.5 text-right">{r.unvisited}</td>
              <td className="px-2 py-1.5 text-right">{r.visit_pct}%</td>
              <td className="px-2 py-1.5 text-right">{r.photo_reports}</td>
              <td className="px-2 py-1.5 text-right">{formatNumberGrouped(r.total_sales_sum, { maxFractionDigits: 2 })}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-2 py-4 text-center text-muted-foreground" colSpan={9}>
                Пусто
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
