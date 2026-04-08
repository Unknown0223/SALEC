"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { agentDisplayName, type AgentListItem } from "@/lib/agent-display";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGroupedInteger } from "@/lib/format-numbers";
import { useMemo, useState } from "react";

type VisitRow = {
  id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  latitude?: string | null;
  longitude?: string | null;
  notes: string | null;
  agent: { id: number; name: string; login: string };
  client: { id: number; name: string } | null;
};

export default function VisitsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const qc = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [exporting, setExporting] = useState(false);

  const agentsQ = useQuery({
    queryKey: ["visits-agents", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      const { data } = await api.get<{ data: AgentListItem[] }>(
        `/api/${tenantSlug}/agents?${params}`
      );
      return data.data;
    }
  });

  const listQ = useQuery({
    queryKey: ["agent-visits", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: VisitRow[]; total: number }>(
        `/api/${tenantSlug}/agent-visits?limit=50`
      );
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const aid = Number.parseInt(agentId, 10);
      if (!Number.isFinite(aid)) throw new Error("agent");
      const cid = clientId.trim() ? Number.parseInt(clientId, 10) : null;
      await api.post(`/api/${tenantSlug}/agent-visits`, {
        agent_id: aid,
        client_id: cid && Number.isFinite(cid) ? cid : null,
        notes: notes.trim() || null
      });
    },
    onSuccess: async () => {
      setNotes("");
      setClientId("");
      await qc.invalidateQueries({ queryKey: ["agent-visits", tenantSlug] });
    }
  });

  const checkoutMut = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/${tenantSlug}/agent-visits/${id}/checkout`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["agent-visits", tenantSlug] });
    }
  });

  const agentOptions = useMemo(() => agentsQ.data ?? [], [agentsQ.data]);

  const downloadVisitsXlsx = async () => {
    if (!tenantSlug) return;
    setExporting(true);
    try {
      const { data } = await api.get<Blob>(`/api/${tenantSlug}/agent-visits/export`, {
        responseType: "blob"
      });
      const blob = data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tashriflar.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Визиты"
        description="Check-in агентов у клиентов (полевые визиты)."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!tenantSlug || exporting}
            onClick={() => void downloadVisitsXlsx()}
          >
            {exporting ? "Excel…" : "Excel (max 10000)"}
          </Button>
        }
      />
      <div className="orders-hub-section orders-hub-section--table">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
              <div className="space-y-3 p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Новый визит</h2>
                <div className="space-y-2">
                  <Label>Агент</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                  >
                    <option value="">—</option>
                    {agentOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {agentDisplayName(a)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>ID клиента (необязательно)</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Напр. 42" />
                </div>
                <div className="space-y-2">
                  <Label>Заметка</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <Button
                  type="button"
                  disabled={!tenantSlug || !agentId || createMut.isPending}
                  onClick={() => void createMut.mutate()}
                >
                  Зафиксировать визит
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="app-table-thead">
                    <tr>
                      <th className="px-3 py-2 text-left">Время</th>
                      <th className="px-3 py-2 text-left">Агент</th>
                      <th className="px-3 py-2 text-left">Клиент</th>
                      <th className="px-3 py-2 text-left">Статус</th>
                      <th className="px-3 py-2 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {(listQ.data ?? []).map((v) => (
                      <tr key={v.id} className="border-t border-border/80">
                        <td className="whitespace-nowrap px-3 py-2">
                          {new Date(v.checked_in_at).toLocaleString("ru-RU")}
                        </td>
                        <td className="px-3 py-2">{v.agent.name}</td>
                        <td className="px-3 py-2">
                          {v.client
                            ? `${v.client.name} (#${formatGroupedInteger(v.client.id)})`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">{v.checked_out_at ? "Завершён" : "Активен"}</td>
                        <td className="px-3 py-2 text-right">
                          {!v.checked_out_at ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={checkoutMut.isPending}
                              onClick={() => void checkoutMut.mutate(v.id)}
                            >
                              Завершить
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
