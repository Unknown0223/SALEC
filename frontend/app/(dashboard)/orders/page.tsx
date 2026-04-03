"use client";

import { OrderCreateDialog } from "@/components/orders/order-create-dialog";
import type { OrderDetailRow, OrderListRow } from "@/components/orders/order-detail-view";
import { TableColumnSettingsDialog } from "@/components/data-table/table-column-settings-dialog";
import {
  dataTableActionsTdSingle,
  dataTableActionsThSingle,
  TableRowActionGroup
} from "@/components/data-table/table-row-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
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
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VALUES
} from "@/lib/order-status";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ListOrdered, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";

const VALID_STATUSES = new Set<string>(ORDER_STATUS_VALUES);

function parseOrdersUrl(searchParams: URLSearchParams): { status: string; page: number } {
  const rawStatus = searchParams.get("status")?.trim() ?? "";
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : "";
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { status, page };
}

type OrdersResponse = {
  data: OrderListRow[];
  total: number;
  page: number;
  limit: number;
};

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const clientIdFromUrl = searchParams.get("client_id")?.trim() ?? "";

  const { status: statusFilter, page } = useMemo(
    () => parseOrdersUrl(searchParams),
    [searchParams]
  );

  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const tablePrefs = useUserTablePrefs({
    tenantSlug,
    tableId: ORDERS_LIST_TABLE_ID,
    defaultColumnOrder: [...ORDER_LIST_COLUMN_IDS],
    defaultPageSize: 30,
    allowedPageSizes: [15, 20, 30, 50, 100]
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function replaceOrdersQuery(patch: { status?: string; page?: number }) {
    const p = new URLSearchParams(searchParams.toString());
    const nextStatus = patch.status !== undefined ? patch.status : statusFilter;
    const nextPage = patch.page !== undefined ? patch.page : page;

    if (nextStatus) p.set("status", nextStatus);
    else p.delete("status");

    if (nextPage > 1) p.set("page", String(nextPage));
    else p.delete("page");

    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["orders", tenantSlug, page, statusFilter, clientIdFromUrl, tablePrefs.pageSize],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(tablePrefs.pageSize)
      });
      if (statusFilter.trim()) params.set("status", statusFilter.trim());
      if (clientIdFromUrl) params.set("client_id", clientIdFromUrl);
      const { data: body } = await api.get<OrdersResponse>(
        `/api/${tenantSlug}/orders?${params.toString()}`
      );
      return body;
    }
  });

  const rows = data?.data ?? [];

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return rows;
    return rows.filter((o) => {
      const hay = [
        o.number,
        o.order_type ?? "",
        o.client_name,
        o.client_legal_name ?? "",
        String(o.client_id),
        o.status,
        ORDER_STATUS_LABELS[o.status] ?? "",
        o.agent_name ?? "",
        o.agent_code ?? "",
        o.warehouse_name ?? "",
        o.comment ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, debouncedSearch]);

  function renderOrderDataCell(colId: string, o: OrderListRow): ReactNode {
    switch (colId) {
      case "number":
        return <span className="font-mono text-xs">{o.number}</span>;
      case "order_type":
        return o.order_type ?? "—";
      case "created_at":
        return <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</span>;
      case "expected_ship_date":
        return o.expected_ship_date ? new Date(o.expected_ship_date).toLocaleDateString() : "—";
      case "shipped_at":
        return o.shipped_at ? new Date(o.shipped_at).toLocaleDateString() : "—";
      case "delivered_at":
        return o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : "—";
      case "status":
        return ORDER_STATUS_LABELS[o.status] ?? o.status;
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
        return `#${o.client_id}`;
      case "qty":
        return <span className="tabular-nums">{o.qty}</span>;
      case "total_sum":
        return <span className="tabular-nums">{o.total_sum}</span>;
      case "bonus_sum":
        return <span className="tabular-nums text-xs text-muted-foreground">{o.bonus_sum}</span>;
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
      <PageHeader
        title="Zakazlar"
        description={tenantSlug ? `Tenant: ${tenantSlug}` : "Ro‘yxat va yangi zakaz"}
        actions={
          <>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
              Boshqaruv
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/clients">
              Klientlar
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/products">
              Mahsulotlar
            </Link>
          </>
        }
      />

      {clientIdFromUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm shadow-sm">
          <span className="text-xs text-muted-foreground">
            Filtr: klient <span className="font-mono font-medium text-foreground">#{clientIdFromUrl}</span>
          </span>
          <Link className="text-xs text-primary underline-offset-2 hover:underline" href="/orders">
            Barcha zakazlar
          </Link>
          <Link
            className="text-xs text-primary underline-offset-2 hover:underline"
            href={`/clients/${clientIdFromUrl}`}
          >
            Klient kartochkasi
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Holat
          <select
            className="h-10 min-w-[11rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            value={statusFilter}
            onChange={(e) => {
              replaceOrdersQuery({ status: e.target.value, page: 1 });
            }}
          >
            <option value="">Barcha holatlar</option>
            {ORDER_STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={!tenantSlug}>
          Yangi zakaz
        </Button>
        {data ? (
          <span className="text-sm text-muted-foreground">
            Jami: <span className="font-medium text-foreground">{data.total}</span>
          </span>
        ) : null}
      </div>

      {tenantSlug ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Qidiruv (joriy sahifa)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => setColumnDialogOpen(true)}>
            <ListOrdered className="mr-1 h-4 w-4" />
            Ustunlar
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sahifa
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
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Yangilash
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filteredRows.length === 0}
            onClick={() => {
              const order = tablePrefs.visibleColumnOrder;
              const headers = order.map(
                (id) => ORDER_LIST_COLUMNS.find((c) => c.id === id)?.label ?? id
              );
              const dataRows = filteredRows.map((o) => order.map((colId) => orderListExportCell(o, colId)));
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
        <p className="text-sm text-muted-foreground">Hozircha zakaz yo‘q.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Qidiruv bo‘yicha natija yo‘q.</p>
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                    {tablePrefs.visibleColumnOrder.map((colId) => {
                      const label = ORDER_LIST_COLUMNS.find((c) => c.id === colId)?.label ?? colId;
                      const right =
                        colId === "qty" || colId === "total_sum" || colId === "bonus_sum";
                      return (
                        <th
                          key={colId}
                          className={cn("px-3 py-2", right && "text-right")}
                        >
                          {label}
                        </th>
                      );
                    })}
                    <th className={cn("text-muted-foreground", dataTableActionsThSingle)}>
                      <span className="sr-only">Tafsilot</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      {tablePrefs.visibleColumnOrder.map((colId) => {
                        const right =
                          colId === "qty" || colId === "total_sum" || colId === "bonus_sum";
                        return (
                          <td
                            key={colId}
                            className={cn(
                              "px-3 py-2",
                              right && "text-right tabular-nums",
                              colId === "number" && "font-mono text-xs",
                              (colId === "created_at" || colId === "bonus_sum") &&
                                "text-xs text-muted-foreground"
                            )}
                          >
                            {renderOrderDataCell(colId, o)}
                          </td>
                        );
                      })}
                      <td className={dataTableActionsTdSingle}>
                        <TableRowActionGroup ariaLabel="Zakaz">
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
          </CardContent>
        </Card>
      )}

      {data && data.total > data.limit ? (
        <div className="flex items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => replaceOrdersQuery({ page: Math.max(1, page - 1) })}
          >
            Oldingi
          </Button>
          <span className="text-muted-foreground">
            {page} / {Math.max(1, Math.ceil(data.total / data.limit))}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * data.limit >= data.total}
            onClick={() => replaceOrdersQuery({ page: page + 1 })}
          >
            Keyingi
          </Button>
        </div>
      ) : null}

      <OrderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantSlug={tenantSlug}
        onCreated={() => void refetch()}
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
