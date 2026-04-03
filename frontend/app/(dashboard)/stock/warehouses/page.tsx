"use client";

import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import type { AxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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
  if (code === "WarehouseNameExists") return "Bu nomdagi ombor allaqachon mavjud.";
  if (code === "WarehouseHasStock") return "Omborda qoldiq bor — o‘chirib bo‘lmaydi.";
  if (code === "WarehouseHasOrders") return "Bu omborga bog‘langan zakazlar bor — o‘chirib bo‘lmaydi.";
  if (status === 400) return "Ma’lumot noto‘g‘ri (nom majburiy).";
  if (status === 404) return "Ombor topilmadi.";
  return "So‘rov xatosi — internet yoki serverni tekshiring.";
}

export default function StockWarehousesPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const hydrated = useAuthStoreHydrated();
  const canManage = role === "admin" || role === "operator";
  const qc = useQueryClient();

  const [whName, setWhName] = useState("");
  const [whType, setWhType] = useState("");
  const [whAddr, setWhAddr] = useState("");
  const [editingWhId, setEditingWhId] = useState<number | null>(null);
  const [editWhName, setEditWhName] = useState("");
  const [editWhType, setEditWhType] = useState("");
  const [editWhAddr, setEditWhAddr] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

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
      setFeedback("Ombor qo‘shildi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setFeedback(warehouseMutationError(err))
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
      setFeedback("Ombor yangilandi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setFeedback(warehouseMutationError(err))
  });

  const deleteWh = useMutation({
    mutationFn: async (id: number) => {
      if (!tenantSlug) throw new Error("no");
      await api.delete(`/api/${tenantSlug}/warehouses/${id}`);
    },
    onSuccess: async () => {
      setFeedback("Ombor o‘chirildi.");
      await qc.invalidateQueries({ queryKey: ["warehouses", tenantSlug] });
    },
    onError: (err) => setFeedback(warehouseMutationError(err))
  });

  if (!hydrated || !tenantSlug) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Omborlar boshqaruvi</h1>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/stock">
          ← Omborga qaytish
        </Link>
      </div>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Omborlar (sklad)</h2>
        <p className="text-xs text-muted-foreground">
          Ombor yaratish, tahrirlash va o‘chirish shu sahifaga ko‘chirildi.
        </p>
        {canManage ? (
          <form
            className="grid max-w-lg gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setFeedback(null);
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
        ) : (
          <p className="text-xs text-muted-foreground">Faqat admin/operator tahrir qila oladi.</p>
        )}

        {feedback ? (
          <p className={feedback.includes("qo‘shildi") || feedback.includes("yangilandi") || feedback.includes("o‘chirildi") ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>
            {feedback}
          </p>
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
                      <Input value={editWhName} onChange={(e) => setEditWhName(e.target.value)} />
                    </div>
                    <div className="grid gap-1">
                      <Label>Turi</Label>
                      <Input value={editWhType} onChange={(e) => setEditWhType(e.target.value)} />
                    </div>
                    <div className="grid gap-1">
                      <Label>Manzil</Label>
                      <Input value={editWhAddr} onChange={(e) => setEditWhAddr(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="button" size="sm" onClick={() => updateWh.mutate()}>
                        Saqlash
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditingWhId(null)}>
                        Bekor
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{w.name}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">#{w.id}</span>
                      {w.type ? <p className="text-xs text-muted-foreground">Turi: {w.type}</p> : null}
                      {w.address ? <p className="text-xs text-muted-foreground">Manzil: {w.address}</p> : null}
                    </div>
                    {canManage ? (
                      <TableRowActionGroup className="justify-end sm:justify-start" ariaLabel="Ombor">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          title="Tahrirlash"
                          aria-label="Tahrirlash"
                          onClick={() => {
                            setEditingWhId(w.id);
                            setEditWhName(w.name);
                            setEditWhType(w.type ?? "");
                            setEditWhAddr(w.address ?? "");
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="O‘chirish"
                          aria-label="O‘chirish"
                          onClick={() => {
                            if (window.confirm(`“${w.name}” ombori o‘chirilsinmi?`)) {
                              setFeedback(null);
                              deleteWh.mutate(w.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </TableRowActionGroup>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
