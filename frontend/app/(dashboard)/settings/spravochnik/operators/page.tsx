"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { OperatorsWorkspace } from "@/components/staff/operators-workspace";

export default function OperatorsSpravochnikPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  if (role !== "admin") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Veb xodimlarni boshqarish faqat administrator uchun.</p>
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Spravochnik
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Veb xodimlar</h1>
        <Link href="/settings/spravochnik" className="text-sm text-primary underline">
          ← Spravochnik
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Veb-panel orqali ishlaydigan xodimlar (hozircha tizim roli <code className="text-foreground">operator</code>
        ); lavozim maydoni orqali «kassir», «menejer» kabi sarlavhalar beriladi.
      </p>
      <OperatorsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
