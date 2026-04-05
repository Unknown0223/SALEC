"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const WRITE = ["admin", "operator", "supervisor"];

export default function RoutesPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const canWrite = role != null && WRITE.includes(role);
  const qc = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [stopsJson, setStopsJson] = useState('[{"client_id":0,"sort":0}]');

  const agentsQ = useQuery({
    queryKey: ["routes-agents", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/agents?${params}`
      );
      return data.data;
    }
  });

  const oneQ = useQuery({
    queryKey: ["agent-route-day", tenantSlug, agentId, routeDate],
    enabled: Boolean(tenantSlug) && Boolean(agentId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("agent_id", agentId);
      params.set("route_date", routeDate);
      const { data } = await api.get<{ data: { stops: unknown; notes: string | null } | null }>(
        `/api/${tenantSlug}/agent-route-days/one?${params}`
      );
      return data.data;
    }
  });

  useEffect(() => {
    if (oneQ.data?.stops != null) {
      try {
        setStopsJson(JSON.stringify(oneQ.data.stops, null, 2));
      } catch {
        /* ignore */
      }
    }
  }, [oneQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const aid = Number.parseInt(agentId, 10);
      let stops: unknown;
      try {
        stops = JSON.parse(stopsJson) as unknown;
      } catch {
        throw new Error("json");
      }
      await api.put(`/api/${tenantSlug}/agent-route-days`, {
        agent_id: aid,
        route_date: routeDate,
        stops
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["agent-route-day", tenantSlug] });
    }
  });

  const agents = useMemo(() => agentsQ.data ?? [], [agentsQ.data]);

  return (
    <PageShell>
      <PageHeader
        title="Маршрут"
        description="План визитов на день: JSON-массив остановок { client_id, sort }."
      />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Агент</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">—</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Дата</Label>
            <Input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Остановки (JSON)</Label>
          <textarea
            className="min-h-[200px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
            value={stopsJson}
            onChange={(e) => setStopsJson(e.target.value)}
            disabled={!canWrite}
          />
        </div>
        {canWrite ? (
          <Button
            type="button"
            disabled={!agentId || saveMut.isPending}
            onClick={() => void saveMut.mutate()}
          >
            Сохранить маршрут
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Редактирование — роли: админ, оператор, супервайзер.</p>
        )}
      </div>
    </PageShell>
  );
}
