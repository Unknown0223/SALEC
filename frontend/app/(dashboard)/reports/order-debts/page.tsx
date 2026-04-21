"use client";

import { OrderDebtsWorkspace } from "@/components/reports/order-debts-workspace";
import { Suspense } from "react";

export default function OrderDebtsReportPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Загрузка…</div>}>
      <OrderDebtsWorkspace />
    </Suspense>
  );
}
