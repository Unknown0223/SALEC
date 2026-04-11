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
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
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
  /** Masalan, to‘lov kartochkasida jadvalni yangilash */
  onAllocated?: () => void;
};

export function PaymentAllocateDialog({ open, onOpenChange, tenantSlug, payment, onAllocated }: Props) {
  const qc = useQueryClient();
  const pid = payment?.id;
  const [allocateOk, setAllocateOk] = useState(false);

  useEffect(() => {
    if (!open) setAllocateOk(false);
  }, [open]);

  const allocQ = useQuery({
    queryKey: ["payment-allocations", tenantSlug, pid],
    enabled: open && Boolean(tenantSlug) && pid != null,
    staleTime: STALE.detail,
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
      onAllocated?.();
    }
  });

  const errorMsg = allocQ.isError
    ? getUserFacingError(allocQ.error, "Не удалось загрузить распределения")
    : allocateMut.isError
      ? getUserFacingError(allocateMut.error, "Распределение не выполнено")
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="payment-allocate-dialog">
        <DialogHeader>
          <DialogTitle>Распределение платежа по заказам</DialogTitle>
          <DialogDescription>
            Сумма закрывает самые старые неоплаченные заказы клиента по очереди (FIFO). Баланс клиента не меняется — только
            привязка к заказам.
          </DialogDescription>
        </DialogHeader>

        {payment ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Клиент:</span>{" "}
              <Link className="text-primary underline" href={`/clients/${payment.client_id}`}>
                {payment.client_name}
              </Link>
            </p>
            <p>
              <span className="text-muted-foreground">Сумма платежа:</span>{" "}
              <span className="font-medium tabular-nums">
                {formatNumberGrouped(payment.amount, { maxFractionDigits: 2 })}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Уже распределено:</span>{" "}
              <span className="font-medium tabular-nums">
                {formatNumberGrouped(allocatedSum, { minFractionDigits: 2, maxFractionDigits: 2 })}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Остаток к распределению:</span>{" "}
              <span className="font-medium tabular-nums">
                {formatNumberGrouped(unallocated, { minFractionDigits: 2, maxFractionDigits: 2 })}
              </span>
            </p>

            {allocQ.isLoading ? (
              <p className="text-muted-foreground">Загрузка…</p>
            ) : (
              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="app-table-thead">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Заказ</th>
                      <th className="px-2 py-1.5 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(allocQ.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-2 py-3 text-center text-muted-foreground">
                          Распределений пока нет
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
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatNumberGrouped(a.amount, { maxFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
            {allocateOk && !errorMsg ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Распределение выполнено.</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            type="button"
            data-testid="payment-allocate-fifo"
            disabled={!payment || unallocated <= 0 || allocateMut.isPending || allocQ.isLoading}
            onClick={() => void allocateMut.mutate()}
          >
            {allocateMut.isPending ? "Распределение…" : "Распределить (FIFO)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
