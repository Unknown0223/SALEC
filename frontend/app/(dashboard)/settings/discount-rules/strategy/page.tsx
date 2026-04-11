"use client";

import { BonusStrategySettings } from "@/components/bonus-rules/bonus-strategy-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function DiscountRulesStrategyPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);

  return (
    <PageShell>
      <Link
        href="/settings/discount-rules/active"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Активные скидки
      </Link>
      <PageHeader
        title="Стратегия бонусов и скидок"
        description={
          tenantSlug
            ? `Объединение правил в заказе (stack). Тенант: ${tenantSlug}`
            : "Объединение правил в заказе (stack)."
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
