"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BoxesIcon,
  FileDown,
  Gift,
  Library,
  Package,
  Plus,
  ShoppingCart,
  Undo2,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type DashboardStats = {
  day_utc: string;
  orders_today: number;
  orders_active: number;
  payments_today: number;
  payments_sum_today: string;
  returns_today: number;
  clients_total: number;
  products_active: number;
  open_orders_total: string;
};

const modules = [
  { href: "/products", title: "Mahsulotlar", desc: "SKU, narxlar, Excel import", icon: Package },
  { href: "/orders", title: "Zakazlar", desc: "Ro’yxat, holat filtri", icon: ShoppingCart },
  { href: "/orders/new", title: "Yangi zakaz", desc: "Tezkor yaratish", icon: Plus },
  { href: "/clients", title: "Klientlar", desc: "Qidiruv, kartochka", icon: Users },
  { href: "/payments", title: "To’lovlar", desc: "Ro’yxat va kiritish", icon: Wallet },
  { href: "/payments/new", title: "Yangi to’lov", desc: "Mijoz balansiga", icon: UserPlus },
  { href: "/returns", title: "Qaytarishlar", desc: "Ombor va pul qaytarish", icon: Undo2 },
  { href: "/stock/low", title: "Kam qoldiq", desc: "Ogohlantirish ro’yxati", icon: AlertTriangle },
  { href: "/reports", title: "Hisobotlar", desc: "Savdo tahlili, KPI", icon: BarChart3 },
  { href: "/settings/bonus-rules/active", title: "Bonus qoidalari", desc: "CRUD", icon: Gift },
  { href: "/stock/receipts", title: "Kirim hujjatlari", desc: "Postuplenie", icon: FileDown },
  { href: "/stock/balances", title: "Ombor qoldiqlari", desc: "Tovarlar balans", icon: BoxesIcon }
] as const;

export type DashboardHomeProps = {
  headerTitle?: string;
  headerDescription?: string;
};

export function DashboardHome({
  headerTitle = "Boshqaruv",
  headerDescription = "Bugungi ko‘rsatkichlar (UTC kun) va tezkor havolalar."
}: DashboardHomeProps) {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const statsQ = useQuery({
    queryKey: ["dashboard-stats", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>(`/api/${tenantSlug}/dashboard/stats`);
      return data;
    }
  });

  return (
    <PageShell>
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/orders/new">
              Yangi zakaz
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/payments/new">
              Yangi to‘lov
            </Link>
          </div>
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
      ) : statsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Statistika yuklanmoqda…</p>
      ) : statsQ.isError ? (
        <p className="text-sm text-destructive">Statistikani yuklab bo‘lmadi.</p>
      ) : statsQ.data ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Bugun zakazlar ({statsQ.data.day_utc})</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.orders_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Faol jarayonda: {statsQ.data.orders_active}
            </CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Bugun to‘lovlar</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.payments_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Summa:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {statsQ.data.payments_sum_today}
              </span>
            </CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Bugun qaytarishlar</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.returns_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Posted qaytarishlar soni</CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Katalog / ochiq qarz</CardDescription>
              <CardTitle className="text-lg tabular-nums leading-snug">
                {statsQ.data.clients_total} klient · {statsQ.data.products_active} mahsulot
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Ochiq zakazlar yig‘indisi:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {statsQ.data.open_orders_total}
              </span>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full border-border/90 transition-all group-hover:border-primary/35 group-hover:shadow-panel-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
                      aria-hidden
                    >
                      <Icon className="h-5 w-5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-base transition-colors group-hover:text-primary">
                        {m.title}
                      </CardTitle>
                      <CardDescription className="mt-1">{m.desc}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Ochish →
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:text-primary hover:underline" href="/">
          Bosh sahifa
        </Link>
      </p>
    </PageShell>
  );
}
