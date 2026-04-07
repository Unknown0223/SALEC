"use client";

import { OrderSseListener } from "@/components/dashboard/order-sse-listener";
import {
  dashboardOrdersNav,
  dashboardSidebarLayout,
  dashboardStockNav,
  dashboardUsersNav,
  flattenMobileNavItems,
  type NavItem
} from "@/components/dashboard/nav-config";
import { Button } from "@/components/ui/button";
import { ClientLucideIcon } from "@/components/ui/client-lucide-icon";
import { useAuthStore, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  UserSquare2,
  Wallet,
  Warehouse,
  ClipboardCheck,
  ListTodo
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function isNavActive(pathname: string, href: string): boolean {
  const pathOnly = href.split("?")[0] ?? href;
  if (pathOnly === "/dashboard") return pathname === "/dashboard";
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

/** Заявки: `/orders?status=…`, `/returns/new?…` va boshqalar */
function orderNavItemActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const q = href.indexOf("?");
  const pathPart = (q >= 0 ? href.slice(0, q) : href) || href;
  const qs = q >= 0 ? href.slice(q + 1) : "";

  if (pathPart === "/orders") {
    if (pathname !== "/orders") return false;
    const want = qs ? new URLSearchParams(qs).get("status") : null;
    const cur = searchParams.get("status");
    if (want === "cancelled") return cur === "cancelled";
    return cur !== "cancelled";
  }

  if (pathPart === "/returns/new" && pathname === "/returns/new") {
    if (!qs) {
      return !searchParams.get("by_order") && searchParams.get("intent") !== "exchange";
    }
    const sp = new URLSearchParams(qs);
    for (const [k, v] of Array.from(sp.entries())) {
      if (searchParams.get(k) !== v) return false;
    }
    return true;
  }

  if (pathPart === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }

  if (qs) {
    if (pathname !== pathPart) return false;
    const sp = new URLSearchParams(qs);
    for (const [k, v] of Array.from(sp.entries())) {
      if (searchParams.get(k) !== v) return false;
    }
    return true;
  }

  return pathname === pathPart || pathname.startsWith(`${pathPart}/`);
}

function navItemVisible(item: NavItem, role: string | null): boolean {
  if (!item.roles?.length) return true;
  return role != null && item.roles.includes(role);
}

function usersNavChildActive(pathname: string): boolean {
  return dashboardUsersNav.items.some((item) => isNavActive(pathname, item.href));
}

function ordersNavModuleOpen(pathname: string): boolean {
  return pathname.startsWith("/orders") || pathname.startsWith("/returns");
}

function stockNavChildActive(pathname: string): boolean {
  return dashboardStockNav.items.some((item) => isNavActive(pathname, item.href));
}

function linkIcon(href: string) {
  const path = href.split("?")[0] ?? href;
  if (path === "/dashboard") return LayoutDashboard;
  if (path === "/clients") return Users;
  if (path.startsWith("/settings/cash-desks")) return Wallet;
  if (path === "/payments") return Wallet;
  if (path === "/expenses") return Receipt;
  if (path === "/territories") return MapPin;
  if (path === "/stock/receipts") return Truck;
  if (path === "/reports") return BarChart3;
  if (path.startsWith("/stock")) return Warehouse;
  if (path === "/visits") return ClipboardCheck;
  if (path === "/tasks") return ListTodo;
  if (path === "/routes") return MapPinned;
  if (path.startsWith("/orders") || path.startsWith("/returns")) return ShoppingCart;
  if (path.startsWith("/products")) return Package;
  if (path.startsWith("/settings")) return Settings;
  return LayoutDashboard;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tenantSlug, clearSession } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const [usersOpen, setUsersOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  useEffect(() => {
    if (usersNavChildActive(pathname)) setUsersOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (stockNavChildActive(pathname)) setStockOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (ordersNavModuleOpen(pathname)) setOrdersOpen(true);
  }, [pathname]);

  function logout() {
    clearSession();
    router.replace("/login");
    router.refresh();
  }

  const isSettingsRoute = pathname.startsWith("/settings");

  const mobileItems = flattenMobileNavItems().filter((item) => navItemVisible(item, effectiveRole));

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <OrderSseListener />
      <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[2px_0_12px_rgba(0,0,0,0.06)] md:flex md:min-h-0">
        <div className="border-b border-sidebar-border/80 px-3 py-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/25 text-sidebar-primary-foreground">
            <ClientLucideIcon icon={Package} className="size-5 opacity-90" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/60">
            SALESDOC
          </p>
          <p className="truncate text-sm font-semibold text-sidebar-foreground" title={tenantSlug ?? undefined}>
            {tenantSlug ?? "—"}
          </p>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2 overscroll-contain">
          {dashboardSidebarLayout.map((entry, idx) => {
            if (entry.kind === "link") {
              const { href, label } = entry.item;
              const active = isNavActive(pathname, href);
              const Icon = linkIcon(href);
              return (
                <Link
                  key={`${href}-${idx}`}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/90 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <ClientLucideIcon icon={Icon} className="size-[18px] shrink-0 opacity-90" />
                  {label}
                </Link>
              );
            }

            if (entry.kind === "orders") {
              return (
                <div key="orders" className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setOrdersOpen((o) => !o)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      ordersNavModuleOpen(pathname)
                        ? "bg-sidebar-accent/90 text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                    )}
                    aria-expanded={ordersOpen}
                  >
                    {ordersOpen ? (
                      <ClientLucideIcon icon={ChevronDown} className="size-4 shrink-0 opacity-80" />
                    ) : (
                      <ClientLucideIcon icon={ChevronRight} className="size-4 shrink-0 opacity-80" />
                    )}
                    <ClientLucideIcon icon={ShoppingCart} className="size-[18px] shrink-0 opacity-90" />
                    <span>{dashboardOrdersNav.sectionTitle}</span>
                  </button>
                  {ordersOpen && (
                    <div className="ml-1 space-y-3 border-l border-sidebar-border/60 py-0.5 pl-2">
                      {dashboardOrdersNav.groups.map((group) => (
                        <div key={group.title}>
                          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                            {group.title}
                          </p>
                          <ul className="flex flex-col gap-0.5">
                            {group.items
                              .filter((item) => navItemVisible(item, effectiveRole))
                              .map((item) => {
                                const active = orderNavItemActive(pathname, searchParams, item.href);
                                return (
                                  <li key={`${group.title}-${item.label}-${item.href}`}>
                                    <Link
                                      href={item.href}
                                      className={cn(
                                        "block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                                        active
                                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                                      )}
                                    >
                                      {item.label}
                                    </Link>
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (entry.kind === "stock") {
              return (
                <div key="stock" className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setStockOpen((o) => !o)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      stockNavChildActive(pathname)
                        ? "bg-sidebar-accent/90 text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                    )}
                    aria-expanded={stockOpen}
                  >
                    {stockOpen ? (
                      <ClientLucideIcon icon={ChevronDown} className="size-4 shrink-0 opacity-80" />
                    ) : (
                      <ClientLucideIcon icon={ChevronRight} className="size-4 shrink-0 opacity-80" />
                    )}
                    <ClientLucideIcon icon={Package} className="size-[18px] shrink-0 opacity-90" />
                    <span>{dashboardStockNav.sectionTitle}</span>
                  </button>
                  {stockOpen && (
                    <ul className="ml-1 flex flex-col gap-0.5 border-l border-sidebar-border/60 py-0.5 pl-2">
                      {dashboardStockNav.items.map((item) => {
                        const active = isNavActive(pathname, item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                                active
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                              )}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            }

            if (entry.kind === "users") {
              return (
                <div key="users" className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setUsersOpen((o) => !o)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      usersNavChildActive(pathname)
                        ? "bg-sidebar-accent/90 text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                    )}
                    aria-expanded={usersOpen}
                  >
                    {usersOpen ? (
                      <ClientLucideIcon icon={ChevronDown} className="size-4 shrink-0 opacity-80" />
                    ) : (
                      <ClientLucideIcon icon={ChevronRight} className="size-4 shrink-0 opacity-80" />
                    )}
                    <ClientLucideIcon icon={UserSquare2} className="size-[18px] shrink-0 opacity-90" />
                    <span>{dashboardUsersNav.sectionTitle}</span>
                  </button>
                  {usersOpen && (
                    <ul className="ml-1 flex flex-col gap-0.5 border-l border-sidebar-border/60 py-0.5 pl-2">
                      {dashboardUsersNav.items
                        .filter((item) => navItemVisible(item, effectiveRole))
                        .map((item) => {
                          const active = isNavActive(pathname, item.href);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                                  active
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                                )}
                              >
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              );
            }

            return null;
          })}
        </nav>
        <div className="border-t border-sidebar-border/80 p-2">
          <div className="mb-2 flex justify-center">
            <NotificationBell tenantSlug={tenantSlug} />
          </div>
          <Button
            className="w-full border-sidebar-border/80 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            variant="outline"
            size="sm"
            type="button"
            onClick={logout}
          >
            Выход
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-border/80 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">SALESDOC</p>
              <span className="truncate text-sm font-semibold">{tenantSlug ?? "Панель"}</span>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={logout}>
              Выход
            </Button>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto pb-0.5">
            {mobileItems.map((item) => {
              const active = orderNavItemActive(pathname, searchParams, item.href);
              return (
                <Link
                  key={`${item.label}-${item.href}`}
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

        <div
          className={cn(
            "app-main-canvas flex min-h-0 flex-1 flex-col overflow-hidden",
            isSettingsRoute && "min-h-0"
          )}
        >
          <div
            className={cn(
              "min-h-0 flex-1",
              isSettingsRoute
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
