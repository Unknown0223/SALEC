"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewClientPage() {
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Tenant yo‘q");
      const { data } = await api.post<{ id: number }>(`/api/${tenantSlug}/clients`, {
        name: name.trim(),
        phone: phone.trim() || null
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
    <PageShell className="max-w-lg">
      <PageHeader
        title="Yangi mijoz"
        description="Minimal ma’lumot — keyin to‘liq tahrir sahifasida davom etasiz."
        actions={
          <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/clients">
            Ro‘yxat
          </Link>
        }
      />

      <form
        className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm"
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
