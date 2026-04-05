"use client";

import { OrderDetailView } from "@/components/orders/order-detail-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function OrderDetailPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const orderId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [showPrint, setShowPrint] = useState(false);

  const invalid = !Number.isFinite(orderId) || orderId < 1;

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setShowPrint(false);
    }, 200);
  };

  return (
    <PageShell className="pb-12">
      <Link
        href="/orders"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Zakazlar ro’yxati
      </Link>
      <PageHeader
        title="Zakaz tafsilotlari"
        description={!invalid ? `id #${orderId}` : undefined}
        actions={
          <>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              onClick={handlePrint}
            >
              🖨 Chop etish
            </button>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/payments/new?order_id=${orderId}`}>
              To’lov qabul
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/returns/new?order_id=${orderId}`}>
              Qaytarish
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
        <p className="text-sm text-destructive">Zakaz identifikatori noto’g’ri.</p>
      ) : (
        <OrderDetailView tenantSlug={tenantSlug} orderId={orderId} showPrintView={showPrint} />
      )}
    </PageShell>
  );
}
