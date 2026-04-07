"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
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
          <div className="mb-4 flex max-w-xs flex-col gap-2">
            <Label htmlFor="low-th">Chegara (mavjud &lt;)</Label>
            <Input
              id="low-th"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
            />
          </div>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : listQ.isError ? (
            <p className="text-sm text-destructive">Xato.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
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
                        {r.available_qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(listQ.data?.data.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Chegara {listQ.data?.threshold ?? threshold} dan past qoldiq yo‘q.
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
