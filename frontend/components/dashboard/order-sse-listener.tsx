"use client";

import { api, apiBaseURL } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

type StreamPayload = { type: string; tenant_id?: number; order_id?: number };

/**
 * Zakazlar o‘zgarishlarini SSE orqali tinglaydi va tegishli React Query so‘rovlarini yangilaydi.
 */
export function OrderSseListener() {
  const qc = useQueryClient();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const accessToken = useAuthStore((s) => s.accessToken);
  const esRef = useRef<EventSource | null>(null);
  const nudgeRef = useRef(false);

  useEffect(() => {
    if (!tenantSlug || !accessToken) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    const url = new URL(`${apiBaseURL}/api/${tenantSlug}/stream/orders`);
    url.searchParams.set("access_token", accessToken);

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data) as StreamPayload;
        if (p.type !== "order.updated" || typeof p.order_id !== "number") return;
        void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
        void qc.invalidateQueries({ queryKey: ["order", tenantSlug, p.order_id] });
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      /* EventSource xuddi shu (eski) URL bilan qayta ulanadi; token eskirsa — axios orqali refresh, keyin accessToken o‘zgaradi. */
      try {
        es.close();
      } catch {
        /* ignore */
      }
      if (nudgeRef.current) return;
      nudgeRef.current = true;
      void api
        .get(`/api/${tenantSlug}/protected`)
        .catch(() => {
          /* 401 → interceptor refresh */
        })
        .finally(() => {
          window.setTimeout(() => {
            nudgeRef.current = false;
          }, 2000);
        });
    };

    return () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [qc, tenantSlug, accessToken]);

  return null;
}
