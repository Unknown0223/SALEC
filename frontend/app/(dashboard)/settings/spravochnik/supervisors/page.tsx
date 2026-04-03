"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { SupervisorsWorkspace } from "@/components/staff/supervisors-workspace";

export default function SupervisorsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Супервайзеры</h1>
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Spravochnik
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Agentlar ostidagi rahbarlar. «Агент» ustunida biriktirilgan agentlar; tahrirlash modalida ro‘yxatni to‘liq
        yangilash mumkin.
      </p>
      <SupervisorsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
