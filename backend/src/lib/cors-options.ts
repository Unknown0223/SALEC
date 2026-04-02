import type { FastifyCorsOptions } from "@fastify/cors";
import { env } from "../config/env";

/**
 * Development/test: barcha originlar.
 * Production: `CORS_ALLOWED_ORIGINS` (vergul bilan) — startupda tekshiriladi ([env.ts](../config/env.ts)).
 */
export function buildCorsOrigin(): FastifyCorsOptions["origin"] {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) {
    return true;
  }
  const allowed = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowed.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS: origin not allowed: ${origin}`), false);
  };
}
