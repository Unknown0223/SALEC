"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

type OverviewRow = {
  price_type: string;
  price_type_name: string;
  payment_method: string | null;
  last_price_at: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PricesOverviewSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isStaff = role === "admin" || role === "operator";

  const [kind, setKind] = useState<"sale" | "purchase">("sale");

  const overviewQ = useQuery({
    queryKey: ["finance-price-overview", tenantSlug, kind],
    enabled: Boolean(tenantSlug) && isStaff,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: OverviewRow[] }>(
        `/api/${tenantSlug}/finance/price-overview?kind=${kind}`
      );
      return data.data;
    }
  });

  const rows = useMemo(() => overviewQ.data ?? [], [overviewQ.data]);

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya...</p>
      </PageShell>
    );
  }
  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Цена"
        description="Narx turlari bo‘yicha oxirgi yangilanish sanasi. Ommaviy tahrir — «Narxni o‘rnatish» sahifasi."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/prices/matrix" className={cn(buttonVariants({ size: "sm" }))}>
              Нarxni o‘rnatish
            </Link>
            <Link href="/settings/prices/price-list" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Прайс-лист
            </Link>
            <Link href="/settings/products/excel" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              Excel import
            </Link>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Katalog
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="orders-hub-section orders-hub-section--table">
          <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-wrap gap-1 border-b border-border bg-muted/25 px-3 py-2 sm:px-4">
                <button
                  type="button"
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    kind === "sale" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                  onClick={() => setKind("sale")}
                >
                  Продажа
                </button>
                <button
                  type="button"
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    kind === "purchase" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                  onClick={() => setKind("purchase")}
                >
                  Закуп
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "34%" }} />
                    <col style={{ width: "33%" }} />
                    <col />
                  </colgroup>
            <thead className="app-table-thead text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Тип цены</th>
                <th className="px-3 py-2 font-medium">Способ оплаты</th>
                <th className="px-3 py-2 font-medium">Дата последней цены</th>
              </tr>
            </thead>
            <tbody>
              {overviewQ.isLoading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-muted-foreground">
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    Ma&apos;lumot yo&apos;q.{" "}
                    <Link href="/settings/price-types" className="underline">
                      Narx turlarini
                    </Link>{" "}
                    sozlang yoki mahsulot narxlari kiriting.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.price_type} className="border-t">
                    <td className="px-3 py-2">{r.price_type_name}</td>
                    <td className="px-3 py-2">{r.payment_method ?? "—"}</td>
                    <td className="px-3 py-2">{fmtDate(r.last_price_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
                </table>
              </div>

              <div className="border-t border-border/80 bg-muted/15 px-3 py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">
                  «Установить наценку»: foizli narx oshirish keyingi versiyada; hozir Excel import yoki matritsadan
                  tahrirlang.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsWorkspace>
    </PageShell>
  );
}
