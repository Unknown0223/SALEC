"use client";

import { GoodsReceiptNewWorkspace } from "@/components/stock/goods-receipt-new-workspace";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import Link from "next/link";

export default function StockReceiptNewPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const canWrite = role === "admin" || role === "operator";

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (!canWrite) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-muted-foreground">Недостаточно прав.</p>
        <Link href="/stock/receipts" className="text-sm text-teal-600 underline">
          К списку
        </Link>
      </div>
    );
  }

  return <GoodsReceiptNewWorkspace tenantSlug={tenantSlug} />;
}
