"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Gift, Layers, ListChecks, ListX, Percent, Settings } from "lucide-react";
import Link from "next/link";

type BonusStackJson = {
  mode?: string;
  max_units?: number | null;
  forbid_apply_all_eligible?: boolean;
};

export default function BonusStackHubPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const stackQ = useQuery({
    queryKey: ["settings", "bonus-stack", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{ bonus_stack: BonusStackJson }>(`/api/${tenantSlug}/settings/bonus-stack`);
      return data.bonus_stack;
    }
  });

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Сессия…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти
          </Link>
        </p>
      </PageShell>
    );
  }

  const bs = stackQ.data;

  const cards = [
    {
      href: "/settings/bonus-rules",
      title: "Правила бонусов",
      desc: "Бонусы по количеству и сумме — список и редактирование.",
      icon: Gift
    },
    {
      href: "/settings/discount-rules/active",
      title: "Скидки",
      desc: "Процентные скидки — отдельный раздел.",
      icon: Percent
    },
    {
      href: "/settings/bonus-rules/strategy",
      title: "Стратегия бонусов",
      desc: "Порядок объединения (stack).",
      icon: Layers
    },
    {
      href: "/settings/bonus-rules/active",
      title: "Активные правила",
      desc: "Только включённые правила.",
      icon: ListChecks
    },
    {
      href: "/settings/bonus-rules/inactive",
      title: "Неактивные правила",
      desc: "Выключенные или приостановленные.",
      icon: ListX
    }
  ];

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Бонусы и скидки"
        description="Настройка bonus stack и разделы правил."
        actions={
          <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Каталог
          </Link>
        }
      />

      <SettingsWorkspace>
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Settings className="mt-0.5 size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium">Bonus stack тенанта</h3>
              {stackQ.isLoading ? (
                <p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>
              ) : stackQ.isError ? (
                <p className="mt-1 text-sm text-destructive">Не удалось прочитать.</p>
              ) : (
                <dl className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">Режим</dt>
                    <dd className="text-foreground">{bs?.mode ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">Макс. единиц</dt>
                    <dd className="text-foreground">{bs?.max_units ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline text-xs uppercase tracking-wide">Запрет выдать все слоты</dt>
                    <dd className="text-foreground">{bs?.forbid_apply_all_eligible === true ? "Да" : "Нет"}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Изменить stack можно через API{" "}
                <code className="rounded bg-muted px-1">PATCH /settings/bonus-stack</code> или форму на странице
                стратегии.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <c.icon className="size-5 text-muted-foreground group-hover:text-foreground" />
              </div>
              <div className="min-w-0">
                <div className="font-medium leading-tight">{c.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </SettingsWorkspace>
    </PageShell>
  );
}
