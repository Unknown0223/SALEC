import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/lib/auth-store";
import { readPersistedAuth } from "@/lib/persisted-auth";

const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();

/** Axios `baseURL`: dev + proxy bo‘lsa bo‘sh — so‘rovlar joriy origin (`/api/...`). */
const baseURL =
  fromEnv != null && fromEnv !== ""
    ? fromEnv
    : process.env.NODE_ENV === "development"
      ? typeof window !== "undefined"
        ? ""
        : process.env.INTERNAL_API_BASE?.trim() || "http://127.0.0.1:4000"
      : typeof window !== "undefined"
        ? window.location.origin
        : "";

/**
 * `EventSource` / `new URL` uchun to‘liq origin.
 * Dev + proxy: `window.location.origin`; SSR yoki `NEXT_PUBLIC_API_URL` — mos ravishda.
 */
export function resolveApiOrigin(): string {
  if (fromEnv != null && fromEnv !== "") {
    try {
      return new URL(fromEnv).origin;
    } catch {
      return fromEnv.replace(/\/$/, "");
    }
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.INTERNAL_API_BASE?.trim() || "http://127.0.0.1:4000";
}

function authRefreshAbsoluteUrl(): string {
  if (!baseURL) return "/auth/refresh";
  return `${baseURL.replace(/\/$/, "")}/auth/refresh`;
}

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" }
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  if (typeof window !== "undefined") {
    const fromStore = useAuthStore.getState().accessToken;
    const fromDisk = readPersistedAuth().accessToken;
    const accessToken = fromStore ?? fromDisk;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    const store = useAuthStore.getState();
    const disk = readPersistedAuth();
    const refreshToken = store.refreshToken ?? disk.refreshToken;
    const tenantSlug = store.tenantSlug ?? disk.tenantSlug;
    if (!refreshToken || !tenantSlug) {
      store.clearSession();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
        authRefreshAbsoluteUrl(),
        { refreshToken }
      );
      store.setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenantSlug
      });
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch {
      store.clearSession();
      return Promise.reject(error);
    }
  }
);

export { baseURL as apiBaseURL };
