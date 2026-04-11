"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import type { AgentRow } from "@/components/staff/agents-workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { ClientRow } from "@/lib/client-types";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TradeDirRow = {
  id: number;
  name: string;
  code: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  rule: BonusRuleRow | null;
};

function sortStr(a: string, b: string) {
  return a.localeCompare(b, "ru");
}

export function BonusRuleOrderScopeDialog({ open, onOpenChange, tenantSlug, rule }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("branches");

  const [branchSel, setBranchSel] = useState<Set<string>>(new Set());
  const [agentSel, setAgentSel] = useState<Set<number>>(new Set());
  const [targetAllClients, setTargetAllClients] = useState(true);
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [clientNameById, setClientNameById] = useState<Record<number, string>>({});
  const [tradeDirSel, setTradeDirSel] = useState<Set<number>>(new Set());

  const [searchBranch, setSearchBranch] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [searchTd, setSearchTd] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [clientSearch]);

  useEffect(() => {
    if (!open || !rule) return;
    setTab("branches");
    setBranchSel(new Set(rule.scope_branch_codes ?? []));
    setAgentSel(new Set(rule.scope_agent_user_ids ?? []));
    setTargetAllClients(rule.target_all_clients !== false);
    setClientIds([...(rule.selected_client_ids ?? [])]);
    setClientNameById({});
    setTradeDirSel(new Set(rule.scope_trade_direction_ids ?? []));
    setSearchBranch("");
    setSearchAgent("");
    setClientSearch("");
    setSearchTd("");
    setShowSelectedOnly(false);
    setExpandedGroups(new Set());
  }, [open, rule]);

  const filterOptQ = useQuery({
    queryKey: ["agents-filter-options", tenantSlug, "bonus-scope"],
    enabled: open && Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: { branches: string[] } }>(
        `/api/${tenantSlug}/agents/filter-options`
      );
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: ["agents", tenantSlug, "bonus-scope", open],
    enabled: open && Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const q = new URLSearchParams({ is_active: "true" });
      const { data: body } = await api.get<{ data: AgentRow[] }>(`/api/${tenantSlug}/agents?${q}`);
      return body.data ?? [];
    }
  });

  const tradeDirQ = useQuery({
    queryKey: ["trade-directions", tenantSlug, "bonus-scope"],
    enabled: open && Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: TradeDirRow[] }>(
        `/api/${tenantSlug}/trade-directions?is_active=true`
      );
      return data.data ?? [];
    }
  });

  const clientsQ = useQuery({
    queryKey: ["bonus-scope-clients", tenantSlug, debouncedClientSearch],
    enabled: open && Boolean(tenantSlug) && !targetAllClients,
    queryFn: async () => {
      const q = new URLSearchParams({
        page: "1",
        limit: "80",
        sort: "name",
        order: "asc",
        is_active: "true"
      });
      if (debouncedClientSearch) q.set("search", debouncedClientSearch);
      const { data } = await api.get<{ data: ClientRow[] }>(`/api/${tenantSlug}/clients?${q}`);
      return data.data ?? [];
    }
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error("no rule");
      const body = {
        scope_branch_codes: Array.from(branchSel).sort(sortStr),
        scope_agent_user_ids: Array.from(agentSel).sort((a, b) => a - b),
        target_all_clients: targetAllClients,
        selected_client_ids: targetAllClients ? [] : [...clientIds].sort((a, b) => a - b),
        scope_trade_direction_ids: Array.from(tradeDirSel).sort((a, b) => a - b)
      };
      const { data } = await api.put<BonusRuleRow>(
        `/api/${tenantSlug}/bonus-rules/${rule.id}`,
        body
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
      onOpenChange(false);
    }
  });

  const branchesFromApi = filterOptQ.data?.branches ?? [];
  const branchRows = useMemo(() => {
    const q = searchBranch.trim().toLowerCase();
    const list = [...branchesFromApi].sort(sortStr);
    if (!q) return list;
    return list.filter((b) => b.toLowerCase().includes(q));
  }, [branchesFromApi, searchBranch]);

  const agentGroups = useMemo(() => {
    const agents = agentsQ.data ?? [];
    const q = searchAgent.trim().toLowerCase();
    const filtered = q
      ? agents.filter(
          (a) =>
            a.fio.toLowerCase().includes(q) ||
            (a.branch ?? "").toLowerCase().includes(q) ||
            (a.login ?? "").toLowerCase().includes(q)
        )
      : agents;
    const m = new Map<string, AgentRow[]>();
    for (const a of filtered) {
      const key = (a.branch ?? "").trim() || "—";
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    const keys = Array.from(m.keys()).sort(sortStr);
    for (const k of keys) {
      m.get(k)!.sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
    }
    return { keys, map: m };
  }, [agentsQ.data, searchAgent]);

  const expandAllGroups = useCallback(() => {
    setExpandedGroups(new Set(agentGroups.keys));
  }, [agentGroups.keys]);

  useEffect(() => {
    if (!open || tab !== "agents") return;
    const keys = agentGroups.keys;
    if (keys.length) setExpandedGroups(new Set(keys));
  }, [open, tab, agentsQ.data]);

  const tradeDirRows = useMemo(() => {
    const q = searchTd.trim().toLowerCase();
    const list = [...(tradeDirQ.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q)
    );
  }, [tradeDirQ.data, searchTd]);

  const toggleBranch = (b: string, checked: boolean) => {
    setBranchSel((prev) => {
      const n = new Set(prev);
      if (checked) n.add(b);
      else n.delete(b);
      return n;
    });
  };

  const toggleAgent = (id: number, checked: boolean) => {
    setAgentSel((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const toggleTradeDir = (id: number, checked: boolean) => {
    setTradeDirSel((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const visibleAgentRows = useMemo(() => {
    if (!showSelectedOnly) return null;
    const agents = agentsQ.data ?? [];
    return agents.filter((a) => agentSel.has(a.id));
  }, [showSelectedOnly, agentsQ.data, agentSel]);

  if (!rule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(640px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        )}
      >
        <DialogHeader className="border-b border-border/60 px-4 py-3 pr-10">
          <DialogTitle className="text-left text-base leading-snug">
            Привязка к заказу: {rule.name}
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Филиал (все агенты филиала), отдельные агенты (ИЛИ с филиалом), клиенты и направление
              торговли. Пустые списки = без ограничения по этому признаку. Для срабатывания в заказе
              должны совпадать клиент (если список задан) и агент/филиал/направление.
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-2">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v ?? "branches")}
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <TabsList className="grid w-full shrink-0 grid-cols-4 gap-1">
              <TabsTrigger value="branches" className="text-[11px] sm:text-xs">
                Филиалы
              </TabsTrigger>
              <TabsTrigger value="agents" className="text-[11px] sm:text-xs">
                Агенты
              </TabsTrigger>
              <TabsTrigger value="clients" className="text-[11px] sm:text-xs">
                Клиенты
              </TabsTrigger>
              <TabsTrigger value="directions" className="text-[11px] sm:text-xs">
                Направления
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="branches"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="Поиск"
                    value={searchBranch}
                    onChange={(e) => setSearchBranch(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const all = branchRows;
                    const allOn = all.length > 0 && all.every((b) => branchSel.has(b));
                    setBranchSel((prev) => {
                      const n = new Set(prev);
                      if (allOn) for (const b of all) n.delete(b);
                      else for (const b of all) n.add(b);
                      return n;
                    });
                  }}
                >
                  Выбрать все
                </Button>
              </div>
              <div className="min-h-[220px] overflow-y-auto rounded-md border border-border/60">
                {filterOptQ.isLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
                ) : branchRows.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">Нет филиалов в данных агентов.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {branchRows.map((b) => (
                      <li key={b} className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={branchSel.has(b)}
                          onChange={(e) => toggleBranch(b, e.target.checked)}
                          id={`br-${b}`}
                        />
                        <label htmlFor={`br-${b}`} className="flex-1 cursor-pointer text-sm">
                          {b}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent
              value="agents"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={expandAllGroups}>
                  Развернуть все
                </Button>
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="Поиск"
                    value={searchAgent}
                    onChange={(e) => setSearchAgent(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const rows =
                      showSelectedOnly && visibleAgentRows
                        ? visibleAgentRows
                        : agentGroups.keys.flatMap((k) => agentGroups.map.get(k) ?? []);
                    const ids = rows.map((r) => r.id);
                    const allOn = ids.length > 0 && ids.every((id) => agentSel.has(id));
                    setAgentSel((prev) => {
                      const n = new Set(prev);
                      if (allOn) for (const id of ids) n.delete(id);
                      else for (const id of ids) n.add(id);
                      return n;
                    });
                  }}
                >
                  Выбрать все
                </Button>
              </div>
              <div className="min-h-[220px] overflow-y-auto rounded-md border border-border/60">
                {agentsQ.isLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {(showSelectedOnly && visibleAgentRows
                      ? [{ key: "selected", label: "Выбранные", rows: visibleAgentRows }]
                      : agentGroups.keys.map((key) => ({
                          key,
                          label: key,
                          rows: agentGroups.map.get(key) ?? []
                        }))
                    ).map((group) =>
                      group.rows.length === 0 ? null : (
                        <div key={group.key}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 bg-muted/30 px-2 py-1.5 text-left text-xs font-medium"
                            onClick={() =>
                              setExpandedGroups((prev) => {
                                const n = new Set(prev);
                                if (n.has(group.key)) n.delete(group.key);
                                else n.add(group.key);
                                return n;
                              })
                            }
                          >
                            {expandedGroups.has(group.key) ? (
                              <ChevronDown className="size-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0" />
                            )}
                            {group.label}
                            <span className="text-muted-foreground">({group.rows.length})</span>
                          </button>
                          {expandedGroups.has(group.key) ? (
                            <ul>
                              {group.rows.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex items-center gap-2 border-t border-border/40 px-3 py-1.5 pl-8"
                                >
                                  <input
                                    type="checkbox"
                                    className="size-4 accent-primary"
                                    checked={agentSel.has(a.id)}
                                    onChange={(e) => toggleAgent(a.id, e.target.checked)}
                                    id={`ag-${a.id}`}
                                  />
                                  <label htmlFor={`ag-${a.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                                    <span className="font-medium">{a.fio}</span>
                                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                      #{a.id}
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent
              value="clients"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={targetAllClients}
                  onChange={(e) => setTargetAllClients(e.target.checked)}
                />
                Все клиенты
              </label>
              {!targetAllClients ? (
                <>
                  <Input
                    className="h-9"
                    placeholder="Поиск клиентов…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <div className="min-h-[200px] overflow-y-auto rounded-md border border-border/60">
                    {clientsQ.isLoading ? (
                      <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {clientIds.map((id) => (
                          <li key={id} className="flex items-center gap-2 px-3 py-2">
                            <span className="flex-1 text-sm">
                              {clientNameById[id]?.trim() ? clientNameById[id] : `#${id}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setClientIds((prev) => prev.filter((x) => x !== id))}
                            >
                              Снять
                            </Button>
                          </li>
                        ))}
                        {(clientsQ.data ?? []).map((row) => {
                          const on = clientIds.includes(row.id);
                          return (
                            <li key={`p-${row.id}`} className="flex items-center gap-2 px-3 py-2">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={on}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setClientIds((prev) => [...prev, row.id].sort((a, b) => a - b));
                                    setClientNameById((p) => ({ ...p, [row.id]: row.name }));
                                  } else {
                                    setClientIds((prev) => prev.filter((x) => x !== row.id));
                                  }
                                }}
                                id={`cl-${row.id}`}
                              />
                              <label htmlFor={`cl-${row.id}`} className="flex-1 cursor-pointer text-sm">
                                {row.name}
                                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                  #{row.id}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ограничение по клиентам выключено — правило действует для любого клиента (остальные
                  фильтры всё равно учитываются).
                </p>
              )}
            </TabsContent>

            <TabsContent
              value="directions"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="Поиск"
                    value={searchTd}
                    onChange={(e) => setSearchTd(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const all = tradeDirRows;
                    const allOn = all.length > 0 && all.every((r) => tradeDirSel.has(r.id));
                    setTradeDirSel((prev) => {
                      const n = new Set(prev);
                      if (allOn) for (const r of all) n.delete(r.id);
                      else for (const r of all) n.add(r.id);
                      return n;
                    });
                  }}
                >
                  Выбрать все
                </Button>
              </div>
              <div className="min-h-[220px] overflow-y-auto rounded-md border border-border/60">
                {tradeDirQ.isLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
                ) : tradeDirRows.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">Нет направлений.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {tradeDirRows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={tradeDirSel.has(r.id)}
                          onChange={(e) => toggleTradeDir(r.id, e.target.checked)}
                          id={`td-${r.id}`}
                        />
                        <label htmlFor={`td-${r.id}`} className="flex-1 cursor-pointer text-sm">
                          {r.name}
                          {r.code?.trim() ? (
                            <span className="ml-2 text-xs text-muted-foreground">[{r.code}]</span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={showSelectedOnly}
              onChange={(e) => setShowSelectedOnly(e.target.checked)}
            />
            Показать только выбранные (вкладка «Агенты»)
          </label>

          {saveMut.isError ? (
            <p className="text-xs text-destructive">Не удалось сохранить. Проверьте права и сеть.</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border/60 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отменить
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="bg-primary text-primary-foreground"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
