"use client";

import { api, apiBaseURL } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

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
  const [status, setStatus] = useState<"idle" | "connected" | "reconnecting">("idle");

  useEffect(() => {
    if (!tenantSlug || !accessToken) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let ownedEs: EventSource | null = null;
    const slugAtStart = tenantSlug;

    (async () => {
      try {
        /* Bearer bilan tekshiruv: eskirgan access JWT bo‘lsa interceptor refresh qiladi; SSE URL faqat query token oladi. */
        await api.get(`/api/${slugAtStart}/protected`);
      } catch {
        return;
      }
      if (cancelled || useAuthStore.getState().tenantSlug !== slugAtStart) return;

      const token = useAuthStore.getState().accessToken ?? accessToken;
      if (!token) return;

      const url = new URL(`${apiBaseURL}/api/${slugAtStart}/stream/orders`);
      url.searchParams.set("access_token", token);
      if (cancelled) return;

      const es = new EventSource(url.toString());
      ownedEs = es;
      if (cancelled) {
        es.close();
        ownedEs = null;
        return;
      }
      esRef.current?.close();
      esRef.current = es;
      setStatus("connected");

      es.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data) as StreamPayload;
          if (p.type !== "order.updated" || typeof p.order_id !== "number") return;
          void qc.invalidateQueries({ queryKey: ["orders", slugAtStart] });
          void qc.invalidateQueries({ queryKey: ["order", slugAtStart, p.order_id] });
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        setStatus("reconnecting");
        try {
          es.close();
        } catch {
          /* ignore */
        }
        if (ownedEs === es) ownedEs = null;
        if (esRef.current === es) esRef.current = null;
        if (nudgeRef.current) return;
        nudgeRef.current = true;
        void api
          .get(`/api/${slugAtStart}/protected`)
          .catch(() => {
            /* 401 → interceptor refresh */
          })
          .finally(() => {
            window.setTimeout(() => {
              nudgeRef.current = false;
            }, 2000);
          });
      };
    })();

    return () => {
      cancelled = true;
      ownedEs?.close();
      ownedEs = null;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("idle");
    };
  }, [qc, tenantSlug, accessToken]);

  if (!tenantSlug || status === "idle") return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 rounded-md border border-border bg-background/90 px-2 py-1 text-xs shadow">
      SSE: {status === "connected" ? "connected" : "reconnecting"}
    </div>
  );
}
