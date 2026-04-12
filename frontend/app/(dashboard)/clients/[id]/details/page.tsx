"use client";

import { ClientDetailView } from "@/components/clients/client-detail-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams } from "next/navigation";

/** Полная карточка: PDF, движения счёта, админ, журнал (прежний интерфейс). */
export default function ClientDetailsOfficePage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const clientId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const invalid = !Number.isFinite(clientId) || clientId < 1;

  return (
    <PageShell className="pb-12">
      <div className="flex flex-wrap gap-2">
        <Link
          href={invalid ? "/clients" : `/clients/${clientId}/balances`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-8 w-fit -ml-2 text-muted-foreground"
          )}
        >
          ← Профиль клиента
        </Link>
        <Link href="/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 text-muted-foreground")}>
          Клиенты
        </Link>
      </div>
      <PageHeader
        title="Служебная карточка"
        description={!invalid ? `Клиент #${clientId} — акт-сверка, баланс, журнал` : undefined}
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Некорректный идентификатор клиента.</p>
      ) : (
        <ClientDetailView tenantSlug={tenantSlug} clientId={clientId} />
      )}
    </PageShell>
  );
}
