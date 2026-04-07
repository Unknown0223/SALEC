"use client";

import { KpiGroupsWorkspace } from "@/components/settings/sales-directions/kpi-groups-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";

export default function KpiGroupsSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка сессии…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Группа KPI</h1>
        <Link href="/settings/company" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Sozlamalar
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Mahsulotlar va agentlar bilan bog‘lanadi; hisobot va KPI logikasida keyinroq ishlatish uchun ma’lumotlar bazasida saqlanadi.
      </p>
      <KpiGroupsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
