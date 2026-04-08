"use client";

import type { ClientRow } from "@/lib/client-types";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export type ClientMapPoint = ClientRow & { lat: number; lon: number };

const PALETTE = ["#10b981", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#f97316", "#6366f1"];

export function ClientsLeafletMap({ clients }: { clients: ClientMapPoint[] }) {
  const bounds = useMemo(() => {
    if (clients.length === 0) return null;
    const pairs: [number, number][] = clients.map((c) => [c.lat, c.lon]);
    const b = new LatLngBounds(pairs);
    if (clients.length === 1) {
      const c = clients[0];
      return new LatLngBounds([c.lat - 0.03, c.lon - 0.03], [c.lat + 0.03, c.lon + 0.03]);
    }
    return b.pad(0.1);
  }, [clients]);

  if (!bounds) return null;

  return (
    <MapContainer
      key={clients.map((c) => c.id).join("-")}
      bounds={bounds}
      boundsOptions={{ padding: [28, 28], maxZoom: 16 }}
      style={{ height: 520, width: "100%", borderRadius: 8 }}
      scrollWheelZoom
      className="z-0 [&_.leaflet-control-attribution]:text-[10px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {clients.map((c, i) => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lon]}
          radius={8}
          pathOptions={{
            color: "#0c4a6e",
            fillColor: PALETTE[i % PALETTE.length],
            fillOpacity: 0.88,
            weight: 2
          }}
        >
          <Popup>
            <div className="min-w-[160px] text-sm">
              <a href={`/clients/${c.id}`} className="font-medium text-sky-700 hover:underline">
                {c.name}
              </a>
              <div className="mt-1 font-mono text-xs text-gray-600">
                {String(c.latitude).slice(0, 12)}, {String(c.longitude).slice(0, 12)}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
