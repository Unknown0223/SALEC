"use client";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { pickCityTerritoryHint } from "@/lib/city-territory-hint";
import { mergeRefOptions } from "@/lib/merge-ref-options";
import { mergeRefSelectOptions } from "@/lib/ref-select-options";
import { useMutation, useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/query-stale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type ClientReferencesResponse = {
  categories: string[];
  client_type_codes: string[];
  regions: string[];
  districts: string[];
  cities: string[];
  neighborhoods: string[];
  zones: string[];
  client_formats: string[];
  sales_channels: string[];
  product_category_refs: string[];
  logistics_services: string[];
  category_options?: { value: string; label: string }[];
  client_type_options?: { value: string; label: string }[];
  client_format_options?: { value: string; label: string }[];
  sales_channel_options?: { value: string; label: string }[];
  city_options?: { value: string; label: string }[];
  region_options?: { value: string; label: string }[];
  city_territory_hints?: Record<
    string,
    {
      region_stored: string | null;
      region_label: string | null;
      zone_stored: string | null;
      zone_label: string | null;
      district_stored: string | null;
      district_label: string | null;
    }
  >;
};

function RefAdminLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

export default function NewClientPage() {
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [clientTypeCode, setClientTypeCode] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [zone, setZone] = useState("");
  const [clientFormat, setClientFormat] = useState("");
  const [salesChannel, setSalesChannel] = useState("");
  const [productCategoryRef, setProductCategoryRef] = useState("");
  const [logisticsService, setLogisticsService] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refsQ = useQuery({
    queryKey: ["clients-references", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<ClientReferencesResponse>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const catOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.category_options?.length) {
      return mergeRefSelectOptions(category, d.category_options, d.categories);
    }
    return mergeRefOptions(category, d.categories).map((v) => ({ value: v, label: v }));
  }, [category, refsQ.data]);
  const typeOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.client_type_options?.length) {
      return mergeRefSelectOptions(clientTypeCode, d.client_type_options, d.client_type_codes);
    }
    return mergeRefOptions(clientTypeCode, d.client_type_codes).map((v) => ({ value: v, label: v }));
  }, [clientTypeCode, refsQ.data]);
  const terrOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.region_options?.length) {
      return mergeRefSelectOptions(region, d.region_options, d.regions);
    }
    return mergeRefOptions(region, d.regions).map((v) => ({ value: v, label: v }));
  }, [region, refsQ.data]);
  const cityOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.city_options?.length) {
      return mergeRefSelectOptions(city, d.city_options, d.cities);
    }
    return mergeRefOptions(city, d.cities).map((v) => ({ value: v, label: v }));
  }, [city, refsQ.data]);
  const distOpts = useMemo(() => mergeRefOptions(district, refsQ.data?.districts), [district, refsQ.data?.districts]);
  const neiOpts = useMemo(
    () => mergeRefOptions(neighborhood, refsQ.data?.neighborhoods),
    [neighborhood, refsQ.data?.neighborhoods]
  );
  const zoneOpts = useMemo(() => mergeRefOptions(zone, refsQ.data?.zones), [zone, refsQ.data?.zones]);
  const cityHint = useMemo(
    () => pickCityTerritoryHint(refsQ.data?.city_territory_hints, city),
    [refsQ.data?.city_territory_hints, city]
  );
  const onCitySelect = (next: string) => {
    setCity(next);
    const h = pickCityTerritoryHint(refsQ.data?.city_territory_hints, next);
    if (!h) return;
    if (h.region_stored) setRegion(h.region_stored);
    if (h.zone_stored) setZone(h.zone_stored);
    if (h.district_stored) setDistrict(h.district_stored);
  };
  const formatOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.client_format_options?.length) {
      return mergeRefSelectOptions(clientFormat, d.client_format_options, d.client_formats);
    }
    return mergeRefOptions(clientFormat, d.client_formats).map((v) => ({ value: v, label: v }));
  }, [clientFormat, refsQ.data]);
  const salesOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.sales_channel_options?.length) {
      return mergeRefSelectOptions(salesChannel, d.sales_channel_options, d.sales_channels);
    }
    return mergeRefOptions(salesChannel, d.sales_channels).map((v) => ({ value: v, label: v }));
  }, [salesChannel, refsQ.data]);
  const prodCatOpts = useMemo(
    () => mergeRefOptions(productCategoryRef, refsQ.data?.product_category_refs),
    [productCategoryRef, refsQ.data?.product_category_refs]
  );
  const logOpts = useMemo(
    () => mergeRefOptions(logisticsService, refsQ.data?.logistics_services),
    [logisticsService, refsQ.data?.logistics_services]
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Tenant yo‘q");
      const { data } = await api.post<{ id: number }>(`/api/${tenantSlug}/clients`, {
        name: name.trim(),
        phone: phone.trim() || null,
        category: category.trim() || null,
        client_type_code: clientTypeCode.trim() || null,
        region: region.trim() || null,
        city: city.trim() || null,
        district: district.trim() || null,
        neighborhood: neighborhood.trim() || null,
        zone: zone.trim() || null,
        client_format: clientFormat.trim() || null,
        sales_channel: salesChannel.trim() || null,
        product_category_ref: productCategoryRef.trim() || null,
        logistics_service: logisticsService.trim() || null
      });
      return data;
    },
    onSuccess: (d) => {
      router.push(`/clients/${d.id}/edit`);
    },
    onError: () => setErr("Qo‘shib bo‘lmadi (nom bo‘sh yoki ruxsat yo‘q).")
  });

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
    <PageShell className="max-w-2xl">
      <PageHeader
        title="Yangi mijoz"
        description="Nom majburiy. Spravochnik maydonlari ixtiyoriy — ro‘yxatlar sozlamalardan to‘ldiriladi."
        actions={
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/clients">
            Ro‘yxat
          </Link>
        }
      />

      <form
        className="grid gap-6 rounded-lg border bg-card p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (!name.trim()) {
            setErr("Nom majburiy.");
            return;
          }
          mut.mutate();
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nc-name">Nomi *</Label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mut.isPending}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-phone">Telefon (ixtiyoriy)</Label>
            <Input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={mut.isPending} />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Справочники (необязательно)
          </p>
          <p className="text-xs text-muted-foreground">
            Значения:{" "}
            <RefAdminLink href="/settings/spravochnik/client-lists">справочники клиента</RefAdminLink>,{" "}
            <RefAdminLink href="/settings/territories">дерево территорий</RefAdminLink>. При выборе города подставляются область и зона из дерева.
          </p>
          {refsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка списков…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Категория</Label>
                  <RefAdminLink href="/settings/client-categories">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Категория"
                  aria-label="Категория"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={mut.isPending}
                >
                  {catOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Тип</Label>
                  <RefAdminLink href="/settings/client-types">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Тип"
                  aria-label="Тип"
                  value={clientTypeCode}
                  onChange={(e) => setClientTypeCode(e.target.value)}
                  disabled={mut.isPending}
                >
                  {typeOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Область</Label>
                  <RefAdminLink href="/settings/territories">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Область"
                  aria-label="Область"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={mut.isPending}
                >
                  {terrOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Формат клиента</Label>
                  <RefAdminLink href="/settings/client-formats">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Формат клиента"
                  aria-label="Формат клиента"
                  value={clientFormat}
                  onChange={(e) => setClientFormat(e.target.value)}
                  disabled={mut.isPending}
                >
                  {formatOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Канал продаж</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-sales">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Канал продаж"
                  aria-label="Канал продаж"
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                  disabled={mut.isPending}
                >
                  {salesOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Категория товара</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-prod-cat">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Категория товара"
                  aria-label="Категория товара"
                  value={productCategoryRef}
                  onChange={(e) => setProductCategoryRef(e.target.value)}
                  disabled={mut.isPending}
                >
                  {prodCatOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Город (код в БД)</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-city">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Город"
                  aria-label="Город"
                  value={city}
                  onChange={(e) => onCitySelect(e.target.value)}
                  disabled={mut.isPending}
                >
                  {cityOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
                {cityHint ? (
                  <p className="text-[11px] text-muted-foreground">
                    По дереву территорий: <span className="font-medium text-foreground">область</span> —{" "}
                    {cityHint.region_label ?? cityHint.region_stored ?? "—"};{" "}
                    {(cityHint.district_label ?? cityHint.district_stored)?.trim() ? (
                      <>
                        <span className="font-medium text-foreground">район</span> —{" "}
                        {cityHint.district_label ?? cityHint.district_stored};{" "}
                      </>
                    ) : null}
                    <span className="font-medium text-foreground">зона</span> —{" "}
                    {cityHint.zone_label ?? cityHint.zone_stored ?? "—"}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Район</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-district">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Район"
                  aria-label="Район"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  disabled={mut.isPending}
                >
                  {distOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Махалля</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-neighborhood">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Махалля"
                  aria-label="Махалля"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  disabled={mut.isPending}
                >
                  {neiOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Зона</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-zone">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Зона"
                  aria-label="Зона"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  disabled={mut.isPending}
                >
                  {zoneOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Логистика</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-logistics">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Логистика"
                  aria-label="Логистика"
                  value={logisticsService}
                  onChange={(e) => setLogisticsService(e.target.value)}
                  disabled={mut.isPending}
                >
                  {logOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
          )}
        </div>

        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Yaratilmoqda…" : "Yaratish va tahrirga"}
          </Button>
          <Link
            className={cn(buttonVariants({ variant: "outline" }), mut.isPending && "pointer-events-none opacity-50")}
            href="/clients"
          >
            Bekor
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
