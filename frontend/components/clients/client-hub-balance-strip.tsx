"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useClientProfileLedgerFilters } from "@/components/clients/client-profile-ledger-filters-context";
import { api } from "@/lib/api";
import {
  BalanceKpiScrollRow,
  CompactBalanceKpiCard,
  LEDGER_KPI_LANE_CLASS,
  SelectableCompactBalanceKpiCard,
  parseLedgerKpiAmount
} from "@/components/clients/ledger-balance-kpi-shared";
import type { ClientBalanceLedgerResponse } from "@/lib/client-balance-ledger-types";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { useAuthStoreHydrated } from "@/lib/auth-store";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const stripSectionLabelClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

type Props = {
  tenantSlug: string;
  clientId: number;
  onOpenDebtsTab?: () => void;
};

export function ClientHubBalanceStrip({ tenantSlug, clientId, onOpenDebtsTab }: Props) {
  const hydrated = useAuthStoreHydrated();
  const { agentFilter, setAgentFilter, showGeneralBlock } = useClientProfileLedgerFilters();
  const hasAgentTableFilter = agentFilter.agentIds.length > 0 || agentFilter.noAgent;

  const stripQs = useMemo(() => {
    const p = new URLSearchParams({ page: "1", limit: "1" });
    if (agentFilter.agentIds.length > 0) {
      const sorted = [...agentFilter.agentIds].sort((a, b) => a - b);
      p.set("agent_ids", sorted.join(","));
    }
    if (agentFilter.noAgent) p.set("no_agent", "1");
    return p.toString();
  }, [agentFilter.agentIds, agentFilter.noAgent]);

  const q = useQuery({
    queryKey: ["client-balance-ledger", tenantSlug, clientId, "hub-strip", stripQs],
    staleTime: STALE.list,
    enabled: Boolean(hydrated && tenantSlug && clientId > 0),
    queryFn: async () => {
      const { data } = await api.get<ClientBalanceLedgerResponse>(
        `/api/${tenantSlug}/clients/${clientId}/balance-ledger?${stripQs}`
      );
      return data;
    }
  });

  if (!hydrated || !tenantSlug) {
    return (
      <Card className="overflow-hidden border border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-2 sm:p-2.5">
          <p className="text-xs text-muted-foreground">Загрузка…</p>
        </CardContent>
      </Card>
    );
  }

  if (q.isLoading) {
    return (
      <Card className="overflow-hidden border border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-2 sm:p-2.5">
          <p className="text-xs text-muted-foreground">Баланс по агентам…</p>
        </CardContent>
      </Card>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Card className="overflow-hidden border border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-2 sm:p-2.5">
          <p className="text-xs text-destructive">Не удалось загрузить сводку баланса.</p>
        </CardContent>
      </Card>
    );
  }

  const ledger = q.data;
  const agentCards = ledger.agent_cards ?? [];
  const scrollSig = `${agentCards.length}-${ledger.ledger_net_balance ?? ""}-${showGeneralBlock}-${[...agentFilter.agentIds].sort((a, b) => a - b).join(",")}-${agentFilter.noAgent ? 1 : 0}`;

  return (
    <Card className="overflow-hidden border border-border bg-card text-card-foreground shadow-sm">
      <CardContent className="space-y-1 p-2 sm:p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1">
          <p className={stripSectionLabelClass}>Баланс</p>
          <div className="flex flex-wrap items-center gap-2">
            {hasAgentTableFilter ? (
              <button
                type="button"
                className="text-[10px] font-semibold uppercase tracking-wide text-primary underline-offset-2 hover:underline"
                onClick={() => setAgentFilter({ agentIds: [], noAgent: false })}
              >
                Все агенты
              </button>
            ) : null}
            {onOpenDebtsTab ? (
              <button
                type="button"
                className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                onClick={onOpenDebtsTab}
              >
                Ведомость →
              </button>
            ) : null}
          </div>
        </div>
        {showGeneralBlock || agentCards.length > 0 ? (
          <BalanceKpiScrollRow layoutSignature={scrollSig}>
            {showGeneralBlock ? (
              <div className={LEDGER_KPI_LANE_CLASS}>
                <CompactBalanceKpiCard
                  title="Общий"
                  mainAmountStr={ledger.ledger_net_balance ?? ledger.account_balance}
                  paymentByType={ledger.summary_payment_by_type}
                />
              </div>
            ) : null}
            {agentCards.map((ac) => {
              const isNullAgent = ac.agent_id == null;
              const aid = ac.agent_id;
              const cardChecked = isNullAgent
                ? agentFilter.noAgent
                : typeof aid === "number" && agentFilter.agentIds.includes(aid);
              const gd = parseLedgerKpiAmount(ac.ledger_general_debt_total ?? "0");
              const gp = parseLedgerKpiAmount(ac.ledger_general_payment_total ?? "0");
              const net = gp - gd;
              const title = ac.agent_code ? `${ac.agent_name} (${ac.agent_code})` : ac.agent_name;
              return (
                <div key={`${ac.agent_id ?? "null"}-${ac.agent_name}`} className={LEDGER_KPI_LANE_CLASS}>
                  <SelectableCompactBalanceKpiCard
                    title={title}
                    mainAmountStr={String(Math.round(net))}
                    paymentByType={ac.payment_by_type}
                    checked={cardChecked}
                    selectedTone={net < 0 ? "red" : "teal"}
                    onToggle={() => {
                      if (isNullAgent) {
                        setAgentFilter((prev) => ({ ...prev, noAgent: !prev.noAgent }));
                      } else {
                        const id = ac.agent_id as number;
                        setAgentFilter((prev) => {
                          const next = new Set(prev.agentIds);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return { ...prev, agentIds: Array.from(next) };
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
          </BalanceKpiScrollRow>
        ) : (
          <p className="text-xs text-muted-foreground">Нет карточек по агентам.</p>
        )}
        <p className="px-0.5 text-[9px] leading-snug text-muted-foreground sm:text-[10px]">
          Сальдо БД:{" "}
          <span className="font-mono tabular-nums text-foreground">
            {formatNumberGrouped(parseLedgerKpiAmount(ledger.account_balance), {
              minFractionDigits: 2,
              maxFractionDigits: 2
            })}
          </span>
          . Галочка на карточке фильтрует заявки, продукт, графики и ведомость «Долги».
        </p>
      </CardContent>
    </Card>
  );
}
