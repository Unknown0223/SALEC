import { isAxiosError } from "axios";

/** Axios javobi yoki `apiFetch` ning `throw new Error(detail)` dagi kod. */
export function getApiErrorCode(err: unknown): string | undefined {
  if (isAxiosError(err)) {
    const d = err.response?.data;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const e = (d as { error?: unknown }).error;
      if (typeof e === "string") return e;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return undefined;
}

/** Backend `503` + `DatabaseSchemaMismatch` (Prisma P2021/P2022 — migratsiya kerak). */
export function isDatabaseSchemaMismatchError(err: unknown): boolean {
  if (isAxiosError(err)) {
    const d = err.response?.data as { error?: string } | undefined;
    if (d?.error === "DatabaseSchemaMismatch") return true;
  }
  return err instanceof Error && err.message === "DatabaseSchemaMismatch";
}
