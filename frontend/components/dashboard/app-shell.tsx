"use client";

import { OrderSseListener } from "@/components/dashboard/order-sse-listener";
import { dashboardNavGroups } from "@/components/dashboard/nav-config";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenantSlug, clearSession } = useAuthStore();

  function logout() {
    clearSession();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh w-full">
      <OrderSseListener />
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-panel md:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <div className="mb-2 h-1 w-10 rounded-full bg-sidebar-primary" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/70">
            Savdo panel
          </p>
          <p className="truncate text-sm font-semibold text-sidebar-foreground" title={tenantSlug ?? undefined}>
            {tenantSlug ?? "—"}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
          {dashboardNavGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <Button
            className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            variant="outline"
            size="sm"
            type="button"
            onClick={logout}
          >
            Chiqish
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border/80 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Savdo</p>
              <span className="truncate text-sm font-semibold">{tenantSlug ?? "Panel"}</span>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={logout}>
              Chiqish
            </Button>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto pb-0.5">
            {dashboardNavGroups.flatMap((g) => g.items).map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="app-main-canvas flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 md:px-6 md:py-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
