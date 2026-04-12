"use client";

import { ClientProfileHub } from "@/components/clients/client-profile-hub";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ClientDetailPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const clientId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const invalid = !Number.isFinite(clientId) || clientId < 1;

  return (
    <PageShell className="pb-12">
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
        <ClientProfileHub tenantSlug={tenantSlug} clientId={clientId} />
      )}
    </PageShell>
  );
}
