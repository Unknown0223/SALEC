import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const AuditEntityType = {
  client: "client",
  user: "user",
  product: "product",
  product_category: "product_category",
  warehouse: "warehouse",
  tenant_settings: "tenant_settings",
  product_price: "product_price",
  stock: "stock",
  bonus_rule: "bonus_rule",
  order: "order",
  goods_receipt: "goods_receipt",
  supplier: "supplier",
  finance: "finance"
} as const;

export type AuditEntityTypeValue = (typeof AuditEntityType)[keyof typeof AuditEntityType];

const SENSITIVE_KEY_SUBSTRINGS = ["password", "token", "secret", "refresh"];
const PII_KEY_SUBSTRINGS = ["pinfl", "phone", "inn", "passport"];

const MAX_PAYLOAD_JSON_CHARS = 12_000;

function maskString(s: string): string {
  const t = s.trim();
  if (t.length <= 4) return "****";
  return `****${t.slice(-4)}`;
}

/**
 * Audit log uchun JSON: parol/token kalitlari olib tashlanadi, PII qisqartiriladi.
 */
export function sanitizePayloadForAudit(value: unknown): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(o)) {
        const low = k.toLowerCase();
        if (SENSITIVE_KEY_SUBSTRINGS.some((s) => low.includes(s))) {
          if (low.includes("password") || low === "password_hash") {
            out[k] = "[redacted]";
          } else {
            continue;
          }
          continue;
        }
        if (PII_KEY_SUBSTRINGS.some((s) => low.includes(s)) && typeof val === "string") {
          out[k] = maskString(val);
          continue;
        }
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };

  const raw = walk(value);
  const obj =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : { value: raw };

  let json = JSON.stringify(obj);
  if (json.length > MAX_PAYLOAD_JSON_CHARS) {
    json = json.slice(0, MAX_PAYLOAD_JSON_CHARS) + `…[truncated,len=${json.length}]`;
    return { _truncated: true, preview: json } as Record<string, unknown>;
  }
  return obj;
}

export type AppendTenantAuditInput = {
  tenantId: number;
  actorUserId: number | null | undefined;
  entityType: AuditEntityTypeValue | string;
  entityId: string | number;
  action: string;
  payload?: Record<string, unknown> | unknown;
};

export async function appendTenantAuditEvent(input: AppendTenantAuditInput): Promise<void> {
  const uid =
    input.actorUserId != null &&
    Number.isFinite(input.actorUserId) &&
    input.actorUserId > 0
      ? Math.floor(Number(input.actorUserId))
      : null;
  const eid = String(input.entityId).slice(0, 64);
  const safePayload =
    input.payload === undefined
      ? {}
      : sanitizePayloadForAudit(
          typeof input.payload === "object" && input.payload !== null && !Array.isArray(input.payload)
            ? input.payload
            : { data: input.payload }
        );

  await prisma.tenantAuditEvent.create({
    data: {
      tenant_id: input.tenantId,
      actor_user_id: uid,
      entity_type: String(input.entityType).slice(0, 64),
      entity_id: eid,
      action: String(input.action).slice(0, 128),
      payload: safePayload as Prisma.InputJsonValue
    }
  });
}
