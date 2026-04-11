"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleForm } from "@/components/bonus-rules/bonus-rule-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { readBonusRuleCloneDraft } from "@/lib/bonus-rule-clone-draft";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function NewBonusRulePage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const [clonePack, setClonePack] = useState<{ rule: BonusRuleRow; nonce: string } | null>(null);
  useEffect(() => {
    const rule = readBonusRuleCloneDraft("bonus");
    if (rule) setClonePack({ rule, nonce: `clone-${Date.now()}` });
  }, []);
  const pageTitle = useMemo(
    () => (clonePack ? "Новое правило бонуса (копия)" : "Новое правило бонуса"),
    [clonePack]
  );

  return (
    <PageShell>
      <Link
        href="/settings/bonus-rules/active"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-fit -ml-2 text-muted-foreground")}
      >
        ← Список правил бонусов
      </Link>
      <PageHeader
        title={pageTitle}
        description={
          clonePack
            ? "Поля заполнены с выбранного правила. Измените название или условия и нажмите «Сохранить», чтобы создать новую запись."
            : "Основные данные, условия, срок, фильтры и клиенты — в одной форме."
        }
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
        <BonusRuleForm
          tenantSlug={tenantSlug}
          initialRule={clonePack?.rule ?? null}
          prefillNonce={clonePack?.nonce ?? null}
        />
      )}
    </PageShell>
  );
}
