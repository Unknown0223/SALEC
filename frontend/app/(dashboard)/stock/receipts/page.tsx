"use client";

import { GoodsReceiptsWorkspace } from "@/components/stock/goods-receipts-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";

export default function StockReceiptsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return <GoodsReceiptsWorkspace tenantSlug={tenantSlug} />;
}
