import { AppShell } from "@/components/dashboard/app-shell";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
