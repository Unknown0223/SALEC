"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

type PaymentRow = {
  id: number;
  client_id: number;
  client_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
};

export default function PaymentsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["payments", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated,
    queryFn: async () => {
      const { data } = await api.get<{ data: PaymentRow[]; total: number }>(
        `/api/${tenantSlug}/payments?page=1&limit=100`
      );
      return data;
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/payments/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      setDeleteFeedback("To'lov o'chirildi va balans qaytarildi.");
      setTimeout(() => setDeleteFeedback(null), 4000);
    },
    onError: () => {
      setDeleteFeedback("To'lovni o'chirib bo'lmadi.");
      setTimeout(() => setDeleteFeedback(null), 4000);
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="To‘lovlar"
        description="Mijoz balansiga tushgan to‘lovlar."
        actions={
          <Link className={cn(buttonVariants({ size: "sm" }))} href="/payments/new">
            Yangi to‘lov
          </Link>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      ) : listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : listQ.isError ? (
        <p className="text-sm text-destructive">Ro‘yxatni yuklab bo‘lmadi.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Sana</th>
                <th className="px-3 py-2">Mijoz</th>
                <th className="px-3 py-2">Zakaz</th>
                <th className="px-3 py-2">Tur</th>
                <th className="px-3 py-2 text-right">Summa</th>
                <th className="px-3 py-2">Izoh</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(listQ.data?.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link className="text-primary underline-offset-2 hover:underline" href={`/clients/${r.client_id}`}>
                      {r.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.order_id != null && r.order_number ? (
                      <Link className="text-primary underline-offset-2 hover:underline" href={`/orders/${r.order_id}`}>
                        {r.order_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{r.payment_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{r.amount}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs text-muted-foreground">
                    {r.note ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-destructive underline underline-offset-2 hover:text-destructive/80"
                      onClick={() => {
                        if (confirm(`To'lov #${r.id} (${r.amount} so'm) o'chirish? Balans qaytariladi.`)) {
                          deleteMut.mutate(r.id);
                        }
                      }}
                      disabled={deleteMut.isPending}
                    >
                      O'chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(listQ.data?.data.length ?? 0) === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Hozircha yozuv yo’q.</p>
          ) : null}
        </div>
      )}

      {deleteFeedback ? (
        <p className="mt-sm text-sm text-muted-foreground">{deleteFeedback}</p>
      ) : null}
    </PageShell>
  );
}
