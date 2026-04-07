"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { getUserFacingError } from "@/lib/error-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type PaymentRowLite = {
  id: number;
  client_id: number;
  client_name: string;
  amount: string;
};

type AllocationRow = {
  id: number;
  payment_id: number;
  order_id: number;
  order_number: string;
  amount: string;
  created_at: string;
};

function sumDecimalStrings(rows: { amount: string }[]): number {
  return rows.reduce((acc, r) => acc + (Number.parseFloat(r.amount) || 0), 0);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  payment: PaymentRowLite | null;
};

export function PaymentAllocateDialog({ open, onOpenChange, tenantSlug, payment }: Props) {
  const qc = useQueryClient();
  const pid = payment?.id;
  const [allocateOk, setAllocateOk] = useState(false);

  useEffect(() => {
    if (!open) setAllocateOk(false);
  }, [open]);

  const allocQ = useQuery({
    queryKey: ["payment-allocations", tenantSlug, pid],
    enabled: open && Boolean(tenantSlug) && pid != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: AllocationRow[] }>(
        `/api/${tenantSlug}/payments/${pid}/allocations`
      );
      return data.data;
    }
  });

  const paymentTotal = payment ? Number.parseFloat(payment.amount) || 0 : 0;
  const allocatedSum = useMemo(() => sumDecimalStrings(allocQ.data ?? []), [allocQ.data]);
  const unallocated = Math.max(0, paymentTotal - allocatedSum);

  const allocateMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/payments/${pid}/allocate`);
    },
    onSuccess: async () => {
      setAllocateOk(true);
      await qc.invalidateQueries({ queryKey: ["payment-allocations", tenantSlug, pid] });
      await qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
    }
  });

  const errorMsg = allocQ.isError
    ? getUserFacingError(allocQ.error, "Taqsimotlar yuklanmadi")
    : allocateMut.isError
      ? getUserFacingError(allocateMut.error, "Taqsimlash muvaffaqiyatsiz")
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>To‘lovni zakazlarga taqsimlash</DialogTitle>
          <DialogDescription>
            Mijozning eng eski ochiq zakazlariga navbat bilan (FIFO) qoldiq summani yopadi. Balansdagi pul o‘zgarmaydi —
            faqat qaysi zakaz qoplanganini hisobga oladi.
          </DialogDescription>
        </DialogHeader>

        {payment ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Mijoz:</span>{" "}
              <Link className="text-primary underline" href={`/clients/${payment.client_id}`}>
                {payment.client_name}
              </Link>
            </p>
            <p>
              <span className="text-muted-foreground">To‘lov summasi:</span>{" "}
              <span className="font-medium tabular-nums">{payment.amount}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Allaqachon taqsimlangan:</span>{" "}
              <span className="font-medium tabular-nums">{allocatedSum.toFixed(2)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Taqsimlash uchun qoldiq:</span>{" "}
              <span className="font-medium tabular-nums">{unallocated.toFixed(2)}</span>
            </p>

            {allocQ.isLoading ? (
              <p className="text-muted-foreground">Загрузка…</p>
            ) : (
              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Zakaz</th>
                      <th className="px-2 py-1.5 text-right">Summa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(allocQ.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-2 py-3 text-center text-muted-foreground">
                          Hali taqsimot yo‘q
                        </td>
                      </tr>
                    ) : (
                      (allocQ.data ?? []).map((a) => (
                        <tr key={a.id} className="border-t">
                          <td className="px-2 py-1.5">
                            <Link className="text-primary underline" href={`/orders/${a.order_id}`}>
                              {a.order_number}
                            </Link>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{a.amount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
            {allocateOk && !errorMsg ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Taqsimlash bajarildi.</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
          <Button
            type="button"
            disabled={!payment || unallocated <= 0 || allocateMut.isPending || allocQ.isLoading}
            onClick={() => void allocateMut.mutate()}
          >
            {allocateMut.isPending ? "Taqsimlanmoqda…" : "FIFO bo‘yicha taqsimlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
