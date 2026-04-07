"use client";

import { BonusRuleForm } from "@/components/bonus-rules/bonus-rule-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";

export default function NewBonusRulePage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();

  return (
    <PageShell>
      <Link
        href="/settings/bonus-rules/active"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-fit -ml-2 text-muted-foreground")}
      >
        ← Bonus qoidalari ro‘yxati
      </Link>
      <PageHeader
        title="Yangi bonus qoidasi"
        description="Barcha maydonlarni bosqichma-bosqich to‘ldiring. O‘ngdagi “Qisqacha” blokini tekshirib boring."
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
        <BonusRuleForm tenantSlug={tenantSlug} initialRule={null} />
      )}
    </PageShell>
  );
}
