"use client";

import { OrderCreateWorkspace } from "@/components/orders/order-create-workspace";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>;
  }

  if (!tenantSlug) {
    return (
      <p className="text-sm text-destructive">
        <Link href="/login" className="underline">
          Qayta kiring
        </Link>
      </p>
    );
  }

  const orderType = (searchParams.get("type") ?? "order").trim();

  return (
    <OrderCreateWorkspace
      tenantSlug={tenantSlug}
      onCreated={() => router.push("/orders")}
      onCancel={() => router.push("/orders")}
      orderType={orderType}
    />
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yuklanmoqda…</p>}>
      <NewOrderContent />
    </Suspense>
  );
}
