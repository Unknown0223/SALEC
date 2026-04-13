"use client";

import { OrderHistoryView } from "@/components/orders/order-history-view";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function OrderHistoryPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const orderId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const invalid = !Number.isFinite(orderId) || orderId < 1;

  return (
    <PageShell className="pb-12">
      <Link
        href={invalid ? "/orders" : `/orders/${orderId}`}
        className="mb-3 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← Orqaga
      </Link>

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">Sessiya topilmadi.</p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Zakaz identifikatori noto‘g‘ri.</p>
      ) : (
        <OrderHistoryView tenantSlug={tenantSlug} orderId={orderId} />
      )}
    </PageShell>
  );
}
