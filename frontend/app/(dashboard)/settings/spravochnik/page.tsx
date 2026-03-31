"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function SpravochnikPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [newCatName, setNewCatName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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

  const createCat = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      await api.post(`/api/${tenantSlug}/product-categories`, { name: newCatName.trim() });
    },
    onSuccess: async () => {
      setNewCatName("");
      setMsg("Kategoriya qo‘shildi.");
      await qc.invalidateQueries({ queryKey: ["product-categories", tenantSlug] });
    },
    onError: () => setMsg("Xato — nom yoki ruxsat.")
  });

  const deleteCat = useMutation({
    mutationFn: async (id: number) => {
      if (!tenantSlug) throw new Error("no");
      await api.delete(`/api/${tenantSlug}/product-categories/${id}`);
    },
    onSuccess: async () => {
      setMsg("O‘chirildi.");
      await qc.invalidateQueries({ queryKey: ["product-categories", tenantSlug] });
    },
    onError: () => setMsg("O‘chirib bo‘lmadi (mahsulot bog‘langan?).")
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
            <h2 className="text-sm font-semibold">Foydalanuvchilar</h2>
            <div className="flex flex-wrap gap-2">
              <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/settings/spravochnik/agents">
                Agentlar bo‘limi
              </Link>
              <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/settings/spravochnik/expeditors">
                Ekspeditorlar bo‘limi
              </Link>
            </div>
            {users.isLoading ? (
              <p className="text-xs text-muted-foreground">Yuklanmoqda</p>
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

          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Mahsulot kategoriyalari</h2>
            {isAdmin ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMsg(null);
                  if (!newCatName.trim()) return;
                  createCat.mutate();
                }}
              >
                <div className="grid gap-1">
                  <Label htmlFor="nc">Yangi kategoriya</Label>
                  <Input
                    id="nc"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    disabled={createCat.isPending}
                  />
                </div>
                <Button type="submit" size="sm" disabled={createCat.isPending}>
                  Qo‘shish
                </Button>
              </form>
            ) : null}
            <ul className="space-y-1 text-sm">
              {(categories.data ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-1">
                  <span>
                    {c.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">#{c.id}</span>
                  </span>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={deleteCat.isPending}
                      onClick={() => {
                        if (window.confirm(`“${c.name}” o‘chirilsinmi?`)) deleteCat.mutate(c.id);
                      }}
                    >
                      O‘chir
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Narx turlari (DB)</h2>
            {priceTypes.isLoading ? (
              <p className="text-xs text-muted-foreground">Yuklanmoqda</p>
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

          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        </>
      )}
    </div>
  );
}
