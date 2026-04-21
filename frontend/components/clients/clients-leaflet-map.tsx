"use client";

import type { ClientRow } from "@/lib/client-types";
import { useEffect, useMemo, useRef } from "react";

export type ClientMapPoint = ClientRow & { lat: number; lon: number };

const PALETTE = ["#10b981", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#f97316", "#6366f1"] as const;
const DEFAULT_HEIGHT_PX = 520;
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

export function ClientsLeafletMap({ clients }: { clients: ClientMapPoint[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const points = useMemo(() => clients.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)), [clients]);
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
              center: [points[0]!.lat, points[0]!.lon],
              zoom: 12,
              controls: ["zoomControl", "typeSelector", "fullscreenControl"]
            },
            { suppressMapOpenBlock: true }
          );

          let minLat = points[0]!.lat;
          let maxLat = points[0]!.lat;
          let minLon = points[0]!.lon;
          let maxLon = points[0]!.lon;
          points.forEach((c, i) => {
            minLat = Math.min(minLat, c.lat);
            maxLat = Math.max(maxLat, c.lat);
            minLon = Math.min(minLon, c.lon);
            maxLon = Math.max(maxLon, c.lon);
            const color = PALETTE[i % PALETTE.length];
            const safeName = escapeHtml(c.name);
            const coords = `${String(c.latitude).slice(0, 12)}, ${String(c.longitude).slice(0, 12)}`;
            const placemark = new ymaps.Placemark(
              [c.lat, c.lon],
              {
                balloonContent: `<div style="min-width:160px;font-size:13px"><a href="/clients/${c.id}" style="font-weight:600;color:#0369a1;text-decoration:none">${safeName}</a><div style="margin-top:6px;font-family:monospace;font-size:11px;color:#374151">${escapeHtml(coords)}</div></div>`,
                hintContent: safeName
              },
              {
                preset: "islands#circleIcon",
                iconColor: color
              }
            );
            map?.geoObjects.add(placemark);
          });

          if (points.length === 1) {
            map.setCenter([points[0]!.lat, points[0]!.lon], 14);
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
        // Non-blocking: container remains visible even if map script fails
      });
    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [mapKey, points]);

  if (points.length === 0) return null;
  return <div ref={hostRef} style={{ height: DEFAULT_HEIGHT_PX, width: "100%", borderRadius: 8 }} className="z-0 overflow-hidden border border-border/50" />;
}
