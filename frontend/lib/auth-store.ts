import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  tenantSlug: string | null;
  role: string | null;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    tenantSlug: string;
    role?: string | null;
  }) => void;
  clearSession: () => void;
};

/** JWT access payload dan `role` (sessiya eski persist bo‘lsa tokendan ham olinadi). */
export function decodeAccessTokenRole(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]!;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    const json = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function useEffectiveRole(): string | null {
  const accessToken = useAuthStore((s) => s.accessToken);
  const stored = useAuthStore((s) => s.role);
  return stored ?? decodeAccessTokenRole(accessToken);
}

function setSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `sd_auth=1;path=/;max-age=${60 * 60 * 24};SameSite=Lax`;
}

function clearSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "sd_auth=;path=/;max-age=0";
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      tenantSlug: null,
      role: null,
      setSession: ({ accessToken, refreshToken, tenantSlug, role: roleIn }) => {
        setSessionCookie();
        const role = roleIn ?? decodeAccessTokenRole(accessToken);
        set({ accessToken, refreshToken, tenantSlug, role });
      },
      clearSession: () => {
        clearSessionCookie();
        set({ accessToken: null, refreshToken: null, tenantSlug: null, role: null });
      }
    }),
    { name: "savdo-auth" }
  )
);

/**
 * localStorage dan sessiya qayta yuklanguncha false.
 * SSR da `persist` bo‘lmasligi mumkin — faqat client `useEffect` da tekshiramiz.
 */
export function useAuthStoreHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = useAuthStore.persist;
    if (!p) {
      setHydrated(true);
      return;
    }
    setHydrated(p.hasHydrated());
    return p.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
