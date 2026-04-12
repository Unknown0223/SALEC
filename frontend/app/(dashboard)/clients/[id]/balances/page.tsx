"use client";

import { ClientBalanceLedgerView } from "@/components/clients/client-balance-ledger-view";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ClientBalancesHubPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const clientId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const invalid = !Number.isFinite(clientId) || clientId < 1;

  if (!hydrated) {
    return (
      <PageShell className="pb-12">
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      </PageShell>
    );
  }
  if (!tenantSlug) {
    return (
      <PageShell className="pb-12">
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      </PageShell>
    );
  }
  if (invalid) {
    return (
      <PageShell className="pb-12">
        <p className="text-sm text-destructive">Некорректный идентификатор клиента.</p>
      </PageShell>
    );
  }

  return <ClientBalanceLedgerView clientId={clientId} pageShellClassName="pb-12" />;
}
