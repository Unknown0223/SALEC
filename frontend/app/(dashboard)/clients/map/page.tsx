"use client";

import type { ClientMapPoint } from "@/components/clients/clients-leaflet-map";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import type { ClientRow } from "@/lib/client-types";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const ClientsLeafletMapDynamic = dynamic(
  () =>
    import("@/components/clients/clients-leaflet-map").then((m) => ({
      default: m.ClientsLeafletMap
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">Карта (Yandex) загружается…</p>
      </div>
    )
  }
);

function hasCoords(c: ClientRow): boolean {
  const lat = c.latitude != null && c.latitude !== "" ? parseFloat(c.latitude) : NaN;
  const lon = c.longitude != null && c.longitude !== "" ? parseFloat(c.longitude) : NaN;
  return !isNaN(lat) && !isNaN(lon);
}

export default function ClientsMapPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const [allClients, setAllClients] = useState<ClientRow[]>([]);
  /** API `total` — GPS bor klientlar soni (has_coords=1) */
  const [gpsClientsTotal, setGpsClientsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hasLocationOnly, setHasLocationOnly] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    try {
      const { data: body } = await api.get<{ data: ClientRow[]; total: number }>(
        `/api/${tenantSlug}/clients?page=1&limit=3500&map=1&has_coords=1&sort=name&order=asc`
      );
      setAllClients(body.data ?? []);
      setGpsClientsTotal(typeof body.total === "number" ? body.total : null);
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

  const clientsWithCoords: ClientMapPoint[] = mapClients
    .filter(hasCoords)
    .map((c) => ({
      ...c,
      lat: parseFloat(c.latitude!),
      lon: parseFloat(c.longitude!)
    }))
    .filter((c) => !isNaN(c.lat) && !isNaN(c.lon));

  const totalWithCoords = allClients.filter(hasCoords).length;

  return (
    <PageShell>
      <PageHeader
        title="Карта клиентов"
        description={
          tenantSlug
            ? `Yandex Map. Клиенты с GPS (сервер): ${gpsClientsTotal ?? totalWithCoords}.`
            : "Клиенты с GPS-координатами"
        }
        actions={
          <>
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href="/clients"
            >
              К списку клиентов
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href="/clients/new"
            >
              Новый клиент
            </Link>
          </>
        }
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Название клиента, адрес, область…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hasLocationOnly}
                  onChange={(e) => setHasLocationOnly(e.target.checked)}
                  className="accent-primary"
                />
                Только с координатами
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchClients}
                disabled={loading || !tenantSlug}
              >
                {loading ? "Обновление…" : "Обновить"}
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Показано: {mapClients.length} / {allClients.length}
            {" | "}Точек: {clientsWithCoords.length}
            {gpsClientsTotal != null && allClients.length < gpsClientsTotal ? (
              <span className="ms-2 text-amber-600 dark:text-amber-400">
                (всего с GPS {gpsClientsTotal}; за один запрос загружается до 3500)
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!authHydrated ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">Загрузка сессии…</p>
        </div>
      ) : !tenantSlug ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-destructive">Tenant не найден.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">Загрузка клиентов…</p>
        </div>
      ) : (
        <Card className="shadow-panel">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Расположение клиентов</CardTitle>
              <span className="text-xs text-muted-foreground">
                {clientsWithCoords.length} точек · Yandex
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {clientsWithCoords.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {allClients.length === 0
                    ? "Клиенты не найдены."
                    : "Нет клиентов с координатами."}
                </p>
              </div>
            ) : (
              <ClientsLeafletMapDynamic clients={clientsWithCoords} />
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Клиенты с координатами</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clientsWithCoords.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Нет данных.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="app-table-thead">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Клиент</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Область</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Район</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Адрес</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Широта (Lat)
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Долгота (Lon)
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
                      <td className="max-w-[200px] truncate px-4 py-2 text-muted-foreground">
                        {c.address || "-"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {c.latitude != null && String(c.latitude).trim()
                          ? formatNumberGrouped(String(c.latitude).trim(), { maxFractionDigits: 6 })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {c.longitude != null && String(c.longitude).trim()
                          ? formatNumberGrouped(String(c.longitude).trim(), { maxFractionDigits: 6 })
                          : "—"}
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
