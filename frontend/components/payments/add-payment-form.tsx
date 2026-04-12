"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ClientRow } from "@/lib/client-types";
import { useAuthStoreHydrated } from "@/lib/auth-store";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserFacingError } from "@/lib/error-utils";
import {
  defaultPaymentTypeValue,
  paymentMethodSelectOptions,
  type ProfilePaymentMethodEntry
} from "@/lib/payment-method-options";

type StaffPick = { id: number; fio: string; code?: string | null };

type CashDeskRow = { id: number; name: string; is_active: boolean };

type PaymentBlock = {
  key: string;
  paid_at_local: string;
  trade_direction: string;
  cash_desk_id: string;
  payment_type: string;
  amount: string;
  consignment: boolean;
  note: string;
};

function newBlock(): PaymentBlock {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    paid_at_local: local,
    trade_direction: "",
    cash_desk_id: "",
    payment_type: "",
    amount: "",
    consignment: false,
    note: ""
  };
}

function toIsoFromLocal(local: string): string | undefined {
  if (!local?.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type Props = {
  tenantSlug: string;
  /** URL dan kelganda */
  initialClientId?: string;
  initialOrderId?: string;
  /** Klient tanlovi yopiq (masalan, vedoma sahifasidan) */
  lockedClientId?: string;
  lockedClientLabel?: string;
  /** Boshlang‘ich agent kartochkadan (vedoma) */
  initialLedgerAgentId?: number | null;
  onSuccess: () => void;
  onCancel?: () => void;
  embedded?: boolean;
};

export function AddPaymentForm({
  tenantSlug,
  initialClientId = "",
  initialOrderId = "",
  lockedClientId,
  lockedClientLabel,
  initialLedgerAgentId,
  onSuccess,
  onCancel,
  embedded = false
}: Props) {
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState(() =>
    lockedClientId?.trim() ? lockedClientId.trim() : initialClientId
  );
  const clientPickerLocked = Boolean(lockedClientId?.trim());

  useEffect(() => {
    const lid = lockedClientId?.trim();
    if (lid) setClientId(lid);
  }, [lockedClientId]);
  const [ledgerAgentUserId, setLedgerAgentUserId] = useState("");
  useEffect(() => {
    if (!clientPickerLocked) return;
    if (initialLedgerAgentId != null && initialLedgerAgentId > 0) {
      setLedgerAgentUserId(String(initialLedgerAgentId));
    } else {
      setLedgerAgentUserId("");
    }
  }, [clientPickerLocked, initialLedgerAgentId]);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [agentFilterId, setAgentFilterId] = useState("");
  const [blocks, setBlocks] = useState<PaymentBlock[]>(() => [newBlock()]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "add-payment-form"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "add-payment-form"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffPick[] }>(`/api/${tenantSlug}/agents?is_active=true`);
      return data.data;
    }
  });

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "add-payment-form"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CashDeskRow[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data.filter((d) => d.is_active);
    }
  });

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "add-payment"],
    enabled: Boolean(tenantSlug) && hydrated,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { trade_directions: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "add-payment-refs"],
    enabled: Boolean(tenantSlug) && hydrated,
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
    const aid = agentFilterId.trim() ? Number.parseInt(agentFilterId, 10) : NaN;
    if (!Number.isFinite(aid) || aid < 1) return all;
    return all.filter((c) => c.agent_id === aid);
  }, [clientsQ.data, agentFilterId]);

  const paySelectOpts = useMemo(
    () => paymentMethodSelectOptions(profileQ.data, profileQ.data?.payment_types),
    [profileQ.data]
  );
  const defaultPayType = useMemo(() => defaultPaymentTypeValue(paySelectOpts), [paySelectOpts]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("NO_CLIENT");
      const oidRaw = orderId.trim();
      const oid = oidRaw ? Number.parseInt(oidRaw, 10) : null;
      const order_id =
        oid != null && Number.isFinite(oid) && oid > 0 ? oid : null;

      const laRawLocked = ledgerAgentUserId.trim();
      const laParsedLocked = laRawLocked ? Number.parseInt(laRawLocked, 10) : NaN;
      const ledger_agent_id_locked =
        clientPickerLocked && Number.isFinite(laParsedLocked) && laParsedLocked > 0
          ? laParsedLocked
          : undefined;

      const payloads: Array<{
        client_id: number;
        order_id: number | null;
        amount: number;
        payment_type: string;
        note: string | null;
        cash_desk_id: number | null;
        paid_at: string | undefined;
        ledger_agent_id?: number;
      }> = [];

      for (const b of blocks) {
        const amt = Number.parseFloat(b.amount.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(amt) || amt <= 0) continue;
        const pt = (b.payment_type || defaultPayType).trim();
        let note = b.note.trim() || null;
        if (b.trade_direction.trim()) {
          const td = `Направление: ${b.trade_direction.trim()}`;
          note = note ? `${td}. ${note}` : td;
        }
        if (b.consignment) {
          const tag = "Консигнация: да";
          note = note ? `${tag}. ${note}` : tag;
        }
        const deskRaw = b.cash_desk_id.trim();
        const deskId = deskRaw ? Number.parseInt(deskRaw, 10) : NaN;
        const cash_desk_id = Number.isFinite(deskId) && deskId > 0 ? deskId : null;
        const paid_at = toIsoFromLocal(b.paid_at_local);
        payloads.push({
          client_id: cid,
          order_id,
          amount: amt,
          payment_type: pt,
          note,
          cash_desk_id,
          paid_at,
          ...(ledger_agent_id_locked != null ? { ledger_agent_id: ledger_agent_id_locked } : {})
        });
      }

      if (payloads.length === 0) throw new Error("NO_LINES");

      for (const body of payloads) {
        await api.post(`/api/${tenantSlug}/payments`, body);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug] });
      onSuccess();
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "NO_CLIENT") {
        setFormErr("Выберите клиента.");
        return;
      }
      if (e instanceof Error && e.message === "NO_LINES") {
        setFormErr("Добавьте хотя бы одну строку с суммой.");
        return;
      }
      if (axios.isAxiosError(e)) {
        const code = (e.response?.data as { error?: string } | undefined)?.error;
        if (code === "BadCashDesk") {
          setFormErr("Указана несуществующая или неактивная касса.");
          return;
        }
        if (code === "BadOrder") {
          setFormErr("Заказ не найден или не принадлежит клиенту.");
          return;
        }
        if (code === "BadLedgerAgent") {
          setFormErr("Указан несуществующий или неактивный агент.");
          return;
        }
      }
      setFormErr(getUserFacingError(e, "Не удалось сохранить платёж."));
    }
  });

  const updateBlock = useCallback((key: string, patch: Partial<PaymentBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }, []);

  const addBlock = useCallback(() => {
    setBlocks((prev) => [...prev, newBlock()]);
  }, []);

  const removeBlock = useCallback((key: string) => {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.key !== key)));
  }, []);

  return (
    <div className="space-y-6">
      {formErr ? (
        <p className="text-sm text-destructive" role="alert">
          {formErr}
        </p>
      ) : null}

      <div className="space-y-4">
        {clientPickerLocked ? (
          <>
            <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Клиент: </span>
              <span className="font-medium text-foreground">
                {lockedClientLabel?.trim() || `ID ${lockedClientId?.trim()}`}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-pay-ledger-agent" className="text-sm font-medium">
                Агент (ведомость)
              </Label>
              <FilterSelect
                id="add-pay-ledger-agent"
                className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                emptyLabel="Как у клиента в карточке"
                value={ledgerAgentUserId}
                onChange={(e) => setLedgerAgentUserId(e.target.value)}
                disabled={submitMut.isPending}
              >
                {(agentsQ.data ?? []).map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.fio}
                    {a.code ? ` (${a.code})` : ""}
                  </option>
                ))}
              </FilterSelect>
              <p className="text-xs text-muted-foreground">
                Если не выбрано — в таблице подставится агент из карточки клиента (или из заказа).
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>Клиент</Label>
            <FilterSelect
              data-testid="new-payment-client"
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
              emptyLabel="Выберите клиента"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setFormErr(null);
              }}
              disabled={submitMut.isPending || clientsQ.isLoading}
            >
              {filteredClients.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </FilterSelect>
          </div>
        )}

        <div className={cn("grid grid-cols-1 gap-4", !clientPickerLocked && "md:grid-cols-2")}>
          {!clientPickerLocked ? (
            <div className="space-y-2">
              <Label className="leading-snug">Агент (фильтр списка клиентов)</Label>
              <p className="text-xs text-muted-foreground">
                Сужает список клиентов. Уже выбранный клиент не сбрасывается, если он относится к этому агенту.
              </p>
              <FilterSelect
                className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                emptyLabel="Все агенты"
                value={agentFilterId}
                onChange={(e) => {
                  const nextAgent = e.target.value;
                  setAgentFilterId(nextAgent);
                  setFormErr(null);
                  const aid = nextAgent.trim() ? Number.parseInt(nextAgent, 10) : NaN;
                  const all = clientsQ.data ?? [];
                  const nextFiltered =
                    !Number.isFinite(aid) || aid < 1 ? all : all.filter((c) => c.agent_id === aid);
                  setClientId((prev) => {
                    const cid = Number.parseInt(prev, 10);
                    if (!Number.isFinite(cid) || cid < 1) return prev;
                    return nextFiltered.some((c) => c.id === cid) ? prev : "";
                  });
                }}
                disabled={submitMut.isPending}
              >
                {(agentsQ.data ?? []).map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.fio}
                    {a.code ? ` (${a.code})` : ""}
                  </option>
                ))}
              </FilterSelect>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="add-pay-order">Заказ (необязательно)</Label>
            <Input
              id="add-pay-order"
              inputMode="numeric"
              className="h-10 bg-background"
              placeholder="Номер заказа"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={submitMut.isPending}
            />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {blocks.map((b, index) => (
          <div
            key={b.key}
            className={cn(
              "relative rounded-xl border p-4 shadow-sm transition-colors",
              index > 0
                ? "border-primary/20 bg-muted/30 ring-1 ring-border/60"
                : "border-border bg-card"
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
              <h3 className="text-sm font-semibold text-foreground">
                Оплата{blocks.length > 1 ? ` · ${index + 1}` : ""}
              </h3>
              {blocks.length > 1 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:underline"
                  onClick={() => removeBlock(b.key)}
                  disabled={submitMut.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Удалить
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Дата оплаты</Label>
                <Input
                  type="datetime-local"
                  className="h-10 bg-background"
                  value={b.paid_at_local}
                  onChange={(e) => updateBlock(b.key, { paid_at_local: e.target.value })}
                  disabled={submitMut.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Направление торговли</Label>
                <FilterSelect
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Не указано"
                  value={b.trade_direction}
                  onChange={(e) => updateBlock(b.key, { trade_direction: e.target.value })}
                  disabled={submitMut.isPending}
                >
                  {(filterOptQ.data?.trade_directions ?? []).map((td) => (
                    <option key={td} value={td}>
                      {td}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Касса</Label>
                <FilterSelect
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Не выбрана"
                  value={b.cash_desk_id}
                  onChange={(e) => updateBlock(b.key, { cash_desk_id: e.target.value })}
                  disabled={submitMut.isPending}
                >
                  {(cashDesksQ.data ?? []).map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Способ оплаты</Label>
                <FilterSelect
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Тип"
                  value={b.payment_type || defaultPayType}
                  onChange={(e) => updateBlock(b.key, { payment_type: e.target.value })}
                  disabled={submitMut.isPending}
                >
                  {paySelectOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <Label className="text-xs text-muted-foreground">Сумма</Label>
                <Input
                  data-testid={index === 0 ? "new-payment-amount" : undefined}
                  inputMode="decimal"
                  className="h-10 bg-background"
                  placeholder="0"
                  value={b.amount}
                  onChange={(e) => updateBlock(b.key, { amount: e.target.value })}
                  disabled={submitMut.isPending}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={b.consignment}
                  onChange={(e) => updateBlock(b.key, { consignment: e.target.checked })}
                  disabled={submitMut.isPending}
                />
                Консигнация (в комментарий)
              </label>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs text-muted-foreground">Комментарий</Label>
                <textarea
                  className="min-h-[80px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="Текст комментария…"
                  value={b.note}
                  onChange={(e) => updateBlock(b.key, { note: e.target.value })}
                  disabled={submitMut.isPending}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={submitMut.isPending}
          onClick={() => addBlock()}
        >
          <Plus className="h-4 w-4" />
          Добавить строку оплаты
        </Button>
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          Вложения к оплате (фото чека, скан) появятся в следующей версии — отдельная кнопка не нужна, данные
          сохраняются по кнопке «Добавить».
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {embedded ? (
          <Link href="/payments" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            ← К списку
          </Link>
        ) : onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitMut.isPending}>
            Отмена
          </Button>
        ) : null}
        <Button
          type="button"
          data-testid="new-payment-submit"
          className="min-w-[10rem]"
          disabled={submitMut.isPending}
          onClick={() => {
            setFormErr(null);
            submitMut.mutate();
          }}
        >
          {submitMut.isPending ? "Сохранение…" : "Добавить"}
        </Button>
      </div>
    </div>
  );
}
