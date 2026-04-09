"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { agentDisplayName, type AgentListItem } from "@/lib/agent-display";
import { cn } from "@/lib/utils";

const AgentTrackLeafletMapDynamic = dynamic(
  () =>
    import("@/components/field/agent-track-leaflet-map").then((m) => ({
      default: m.AgentTrackLeafletMap
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] items-center justify-center rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">Xarita yuklanmoqda…</p>
      </div>
    )
  }
);

type PingRow = {
  id: number;
  agent_id: number;
  latitude: string;
  longitude: string;
  accuracy_meters: number | null;
  recorded_at: string;
};

export default function AgentTrackPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAgent = role === "agent";

  const [agentId, setAgentId] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterTerritory, setFilterTerritory] = useState("");
  const [filterOblast, setFilterOblast] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterTradeDirection, setFilterTradeDirection] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [agentStatus, setAgentStatus] = useState<"active" | "inactive" | "all">("active");
  const [fromLocal, setFromLocal] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [toLocal, setToLocal] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16);
  });

  const filterOptQ = useQuery({
    queryKey: ["agent-track-filter-options", tenantSlug],
    enabled: Boolean(tenantSlug) && hydrated && !isAgent,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: {
          branches: string[];
          trade_directions: string[];
          positions: string[];
          territories: string[];
          territory_tokens: string[];
        };
      }>(`/api/${tenantSlug}/agents/filter-options`);
      return data.data;
    }
  });

  const agentsQ = useQuery({
    queryKey: [
      "track-agents",
      tenantSlug,
      filterBranch,
      filterTerritory,
      filterOblast,
      filterCity,
      filterTradeDirection,
      filterPosition,
      agentStatus
    ],
    enabled: Boolean(tenantSlug) && hydrated && !isAgent,
    staleTime: STALE.reference,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentStatus === "active") params.set("is_active", "true");
      else if (agentStatus === "inactive") params.set("is_active", "false");
      if (filterBranch.trim()) params.set("branch", filterBranch.trim());
      if (filterTerritory.trim()) params.set("territory", filterTerritory.trim());
      if (filterOblast.trim()) params.set("territory_oblast", filterOblast.trim());
      if (filterCity.trim()) params.set("territory_city", filterCity.trim());
      if (filterTradeDirection.trim()) params.set("trade_direction", filterTradeDirection.trim());
      if (filterPosition.trim()) params.set("position", filterPosition.trim());
      const { data } = await api.get<{ data: AgentListItem[] }>(
        `/api/${tenantSlug}/agents?${params}`
      );
      return data.data;
    }
  });

  const selectedAgentId = useMemo(() => {
    if (isAgent) return null;
    const n = Number.parseInt(agentId, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [agentId, isAgent]);

  useEffect(() => {
    if (isAgent) return;
    const list = agentsQ.data;
    if (!list || selectedAgentId == null) return;
    if (!list.some((a) => a.id === selectedAgentId)) {
      setAgentId("");
    }
  }, [isAgent, agentsQ.data, selectedAgentId]);

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const setQuickRange = (hoursBack: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - hoursBack * 60 * 60 * 1000);
    setFromLocal(from.toISOString().slice(0, 16));
    setToLocal(to.toISOString().slice(0, 16));
  };

  const trackQ = useQuery({
    queryKey: ["agent-locations", tenantSlug, isAgent, selectedAgentId, fromLocal, toLocal],
    enabled:
      Boolean(tenantSlug) &&
      hydrated &&
      (isAgent || selectedAgentId != null) &&
      Boolean(fromLocal) &&
      Boolean(toLocal),
    staleTime: STALE.live,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!isAgent && selectedAgentId != null) params.set("agent_id", String(selectedAgentId));
      const fromIso = new Date(fromLocal).toISOString();
      const toIso = new Date(toLocal).toISOString();
      params.set("from", fromIso);
      params.set("to", toIso);
      params.set("limit", "3000");
      const { data } = await api.get<{
        data: PingRow[];
        truncated: boolean;
        range: { from: string; to: string };
      }>(`/api/${tenantSlug}/agent-locations?${params}`);
      return data;
    }
  });

  const trackPoints = useMemo(() => {
    const rows = trackQ.data?.data ?? [];
    return rows
      .map((r) => {
        const lat = Number.parseFloat(r.latitude);
        const lon = Number.parseFloat(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          id: r.id,
          lat,
          lon,
          recorded_at: r.recorded_at,
          accuracy_meters: r.accuracy_meters
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [trackQ.data?.data]);

  const agentLabel = isAgent
    ? "Sizning trekingiz"
    : (() => {
        const row = agentsQ.data?.find((a) => a.id === selectedAgentId);
        if (row) return agentDisplayName(row);
        if (selectedAgentId != null) return `Agent #${selectedAgentId}`;
        return "Agent";
      })();

  return (
    <PageShell>
      <PageHeader
        title="Agent GPS treki"
        description="Mobil ilova yoki POST /agent-locations orqali kelgan nuqtalar. OpenStreetMap + chiziq."
        actions={
          <Link href="/routes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Marshrut kunlari
          </Link>
        }
      />

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">Kirish kerak.</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Filtrlar va agent</CardTitle>
              {!isAgent ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => {
                    setFilterBranch("");
                    setFilterTerritory("");
                    setFilterOblast("");
                    setFilterCity("");
                    setFilterTradeDirection("");
                    setFilterPosition("");
                    setAgentStatus("active");
                  }}
                >
                  Filtrlarni tozalash
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAgent ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Filial</Label>
                    <select
                      className={selectClass}
                      value={filterBranch}
                      onChange={(e) => setFilterBranch(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.branches ?? []).map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Teritoriya (to‘liq)</Label>
                    <select
                      className={selectClass}
                      value={filterTerritory}
                      onChange={(e) => setFilterTerritory(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.territories ?? []).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Viloyat (qator ichida)</Label>
                    <select
                      className={selectClass}
                      value={filterOblast}
                      onChange={(e) => setFilterOblast(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.territory_tokens ?? []).map((t) => (
                        <option key={`o-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Shahar (qator ichida)</Label>
                    <select
                      className={selectClass}
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.territory_tokens ?? []).map((t) => (
                        <option key={`c-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Savdo yo‘nalishi</Label>
                    <select
                      className={selectClass}
                      value={filterTradeDirection}
                      onChange={(e) => setFilterTradeDirection(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.trade_directions ?? []).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Agent holati</Label>
                    <select
                      className={selectClass}
                      value={agentStatus}
                      onChange={(e) =>
                        setAgentStatus(e.target.value as "active" | "inactive" | "all")
                      }
                    >
                      <option value="active">Faol</option>
                      <option value="inactive">Nofaol</option>
                      <option value="all">Barchasi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lavozim</Label>
                    <select
                      className={selectClass}
                      value={filterPosition}
                      onChange={(e) => setFilterPosition(e.target.value)}
                      disabled={filterOptQ.isLoading}
                    >
                      <option value="">— barchasi —</option>
                      {(filterOptQ.data?.positions ?? []).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2 lg:col-span-2 xl:col-span-2">
                    <Label>Agent</Label>
                    <select
                      className={selectClass}
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                    >
                      <option value="">— tanlang —</option>
                      {(agentsQ.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {agentDisplayName(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Agent sifatida faqat o‘z GPS nuqtalaringiz ko‘rinadi.
                </p>
              )}
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[180px] flex-1 space-y-2">
                  <Label>Dan (mahalliy)</Label>
                  <Input
                    type="datetime-local"
                    value={fromLocal}
                    onChange={(e) => setFromLocal(e.target.value)}
                  />
                </div>
                <div className="min-w-[180px] flex-1 space-y-2">
                  <Label>Gacha (mahalliy)</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal}
                    onChange={(e) => setToLocal(e.target.value)}
                  />
                </div>
                <div className="min-w-[220px] space-y-2">
                  <Label>Tezkor davr</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange(6)}>
                      Oxirgi 6 soat
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange(24)}>
                      24 soat
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange(24 * 7)}>
                      7 kun
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={trackQ.isFetching || (!isAgent && !selectedAgentId)}
                  onClick={() => void trackQ.refetch()}
                >
                  {trackQ.isFetching ? "Yuklanmoqda…" : "Yangilash"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {trackQ.isError ? (
            <p className="text-sm text-destructive">Trekni yuklab bo‘lmadi.</p>
          ) : null}

          {trackQ.data?.truncated ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Ko‘rsatilgan nuqtalar soni cheklangan (max 3000). Davrni qisqartiring.
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Xarita</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {trackPoints.length} nuqta
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {trackQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
              ) : !isAgent && !selectedAgentId ? (
                <p className="text-sm text-muted-foreground">Agentni tanlang.</p>
              ) : trackPoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bu davrda GPS nuqtalari yo‘q. Mobil ilova `POST /api/.../agent-locations` yuborishi kerak.
                </p>
              ) : (
                <AgentTrackLeafletMapDynamic points={trackPoints} agentLabel={agentLabel} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
