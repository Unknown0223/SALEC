"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type TenantProfile = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  feature_flags: Record<string, unknown>;
  references: {
    payment_types: string[];
    return_reasons: string[];
    regions: string[];
  };
};

function splitLines(s: string): string[] {
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function CompanySettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [ordersSse, setOrdersSse] = useState(true);
  const [payTypes, setPayTypes] = useState("");
  const [returnReasons, setReturnReasons] = useState("");
  const [regions, setRegions] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return body;
    }
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setPhone(data.phone ?? "");
    setAddress(data.address ?? "");
    setLogoUrl(data.logo_url ?? "");
    setOrdersSse(data.feature_flags?.orders_sse !== false);
    setPayTypes(data.references.payment_types.join("\n"));
    setReturnReasons(data.references.return_reasons.join("\n"));
    setRegions(data.references.regions.join("\n"));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const { data: body } = await api.patch<TenantProfile>(`/api/${tenantSlug}/settings/profile`, {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        logo_url: logoUrl.trim() || null,
        feature_flags: { orders_sse: ordersSse },
        references: {
          payment_types: splitLines(payTypes),
          return_reasons: splitLines(returnReasons),
          regions: splitLines(regions)
        }
      });
      return body;
    },
    onSuccess: (p) => {
      void qc.setQueryData(["settings", "profile", tenantSlug], p);
      setMsg("Saqlandi.");
    },
    onError: () => setMsg("Saqlashda xato yoki ruxsat yo‘q.")
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Kompaniya va flaglar</h1>
        <p className="text-sm text-muted-foreground">Tenant: {tenantSlug ?? "—"}</p>
        <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/dashboard">
          ← Dashboard
        </Link>
      </div>

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Profilni olishda xato.</p>
      ) : (
        <div className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="co-name">Kompaniya nomi</Label>
            <Input
              id="co-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-phone">Telefon</Label>
            <Input
              id="co-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-addr">Manzil</Label>
            <Input
              id="co-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-logo">Logo URL</Label>
            <Input
              id="co-logo"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ordersSse}
              onChange={(e) => setOrdersSse(e.target.checked)}
              disabled={!isAdmin || saveMut.isPending}
            />
            Zakazlar SSE (real-time yangilanish)
          </label>
          <p className="text-xs font-medium text-muted-foreground">Qoʻshimcha spravochniklar (har bir qator yoki vergul bilan)</p>
          <div className="grid gap-1.5">
            <Label htmlFor="co-pay">Toʻlov turlari</Label>
            <textarea
              id="co-pay"
              className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
              value={payTypes}
              onChange={(e) => setPayTypes(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-ret">Qaytarish sabablari</Label>
            <textarea
              id="co-ret"
              className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
              value={returnReasons}
              onChange={(e) => setReturnReasons(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          <div id="ref-regions" className="scroll-mt-20 grid gap-1.5">
            <Label htmlFor="co-reg">Hududlar (viloyat / territoriya)</Label>
            <p className="text-xs text-muted-foreground">
              Mijoz kartochkasidagi «Teritoriya» tanlovi shu ro‘yxatdan to‘ldiriladi.
            </p>
            <textarea
              id="co-reg"
              className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
              value={regions}
              onChange={(e) => setRegions(e.target.value)}
              disabled={!isAdmin || saveMut.isPending}
            />
          </div>
          {isAdmin ? (
            <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saqlanmoqda…" : "Saqlash"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Tahrirlash faqat admin uchun.</p>
          )}
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        </div>
      )}
    </div>
  );
}
