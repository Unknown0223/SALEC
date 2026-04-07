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
  ArrowLeftRight,
  BarChart3,
  BoxesIcon,
  FileDown,
  Gift,
  MapPin,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  Undo2,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DashboardDayActivityChart } from "@/components/charts/analytics-charts";

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
  { href: "/products", title: "Товары", desc: "SKU, цены, импорт Excel", icon: Package },
  { href: "/orders", title: "Заказы", desc: "Список, фильтр по статусу", icon: ShoppingCart },
  { href: "/orders/new", title: "Новый заказ", desc: "Быстрое создание", icon: Plus },
  { href: "/clients", title: "Клиенты", desc: "Поиск, карточка", icon: Users },
  { href: "/payments", title: "Платежи", desc: "Список и ввод", icon: Wallet },
  { href: "/payments/new", title: "Новый платёж", desc: "На баланс клиента", icon: UserPlus },
  { href: "/returns", title: "Возвраты", desc: "Склад и возврат средств", icon: Undo2 },
  { href: "/stock/transfers", title: "Перемещение склада", desc: "Трансферы A → B, фильтр", icon: ArrowLeftRight },
  { href: "/expenses", title: "Расходы", desc: "PnL, статус, таблица", icon: Receipt },
  { href: "/territories", title: "Территории", desc: "Список территорий", icon: MapPin },
  { href: "/stock/low", title: "Низкий остаток", desc: "Список предупреждений", icon: AlertTriangle },
  { href: "/reports", title: "Отчёты", desc: "Аналитика продаж, KPI", icon: BarChart3 },
  { href: "/settings/bonus-rules/active", title: "Бонусные правила", desc: "Создание и редактирование", icon: Gift },
  { href: "/stock/receipts", title: "Приходные документы", desc: "Поступление на склад", icon: FileDown },
  { href: "/stock/balances", title: "Остатки на складе", desc: "Баланс по товарам", icon: BoxesIcon }
] as const;

export type DashboardHomeProps = {
  headerTitle?: string;
  headerDescription?: string;
};

export function DashboardHome({
  headerTitle = "Панель управления",
  headerDescription = "Показатели за сегодня (день UTC) и быстрые ссылки."
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
              Новый заказ
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/payments/new">
              Новый платёж
            </Link>
          </div>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : statsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка статистики…</p>
      ) : statsQ.isError ? (
        <p className="text-sm text-destructive">Не удалось загрузить статистику.</p>
      ) : statsQ.data ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Заказов сегодня ({statsQ.data.day_utc})</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.orders_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              В работе: {statsQ.data.orders_active}
            </CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Платежей сегодня</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.payments_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Сумма:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {statsQ.data.payments_sum_today}
              </span>
            </CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Возвратов сегодня</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{statsQ.data.returns_today}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Количество оформленных возвратов</CardContent>
          </Card>
          <Card className="border-border/90">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">Каталог / открытая задолженность</CardDescription>
              <CardTitle className="text-lg tabular-nums leading-snug">
                {statsQ.data.clients_total} клиентов · {statsQ.data.products_active} товаров
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Сумма открытых заказов:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {statsQ.data.open_orders_total}
              </span>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {statsQ.data ? (
        <Card className="mb-8 border-border/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Активность за сегодня</CardTitle>
            <CardDescription className="text-xs">Заказы, в работе, платежи и возвраты (диаграмма)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <DashboardDayActivityChart
              ordersToday={statsQ.data.orders_today}
              ordersActive={statsQ.data.orders_active}
              paymentsToday={statsQ.data.payments_today}
              returnsToday={statsQ.data.returns_today}
            />
          </CardContent>
        </Card>
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
                    Открыть →
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:text-primary hover:underline" href="/">
          Главная
        </Link>
      </p>
    </PageShell>
  );
}
