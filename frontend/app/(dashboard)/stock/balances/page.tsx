"use client";

import { StockBalancesWorkspace } from "@/components/stock/stock-balances-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";

export default function StockBalancesPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return <StockBalancesWorkspace tenantSlug={tenantSlug} />;
}
