"use client";

import { OrderCreateDialog } from "@/components/orders/order-create-dialog";
import type { OrderDetailRow, OrderListRow } from "@/components/orders/order-detail-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { QueryErrorState } from "@/components/common/query-error-state";
import { getUserFacingError } from "@/lib/error-utils";
import {
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VALUES
} from "@/lib/order-status";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

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
    queryKey: ["orders", tenantSlug, page, statusFilter, clientIdFromUrl],
    enabled: Boolean(tenantSlug),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "30"
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
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2200px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">№</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Дата заказа</th>
                <th className="px-3 py-2">Ожидаемая дата отгрузки</th>
                <th className="px-3 py-2">Дата отгрузки</th>
                <th className="px-3 py-2">Дата доставки</th>
                <th className="px-3 py-2">Holat</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Юр. наз. клиента</th>
                <th className="px-3 py-2">Ид клиента</th>
                <th className="px-3 py-2 text-right">Кол-во</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Bonus</th>
                <th className="px-3 py-2">Баланс</th>
                <th className="px-3 py-2">Долг</th>
                <th className="px-3 py-2">Тип цены</th>
                <th className="px-3 py-2">Склад</th>
                <th className="px-3 py-2">Агент</th>
                <th className="px-3 py-2">Код агента</th>
                <th className="px-3 py-2">Экспедиторы</th>
                <th className="px-3 py-2">Область</th>
                <th className="px-3 py-2">Город</th>
                <th className="px-3 py-2">Зона</th>
                <th className="px-3 py-2">Консигнация</th>
                <th className="px-3 py-2">День</th>
                <th className="px-3 py-2">Кто создал</th>
                <th className="px-3 py-2">Комментарий</th>
                <th className="px-3 py-2">Роль(кто создал)</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{o.number}</td>
                  <td className="px-3 py-2">{o.order_type ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{o.expected_ship_date ? new Date(o.expected_ship_date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2">{o.shipped_at ? new Date(o.shipped_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2">{o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2">{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${o.client_id}`}
                      className="text-primary underline-offset-2 hover:underline font-medium"
                    >
                      {o.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{o.client_legal_name ?? "—"}</td>
                  <td className="px-3 py-2">#{o.client_id}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.total_sum}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{o.bonus_sum}</td>
                  <td className="px-3 py-2">{o.balance ?? "—"}</td>
                  <td className="px-3 py-2">{o.debt ?? "—"}</td>
                  <td className="px-3 py-2">{o.price_type ?? "—"}</td>
                  <td className="px-3 py-2">{o.warehouse_name ?? "—"}</td>
                  <td className="px-3 py-2">{o.agent_name ?? "—"}</td>
                  <td className="px-3 py-2">{o.agent_code ?? "—"}</td>
                  <td className="px-3 py-2">{o.expeditors ?? "—"}</td>
                  <td className="px-3 py-2">{o.region ?? "—"}</td>
                  <td className="px-3 py-2">{o.city ?? "—"}</td>
                  <td className="px-3 py-2">{o.zone ?? "—"}</td>
                  <td className="px-3 py-2">{o.consignment == null ? "—" : o.consignment ? "Ha" : "Yo‘q"}</td>
                  <td className="px-3 py-2">{o.day ?? "—"}</td>
                  <td className="px-3 py-2">{o.created_by ?? "—"}</td>
                  <td className="px-3 py-2">{o.comment ?? "—"}</td>
                  <td className="px-3 py-2">{o.created_by_role ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/orders/${o.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                      prefetch={false}
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
                      Tafsilot
                    </Link>
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
