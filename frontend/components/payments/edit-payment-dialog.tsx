"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStoreHydrated } from "@/lib/auth-store";
import { getUserFacingError } from "@/lib/error-utils";
import {
  defaultPaymentTypeValue,
  paymentMethodSelectOptionsWithCurrent,
  type ProfilePaymentMethodEntry
} from "@/lib/payment-method-options";
import { STALE } from "@/lib/query-stale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type CashDeskRow = { id: number; name: string; is_active: boolean };
type LinkageScope = {
  selected_agent_id: number | null;
  selected_cash_desk_id?: number | null;
  selected_expeditor_user_id?: number | null;
  constrained: boolean;
  cash_desk_ids: number[];
  expeditor_ids: number[];
};

type StaffPick = { id: number; fio: string; login?: string; code?: string | null };

type PaymentDetailRow = {
  id: number;
  client_id: number;
  agent_id?: number | null;
  order_id: number | null;
  amount: string;
  payment_type: string;
  note: string | null;
  cash_desk_id?: number | null;
  cash_desk_name?: string | null;
  entry_kind?: string;
  expeditor_user_id?: number | null;
  expeditor_name?: string | null;
  paid_at: string | null;
  deleted_at?: string | null;
};

type DetailPayload = {
  payment: PaymentDetailRow;
  allocated_total: string;
  unallocated: string;
};

