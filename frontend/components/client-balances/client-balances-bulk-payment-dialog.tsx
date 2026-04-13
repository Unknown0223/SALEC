"use client";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { DateTimePickerField, localValueToDatetimeInput } from "@/components/ui/datetime-popover";
import { api } from "@/lib/api";
import { useAuthStoreHydrated } from "@/lib/auth-store";
import type { ClientBalanceRow } from "@/lib/client-balances-types";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";

type CashDeskRow = { id: number; name: string; is_active: boolean };

type RowDraft = {
  client_id: number;
  trade_direction: string;
  consignment: boolean;
  amounts: Record<string, string>;
  note: string;
};

function parseLineAmount(s: string): number {
  const t = String(s)
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/\u2212/g, "-")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function toIsoFromLocal(local: string): string | undefined {
  if (!local?.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function buildNote(
  tradeDirection: string,
  consignment: boolean,
  rowNote: string | null
): string | null {
  let note = rowNote?.trim() || null;
  if (tradeDirection.trim()) {
    const td = `Направление: ${tradeDirection.trim()}`;
    note = note ? `${td}. ${note}` : td;
  }
  if (consignment) {
    const tag = "Консигнация: да";
    note = note ? `${tag}. ${note}` : tag;
  }
  return note;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  clients: ClientBalanceRow[];
  paymentColumnLabels: string[];
  tradeDirections: string[];
  /** Muvaffaqiyatli saqlangandan keyin (masalan, tanlovni tozalash) */
  onSaved?: () => void;
};

export function ClientBalancesBulkPaymentDialog({
  open,
  onOpenChange,
  tenantSlug,
  clients,
  paymentColumnLabels,
  tradeDirections,
  onSaved
}: Props) {
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [cashDeskId, setCashDeskId] = useState("");
  const [paidAtLocal, setPaidAtLocal] = useState(() => localValueToDatetimeInput(new Date()));
  const [rowDrafts, setRowDrafts] = useState<RowDraft[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const cashDesksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "bulk-pay-balances"],
    enabled: Boolean(tenantSlug) && hydrated && open,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: CashDeskRow[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data.filter((d) => d.is_active);
    }
  });

  useEffect(() => {
    if (!open) return;
    setRowDrafts(
      clients.map((c) => ({
        client_id: c.client_id,
        trade_direction: (c.trade_direction ?? "").trim(),
        consignment: false,
        amounts: Object.fromEntries(paymentColumnLabels.map((l) => [l, ""])),
        note: ""
      }))
    );
    setPaidAtLocal(localValueToDatetimeInput(new Date()));
    setCashDeskId("");
    setFormErr(null);
  }, [open, clients, paymentColumnLabels]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.client_id, c])), [clients]);

  const updateDraft = useCallback((clientId: number, patch: Partial<RowDraft>) => {
    setRowDrafts((prev) =>
      prev.map((r) => (r.client_id === clientId ? { ...r, ...patch } : r))
    );
  }, []);

  const updateAmount = useCallback((clientId: number, label: string, value: string) => {
    setRowDrafts((prev) =>
      prev.map((r) =>
        r.client_id === clientId ? { ...r, amounts: { ...r.amounts, [label]: value } } : r
      )
    );
  }, []);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(
      paymentColumnLabels.map((l) => [l, 0])
    );
    for (const d of rowDrafts) {
      for (const lab of paymentColumnLabels) {
        totals[lab] = (totals[lab] ?? 0) + parseLineAmount(d.amounts[lab] ?? "");
      }
    }
    return totals;
  }, [rowDrafts, paymentColumnLabels]);

  const tradeDirectionOptions = useMemo(() => {
    const s = new Set<string>(tradeDirections);
    for (const d of rowDrafts) {
      const t = d.trade_direction.trim();
      if (t) s.add(t);
    }
    return [...s];
  }, [tradeDirections, rowDrafts]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const deskRaw = cashDeskId.trim();
      const deskParsed = deskRaw ? Number.parseInt(deskRaw, 10) : NaN;
      const cash_desk_id =
        Number.isFinite(deskParsed) && deskParsed > 0 ? deskParsed : null;
      const paid_at = toIsoFromLocal(paidAtLocal);

      type Body = {
        client_id: number;
        order_id: null;
        amount: number;
        payment_type: string;
        note: string | null;
        cash_desk_id: number | null;
        paid_at: string | undefined;
        ledger_agent_id?: number;
      };

      const bodies: Body[] = [];
      for (const d of rowDrafts) {
        const row = clientById.get(d.client_id);
        if (!row) continue;
        for (const lab of paymentColumnLabels) {
          const amt = parseLineAmount(d.amounts[lab] ?? "");
          if (amt <= 0) continue;
          const note = buildNote(d.trade_direction, d.consignment, d.note.trim() || null);
          const body: Body = {
            client_id: d.client_id,
            order_id: null,
            amount: amt,
            payment_type: lab.trim(),
            note,
            cash_desk_id,
            paid_at
          };
          if (row.agent_id != null && row.agent_id > 0) {
            body.ledger_agent_id = row.agent_id;
          }
          bodies.push(body);
        }
      }

      if (bodies.length === 0) throw new Error("NO_AMOUNTS");

      for (const body of bodies) {
        await api.post(`/api/${tenantSlug}/payments`, body);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["client-balances", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["payments", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["client-balance-ledger", tenantSlug] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "NO_AMOUNTS") {
        setFormErr("Укажите хотя бы одну сумму больше нуля.");
        return;
      }
      if (axios.isAxiosError(e)) {
        const code = (e.response?.data as { error?: string } | undefined)?.error;
        if (code === "BadCashDesk") {
          setFormErr("Указана несуществующая или неактивная касса.");
          return;
        }
        if (code === "BadLedgerAgent") {
          setFormErr("Для одного из клиентов указан недопустимый агент ведомости.");
          return;
        }
        if (code === "BadPaymentType") {
          setFormErr("Недопустимый способ оплаты.");
          return;
        }
      }
      setFormErr(getUserFacingError(e, "Не удалось сохранить оплаты."));
    }
  });

  const tableMinW = 520 + paymentColumnLabels.length * 112;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[min(92vh,900px)] w-full max-w-[min(100vw-1rem,72rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-2rem,72rem)]"
      >
        <div className="max-h-[min(92vh,900px)] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Оплаты</DialogTitle>
            <DialogDescription>
              Платежи по выбранным клиентам. Для каждого способа оплаты укажите сумму; пустые ячейки
              пропускаются.
            </DialogDescription>
          </DialogHeader>

          {formErr ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {formErr}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-pay-cash-desk">Касса</Label>
              <FilterSelect
                id="bulk-pay-cash-desk"
                className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                emptyLabel="Не выбрана"
                value={cashDeskId}
                onChange={(e) => {
                  setCashDeskId(e.target.value);
                  setFormErr(null);
                }}
                disabled={submitMut.isPending}
              >
                {(cashDesksQ.data ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-pay-datetime">Дата оплаты</Label>
              <DateTimePickerField
                id="bulk-pay-datetime"
                value={paidAtLocal}
                onChange={setPaidAtLocal}
                disabled={submitMut.isPending}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table
              className="w-full min-w-0 border-collapse text-sm"
              style={{ minWidth: tableMinW }}
            >
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="sticky left-0 z-10 min-w-[10rem] border-r border-border bg-muted/50 px-2 py-2">
                    Клиент
                  </th>
                  <th className="whitespace-nowrap px-2 py-2">Агент</th>
                  <th className="min-w-[8rem] px-2 py-2">Направление торговли</th>
                  <th className="w-10 px-1 py-2 text-center">Консиг.</th>
                  {paymentColumnLabels.map((lab) => (
                    <th
                      key={lab}
                      className="min-w-[6.5rem] whitespace-normal px-2 py-2 text-right text-xs leading-tight"
                      title={lab}
                    >
                      {lab}
                    </th>
                  ))}
                  <th className="min-w-[8rem] px-2 py-2">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {rowDrafts.map((d) => {
                  const row = clientById.get(d.client_id);
                  const agentLabel =
                    row?.agent_name?.trim() ||
                    (row?.agent_tags?.length ? row.agent_tags.join(", ") : "—");
                  return (
                    <tr key={d.client_id} className="border-b border-border/80">
                      <td className="sticky left-0 z-10 max-w-[12rem] border-r border-border bg-card px-2 py-2 align-top">
                        <span className="font-medium">{row?.name ?? `#${d.client_id}`}</span>
                      </td>
                      <td className="max-w-[9rem] px-2 py-2 align-top text-xs text-muted-foreground">
                        {agentLabel}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <FilterSelect
                          className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs"
                          emptyLabel="—"
                          value={d.trade_direction}
                          onChange={(e) =>
                            updateDraft(d.client_id, { trade_direction: e.target.value })
                          }
                          disabled={submitMut.isPending}
                        >
                          {tradeDirectionOptions.map((td) => (
                            <option key={td} value={td}>
                              {td}
                            </option>
                          ))}
                        </FilterSelect>
                      </td>
                      <td className="px-1 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          className="rounded border-input"
                          checked={d.consignment}
                          onChange={(e) =>
                            updateDraft(d.client_id, { consignment: e.target.checked })
                          }
                          disabled={submitMut.isPending}
                          title="Консигнация"
                        />
                      </td>
                      {paymentColumnLabels.map((lab) => (
                        <td key={`${d.client_id}-${lab}`} className="px-1 py-1.5 align-top">
                          <Input
                            className="h-9 tabular-nums"
                            inputMode="decimal"
                            placeholder="0"
                            value={d.amounts[lab] ?? ""}
                            onChange={(e) => updateAmount(d.client_id, lab, e.target.value)}
                            disabled={submitMut.isPending}
                          />
                        </td>
                      ))}
                      <td className="min-w-[8rem] px-2 py-2 align-top">
                        <Input
                          className="h-9 text-sm"
                          value={d.note}
                          onChange={(e) => updateDraft(d.client_id, { note: e.target.value })}
                          disabled={submitMut.isPending}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-medium">
                  <td
                    colSpan={3}
                    className="sticky left-0 z-10 border-r border-border bg-muted/40 px-2 py-2 text-xs"
                  >
                    Итого
                  </td>
                  <td className="bg-muted/40 px-2 py-2" />
                  {paymentColumnLabels.map((lab) => (
                    <td key={`tot-${lab}`} className="px-2 py-2 text-right tabular-nums text-xs">
                      {formatNumberGrouped(String(columnTotals[lab] ?? 0), {
                        maxFractionDigits: 2
                      })}{" "}
                      UZS
                    </td>
                  ))}
                  <td className="bg-muted/40" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              disabled={submitMut.isPending}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </button>
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
              disabled={submitMut.isPending || rowDrafts.length === 0}
              onClick={() => {
                setFormErr(null);
                void submitMut.mutateAsync();
              }}
            >
              {submitMut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
