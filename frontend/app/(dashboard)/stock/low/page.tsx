"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

type LowRow = { product_id: number; sku: string; name: string; available_qty: string };

export default function StockLowPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [threshold, setThreshold] = useState("10");

  const listQ = useQuery({
    queryKey: ["stock-low", tenantSlug, threshold],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const t = threshold.trim() || "10";
      const { data } = await api.get<{ data: LowRow[]; threshold: string }>(
        `/api/${tenantSlug}/stock/low?threshold=${encodeURIComponent(t)}`
      );
      return data;
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Kam qoldiq"
        description="Realizatsiya (`sales`) omborlari bo‘yicha jami mavjud miqdor chegara ostida."
        actions={
          <Link href="/stock" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            ← Ombor
          </Link>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      ) : (
        <>
          <div className="orders-hub-section orders-hub-section--filters">
            <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
              <CardContent className="max-w-md p-4 sm:p-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="low-th" className="text-sm font-medium text-foreground/88">
                    Chegara (mavjud &lt;)
                  </Label>
                  <Input
                    id="low-th"
                    className="bg-background text-foreground"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          {listQ.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Загрузка…</p>
          ) : listQ.isError ? (
            <p className="mt-4 text-sm text-destructive">Xato.</p>
          ) : (
            <div className="orders-hub-section orders-hub-section--table mt-4">
              <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead className="app-table-thead text-left text-xs">
                        <tr>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Mahsulot</th>
                          <th className="px-3 py-2 text-right">Mavjud (jami)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(listQ.data?.data ?? []).map((r) => (
                          <tr key={r.product_id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-800 dark:text-amber-300">
                              {formatNumberGrouped(r.available_qty, { maxFractionDigits: 3 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(listQ.data?.data.length ?? 0) === 0 ? (
                    <p className="border-t border-border/60 p-6 text-center text-sm text-foreground/75">
                      Chegara {listQ.data?.threshold ?? threshold} dan past qoldiq yo‘q.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
