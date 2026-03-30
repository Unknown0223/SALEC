"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import type { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

function warehouseMutationError(err: unknown): string {
  const ax = err as AxiosError<{ error?: string }>;
  const status = ax.response?.status;
  const code = ax.response?.data?.error;
  if (status === 401) return "Sessiya tugagan — qayta kiring.";
  if (status === 403 || code === "ForbiddenRole" || code === "CrossTenantDenied") {
    return "Ruxsat yo‘q yoki noto‘g‘ri diler (slug).";
  }
  if (code === "WarehouseNameExists") {
    return "Bu nomdagi ombor allaqachon mavjud — boshqa nom yozing.";
  }
  if (code === "WarehouseHasStock") return "Omborda qoldiq bor — o‘chirib bo‘lmaydi.";
  if (code === "WarehouseHasOrders") return "Bu omborga bog‘langan zakazlar bor — o‘chirib bo‘lmaydi.";
  if (status === 400) return "Ma’lumot noto‘g‘ri (nom majburiy).";
  if (status === 404) return "Ombor topilmadi.";
  return "So‘rov xatosi — internet yoki serverni tekshiring.";
}

export default function SpravochnikPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const canManageWarehouses = role === "admin" || role === "operator";
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [newCatName, setNewCatName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [whName, setWhName] = useState("");
  const [whType, setWhType] = useState("");
  const [whAddr, setWhAddr] = useState("");
  const [editingWhId, setEditingWhId] = useState<number | null>(null);
  const [editWhName, setEditWhName] = useState("");
  const [editWhType, setEditWhType] = useState("");
  const [editWhAddr, setEditWhAddr] = useState("");
  const [whFeedback, setWhFeedback] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        data: { id: number; name: string; type: string | null; address: string | null }[];
      }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

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

  const createWh = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      await api.post(`/api/${tenantSlug}/warehouses`, {
        name: whName.trim(),
        type: whType.trim() || null,
        address: whAddr.trim() || null
      });
    },
    onSuccess: async () => {
      setWhName("");
      setWhType("");
      setWhAddr("");
      setWhFeedback("Ombor qo‘shildi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
      await qc.refetchQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setWhFeedback(warehouseMutationError(err))
  });

  const updateWh = useMutation({
    mutationFn: async () => {
      if (!tenantSlug || editingWhId == null) throw new Error("no");
      await api.patch(`/api/${tenantSlug}/warehouses/${editingWhId}`, {
        name: editWhName.trim(),
        type: editWhType.trim() || null,
        address: editWhAddr.trim() || null
      });
    },
    onSuccess: async () => {
      setEditingWhId(null);
      setWhFeedback("Ombor yangilandi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
      await qc.refetchQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setWhFeedback(warehouseMutationError(err))
  });

  const deleteWh = useMutation({
    mutationFn: async (id: number) => {
      if (!tenantSlug) throw new Error("no");
      await api.delete(`/api/${tenantSlug}/warehouses/${id}`);
    },
    onSuccess: async () => {
      setWhFeedback("Ombor o‘chirildi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
      await qc.refetchQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setWhFeedback(warehouseMutationError(err))
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
        <p className="text-sm text-muted-foreground">Omborlar, foydalanuvchilar, kategoriyalar, narx turlari</p>
        <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/dashboard">
          ← Dashboard
        </Link>
      </div>

      {!hydrated || !tenantSlug ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Omborlar (sklad)</h2>
            <p className="text-xs text-muted-foreground">
              Yangi ombor yaratish, tahrirlash va o‘chirish (admin yoki operator). Omborda qoldiq yoki
              zakaz bog‘langan bo‘lsa, o‘chirish mumkin emas.
            </p>
            {canManageWarehouses ? (
              <form
                className="grid max-w-lg gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setWhFeedback(null);
                  if (!whName.trim()) return;
                  createWh.mutate();
                }}
              >
                <div className="grid gap-1 sm:col-span-2">
                  <Label htmlFor="wh-name">Nomi *</Label>
                  <Input
                    id="wh-name"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="Masalan: Asosiy ombor"
                    disabled={createWh.isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="wh-type">Turi</Label>
                  <Input
                    id="wh-type"
                    value={whType}
                    onChange={(e) => setWhType(e.target.value)}
                    placeholder="ixtiyoriy"
                    disabled={createWh.isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="wh-addr">Manzil</Label>
                  <Input
                    id="wh-addr"
                    value={whAddr}
                    onChange={(e) => setWhAddr(e.target.value)}
                    placeholder="ixtiyoriy"
                    disabled={createWh.isPending}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm" disabled={createWh.isPending || !whName.trim()}>
                    Ombor qo‘shish
                  </Button>
                </div>
              </form>
            ) : null}
            {whFeedback ? (
              <p
                className={
                  whFeedback.startsWith("Ombor qo‘shildi") ||
                  whFeedback.startsWith("Ombor yangilandi") ||
                  whFeedback.startsWith("Ombor o‘chirildi")
                    ? "text-sm text-emerald-700 dark:text-emerald-400"
                    : "text-destructive text-sm"
                }
              >
                {whFeedback}
              </p>
            ) : null}
            {!canManageWarehouses ? (
              <p className="text-xs text-muted-foreground">Ombor boshqaruvi uchun admin yoki operator kirishi kerak.</p>
            ) : null}
            {warehouses.isLoading ? (
              <p className="text-xs text-muted-foreground">Yuklanmoqda</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {(warehouses.data ?? []).map((w) => (
                  <li key={w.id} className="rounded-md border border-border/60 p-3">
                    {editingWhId === w.id ? (
                      <div className="grid max-w-lg gap-2 sm:grid-cols-2">
                        <div className="grid gap-1 sm:col-span-2">
                          <Label>Nomi</Label>
                          <Input
                            value={editWhName}
                            onChange={(e) => setEditWhName(e.target.value)}
                            disabled={updateWh.isPending}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label>Turi</Label>
                          <Input
                            value={editWhType}
                            onChange={(e) => setEditWhType(e.target.value)}
                            disabled={updateWh.isPending}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label>Manzil</Label>
                          <Input
                            value={editWhAddr}
                            onChange={(e) => setEditWhAddr(e.target.value)}
                            disabled={updateWh.isPending}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={updateWh.isPending || !editWhName.trim()}
                            onClick={() => updateWh.mutate()}
                          >
                            Saqlash
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingWhId(null)}
                          >
                            Bekor
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-medium">{w.name}</span>{" "}
                          <span className="font-mono text-xs text-muted-foreground">#{w.id}</span>
                          {w.type ? (
                            <p className="text-xs text-muted-foreground">Turi: {w.type}</p>
                          ) : null}
                          {w.address ? (
                            <p className="text-xs text-muted-foreground">Manzil: {w.address}</p>
                          ) : null}
                        </div>
                        {canManageWarehouses ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingWhId(w.id);
                                setEditWhName(w.name);
                                setEditWhType(w.type ?? "");
                                setEditWhAddr(w.address ?? "");
                              }}
                            >
                              Tahrirlash
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={deleteWh.isPending}
                              onClick={() => {
                                if (window.confirm(`“${w.name}” ombori o‘chirilsinmi?`)) {
                                  setWhFeedback(null);
                                  deleteWh.mutate(w.id);
                                }
                              }}
                            >
                              O‘chir
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Foydalanuvchilar</h2>
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
