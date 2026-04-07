"use client";

import { TradeDirectionsWorkspace } from "@/components/settings/sales-directions/trade-directions-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";

export default function TradeDirectionsSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка сессии…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Направление торговли</h1>
        <Link href="/settings/company" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Sozlamalar
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Ro‘yxat agent va ekspeditor «Направление торговли» maydonida tanlanadi; mijozlar va bonuslar uchun alohida spravochniklar
        mavjud.
      </p>
      <TradeDirectionsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
