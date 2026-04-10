"use client";

import { BonusRuleForm } from "@/components/bonus-rules/bonus-rule-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";

export default function NewDiscountRulePage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();

  return (
    <PageShell>
      <Link
        href="/settings/discount-rules/active"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-fit -ml-2 text-muted-foreground")}
      >
        ← Chegirmalar ro‘yxati
      </Link>
      <PageHeader
        title="Yangi skidka qoidasi"
        description="Foizli chegirma yoki minimal buyurtma summasi (sovg‘a), muddat, filtrlar va mahsulot doirasi — dona bonuslari «Bonuslar»da."
        actions={
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
            Панель управления
          </Link>
        }
      />

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : (
        <BonusRuleForm tenantSlug={tenantSlug} initialRule={null} variant="discountOnly" />
      )}
    </PageShell>
  );
}
