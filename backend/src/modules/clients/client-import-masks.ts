/**
 * Klient Excel import: dublikat kalitlari va yangilashda qaysi maydonlar qo‘llanishi.
 */
import type { Prisma } from "@prisma/client";

/** Yangi klient importida dublikat uchun ruxsat etilgan maydonlar (import kalitlari). */
export const ALLOWED_DUPLICATE_KEY_FIELDS = [
  "client_code",
  "client_pinfl",
  "inn",
  "phone",
  "name",
  "city",
  "city_code"
] as const;

export type AllowedDuplicateKeyField = (typeof ALLOWED_DUPLICATE_KEY_FIELDS)[number];

/** Telefon/INN/PINFL majburiy emas — default: kod + shahar (filial farqi). */
export const DEFAULT_DUPLICATE_KEY_FIELDS: AllowedDuplicateKeyField[] = ["client_code", "city"];

const DUP_SET = new Set<string>(ALLOWED_DUPLICATE_KEY_FIELDS);

/** Yangilashda Exceldan qo‘llanadigan maydonlar (xarita kalitlari). `client_db_id` emas. */
export function buildAllowedUpdateApplyFieldList(agentSlotCount: number): string[] {
  const base = [
    "name",
    "legal_name",
    "phone",
    "address",
    "client_code",
    "client_pinfl",
    "category_name",
    "category_code",
    "category",
    "client_type_name",
    "client_type_code",
    "credit_limit",
    "is_active",
    "responsible_person",
    "landmark",
    "inn",
    "pdl",
    "logistics_service",
    "license_until",
    "working_hours",
    "region",
    "district",
    "city",
    "city_code",
    "neighborhood",
    "zone",
    "street",
    "house_number",
    "apartment",
    "gps_text",
    "latitude",
    "longitude",
    "notes",
    "client_format_name",
    "client_format_code",
    "client_format",
    "sales_channel_name",
    "sales_channel_code",
    "sales_channel",
    "product_category_ref",
    "contact1_firstName",
    "contact1_lastName",
    "contact1_phone",
    "contact2_firstName",
    "contact2_lastName",
    "contact2_phone"
  ];
  for (let s = 1; s <= agentSlotCount; s++) {
    base.push(`import_agent_${s}`, `import_agent_${s}_days`, `import_expeditor_${s}`);
  }
  return base;
}

const ALLOWED_UPDATE_APPLY_SET = new Set(buildAllowedUpdateApplyFieldList(10));

export function normalizeDuplicateKeyFields(raw: string[] | undefined | null): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const k = String(x ?? "").trim();
    if (!k || !DUP_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  if (out.length === 0) return [...DEFAULT_DUPLICATE_KEY_FIELDS];
  return out;
}

/** `null` = barcha xaritalangan maydonlar (oldingi xatti-harakat). */
export function normalizeUpdateApplyFields(raw: string[] | undefined | null): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const k = String(x ?? "").trim();
    if (!k || !ALLOWED_UPDATE_APPLY_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.length === 0 ? null : out;
}

export function filterClientUpdateInputByApplyFields(
  data: Prisma.ClientUpdateInput,
  apply: Set<string>
): Prisma.ClientUpdateInput {
  const next: Prisma.ClientUpdateInput = {};

  const take = (key: keyof Prisma.ClientUpdateInput, ...requiredKeys: string[]) => {
    if (!requiredKeys.some((k) => apply.has(k))) return;
    const v = data[key];
    if (v !== undefined) (next as Record<string, unknown>)[key as string] = v;
  };

  take("name", "name");
  take("legal_name", "legal_name");
  if (apply.has("phone")) {
    if (data.phone !== undefined) next.phone = data.phone;
    if (data.phone_normalized !== undefined) next.phone_normalized = data.phone_normalized;
  }
  take("address", "address");
  take("client_code", "client_code");
  take("client_pinfl", "client_pinfl");
  take("category", "category_name", "category_code", "category");
  take("client_type_code", "client_type_name", "client_type_code");
  take("credit_limit", "credit_limit");
  take("is_active", "is_active");
  take("responsible_person", "responsible_person");
  take("landmark", "landmark");
  take("inn", "inn");
  take("pdl", "pdl");
  take("logistics_service", "logistics_service");
  take("license_until", "license_until");
  take("working_hours", "working_hours");
  take("region", "region");
  take("district", "district");
  take("city", "city", "city_code");
  take("neighborhood", "neighborhood");
  take("zone", "zone");
  take("street", "street");
  take("house_number", "house_number");
  take("apartment", "apartment");
  take("gps_text", "gps_text");
  take("latitude", "latitude");
  take("longitude", "longitude");
  take("notes", "notes");
  take("client_format", "client_format_name", "client_format_code", "client_format");
  take("sales_channel", "sales_channel_name", "sales_channel_code", "sales_channel");
  take("product_category_ref", "product_category_ref");

  const contactKeys = [
    "contact1_firstName",
    "contact1_lastName",
    "contact1_phone",
    "contact2_firstName",
    "contact2_lastName",
    "contact2_phone"
  ];
  if (contactKeys.some((k) => apply.has(k)) && data.contact_persons !== undefined) {
    next.contact_persons = data.contact_persons;
  }

  return next;
}

/** Dublikat kaliti uchun qiymatlar (allaqachon trim/normalize qilingan). */
export type DuplicateKeyParts = {
  client_code: string | null;
  client_pinfl: string | null;
  inn: string | null;
  nameLower: string | null;
  phoneDigits: string | null;
  cityNorm: string | null;
};

/**
 * Tanlangan maydonlar bo‘yicha bitta qator kaliti. Bo‘sh segmentlar tashlanadi;
 * hech bo‘lmaganda bitta segment bo‘lmasa `null` — dublikat tekshiruvi o‘tkazilmaydi.
 */
export function buildDuplicateCompositeKey(fields: string[], parts: DuplicateKeyParts): string | null {
  const want = new Set(fields);
  const segments: string[] = [];

  const push = (tag: string, v: string | null | undefined) => {
    const t = (v ?? "").trim();
    if (!t) return;
    segments.push(`${tag}:${t}`);
  };

  if (want.has("client_code")) push("cc", parts.client_code);
  if (want.has("client_pinfl")) push("pinfl", parts.client_pinfl);
  if (want.has("inn")) push("inn", parts.inn);
  if (want.has("name")) push("nm", parts.nameLower);
  if (want.has("phone")) {
    const ph = parts.phoneDigits?.replace(/\D/g, "") ?? "";
    if (ph.length >= 7) push("ph", ph);
  }
  if (want.has("city") || want.has("city_code")) {
    push("city", parts.cityNorm);
  }

  if (segments.length === 0) return null;
  return segments.join("|");
}

export function duplicateKeyFromExistingRow(
  c: {
    name: string;
    phone_normalized: string | null;
    client_code: string | null;
    client_pinfl: string | null;
    inn: string | null;
    city: string | null;
  },
  fields: string[]
): string | null {
  return buildDuplicateCompositeKey(fields, {
    client_code: c.client_code?.trim() || null,
    client_pinfl: c.client_pinfl?.trim() || null,
    inn: c.inn?.trim() || null,
    nameLower: c.name?.trim() ? c.name.trim().toLocaleLowerCase("ru-RU") : null,
    phoneDigits: c.phone_normalized?.replace(/\D/g, "") || null,
    cityNorm: c.city?.trim() ? c.city.trim().toLocaleLowerCase("ru-RU") : null
  });
}
