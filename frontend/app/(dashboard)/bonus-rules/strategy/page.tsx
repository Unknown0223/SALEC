"use client";

import { BonusStrategySettings } from "@/components/bonus-rules/bonus-strategy-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function BonusStrategyPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  return (
    <PageShell>
      <Link
        href="/bonus-rules/active"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Faol qoidalar
      </Link>
      <PageHeader
        title="Bonus strategiyasi"
        description={
          tenantSlug
            ? `Bir zakazda nechta avtomatik bonus slot qo‘llanishi. Tenant: ${tenantSlug}`
            : "Bir zakazda nechta avtomatik bonus slot qo‘llanishi."
        }
        actions={
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
            Boshqaruv
          </Link>
        }
      />
      <BonusStrategySettings />
    </PageShell>
  );
}
