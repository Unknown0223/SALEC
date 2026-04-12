"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { DateTimePickerField } from "@/components/ui/datetime-popover";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStoreHydrated } from "@/lib/auth-store";
import type { ClientRow } from "@/lib/client-types";
import { getUserFacingError } from "@/lib/error-utils";
import {
  defaultPaymentTypeValue,
  paymentMethodSelectOptions,
  type ProfilePaymentMethodEntry
} from "@/lib/payment-method-options";
import type { OpeningBalanceListRow } from "@/lib/opening-balance-types";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type StaffPick = { id: number; fio: string; code?: string | null };
type CashDeskRow = { id: number; name: string; is_active: boolean };

const controlClass =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  onCreated?: () => void;
};

export function AddOpeningBalanceDialog({ open, onOpenChange, tenantSlug, onCreated }: Props) {
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [balanceType, setBalanceType] = useState<"debt" | "surplus">("debt");
  const [amount, setAmount] = useState("");
  const [paidAtLocal, setPaidAtLocal] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
  });
  const [paymentType, setPaymentType] = useState("");
  const [cashDeskId, setCashDeskId] = useState("");
  const [tradeDirection, setTradeDirection] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "add-opening-balance"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "add-opening-balance"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CashDeskRow[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data.filter((d) => d.is_active);
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "add-opening-balance"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { trade_directions: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "add-opening-balance-refs"],
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

  const selectedClient = useMemo(
    () => (clientsQ.data ?? []).find((c) => String(c.id) === clientId),
    [clientsQ.data, clientId]
  );

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "add-opening-balance-agent-label"],
    enabled: Boolean(tenantSlug) && hydrated && open && Boolean(selectedClient?.agent_id),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const agentLabel = useMemo(() => {
    if (!selectedClient?.agent_id) return "—";
    const a = (agentsQ.data ?? []).find((x) => x.id === selectedClient.agent_id);
    if (!a) return `ID ${selectedClient.agent_id}`;
    return `${a.fio}${a.code ? ` (${a.code})` : ""}`;
  }, [selectedClient, agentsQ.data]);

  const paySelectOpts = useMemo(
    () => paymentMethodSelectOptions(profileQ.data, profileQ.data?.payment_types),
    [profileQ.data]
  );
  const defaultPayType = useMemo(() => defaultPaymentTypeValue(paySelectOpts), [paySelectOpts]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("NO_CLIENT");
      const raw = amount.replace(/\s/g, "").replace(",", ".");
      const amt = Number.parseFloat(raw);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("NO_AMOUNT");
      const pt = (paymentType || defaultPayType).trim();
      const deskRaw = cashDeskId.trim();
      const deskParsed = deskRaw ? Number.parseInt(deskRaw, 10) : NaN;
      const cash_desk_id = Number.isFinite(deskParsed) && deskParsed > 0 ? deskParsed : null;
      const pd = new Date(paidAtLocal);
      const paid_at = Number.isNaN(pd.getTime()) ? null : pd.toISOString();
      const { data } = await api.post<OpeningBalanceListRow>(`/api/${tenantSlug}/opening-balances`, {
        client_id: cid,
        balance_type: balanceType,
        amount: amt,
        payment_type: pt,
        cash_desk_id,
        trade_direction: tradeDirection.trim() || null,
        note: note.trim() || null,
        paid_at
      });
      return data;
    },
    onSuccess: async () => {
      setErr(null);
      await qc.invalidateQueries({ queryKey: ["opening-balances", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      onCreated?.();
      onOpenChange(false);
      setAmount("");
      setNote("");
    },
    onError: (e: unknown) => {
      setErr(getUserFacingError(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92vh,42rem)] w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 pb-3 pt-4 pr-14 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">Добавить</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Начальный баланс клиента — корректирует текущий баланс (долг или излишек).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4">
            {err ? (
              <p className="text-sm text-destructive" role="alert">
                {err}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="aob-client" className="text-sm font-medium text-foreground">
                Клиенты
              </Label>
              <FilterSelect
                id="aob-client"
                className={cn(controlClass, "px-2")}
                emptyLabel="Выберите клиента"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {(clientsQ.data ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label className="text-sm font-medium text-foreground">Агент</Label>
              <Input
                readOnly
                className={cn(controlClass, "h-10 cursor-not-allowed bg-muted/40 text-muted-foreground")}
                value={agentLabel}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-amt" className="text-sm font-medium text-foreground">
                Сумма
              </Label>
              <Input
                id="aob-amt"
                className={cn(controlClass, "h-10")}
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitMut.isPending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-paid" className="text-sm font-medium text-foreground">
                Дата оплаты
              </Label>
              <DateTimePickerField
                id="aob-paid"
                value={paidAtLocal}
                onChange={setPaidAtLocal}
                disabled={submitMut.isPending}
                dateOnly
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-pay-type" className="text-sm font-medium text-foreground">
                Способ оплаты
              </Label>
              <FilterSelect
                id="aob-pay-type"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={paymentType || defaultPayType}
                onChange={(e) => setPaymentType(e.target.value)}
              >
                {paySelectOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-desk" className="text-sm font-medium text-foreground">
                Касса
              </Label>
              <FilterSelect
                id="aob-desk"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={cashDeskId}
                onChange={(e) => setCashDeskId(e.target.value)}
              >
                <option value="">—</option>
                {(cashDesksQ.data ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-trade" className="text-sm font-medium text-foreground">
                Направление торговли
              </Label>
              <FilterSelect
                id="aob-trade"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={tradeDirection}
                onChange={(e) => setTradeDirection(e.target.value)}
              >
                <option value="">—</option>
                {(filterOptQ.data?.trade_directions ?? []).map((td) => (
                  <option key={td} value={td}>
                    {td}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-bt" className="text-sm font-medium text-foreground">
                Тип остатка
              </Label>
              <FilterSelect
                id="aob-bt"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={balanceType}
                onChange={(e) => setBalanceType(e.target.value as "debt" | "surplus")}
              >
                <option value="debt">Долг</option>
                <option value="surplus">Излишек</option>
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aob-note" className="text-sm font-medium text-foreground">
                Комментарий
              </Label>
              <textarea
                id="aob-note"
                rows={4}
                className={cn(controlClass, "min-h-[5.5rem] resize-y py-2.5")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                disabled={submitMut.isPending}
                placeholder="Необязательно"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-muted/20 px-5 py-4">
          <Button
            type="button"
            className="h-10 w-full bg-teal-600 text-sm font-medium text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
            disabled={submitMut.isPending}
            onClick={() => submitMut.mutate()}
          >
            {submitMut.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
