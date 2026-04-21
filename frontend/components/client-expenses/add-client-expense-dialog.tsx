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
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type StaffPick = { id: number; fio: string; code?: string | null };
type CashDeskRow = { id: number; name: string; is_active: boolean };
type LinkageScope = {
  selected_agent_id: number | null;
  selected_cash_desk_id?: number | null;
  selected_expeditor_user_id?: number | null;
  constrained: boolean;
  client_ids: number[];
  cash_desk_ids: number[];
  expeditor_ids: number[];
};

const controlClass =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

function toIsoFromLocal(local: string): string | undefined {
  if (!local?.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  onCreated?: () => void;
  /** Vedoma / profil: klient oldindan ma’lum */
  fixedClientId?: number;
  fixedClientLabel?: string;
  /** Boshlang‘ich agent (kartochkadan) */
  defaultLedgerAgentId?: number | null;
};

export function AddClientExpenseDialog({
  open,
  onOpenChange,
  tenantSlug,
  onCreated,
  fixedClientId,
  fixedClientLabel,
  defaultLedgerAgentId
}: Props) {
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState(
    () => (fixedClientId != null && fixedClientId > 0 ? String(fixedClientId) : "")
  );
  const [agentFilterId, setAgentFilterId] = useState("");
  const [expeditorUserId, setExpeditorUserId] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [tradeDirection, setTradeDirection] = useState("");
  const [cashDeskId, setCashDeskId] = useState("");
  const [paidAtLocal, setPaidAtLocal] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [ledgerAgentUserId, setLedgerAgentUserId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  const clientFixed = fixedClientId != null && fixedClientId > 0;

  useEffect(() => {
    if (open && clientFixed) {
      setClientId(String(fixedClientId));
      if (defaultLedgerAgentId != null && defaultLedgerAgentId > 0) {
        setLedgerAgentUserId(String(defaultLedgerAgentId));
      } else {
        setLedgerAgentUserId("");
      }
    }
  }, [open, clientFixed, fixedClientId, defaultLedgerAgentId]);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "add-client-expense"],
    enabled: Boolean(tenantSlug) && hydrated && open && !clientFixed,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "add-client-expense"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "add-client-expense"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/expeditors?is_active=true`);
      return data.data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "add-client-expense"],
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
    queryKey: ["agents-filter-options", tenantSlug, "add-client-expense"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { trade_directions: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const selectedAgentIdNum = agentFilterId.trim() ? Number.parseInt(agentFilterId.trim(), 10) : NaN;
  const selectedCashDeskIdNum = cashDeskId.trim() ? Number.parseInt(cashDeskId.trim(), 10) : NaN;
  const selectedExpeditorIdNum = expeditorUserId.trim() ? Number.parseInt(expeditorUserId.trim(), 10) : NaN;
  const linkageQ = useQuery({
    queryKey: [
      "linkage-options",
      tenantSlug,
      "add-client-expense",
      Number.isFinite(selectedAgentIdNum) && selectedAgentIdNum > 0 ? selectedAgentIdNum : null,
      Number.isFinite(selectedCashDeskIdNum) && selectedCashDeskIdNum > 0 ? selectedCashDeskIdNum : null,
      Number.isFinite(selectedExpeditorIdNum) && selectedExpeditorIdNum > 0 ? selectedExpeditorIdNum : null
    ],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      if (
        (!Number.isFinite(selectedAgentIdNum) || selectedAgentIdNum < 1) &&
        (!Number.isFinite(selectedCashDeskIdNum) || selectedCashDeskIdNum < 1) &&
        (!Number.isFinite(selectedExpeditorIdNum) || selectedExpeditorIdNum < 1)
      ) {
        return null;
      }
      const params = new URLSearchParams();
      if (Number.isFinite(selectedAgentIdNum) && selectedAgentIdNum > 0) {
        params.set("selected_agent_id", String(selectedAgentIdNum));
      }
      if (Number.isFinite(selectedCashDeskIdNum) && selectedCashDeskIdNum > 0) {
        params.set("selected_cash_desk_id", String(selectedCashDeskIdNum));
      }
      if (Number.isFinite(selectedExpeditorIdNum) && selectedExpeditorIdNum > 0) {
        params.set("selected_expeditor_user_id", String(selectedExpeditorIdNum));
      }
      const { data } = await api.get<{ data: LinkageScope }>(
        `/api/${tenantSlug}/linkage/options?${params.toString()}`
      );
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "add-client-expense-refs"],
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

  const filteredClients = useMemo(() => {
    const all = clientsQ.data ?? [];
    const scope = linkageQ.data;
    if (scope?.constrained) {
      const allowed = new Set(scope.client_ids);
      return all.filter((c) => allowed.has(c.id));
    }
    const aid = agentFilterId.trim() ? Number.parseInt(agentFilterId, 10) : NaN;
    if (!Number.isFinite(aid) || aid < 1) return all;
    return all.filter((c) => c.agent_id === aid);
  }, [clientsQ.data, linkageQ.data, agentFilterId]);
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
    if (clientFixed) return;
    if (!clientId) return;
    const ok = filteredClients.some((c) => String(c.id) === clientId);
    if (!ok) {
      setClientId("");
      setSelectionNotice("Klient tanlovi yangilandi: mos bo‘lmagan qiymat olib tashlandi.");
    }
  }, [clientFixed, filteredClients, clientId]);

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
      let noteJoined = note.trim() || null;
      if (tradeDirection.trim()) {
        const td = `Направление: ${tradeDirection.trim()}`;
        noteJoined = noteJoined ? `${td}. ${noteJoined}` : td;
      }
      const deskRaw = cashDeskId.trim();
      const deskParsed = deskRaw ? Number.parseInt(deskRaw, 10) : NaN;
      const cash_desk_id = Number.isFinite(deskParsed) && deskParsed > 0 ? deskParsed : null;
      const exRaw = expeditorUserId.trim();
      const exParsed = exRaw ? Number.parseInt(exRaw, 10) : NaN;
      const expeditor_user_id = Number.isFinite(exParsed) && exParsed > 0 ? exParsed : null;
      const paid_at = toIsoFromLocal(paidAtLocal);
      const laRaw = ledgerAgentUserId.trim();
      const laParsed = laRaw ? Number.parseInt(laRaw, 10) : NaN;
      const ledger_agent_id =
        Number.isFinite(laParsed) && laParsed > 0 ? laParsed : undefined;
      await api.post(`/api/${tenantSlug}/payments`, {
        client_id: cid,
        amount: amt,
        payment_type: pt,
        note: noteJoined,
        cash_desk_id,
        paid_at: paid_at ?? null,
        entry_kind: "client_expense",
        expeditor_user_id,
        ...(ledger_agent_id != null ? { ledger_agent_id } : {})
      });
    },
    onSuccess: async () => {
      setErr(null);
      await qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug] });
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
        className="flex max-h-[min(92vh,40rem)] w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 pb-3 pt-4 pr-14 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">Добавить долг</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Расход уменьшает баланс клиента. Заказ не требуется.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4">
            {err ? (
              <p className="text-sm text-destructive" role="alert">
                {err}
              </p>
            ) : null}
            {selectionNotice ? (
              <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
                {selectionNotice}
              </p>
            ) : null}

            {clientFixed ? (
              <>
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Клиент: </span>
                  <span className="font-medium text-foreground">
                    {fixedClientLabel?.trim() || `ID ${fixedClientId}`}
                  </span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ace-ledger-agent" className="text-sm font-medium text-foreground">
                    Агент (ведомость)
                  </Label>
                  <FilterSelect
                    id="ace-ledger-agent"
                    className={cn(controlClass, "px-2")}
                    emptyLabel="Как у клиента в карточке"
                    value={ledgerAgentUserId}
                    onChange={(e) => setLedgerAgentUserId(e.target.value)}
                  >
                    {(agentsQ.data ?? []).map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.fio}
                        {a.code ? ` (${a.code})` : ""}
                      </option>
                    ))}
                  </FilterSelect>
                  <p className="text-xs text-muted-foreground">
                    Если не выбрано — в таблице подставится агент из карточки клиента.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="ace-client" className="text-sm font-medium text-foreground">
                    Клиенты
                  </Label>
                  <FilterSelect
                    id="ace-client"
                    className={cn(controlClass, "px-2")}
                    emptyLabel="Выберите клиента"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    {filteredClients.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ace-agent-filter" className="text-sm font-medium text-foreground">
                    Агент
                  </Label>
                  <FilterSelect
                    id="ace-agent-filter"
                    className={cn(controlClass, "px-2")}
                    emptyLabel="Все агенты"
                    value={agentFilterId}
                    onChange={(e) => setAgentFilterId(e.target.value)}
                  >
                    {(agentsQ.data ?? []).map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.fio}
                        {a.code ? ` (${a.code})` : ""}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="ace-pay-type" className="text-sm font-medium text-foreground">
                Способ оплаты
              </Label>
              <FilterSelect
                id="ace-pay-type"
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
              <Label htmlFor="ace-trade" className="text-sm font-medium text-foreground">
                Направление торговли
              </Label>
              <FilterSelect
                id="ace-trade"
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
              <Label htmlFor="ace-desk" className="text-sm font-medium text-foreground">
                Касса
              </Label>
              <FilterSelect
                id="ace-desk"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={cashDeskId}
                onChange={(e) => setCashDeskId(e.target.value)}
              >
                <option value="">—</option>
                {filteredCashDesks.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ace-exp" className="text-sm font-medium text-foreground">
                Экспедиторы
              </Label>
              <FilterSelect
                id="ace-exp"
                className={cn(controlClass, "px-2")}
                emptyLabel="—"
                value={expeditorUserId}
                onChange={(e) => setExpeditorUserId(e.target.value)}
              >
                <option value="">—</option>
                {filteredExpeditors.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.fio}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ace-paid" className="text-sm font-medium text-foreground">
                Дата оплаты
              </Label>
              <DateTimePickerField
                id="ace-paid"
                value={paidAtLocal}
                onChange={setPaidAtLocal}
                disabled={submitMut.isPending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ace-amt" className="text-sm font-medium text-foreground">
                Сумма
              </Label>
              <Input
                id="ace-amt"
                className={cn(controlClass, "h-10")}
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitMut.isPending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ace-note" className="text-sm font-medium text-foreground">
                Комментарий
              </Label>
              <textarea
                id="ace-note"
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
            {submitMut.isPending ? "Сохранение…" : "Добавить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
