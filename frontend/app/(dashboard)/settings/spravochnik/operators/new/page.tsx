"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { WebOperatorCreateWorkspace } from "@/components/staff/web-operator-create-workspace";

export default function NewOperatorPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  if (role !== "admin") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Faqat administrator uchun.</p>
        <Link href="/settings/spravochnik/operators" className="text-sm text-primary underline">
          ← Ro‘yxat
        </Link>
      </div>
    );
  }

  return <WebOperatorCreateWorkspace tenantSlug={tenantSlug} />;
}
