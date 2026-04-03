import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

const MAX_UI_PREFS_JSON_CHARS = 120_000;

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

function asTableRecord(v: unknown): Record<string, unknown> {
  return asRecord(v);
}

/**
 * `tables[tableId]` obyektlarini birlashtiradi (shallow + tables ichida har bir jadval uchun shallow).
 */
export function mergeUiPreferences(current: unknown, patch: unknown): Record<string, unknown> {
  const c = asRecord(current);
  const p = asRecord(patch);
  const next: Record<string, unknown> = { ...c };

  for (const [key, val] of Object.entries(p)) {
    if (key === "tables" && val != null && typeof val === "object" && !Array.isArray(val)) {
      const curTables = asRecord(c.tables);
      const patchTables = val as Record<string, unknown>;
      const mergedTables: Record<string, unknown> = { ...curTables };
      for (const [tid, tval] of Object.entries(patchTables)) {
        if (tval != null && typeof tval === "object" && !Array.isArray(tval)) {
          mergedTables[tid] = { ...asTableRecord(curTables[tid]), ...(tval as Record<string, unknown>) };
        } else {
          mergedTables[tid] = tval as unknown;
        }
      }
      next.tables = mergedTables;
    } else {
      next[key] = val;
    }
  }
  return next;
}

export async function getUserUiPreferences(tenantId: number, userId: number): Promise<unknown> {
  const row = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId },
    select: { ui_preferences: true }
  });
  if (!row) throw new Error("NOT_FOUND");
  return row.ui_preferences ?? {};
}

export async function patchUserUiPreferences(
  tenantId: number,
  userId: number,
  patch: unknown
): Promise<unknown> {
  const row = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId },
    select: { ui_preferences: true }
  });
  if (!row) throw new Error("NOT_FOUND");

  const merged = mergeUiPreferences(row.ui_preferences, patch);
  const json = JSON.stringify(merged);
  if (json.length > MAX_UI_PREFS_JSON_CHARS) {
    throw new Error("UI_PREFS_TOO_LARGE");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { ui_preferences: merged as Prisma.InputJsonValue }
  });

  return merged;
}
