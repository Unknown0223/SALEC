"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { StaffManageView } from "@/components/staff/staff-manage-view";

export default function SupervisorsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Supervizorlar</h1>
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Spravochnik
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Agentlar ostidagi rahbarlar. Klientlar filtrida va agent kartasida faqat shu ro‘yxatdan tanlanadi.
      </p>
      <StaffManageView kind="supervisor" tenantSlug={tenantSlug} />
    </div>
  );
}
