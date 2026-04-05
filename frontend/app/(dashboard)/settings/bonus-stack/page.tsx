"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Gift, Layers, ListChecks, ListX, Settings } from "lucide-react";
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
    queryFn: async () => {
      const { data } = await api.get<{ bonus_stack: BonusStackJson }>(`/api/${tenantSlug}/settings/bonus-stack`);
      return data.bonus_stack;
    }
  });

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  const bs = stackQ.data;

  const cards = [
    {
      href: "/settings/bonus-rules",
      title: "Bonus qoidalari",
      desc: "Barcha qoidalar ro‘yxati va tahrirlash.",
      icon: Gift
    },
    {
      href: "/settings/bonus-rules/strategy",
      title: "Bonus strategiyasi",
      desc: "Birlashtirish tartibi (stack policy).",
      icon: Layers
    },
    {
      href: "/settings/bonus-rules/active",
      title: "Faol qoidalar",
      desc: "Faqat yoqilgan qoidalar.",
      icon: ListChecks
    },
    {
      href: "/settings/bonus-rules/inactive",
      title: "Nofaol qoidalar",
      desc: "O‘chirilgan yoki vaqtinchalik to‘xtatilgan.",
      icon: ListX
    }
  ];

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Bonuslar va chegirmalar"
        description="Bonus stack sozlamasi va qoidalar bo‘limlari."
        actions={
          <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Katalog
          </Link>
        }
      />

      <SettingsWorkspace>
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Settings className="mt-0.5 size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium">Tenant bonus stack</h3>
              {stackQ.isLoading ? (
                <p className="mt-1 text-sm text-muted-foreground">Yuklanmoqda…</p>
              ) : stackQ.isError ? (
                <p className="mt-1 text-sm text-destructive">O‘qib bo‘lmadi.</p>
              ) : (
                <dl className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">Rejim</dt>
                    <dd className="text-foreground">{bs?.mode ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">Max. birlik</dt>
                    <dd className="text-foreground">{bs?.max_units ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline text-xs uppercase tracking-wide">Barcha moslarni taqiqlash</dt>
                    <dd className="text-foreground">{bs?.forbid_apply_all_eligible === true ? "Ha" : "Yo‘q"}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Stack qiymatini o‘zgartirish uchun API{" "}
                <code className="rounded bg-muted px-1">PATCH /settings/bonus-stack</code> yoki keyingi tahrirda shu sahifaga
                forma qo‘shiladi.
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
