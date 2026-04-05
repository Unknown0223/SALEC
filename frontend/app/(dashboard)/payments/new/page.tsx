"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import type { ClientRow } from "@/lib/client-types";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const PAY_TYPES = ["naqd", "plastik", "o‘tkazma", "boshqa"] as const;

export default function NewPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const [clientId, setClientId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<string>(PAY_TYPES[0]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const c = searchParams.get("client_id");
    const o = searchParams.get("order_id");
    const a = searchParams.get("amount");
    if (c) setClientId(c);
    if (o) setOrderId(o);
    if (a?.trim()) setAmount(a.trim());
  }, [searchParams]);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "payment-form"],
    enabled: Boolean(tenantSlug) && hydrated,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=300&is_active=true`
      );
      return data.data;
    }
  });

  const mut = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");
      const amt = Number.parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("amount");
      const oid = orderId.trim() ? Number.parseInt(orderId.trim(), 10) : null;
      await api.post(`/api/${tenantSlug}/payments`, {
        client_id: cid,
        order_id: oid != null && Number.isFinite(oid) && oid > 0 ? oid : null,
        amount: amt,
        payment_type: paymentType,
        note: note.trim() || null
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      router.push("/payments");
    },
    onError: (e: Error) => {
      if (e.message === "client") {
        setErr("Mijozni tanlang.");
        return;
      }
      if (e.message === "amount") {
        setErr("Summa musbat bo‘lsin.");
        return;
      }
      setErr("Saqlab bo‘lmadi.");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Yangi to‘lov"
        description="Mijoz balansiga qo‘shiladi (kirim)."
        actions={
          <Link href="/payments" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            ← Ro‘yxat
          </Link>
        }
      />

      {!hydrated || !tenantSlug ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          {err ? (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label>Mijoz</Label>
            <FilterSelect
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              emptyLabel="Tanlang"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={mut.isPending || clientsQ.isLoading}
            >
              {(clientsQ.data ?? []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-ord">Zakaz ID (ixtiyoriy)</Label>
            <Input
              id="pay-ord"
              inputMode="numeric"
              placeholder="Masalan 42"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-amt">Summa</Label>
            <Input
              id="pay-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>To‘lov turi</Label>
            <FilterSelect
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              emptyLabel="Tur"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              disabled={mut.isPending}
            >
              {PAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Izoh</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <Button
            type="button"
            disabled={mut.isPending}
            onClick={() => {
              setErr(null);
              mut.mutate();
            }}
          >
            {mut.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </div>
      )}
    </PageShell>
  );
}
