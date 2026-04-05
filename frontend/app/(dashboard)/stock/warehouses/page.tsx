"use client";

import { WarehousesWorkspace } from "@/components/warehouses/warehouses-workspace";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";

export default function StockWarehousesPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const canWrite = role === "admin" || role === "operator";

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return <WarehousesWorkspace tenantSlug={tenantSlug} canWrite={canWrite} />;
}
