import { AppShell } from "@/components/dashboard/app-shell";
import { RouteLoadingFallback } from "@/components/ui/route-loading-fallback";
import type { ReactNode } from "react";
import { Suspense } from "react";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoadingFallback rootLayout />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
