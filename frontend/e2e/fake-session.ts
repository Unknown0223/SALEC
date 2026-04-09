import type { BrowserContext } from "@playwright/test";

/** `lib/auth-store` bilan mos kalit */
export const AUTH_STORAGE_KEY = "savdo-auth";

/** Haqiqiy JWT emas — faqat middleware + layout «kirgan» holatini imitatsiya qiladi. API so‘rovlari xato berishi mumkin. */
export const FAKE_ADMIN_SESSION_RAW = JSON.stringify({
  state: {
    accessToken: "e2e-placeholder-token",
    refreshToken: "e2e-placeholder-refresh",
    tenantSlug: "test1",
    role: "admin"
  },
  version: 0
});

export async function installFakeAdminSession(context: BrowserContext) {
  await context.addCookies([
    {
      name: "sd_auth",
      value: "1",
      domain: "127.0.0.1",
      path: "/"
    }
  ]);
  await context.addInitScript(
    ({ key, raw }: { key: string; raw: string }) => {
      localStorage.setItem(key, raw);
    },
    { key: AUTH_STORAGE_KEY, raw: FAKE_ADMIN_SESSION_RAW }
  );
}
