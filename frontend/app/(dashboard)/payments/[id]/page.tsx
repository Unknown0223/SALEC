"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { PaymentAllocateDialog } from "@/components/payments/payment-allocate-dialog";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { activeRefSelectOptions } from "@/lib/profile-ref-entries";

type PaymentDetailRow = {
  id: number;
  client_id: number;
  client_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
  workflow_status?: string;
  deleted_at?: string | null;
  deleted_by_user_id?: number | null;
  deleted_by_name?: string | null;
  delete_reason_ref?: string | null;
};

type AllocationRow = {
  id: number;
  payment_id: number;
  order_id: number;
  order_number: string;
  amount: string;
  created_at: string;
};

type DetailPayload = {
  payment: PaymentDetailRow;
  allocations: AllocationRow[];
  allocated_total: string;
  unallocated: string;
};

export default function PaymentDetailPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const paymentId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const effectiveRole = useEffectiveRole();
  const qc = useQueryClient();
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [cancelReasonRef, setCancelReasonRef] = useState("");

  const invalid = !Number.isFinite(paymentId) || paymentId < 1;
  const canDelete = effectiveRole === "admin";

  const profileCancelQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "payment-cancel-reasons"],
    enabled: Boolean(tenantSlug) && hydrated && canDelete,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references: { cancel_payment_reason_entries?: unknown };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });
  const cancelReasonOptions = useMemo(
    () => activeRefSelectOptions(profileCancelQ.data?.references?.cancel_payment_reason_entries),
    [profileCancelQ.data]
  );

  const detailQ = useQuery({
    queryKey: ["payment-detail", tenantSlug, paymentId],
    enabled: Boolean(tenantSlug) && hydrated && !invalid,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<DetailPayload>(`/api/${tenantSlug}/payments/${paymentId}`);
      return data;
    }
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const params =
        cancelReasonRef.trim().length > 0 ? { cancel_reason_ref: cancelReasonRef.trim() } : undefined;
      await api.delete(`/api/${tenantSlug}/payments/${paymentId}`, { params });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["payment-detail", tenantSlug, paymentId] });
    }
  });

  const restoreMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/payments/${paymentId}/restore`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["payment-detail", tenantSlug, paymentId] });
    }
  });

  const p = detailQ.data?.payment;
  const isVoided = Boolean(p?.deleted_at);
  const data = detailQ.data;

  return (
    <PageShell className="pb-12">
      <Link
        href="/payments"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← К списку платежей
      </Link>

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Сессия…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти
          </Link>
        </p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Неверный идентификатор.</p>
      ) : detailQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : detailQ.isError ? (
        <p className="text-sm text-destructive">Платёж не найден или не загрузился.</p>
      ) : p && data ? (
        <>
          <PageHeader
            title={`Платёж #${p.id}`}
            description={`${p.payment_type} · ${new Date(p.created_at).toLocaleString("ru-RU")}`}
            actions={
              <div className="flex flex-wrap gap-2">
                {!isVoided ? (
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    onClick={() => setAllocateOpen(true)}
                  >
                    Распределить по заказам
                  </button>
                ) : null}
                {canDelete && !isVoided ? (
                  <>
                    {cancelReasonOptions.length > 0 ? (
                      <select
                        className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs"
                        value={cancelReasonRef}
                        onChange={(e) => setCancelReasonRef(e.target.value)}
                        title="Bekor qilish sababi (audit)"
                        aria-label="Причина отмены платежа"
                      >
                        <option value="">Причина (необязательно)</option>
                        {cancelReasonOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Отменить платёж #${p.id} (${formatNumberGrouped(p.amount, { maxFractionDigits: 2 })})? Запись останется в архиве; баланс и распределения будут скорректированы.`
                          )
                        ) {
                          deleteMut.mutate();
                        }
                      }}
                    >
                      В архив (отмена)
                    </button>
                  </>
                ) : null}
                {canDelete && isVoided ? (
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "bg-emerald-600 hover:bg-emerald-700")}
                    disabled={restoreMut.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Восстановить платёж #${p.id}? Сумма снова учтётся на балансе; при необходимости заново распределите по заказам.`
                        )
                      ) {
                        restoreMut.mutate();
                      }
                    }}
                  >
                    Восстановить
                  </button>
                ) : null}
              </div>
            }
          />

          {isVoided ? (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">Платёж в архиве (отменён)</p>
              <p className="mt-1 text-muted-foreground">
                Дата отмены:{" "}
                {p.deleted_at ? new Date(p.deleted_at).toLocaleString("ru-RU") : "—"}
                {p.deleted_by_name ? ` · Кто: ${p.deleted_by_name}` : ""}
                {p.delete_reason_ref ? ` · Причина: ${p.delete_reason_ref}` : ""}
              </p>
            </div>
          ) : null}

          {deleteMut.isError ? (
            <p className="mb-4 text-sm text-destructive">Не удалось отменить платёж.</p>
          ) : null}
          {restoreMut.isError ? (
            <p className="mb-4 text-sm text-destructive">Не удалось восстановить платёж.</p>
          ) : null}

          <div className="mb-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Клиент</p>
              <Link
                className="font-medium text-primary underline-offset-2 hover:underline"
                href={`/clients/${p.client_id}`}
              >
                {p.client_name}
              </Link>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Связанный заказ</p>
              {p.order_id != null && p.order_number ? (
                <Link
                  className="font-mono text-sm text-primary underline-offset-2 hover:underline"
                  href={`/orders/${p.order_id}`}
                >
                  {p.order_number}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Сумма</p>
              <p className="text-lg font-semibold tabular-nums">{formatNumberGrouped(p.amount, { maxFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Распределено / остаток</p>
              <p className="text-sm tabular-nums">
                {formatNumberGrouped(data.allocated_total, { maxFractionDigits: 2 })} /{" "}
                <span className="font-medium">{formatNumberGrouped(data.unallocated, { maxFractionDigits: 2 })}</span>
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Комментарий</p>
              <p className="text-sm">{p.note?.trim() ? p.note : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Создал</p>
              <p className="text-sm">{p.created_by_name ?? "—"}</p>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Zakazlarga taqsimot</h2>
          {data.allocations.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Hali taqsimot yo‘q. «Zakazlarga taqsimlash» FIFO bo‘yicha ochiq qarzlarni yopadi.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead className="app-table-thead text-left text-xs">
                  <tr>
                    <th className="px-3 py-2">Zakaz</th>
                    <th className="px-3 py-2 text-right">Summa</th>
                    <th className="px-3 py-2">Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          className="font-mono text-primary underline-offset-2 hover:underline"
                          href={`/orders/${a.order_id}`}
                        >
                          {a.order_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatNumberGrouped(a.amount, { maxFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PaymentAllocateDialog
            open={allocateOpen}
            onOpenChange={setAllocateOpen}
            tenantSlug={tenantSlug}
            payment={{
              id: p.id,
              client_id: p.client_id,
              client_name: p.client_name,
              amount: p.amount
            }}
            onAllocated={() => {
              void qc.invalidateQueries({ queryKey: ["payment-detail", tenantSlug, paymentId] });
            }}
          />
        </>
      ) : null}
    </PageShell>
  );
}
