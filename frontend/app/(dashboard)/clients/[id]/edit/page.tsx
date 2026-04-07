"use client";

import { ClientEditForm } from "@/components/clients/client-edit-form";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function ClientEditPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const rawId = params.id;
  const clientId = Number.parseInt(typeof rawId === "string" ? rawId : "", 10);

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      </PageShell>
    );
  }

  if (!Number.isFinite(clientId) || clientId < 1) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">Noto‘g‘ri mijoz identifikatori.</p>
        <Link href="/clients" className="text-sm text-primary underline">
          Ro‘yxatga qaytish
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-[min(100%,90rem)]">
      <ClientEditForm
        tenantSlug={tenantSlug}
        clientId={clientId}
        onSuccess={() => router.push(`/clients/${clientId}`)}
        onCancel={() => router.back()}
      />
    </PageShell>
  );
}
