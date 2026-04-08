"use client";

import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";

export type TrackPoint = {
  id: number;
  lat: number;
  lon: number;
  recorded_at: string;
  accuracy_meters: number | null;
};

export function AgentTrackLeafletMap({
  points,
  agentLabel
}: {
  points: TrackPoint[];
  agentLabel: string;
}) {
  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lon] as [number, number]),
    [points]
  );

  const bounds = useMemo(() => {
    if (positions.length === 0) return null;
    if (positions.length === 1) {
      const [lat, lon] = positions[0];
      return new LatLngBounds([lat - 0.02, lon - 0.02], [lat + 0.02, lon + 0.02]);
    }
    return new LatLngBounds(positions).pad(0.12);
  }, [positions]);

  if (!bounds || points.length === 0) return null;

  return (
    <MapContainer
      key={points.map((p) => p.id).join("-")}
      bounds={bounds}
      boundsOptions={{ padding: [28, 28], maxZoom: 17 }}
      style={{ height: 480, width: "100%", borderRadius: 8 }}
      scrollWheelZoom
      className="z-0 [&_.leaflet-control-attribution]:text-[10px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {positions.length > 1 ? (
        <Polyline
          positions={positions}
          pathOptions={{ color: "#0369a1", weight: 4, opacity: 0.88 }}
        />
      ) : null}
      {points.map((p, i) => {
        const isEnd = i === 0 || i === points.length - 1;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={isEnd ? 9 : 5}
            pathOptions={{
              color: isEnd ? "#0f172a" : "#0369a1",
              fillColor: isEnd ? "#10b981" : "#7dd3fc",
              fillOpacity: 0.9,
              weight: 2
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{agentLabel}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {new Date(p.recorded_at).toLocaleString()}
                </div>
                {p.accuracy_meters != null ? (
                  <div className="text-xs text-gray-500">±{Math.round(p.accuracy_meters)} m</div>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
