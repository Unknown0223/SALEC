/** Zustand `persist` kaliti — `auth-store` dagi `name` bilan bir xil bo‘lishi kerak */
const STORAGE_KEY = "savdo-auth";

type PersistShape = {
  state?: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tenantSlug?: string | null;
  };
};

/** Rehydration tugaguncha `useAuthStore.getState().accessToken` bo‘sh bo‘lishi mumkin; so‘rovda shu yordamchi ishlatiladi */
export function readPersistedAuth(): {
  accessToken: string | null;
  refreshToken: string | null;
  tenantSlug: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, tenantSlug: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, tenantSlug: null };
    const parsed = JSON.parse(raw) as PersistShape;
    const s = parsed.state;
    return {
      accessToken: s?.accessToken ?? null,
      refreshToken: s?.refreshToken ?? null,
      tenantSlug: s?.tenantSlug ?? null
    };
  } catch {
    return { accessToken: null, refreshToken: null, tenantSlug: null };
  }
}
