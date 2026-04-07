import { AppShell } from "@/components/dashboard/app-shell";
import type { ReactNode } from "react";
import { Suspense } from "react";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[40vh] p-6 text-sm text-muted-foreground">Загрузка…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
