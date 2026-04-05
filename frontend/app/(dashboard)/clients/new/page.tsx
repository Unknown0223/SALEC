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
import { mergeRefOptions } from "@/lib/merge-ref-options";
import { useMutation, useQuery } from "@tanstack/react-query";
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
    queryFn: async () => {
      const { data } = await api.get<ClientReferencesResponse>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const catOpts = useMemo(() => mergeRefOptions(category, refsQ.data?.categories), [category, refsQ.data?.categories]);
  const typeOpts = useMemo(
    () => mergeRefOptions(clientTypeCode, refsQ.data?.client_type_codes),
    [clientTypeCode, refsQ.data?.client_type_codes]
  );
  const terrOpts = useMemo(() => mergeRefOptions(region, refsQ.data?.regions), [region, refsQ.data?.regions]);
  const cityOpts = useMemo(() => mergeRefOptions(city, refsQ.data?.cities), [city, refsQ.data?.cities]);
  const distOpts = useMemo(() => mergeRefOptions(district, refsQ.data?.districts), [district, refsQ.data?.districts]);
  const neiOpts = useMemo(
    () => mergeRefOptions(neighborhood, refsQ.data?.neighborhoods),
    [neighborhood, refsQ.data?.neighborhoods]
  );
  const zoneOpts = useMemo(() => mergeRefOptions(zone, refsQ.data?.zones), [zone, refsQ.data?.zones]);
  const formatOpts = useMemo(
    () => mergeRefOptions(clientFormat, refsQ.data?.client_formats),
    [clientFormat, refsQ.data?.client_formats]
  );
  const salesOpts = useMemo(
    () => mergeRefOptions(salesChannel, refsQ.data?.sales_channels),
    [salesChannel, refsQ.data?.sales_channels]
  );
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
            Spravochnikdan tanlanadi (ixtiyoriy)
          </p>
          <p className="text-xs text-muted-foreground">
            Qiymatlar:{" "}
            <RefAdminLink href="/settings/spravochnik/client-lists">mijoz spravochniklari</RefAdminLink>,{" "}
            <RefAdminLink href="/settings/territories">viloyatlar</RefAdminLink>.
          </p>
          {refsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Ro‘yxatlar yuklanmoqda…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Toifa</Label>
                  <RefAdminLink href="/settings/client-categories">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Toifa"
                  aria-label="Toifa"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={mut.isPending}
                >
                  {catOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Tur (kod)</Label>
                  <RefAdminLink href="/settings/client-types">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Tur (kod)"
                  aria-label="Tur (kod)"
                  value={clientTypeCode}
                  onChange={(e) => setClientTypeCode(e.target.value)}
                  disabled={mut.isPending}
                >
                  {typeOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Viloyat / territoriya</Label>
                  <RefAdminLink href="/settings/territories">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Viloyat / territoriya"
                  aria-label="Viloyat / territoriya"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={mut.isPending}
                >
                  {terrOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Mijoz formati</Label>
                  <RefAdminLink href="/settings/client-formats">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Mijoz formati"
                  aria-label="Mijoz formati"
                  value={clientFormat}
                  onChange={(e) => setClientFormat(e.target.value)}
                  disabled={mut.isPending}
                >
                  {formatOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Savdo kanali</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-sales">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Savdo kanali"
                  aria-label="Savdo kanali"
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                  disabled={mut.isPending}
                >
                  {salesOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Mahsulot toifasi</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-prod-cat">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Mahsulot toifasi"
                  aria-label="Mahsulot toifasi"
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
                  <Label className="mb-0 text-xs">Shahar (gorod)</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-city">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Shahar"
                  aria-label="Shahar"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={mut.isPending}
                >
                  {cityOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-xs">Tuman</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-district">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Tuman"
                  aria-label="Tuman"
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
                  <Label className="mb-0 text-xs">Mahalla</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-neighborhood">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Mahalla"
                  aria-label="Mahalla"
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
                  <Label className="mb-0 text-xs">Zona</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-zone">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Zona"
                  aria-label="Zona"
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
                  <Label className="mb-0 text-xs">Logistika xizmati</Label>
                  <RefAdminLink href="/settings/spravochnik/client-lists#ref-logistics">+</RefAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Logistika xizmati"
                  aria-label="Logistika xizmati"
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
