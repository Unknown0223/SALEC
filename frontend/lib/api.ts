import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/lib/auth-store";
import { readPersistedAuth } from "@/lib/persisted-auth";

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

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
        `${baseURL}/auth/refresh`,
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
