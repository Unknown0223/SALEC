"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { changeLogActionLabel, formatOrderChangeSummary } from "@/lib/order-change-log-format";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { STALE } from "@/lib/query-stale";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { OrderDetailRow } from "./order-detail-view";

const PANEL =
  "overflow-hidden rounded-xl border border-border/90 bg-card text-card-foreground shadow-panel";
const TBODY_ROW =
  "border-b border-border/70 transition-colors last:border-b-0 hover:bg-muted/25 even:bg-muted/[0.06] dark:even:bg-muted/15";
const TABLE_WRAP = "overflow-x-auto";

type Props = {
  tenantSlug: string;
  orderId: number;
};

export function OrderHistoryView({ tenantSlug, orderId }: Props) {
  const q = useQuery({
    queryKey: ["order", tenantSlug, orderId],
    enabled: Boolean(tenantSlug) && orderId > 0,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<OrderDetailRow>(`/api/${tenantSlug}/orders/${orderId}`);
      return body;
    }
  });

  if (!tenantSlug) {
    return <p className="text-sm text-destructive">Tenant aniqlanmadi.</p>;
  }

  if (q.isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (q.isError || !q.data) {
    return <p className="py-12 text-center text-sm text-destructive">Yuklab bo‘lmadi yoki zakaz topilmadi.</p>;
  }

  const data = q.data;
  const logs = data.status_logs ?? [];
  const changes = data.change_logs ?? [];

  return (
    <div className="flex flex-col gap-5 text-sm">
      <header className="flex flex-col gap-1 border-b border-border/70 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Zakaz tarixi
        </h1>
        <p className="text-xs text-muted-foreground">
          Zakaz №{data.number} · ID {data.id}
        </p>
        <Link
          href={`/orders/${orderId}`}
          className="mt-2 w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Zakaz kartasiga qaytish
        </Link>
      </header>

      <Card className={PANEL}>
        <CardHeader className="border-b border-border/70 bg-muted/25 py-3 dark:bg-muted/10">
          <CardTitle className="text-base">Holat o‘tishlari</CardTitle>
          <CardDescription>Kim va qachon qaysi holatdan qaysi holatga o‘tgandi.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Yozuvlar yo‘q.</p>
          ) : (
            <div className={cn(TABLE_WRAP, "max-h-[min(28rem,50vh)] overflow-y-auto")}>
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead className="app-table-thead">
                  <tr className="sticky top-0 text-left">
                    <th className="px-3 py-2.5 font-medium">Oldin</th>
                    <th className="px-3 py-2.5 font-medium">Keyin</th>
                    <th className="px-3 py-2.5 font-medium">Foydalanuvchi</th>
                    <th className="px-3 py-2.5 font-medium">Vaqt</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className={TBODY_ROW}>
                      <td className="px-3 py-2">
                        {ORDER_STATUS_LABELS[log.from_status] ?? log.from_status}
                      </td>
                      <td className="px-3 py-2">
                        {ORDER_STATUS_LABELS[log.to_status] ?? log.to_status}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{log.user_login ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={PANEL}>
        <CardHeader className="border-b border-border/70 bg-muted/25 py-3 dark:bg-muted/10">
          <CardTitle className="text-base">Tahrir jurnali</CardTitle>
          <CardDescription>Qatorlar, ombor, agent va boshqa o‘zgarishlar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {changes.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Yozuvlar yo‘q.</p>
          ) : (
            <div className={cn(TABLE_WRAP, "max-h-[min(28rem,50vh)] overflow-y-auto")}>
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead className="app-table-thead">
                  <tr className="sticky top-0 text-left">
                    <th className="px-3 py-2.5 font-medium">Vaqt</th>
                    <th className="px-3 py-2.5 font-medium">Foydalanuvchi</th>
                    <th className="px-3 py-2.5 font-medium">Amal</th>
                    <th className="px-3 py-2.5 font-medium">Qisqacha</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((log) => (
                    <tr key={log.id} className={TBODY_ROW}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{log.user_login ?? "—"}</td>
                      <td className="px-3 py-2">{changeLogActionLabel(log.action)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatOrderChangeSummary(log.action, log.payload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={PANEL}>
        <CardHeader className="border-b border-border/70 bg-muted/25 py-3 dark:bg-muted/10">
          <CardTitle className="text-base">Tarkib (qatorlar)</CardTitle>
          <CardDescription>Zakazdagi mahsulotlar — tarix sahifasidagi qisqa ko‘rinish.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className={TABLE_WRAP}>
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead className="app-table-thead text-left">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Mahsulot</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 text-right font-medium">Miqdor</th>
                  <th className="px-3 py-2.5 text-right font-medium">Narx</th>
                  <th className="px-3 py-2.5 text-right font-medium">Jami</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr
                    key={i.id}
                    className={cn(TBODY_ROW, i.is_bonus && "bg-emerald-500/[0.06] dark:bg-emerald-950/20")}
                  >
                    <td className="px-3 py-2">
                      {i.name}
                      {i.is_bonus ? (
                        <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-200">
                          Bonus
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">{i.sku}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumberGrouped(i.qty, { maxFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumberGrouped(i.price, { maxFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatNumberGrouped(i.total, { maxFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
