"use client";

import { useEffect, useMemo, useRef } from "react";

export type TrackPoint = {
  id: number;
  lat: number;
  lon: number;
  recorded_at: string;
  accuracy_meters: number | null;
};

const DEFAULT_HEIGHT_PX = 480;
const YANDEX_LANG = "ru_RU";

type YMapLike = {
  destroy: () => void;
  geoObjects: { add: (obj: unknown) => void };
  setBounds: (bounds: [[number, number], [number, number]], opts?: Record<string, unknown>) => void;
  setCenter: (center: [number, number], zoom: number) => void;
};

type YMapsLike = {
  ready: (cb: () => void) => void;
  Map: new (el: HTMLElement, state: Record<string, unknown>, opts?: Record<string, unknown>) => YMapLike;
  Placemark: new (
    coords: [number, number],
    props?: Record<string, unknown>,
    opts?: Record<string, unknown>
  ) => unknown;
  Polyline: new (
    coords: Array<[number, number]>,
    props?: Record<string, unknown>,
    opts?: Record<string, unknown>
  ) => unknown;
};

declare global {
  interface Window {
    ymaps?: YMapsLike;
    __ymapsLoaderPromise?: Promise<YMapsLike>;
  }
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadYandexMapsApi(): Promise<YMapsLike> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("NoWindow"));
  }
  if (window.ymaps) return Promise.resolve(window.ymaps);
  if (window.__ymapsLoaderPromise) return window.__ymapsLoaderPromise;

  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim();
  const src = key
    ? `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=${YANDEX_LANG}`
    : `https://api-maps.yandex.ru/2.1/?lang=${YANDEX_LANG}`;
  window.__ymapsLoaderPromise = new Promise<YMapsLike>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yandex-maps="1"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.ymaps) resolve(window.ymaps);
        else reject(new Error("YandexMapsUnavailable"));
      });
      existing.addEventListener("error", () => reject(new Error("YandexMapsScriptError")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.yandexMaps = "1";
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("YandexMapsUnavailable"));
        return;
      }
      resolve(window.ymaps);
    };
    script.onerror = () => reject(new Error("YandexMapsScriptError"));
    document.head.appendChild(script);
  });
  return window.__ymapsLoaderPromise;
}

export function AgentTrackLeafletMap({
  points,
  agentLabel
}: {
  points: TrackPoint[];
  agentLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lon] as [number, number]),
    [points]
  );
  const mapKey = useMemo(() => points.map((p) => p.id).join("-"), [points]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || points.length === 0) return;
    let cancelled = false;
    let map: YMapLike | null = null;
    void loadYandexMapsApi()
      .then((ymaps) => {
        if (cancelled || !host) return;
        ymaps.ready(() => {
          if (cancelled || !host) return;
          map = new ymaps.Map(
            host,
            {
              center: positions[0] ?? [41.3111, 69.2797],
              zoom: 12,
              controls: ["zoomControl", "typeSelector", "fullscreenControl"]
            },
            { suppressMapOpenBlock: true }
          );

          if (positions.length > 1) {
            const line = new ymaps.Polyline(
              positions,
              {},
              {
                strokeColor: "#0369a1",
                strokeOpacity: 0.88,
                strokeWidth: 4
              }
            );
            map.geoObjects.add(line);
          }

          let minLat = positions[0]![0];
          let maxLat = positions[0]![0];
          let minLon = positions[0]![1];
          let maxLon = positions[0]![1];

          points.forEach((p, i) => {
            const isEnd = i === 0 || i === points.length - 1;
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon);
            maxLon = Math.max(maxLon, p.lon);
            const dateText = escapeHtml(new Date(p.recorded_at).toLocaleString());
            const accText =
              p.accuracy_meters != null
                ? `<div style="font-size:11px;color:#6b7280">±${Math.round(p.accuracy_meters)} m</div>`
                : "";
            const placemark = new ymaps.Placemark(
              [p.lat, p.lon],
              {
                balloonContent: `<div style="font-size:13px"><div style="font-weight:600">${escapeHtml(agentLabel)}</div><div style="margin-top:4px;font-size:11px;color:#4b5563">${dateText}</div>${accText}</div>`,
                hintContent: `${agentLabel} · ${new Date(p.recorded_at).toLocaleTimeString()}`
              },
              {
                preset: isEnd ? "islands#darkBlueCircleDotIcon" : "islands#blueCircleDotIcon"
              }
            );
            map?.geoObjects.add(placemark);
          });

          if (positions.length === 1) {
            map.setCenter(positions[0]!, 14);
          } else {
            map.setBounds(
              [
                [minLat, minLon],
                [maxLat, maxLon]
              ],
              { checkZoomRange: true, zoomMargin: [24, 24, 24, 24] }
            );
          }
        });
      })
      .catch(() => {
        // Non-blocking: keep container rendered on API load errors
      });
    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [agentLabel, mapKey, points, positions]);

  if (points.length === 0) return null;
  return <div ref={hostRef} style={{ height: DEFAULT_HEIGHT_PX, width: "100%", borderRadius: 8 }} className="z-0 overflow-hidden border border-border/50" />;
}
