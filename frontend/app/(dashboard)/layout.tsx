import { AppShell } from "@/components/dashboard/app-shell";
import type { ReactNode } from "react";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
