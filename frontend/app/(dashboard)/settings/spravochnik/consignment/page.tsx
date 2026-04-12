"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { ConsignmentWorkspace } from "@/components/staff/consignment-workspace";

export default function ConsignmentPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка сессии…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Справочники
        </Link>
      </div>
      <ConsignmentWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
