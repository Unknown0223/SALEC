"use client";

import { ClientDetailView } from "@/components/clients/client-detail-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <Link
        href="/clients"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Klientlar ro‘yxati
      </Link>
      <PageHeader
        title="Klient kartochkasi"
        description={!invalid ? `id #${clientId}` : undefined}
        actions={
          <>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/dashboard">
              Boshqaruv
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/orders">
              Zakazlar
            </Link>
          </>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Klient identifikatori noto‘g‘ri.</p>
      ) : (
        <ClientDetailView tenantSlug={tenantSlug} clientId={clientId} />
      )}
    </PageShell>
  );
}
