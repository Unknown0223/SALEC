"use client";

import { useAuthStore } from "@/lib/auth-store";
import { readPersistedAuth } from "@/lib/persisted-auth";
import { apiBaseURL } from "@/lib/api";

/** Login paytida saqlangan tenant slug (marshrutlar `/api/${slug}/...` uchun). */
export function useTenant(): string {
  return useAuthStore((s) => s.tenantSlug ?? "");
}

/**
 * Bearer + bir marta refresh (axios `api` bilan bir xil siyosat).
 * Faqat client komponentlarda.
 */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error("apiFetch is client-only");
  }
  const base = apiBaseURL || "";
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const buildHeaders = (): Headers => {
    const h = new Headers(init?.headers);
    const body = init?.body;
    if (body != null && typeof body === "string" && !h.has("Content-Type")) {
      h.set("Content-Type", "application/json");
    }
    const token = useAuthStore.getState().accessToken ?? readPersistedAuth().accessToken;
    if (token) h.set("Authorization", `Bearer ${token}`);
    return h;
  };

  const doFetch = () => fetch(url, { ...init, headers: buildHeaders() });

  let res = await doFetch();

  if (res.status === 401) {
    const store = useAuthStore.getState();
    const disk = readPersistedAuth();
    const refreshToken = store.refreshToken ?? disk.refreshToken;
    const tenantSlug = store.tenantSlug ?? disk.tenantSlug;
    if (refreshToken && tenantSlug) {
      try {
        const r = await fetch(`${base}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
        if (r.ok) {
          const data = (await r.json()) as { accessToken: string; refreshToken: string };
          store.setSession({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            tenantSlug
          });
          res = await doFetch();
        }
      } catch {
        /* clear below if still 401 */
      }
    }
    if (res.status === 401) {
      useAuthStore.getState().clearSession();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* use text */
    }
    throw new Error(detail || res.statusText);
  }

  const ct = res.headers.get("content-type");
  if (ct?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}
