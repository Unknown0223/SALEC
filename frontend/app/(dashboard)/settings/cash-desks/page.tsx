"use client";

import Link from "next/link";
import { CashDesksWorkspace } from "@/components/cash-desks/cash-desks-workspace";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";

export default function CashDesksSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const canWrite = role === "admin" || role === "operator";

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Загрузка сессии…</p>;
  }
  if (!tenantSlug) {
    return (
      <p className="text-sm text-destructive">
        <Link href="/login" className="underline">
          Kirish
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Кассы</h1>
        <Link href="/settings" className="text-sm text-primary underline">
          ← Sozlamalar
        </Link>
      </div>
      <CashDesksWorkspace tenantSlug={tenantSlug} canWrite={canWrite} />
    </div>
  );
}
