"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import type { ClientRow } from "@/lib/client-types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ClientWithCoords = ClientRow & {
  lat: number;
  lon: number;
};

function hasCoords(c: ClientRow): boolean {
  const lat = (c.latitude != null && c.latitude !== "") ? parseFloat(c.latitude) : NaN;
  const lon = (c.longitude != null && c.longitude !== "") ? parseFloat(c.longitude) : NaN;
  return !isNaN(lat) && !isNaN(lon);
}

/** Convert lat/lon to percentage positions within the bounding box. */
function toXY(
  clients: ClientWithCoords[]
): { xPct: number[]; yPct: number[] } {
  if (clients.length === 0) return { xPct: [], yPct: [] };
  let minLat = clients[0].lat, maxLat = clients[0].lat;
  let minLon = clients[0].lon, maxLon = clients[0].lon;
  for (const c of clients) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;
  }

  // Add 5% padding so edge points don't sit on the border
  const padLat = Math.max((maxLat - minLat) * 0.05, 0.001);
  const padLon = Math.max((maxLon - minLon) * 0.05, 0.001);
  minLat -= padLat;
  maxLat += padLat;
  minLon -= padLon;
  maxLon += padLon;

  const xPct = clients.map((c) => ((c.lon - minLon) / (maxLon - minLon)) * 100);
  const yPct = clients.map((c) => (1 - (c.lat - minLat) / (maxLat - minLat)) * 100);
  return { xPct, yPct };
}

const COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-lime-500",
];

function colorFor(i: number): string {
  return COLORS[i % COLORS.length];
}

