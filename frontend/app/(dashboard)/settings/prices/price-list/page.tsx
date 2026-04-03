"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Package } from "lucide-react";
import Link from "next/link";

export default function PriceListPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "price-list-meta"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ total: number }>(`/api/${tenantSlug}/products?limit=1&page=1`);
      return data.total;
    }
  });

  const total = productsQ.data ?? null;
  const isEmpty = !productsQ.isLoading && !productsQ.isError && total === 0;
  const hasProducts = !productsQ.isLoading && !productsQ.isError && total !== null && total > 0;

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Прайс-лист"
        description="Barcha mahsulotlar va narx turlari bo‘yicha umumiy ro‘yxat."
        actions={
          <Link href="/settings/prices" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            ← Цена
          </Link>
        }
      />

      <SettingsWorkspace>
        {productsQ.isLoading ? (
          <div
            className="flex min-h-[min(70vh,520px)] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 px-6 py-16"
            aria-busy="true"
          >
            <div className="size-10 animate-pulse rounded-full bg-muted" />
            <p className="mt-4 text-sm text-muted-foreground">Yuklanmoqda…</p>
          </div>
        ) : productsQ.isError ? (
          <div className="flex min-h-[min(50vh,400px)] flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
            <p className="text-sm text-destructive">Ma&apos;lumotni yuklashda xato yuz berdi.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => productsQ.refetch()}>
              Qayta urinish
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="flex min-h-[min(70vh,520px)] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/25 px-6 py-16 text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-muted">
              <Package className="size-8 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Ma&apos;lumot yo&apos;q</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Hozircha tizimda mahsulot yozuvlari yo&apos;q — shu sababli prays-list ham bo&apos;sh. Avval
              katalogga mahsulot qo&apos;shing yoki Excel orqali import qiling.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <Link href="/products" className={cn(buttonVariants({ size: "sm" }))}>
                Mahsulotlarga o‘tish
              </Link>
              <Link href="/settings/products/excel" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Excel import
              </Link>
              <Link
                href="/settings/prices/matrix"
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                Narxni o‘rnatish
              </Link>
            </div>
          </div>
        ) : hasProducts ? (
          <div className="space-y-6">
            <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{total?.toLocaleString("uz-UZ")}</span> ta mahsulot
              mavjud. Ko‘p ustunli prays-listni fayl sifatida olish uchun Excel import / eksportdan foydalaning.
            </div>
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-muted/15 px-6 py-12 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
                <FileSpreadsheet className="size-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold">Jadval ko‘rinishi keyinroq</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Interaktiv prays-list (barcha narx turlari ustunlari) hozircha shu sahifada chiqarilmaydi.{" "}
                <Link href="/settings/products/excel" className="text-primary underline underline-offset-4">
                  Mahsulot / narx Excel
                </Link>{" "}
                yoki API orqali eksport qiling.
              </p>
              <p className="mt-3 max-w-lg text-xs text-muted-foreground">
                Narx turlari va oxirgi yangilanish:{" "}
                <Link href="/settings/prices" className="text-primary underline underline-offset-4">
                  Sozlamalar → Цена
                </Link>
                .
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href="/settings/products/excel" className={cn(buttonVariants({ size: "sm" }))}>
                  Excel sahifasi
                </Link>
                <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Mahsulotlar
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </SettingsWorkspace>
    </PageShell>
  );
}
