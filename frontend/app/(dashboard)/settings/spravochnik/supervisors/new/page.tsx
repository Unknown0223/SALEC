"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/dashboard/page-shell";
import { StaffCreateForm } from "@/components/staff/staff-create-form";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";

export default function NewSupervisorPage() {
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-4">
        <Link href="/settings/spravochnik/supervisors" className="text-sm text-primary underline">
          ← Supervizorlar ro‘yxati
        </Link>
      </div>
      <StaffCreateForm
        kind="supervisor"
        tenantSlug={tenantSlug}
        onSuccess={() => router.push("/settings/spravochnik/supervisors")}
        onCancel={() => router.back()}
      />
    </PageShell>
  );
}