export default function ClientsMapPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const [allClients, setAllClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hasLocationOnly, setHasLocationOnly] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    try {
      const { data: body } = await api.get<{ data: ClientRow[]; total: number }>(
        `/api/${tenantSlug}/clients?page=1&limit=500`
      );
      setAllClients(body.data ?? []);
    } catch (e) {
      console.error("Failed to fetch clients for map", e);
      setAllClients([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (tenantSlug) void fetchClients();
  }, [tenantSlug, fetchClients]);

  const mapClients = allClients
    .filter((c) => !hasLocationOnly || hasCoords(c))
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.region && c.region.toLowerCase().includes(q)) ||
        (c.district && c.district.toLowerCase().includes(q))
      );
    });

  const clientsWithCoords = mapClients
    .filter(hasCoords)
    .map((c) => ({
      ...c,
      lat: parseFloat(c.latitude!),
      lon: parseFloat(c.longitude!),
    }))
    // Remove any remaining NaN entries
    .filter((c) => !isNaN(c.lat) && !isNaN(c.lon));

  const { xPct, yPct } = toXY(clientsWithCoords);

  // For tooltip coordination between dots and tooltip
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalWithCoords = allClients.filter(hasCoords).length;

  return (
    <PageShell>
      <PageHeader
        title="Klientlar xaritasi"
        description={`Klientlarning GPS koordinatalari asosida joylashuv xaritasi${tenantSlug ? ` (${totalWithCoords} ta koordinatali)` : ""}`}
        actions={
          <>
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href="/clients"
            >
              Ro'yxatga qaytish
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href="/clients/new"
            >
              Yangi mijoz
            </Link>
          </>
        }
      />

      {/* Filters */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Filtrlar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Klient nomi, manzil, viloyat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasLocationOnly}
                  onChange={(e) => setHasLocationOnly(e.target.checked)}
                  className="accent-primary"
                />
                Faqat koordinatalilar
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchClients}
                disabled={loading || !tenantSlug}
              >
                {loading ? "Yangilanmoqda..." : "Yangilash"}
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Ko'rsatilmoqda: {mapClients.length} / {allClients.length}
            {" | "}Koordinatali: {clientsWithCoords.length}
          </div>
        </CardContent>
      </Card>

      {/* Map visualization */}
      {!authHydrated ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda...</p>
        </div>
      ) : !tenantSlug ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-destructive">Tenant topilmadi. Qayta kiring.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">Klientlar yuklanmoqda...</p>
        </div>
      ) : (
        <Card className="shadow-panel">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Klient joylashuvlari</CardTitle>
              <span className="text-xs text-muted-foreground">
                {clientsWithCoords.length} nuqta
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {clientsWithCoords.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {allClients.length === 0
                    ? "Klientlar topilmadi."
                    : "Koordinatasi bor klientlar topilmadi."}
                </p>
              </div>
            ) : (
              <div className="relative w-full select-none">
                {/* Map container */}
                <div
                  className="relative w-full overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-950"
                  style={{ height: 520 }}
                >
                  {/* Grid lines - vertical */}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={`vg-${i}`}
                      className="absolute top-0 h-full border-r border-border/15"
                      style={{ left: `${(i + 1) * 10}%` }}
                    />
                  ))}
                  {/* Grid lines - horizontal */}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={`hg-${i}`}
                      className="absolute left-0 w-full border-b border-border/15"
                      style={{ top: `${(i + 1) * 10}%` }}
                    />
                  ))}

                  {/* Axis labels */}
                  {(() => {
                    let mnLat = Infinity, mxLat = -Infinity, mnLon = Infinity, mxLon = -Infinity;
                    for (const c of clientsWithCoords) {
                      if (c.lat < mnLat) mnLat = c.lat;
                      if (c.lat > mxLat) mxLat = c.lat;
                      if (c.lon < mnLon) mnLon = c.lon;
                      if (c.lon > mxLon) mxLon = c.lon;
                    }
                    return (
                      <>
                        <span className="absolute top-1.5 left-2 text-[10px] text-muted-foreground/60">
                          Lat: {mxLat.toFixed(4)}
                        </span>
                        <span className="absolute bottom-1.5 left-2 text-[10px] text-muted-foreground/60">
                          Lat: {mnLat.toFixed(4)}
                        </span>
                        <span className="absolute bottom-1.5 right-12 text-[10px] text-muted-foreground/60">
                          Lon: {mnLon.toFixed(4)}
                        </span>
                        <span className="absolute bottom-1.5 right-1.5 text-[10px] text-muted-foreground/60">
                          Lon: {mxLon.toFixed(4)}
                        </span>
                      </>
                    );
                  })()}

                  {/* Dots */}
                  {clientsWithCoords.map((client, i) => (
                    <div
                      key={`dot-${client.id}`}
                      className={cn(
                        "absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer group",
                        hoveredIdx === i ? "z-50" : ""
                      )}
                      style={{
                        left: `${xPct[i]}%`,
                        top: `${yPct[i]}%`,
                      }}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      <div
                        className={cn(
                          "h-3 w-3 rounded-full transition-all duration-150 group-hover:scale-[2.2] group-hover:ring-2 group-hover:ring-white/80 group-hover:dark:ring-slate-900/80 group-hover:shadow-lg",
                          colorFor(i)
                        )}
                      />
                    </div>
                  ))}

                  {/* Tooltip */}
                  {hoveredIdx != null && (
                    <div
                      className="pointer-events-none absolute z-[60] rounded-md border border-border/80 bg-popover px-3 py-1.5 shadow-xl"
                      style={{
                        left: `${xPct[hoveredIdx]}%`,
                        top: `${yPct[hoveredIdx]}%`,
                        transform: "translate(-50%, calc(-100% - 12px))",
                      }}
                    >
                      <p className="text-xs font-medium text-popover-foreground whitespace-nowrap">
                        {clientsWithCoords[hoveredIdx].name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {clientsWithCoords[hoveredIdx].latitude?.slice(0, 10)}, {clientsWithCoords[hoveredIdx].longitude?.slice(0, 10)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {clientsWithCoords.slice(0, 20).map((c, i) => (
                    <span key={`legend-${c.id}`} className="flex items-center gap-1">
                      <span className={cn("inline-block h-2 w-2 rounded-full", colorFor(i))} />
                      <span className="max-w-[140px] truncate">{c.name}</span>
                    </span>
                  ))}
                  {clientsWithCoords.length > 20 && (
                    <span className="text-muted-foreground">
                      +{clientsWithCoords.length - 20} yana
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coordinate table below the map */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Koordinatali klientlar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clientsWithCoords.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Ma'lumot yo'q.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Klient
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Viloyat
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Tuman
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Manzil
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Kenglik (Lat)
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Uzunlik (Lon)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientsWithCoords.map((c, i) => (
                    <tr
                      key={c.id}
                      className="border-b border-border/30 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{c.region || "-"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.district || "-"}</td>
                      <td className="px-4 py-2 max-w-[200px] truncate text-muted-foreground">
                        {c.address || "-"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {c.latitude}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {c.longitude}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
