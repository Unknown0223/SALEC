"use client";

import { PageShell } from "@/components/dashboard/page-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function PayrollHubPage() {
  return (
    <PageShell>
      <PageHeader
        title="Зарплата"
        description="Расчёт начислений и удержаний — поэтапно подключается к заказам и посещениям."
      />
      <ul className="max-w-xl space-y-3 text-sm">
        <li className="rounded-lg border bg-card p-4">
          <p className="font-medium">Надбавки и вычеты</p>
          <p className="mt-1 text-muted-foreground">Справочные корректировки (уже в системе).</p>
          <Link href="/settings/payroll/adjustments" className={cn(buttonVariants({ variant: "link" }), "mt-2 px-0")}>
            Открыть
          </Link>
        </li>
        <li className="rounded-lg border border-dashed p-4 text-muted-foreground">
          <p className="font-medium text-foreground">Расчётный лист и выплаты</p>
          <p className="mt-1">План: агрегация по агентам, периодам, KPI и экспорт. Мобильное van-selling не требуется для первой версии.</p>
        </li>
      </ul>
    </PageShell>
  );
}
