"use client";

import { SalesChannelsWorkspace } from "@/components/settings/sales-directions/sales-channels-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";

export default function SalesChannelsSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка сессии…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Канал продаж</h1>
        <Link href="/settings/company" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Sozlamalar
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Mijoz kartasidagi «Savdo kanali» va filtrlarda shu yerda kiritilgan qiymatlar (kod yoki nom) ko‘rinadi.
      </p>
      <SalesChannelsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
