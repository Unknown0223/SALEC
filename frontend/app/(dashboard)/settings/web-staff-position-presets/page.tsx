"use client";

import Link from "next/link";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { WebStaffPositionPresetsWorkspace } from "@/components/settings/web-staff-position-presets-workspace";

export default function WebStaffPositionPresetsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>;
  }

  if (role !== "admin") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Bu bo‘lim faqat administrator uchun.</p>
        <Link href="/settings" className="text-sm text-primary underline">
          ← Sozlamalar
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Veb xodim lavozimlari</h1>
        <Link href="/settings" className="text-sm text-primary underline">
          ← Sozlamalar
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Yuqoridagi yorliqlar orqali faol va nofaol ro‘yxatni almashtirasiz. Yaratish va nofaollashtirish vaqti hamda
        kim qilgani ko‘rsatiladi. Yangi nom modaldan, tahrirlash jadvalda. Ro‘yxat{" "}
        <Link href="/settings/spravochnik/operators" className="text-primary underline">
          Veb xodimlar
        </Link>{" "}
        sahifasida ham ishlatiladi.
      </p>
      <WebStaffPositionPresetsWorkspace tenantSlug={tenantSlug} />
    </div>
  );
}
