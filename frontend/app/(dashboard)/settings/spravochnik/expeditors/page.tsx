"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { ExpeditorsWorkspace } from "@/components/staff/expeditors-workspace";

export default function ExpeditorsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Экспедиторы</h1>
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Spravochnik
        </Link>
      </div>
      <ExpeditorsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
