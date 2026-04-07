"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
export default function SpravochnikPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const effectiveRole = useEffectiveRole();

  const users = useQuery({
    queryKey: ["ref-users", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; login: string; name: string; role: string }[] }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  const categories = useQuery({
    queryKey: ["product-categories", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string; parent_id: number | null }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    }
  });

  const priceTypes = useQuery({
    queryKey: ["price-types", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types`);
      return data.data;
    }
  });

  const profile = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        references: { payment_types: string[]; return_reasons: string[]; regions: string[] };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Spravochniklar</h1>
        <p className="text-sm text-muted-foreground">Foydalanuvchilar, kategoriyalar, narx turlari</p>
        <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/dashboard">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <h2 className="text-sm font-semibold">Yagona sozlamalar katalogi</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Barcha bo‘limlar chap paneldagi katalog orqali: territoriya, filiallar, narxlar, uskunalar va boshqalar.
        </p>
        <Link
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-3 inline-flex")}
          href="/settings"
        >
          Sozlamalar katalogiga o‘tish
        </Link>
      </section>

      {!hydrated || !tenantSlug ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <>
          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Ombor boshqaruvi</h2>
            <p className="text-xs text-muted-foreground">
              Omborga oid sozlamalar alohida bo‘limga ko‘chirildi.
            </p>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock/warehouses">
              Omborlar sahifasini ochish
            </Link>
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Mijoz kartochkasi tanlovlari</h2>
            <p className="text-xs text-muted-foreground">
              Toifa, tur, format, savdo kanali, tuman, mahalla, zona, logistika — mijoz tahririda dropdown uchun.
            </p>
            <Link
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
              href="/settings/spravochnik/client-lists"
            >
              Mijoz spravochniklarini boshqarish
            </Link>
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Foydalanuvchilar</h2>
            <div className="flex flex-wrap gap-2">
              <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/settings/spravochnik/agents">
                Agentlar bo‘limi
              </Link>
              <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/settings/spravochnik/expeditors">
                Ekspeditorlar bo‘limi
              </Link>
              <Link
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                href="/settings/spravochnik/supervisors"
              >
                Supervizorlar
              </Link>
              {effectiveRole === "admin" ? (
                <Link
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  href="/settings/spravochnik/operators"
                >
                  Veb xodimlar
                </Link>
              ) : null}
            </div>
            {users.isLoading ? (
              <p className="text-xs text-muted-foreground">Загрузка</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {(users.data ?? []).map((u) => (
                  <li key={u.id}>
                    {u.name} ({u.login}) — {u.role}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Mahsulot kategoriyalari</h2>
            <p className="text-xs text-muted-foreground">
              Kategoriya, guruh va pastki kategoriyalar — jadval va modal orqali boshqariladi.
            </p>
            <Link className={cn(buttonVariants({ variant: "default", size: "sm" }))} href="/settings/product-categories">
              Sozlamalar: Категория продукта
            </Link>
            <p className="text-xs text-muted-foreground">
              Jami: {(categories.data ?? []).length} yozuv (barcha darajalar)
            </p>
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Narx turlari (DB + katalog)</h2>
            <Link className={cn(buttonVariants({ variant: "default", size: "sm" }))} href="/settings/price-types">
              Sozlamalar: Тип цены
            </Link>
            {priceTypes.isLoading ? (
              <p className="text-xs text-muted-foreground">Загрузка</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {(priceTypes.data ?? []).join(", ") || "—"}
              </p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Kompaniya spravochniklari (o‘qish)</h2>
            <p className="text-xs text-muted-foreground">
              Tahrirlash:{" "}
              <Link className="text-primary underline" href="/settings/company">
                Kompaniya sozlamalari
              </Link>
            </p>
            {profile.data ? (
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <p className="font-medium">To‘lov turlari</p>
                  <p className="text-muted-foreground">{(profile.data.references.payment_types ?? []).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="font-medium">Qaytarish</p>
                  <p className="text-muted-foreground">
                    {(profile.data.references.return_reasons ?? []).join(", ") || "—"}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Hududlar</p>
                  <p className="text-muted-foreground">{(profile.data.references.regions ?? []).join(", ") || "—"}</p>
                </div>
              </div>
            ) : null}
          </section>

        </>
      )}
    </div>
  );
}