const controlClass =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function isoToLocalDatetime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(local: string): string | null {
  if (!local?.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  paymentId: number | null;
  clientId: number;
  onSaved?: () => void;
};

export function EditPaymentDialog({
  open,
  onOpenChange,
  tenantSlug,
  paymentId,
  clientId,
  onSaved
}: Props) {
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [note, setNote] = useState("");
  const [cashDeskId, setCashDeskId] = useState("");
  const [paidAtLocal, setPaidAtLocal] = useState("");
  const [orderId, setOrderId] = useState("");
  const [expeditorUserId, setExpeditorUserId] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ["payment-detail", tenantSlug, paymentId],
    enabled: Boolean(tenantSlug) && hydrated && open && paymentId != null && paymentId > 0,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<DetailPayload>(`/api/${tenantSlug}/payments/${paymentId}`);
      return data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "edit-payment"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CashDeskRow[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data.filter((d) => d.is_active);
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "edit-payment"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "edit-payment-refs"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          payment_types?: string[];
          payment_method_entries?: ProfilePaymentMethodEntry[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references ?? {};
    }
  });

  const profileRefs = profileQ.data;
  const p = detailQ.data?.payment;
  const isVoided = Boolean(p?.deleted_at);
  const selectedAgentIdNum = p?.agent_id ?? null;
  const selectedCashDeskIdNum = cashDeskId.trim() ? Number.parseInt(cashDeskId.trim(), 10) : NaN;
  const selectedExpeditorIdNum = expeditorUserId.trim() ? Number.parseInt(expeditorUserId.trim(), 10) : NaN;
  const linkageQ = useQuery({
    queryKey: [
      "linkage-options",
      tenantSlug,
      "edit-payment",
      selectedAgentIdNum,
      Number.isFinite(selectedCashDeskIdNum) && selectedCashDeskIdNum > 0 ? selectedCashDeskIdNum : null,
      Number.isFinite(selectedExpeditorIdNum) && selectedExpeditorIdNum > 0 ? selectedExpeditorIdNum : null
    ],
    enabled: Boolean(tenantSlug) && hydrated && open && p != null,
    staleTime: STALE.reference,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAgentIdNum != null && selectedAgentIdNum > 0) {
        params.set("selected_agent_id", String(selectedAgentIdNum));
      }
      if (Number.isFinite(selectedCashDeskIdNum) && selectedCashDeskIdNum > 0) {
        params.set("selected_cash_desk_id", String(selectedCashDeskIdNum));
      }
      if (Number.isFinite(selectedExpeditorIdNum) && selectedExpeditorIdNum > 0) {
        params.set("selected_expeditor_user_id", String(selectedExpeditorIdNum));
      }
      const qs = params.toString();
      if (!qs) return null;
      const { data } = await api.get<{ data: LinkageScope }>(`/api/${tenantSlug}/linkage/options?${qs}`);
      return data.data;
    }
  });

  const payOpts = useMemo(
    () =>
      paymentMethodSelectOptionsWithCurrent(profileRefs, profileRefs?.payment_types, p?.payment_type),
    [profileRefs, p?.payment_type]
  );
  const allocated = useMemo(() => {
    const t = detailQ.data?.allocated_total ?? "0";
    const n = Number.parseFloat(String(t).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [detailQ.data?.allocated_total]);

  const showExpeditor = Boolean(p && p.order_id == null);
  const filteredCashDesks = useMemo(() => {
    const all = cashDesksQ.data ?? [];
    const scope = linkageQ.data;
    if (!scope?.constrained) return all;
    const allowed = new Set(scope.cash_desk_ids);
    return all.filter((d) => allowed.has(d.id));
  }, [cashDesksQ.data, linkageQ.data]);
  const filteredExpeditors = useMemo(() => {
    const all = expeditorsQ.data ?? [];
    const scope = linkageQ.data;
    if (!scope?.constrained) return all;
    const allowed = new Set(scope.expeditor_ids);
    return all.filter((d) => allowed.has(d.id));
  }, [expeditorsQ.data, linkageQ.data]);

  useEffect(() => {
    if (!open || !p) return;
    setAmount(p.amount?.replace(/\s/g, "") ?? "");
    setPaymentType((p.payment_type ?? defaultPaymentTypeValue(payOpts)).trim());
    setNote(p.note ?? "");
    setCashDeskId(p.cash_desk_id != null && p.cash_desk_id > 0 ? String(p.cash_desk_id) : "");
    setPaidAtLocal(isoToLocalDatetime(p.paid_at));
    setOrderId(p.order_id != null && p.order_id > 0 ? String(p.order_id) : "");
    setExpeditorUserId(p.expeditor_user_id != null && p.expeditor_user_id > 0 ? String(p.expeditor_user_id) : "");
    setFormErr(null);
  }, [open, p, payOpts]);
  useEffect(() => {
    if (!cashDeskId.trim()) return;
    if (!filteredCashDesks.some((d) => String(d.id) === cashDeskId.trim())) {
      setCashDeskId("");
      setSelectionNotice("Kassa tanlovi yangilandi: mos bo‘lmagan qiymat olib tashlandi.");
    }
  }, [cashDeskId, filteredCashDesks]);
  useEffect(() => {
    if (!expeditorUserId.trim()) return;
    if (!filteredExpeditors.some((d) => String(d.id) === expeditorUserId.trim())) {
      setExpeditorUserId("");
      setSelectionNotice("Dastavchi tanlovi yangilandi: mos bo‘lmagan qiymat olib tashlandi.");
    }
  }, [expeditorUserId, filteredExpeditors]);

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!paymentId || paymentId < 1) throw new Error("NO_ID");
      const amt = Number.parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("BAD_AMOUNT");
      const pt = paymentType.trim() || defaultPaymentTypeValue(payOpts);
      const body: Record<string, unknown> = {
        amount: amt,
        payment_type: pt,
        note: note.trim() ? note.trim() : null,
        cash_desk_id: cashDeskId.trim() ? Number.parseInt(cashDeskId, 10) : null,
        paid_at: toIsoFromLocal(paidAtLocal)
      };
      const oidRaw = orderId.trim();
      if (oidRaw === "") body.order_id = null;
      else {
        const oid = Number.parseInt(oidRaw, 10);
        if (!Number.isFinite(oid) || oid < 1) throw new Error("BAD_ORDER_INPUT");
        body.order_id = oid;
      }
      if (showExpeditor) {
        const ex = expeditorUserId.trim();
        body.expeditor_user_id = ex === "" ? null : Number.parseInt(ex, 10);
      }
      const { data } = await api.patch<DetailPayload>(`/api/${tenantSlug}/payments/${paymentId}`, body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payment-detail", tenantSlug, paymentId] });
      void qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug, clientId] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      const ax = e as { response?: { data?: { error?: string } } };
      const code = ax.response?.data?.error;
      if (code === "AmountBelowAllocated") {
        setFormErr(
          allocated > 0
            ? `Summa taqsimlangan summadan kam bo‘lmasin (taqsimlangan: ${allocated}).`
            : "Summa taqsimlashlar bilan mos kelmaydi."
        );
        return;
      }
      if (code === "OrderLockedByAllocations") {
        setFormErr("Taqsimlashlar bor — zakaz raqamini o‘zgartirib bo‘lmaydi.");
        return;
      }
      if (code === "BadExpeditorScope") {
        setFormErr("Zakaz bog‘langan to‘lovda ekskpeditorni shu yerda o‘zgartirish mumkin emas.");
        return;
      }
      if (code === "PaymentVoided") {
        setFormErr("To‘lov bekor qilingan (arxiv) — tahrirlanmaydi.");
        return;
      }
      setFormErr(getUserFacingError(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,880px)] w-full max-w-lg gap-4 overflow-y-auto p-5 sm:p-6"
        data-testid="edit-payment-dialog"
      >
        <DialogHeader>
          <DialogTitle>To‘lovni tahrirlash</DialogTitle>
          <DialogDescription>
            Summa, usul, kassa, sana, izoh va (mavjud bo‘lsa) zakaz. Ombor yoki mijoz o‘zgarmaydi.
          </DialogDescription>
        </DialogHeader>

        {detailQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
        ) : detailQ.isError ? (
          <p className="text-sm text-destructive">Ma’lumot yuklanmadi.</p>
        ) : isVoided ? (
          <p className="text-sm text-destructive">Bu to‘lov arxivlangan — tahrirlash mumkin emas.</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFormErr(null);
              patchMut.mutate();
            }}
          >
            {allocated > 0 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100">
                Taqsimlangan:{" "}
                <span className="font-semibold tabular-nums">{allocated}</span>. Summa shundan kam bo‘lmasin.
              </p>
            ) : null}
            {selectionNotice ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100">
                {selectionNotice}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ep-amount">Summa</Label>
              <Input
                id="ep-amount"
                className={controlClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={patchMut.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-type">To‘lov usuli</Label>
              <FilterSelect
                id="ep-type"
                className={controlClass}
                aria-label="To‘lov usuli"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                disabled={patchMut.isPending}
                emptyLabel={payOpts[0]?.label ?? "—"}
              >
                {payOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-desk">Kassa</Label>
              <FilterSelect
                id="ep-desk"
                className={controlClass}
                aria-label="Kassa"
                value={cashDeskId}
                onChange={(e) => setCashDeskId(e.target.value)}
                disabled={patchMut.isPending}
                emptyLabel="—"
              >
                {filteredCashDesks.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-paid">To‘lov sanasi / vaqti</Label>
              <Input
                id="ep-paid"
                type="datetime-local"
                className={controlClass}
                value={paidAtLocal}
                onChange={(e) => setPaidAtLocal(e.target.value)}
                disabled={patchMut.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-order">Zakaz ID (bo‘sh — zakazsiz)</Label>
              <Input
                id="ep-order"
                className={controlClass}
                inputMode="numeric"
                placeholder="Masalan: 1204"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.replace(/\D/g, ""))}
                disabled={patchMut.isPending || allocated > 0}
                title={allocated > 0 ? "Taqsimlash bor — zakaz o‘zgarmaydi" : undefined}
              />
            </div>
            {showExpeditor ? (
              <div className="space-y-1.5">
                <Label htmlFor="ep-ex">Ekspeditor</Label>
                <FilterSelect
                  id="ep-ex"
                  className={controlClass}
                  aria-label="Ekspeditor"
                  value={expeditorUserId}
                  onChange={(e) => setExpeditorUserId(e.target.value)}
                  disabled={patchMut.isPending}
                  emptyLabel="—"
                >
                  {filteredExpeditors.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {(r.login ? `${r.login} · ` : "") + r.fio}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ep-note">Izoh</Label>
              <Input
                id="ep-note"
                className={controlClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={patchMut.isPending}
              />
            </div>
            {formErr ? (
              <p className="text-sm text-destructive" role="alert">
                {formErr}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={patchMut.isPending}>
                Bekor
              </Button>
              <Button type="submit" disabled={patchMut.isPending} className="bg-teal-600 text-white hover:bg-teal-700">
                {patchMut.isPending ? "Saqlanmoqda…" : "Saqlash"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
