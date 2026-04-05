"use client";

import { PageShell } from "@/components/dashboard/page-shell";
import { PageHeader } from "@/components/dashboard/page-header";

export default function VanSellingInfoPage() {
  return (
    <PageShell>
      <PageHeader
        title="Van-selling"
        description="Мобильные продажи с машины и офлайн-синхронизация."
      />
      <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          В справочнике складов уже есть признак <strong className="text-foreground">van_selling</strong> — его
          можно включить для точек, работающих как торговые авто.
        </p>
        <p>
          Полноценный van-selling (Android/iOS, офлайн-корзина, синхронизация очереди) выносится в отдельное
          мобильное приложение и API-версионирование; веб-панель остаётся для остатков, заказов и отчётов.
        </p>
        <p className="text-xs">Текущий этап: веб-дашборд и REST API; мобильный клиент — в дорожной карте.</p>
      </div>
    </PageShell>
  );
}
