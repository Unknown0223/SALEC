"use client";

import { BonusStrategySettings } from "@/components/bonus-rules/bonus-strategy-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function BonusStrategyPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  return (
    <PageShell>
      <Link
        href="/settings/bonus-rules/active"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Активные правила
      </Link>
      <PageHeader
        title="Стратегия бонусов"
        description={
          tenantSlug
            ? `Сколько автоматических бонусных слотов применять в одном заказе. Тенант: ${tenantSlug}`
            : "Сколько автоматических бонусных слотов применять в одном заказе."
        }
        actions={
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
            Панель управления
          </Link>
        }
      />
      <BonusStrategySettings />
    </PageShell>
  );
}
