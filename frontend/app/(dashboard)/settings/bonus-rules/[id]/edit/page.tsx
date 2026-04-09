"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleForm } from "@/components/bonus-rules/bonus-rule-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function EditBonusRulePage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const ruleId = Number.parseInt(idStr ?? "", 10);
  const invalid = !Number.isFinite(ruleId) || ruleId < 1;

  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bonus-rule", tenantSlug, ruleId],
    enabled: Boolean(tenantSlug) && !invalid,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<BonusRuleRow>(`/api/${tenantSlug}/bonus-rules/${ruleId}`);
      return body;
    }
  });

  return (
    <PageShell>
      <Link
        href="/settings/bonus-rules/active"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-fit -ml-2 text-muted-foreground")}
      >
        ← Bonus qoidalari ro‘yxati
      </Link>

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Некорректный идентификатор правила.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Правило не найдено или ошибка"}
        </p>
      ) : data ? (
        <>
          <PageHeader
            title="Bonus qoidasini tahrirlash"
            description={`${data.name} · #${data.id}`}
            actions={
              <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
                Панель управления
              </Link>
            }
          />
          <BonusRuleForm tenantSlug={tenantSlug} initialRule={data} />
        </>
      ) : (
        <p className="text-sm text-destructive">Нет данных.</p>
      )}
    </PageShell>
  );
}
