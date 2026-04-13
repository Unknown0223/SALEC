/** Finans spravochniklari: tenant.settings.references ichidagi valyuta, to‘lov, narx turi. */

export type CurrencyEntryDto = {
  id: string;
  name: string;
  code: string;
  sort_order: number | null;
  active: boolean;
  is_default: boolean;
};

export type PaymentMethodEntryDto = {
  id: string;
  name: string;
  code: string | null;
  currency_code: string;
  sort_order: number | null;
  comment: string | null;
  color: string | null;
  active: boolean;
};

export type PriceTypeEntryDto = {
  id: string;
  name: string;
  code: string | null;
  payment_method_id: string;
  kind: "sale" | "purchase";
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  manual: boolean;
  attached_clients_only: boolean;
};

const DEFAULT_CURRENCY_ENTRIES: CurrencyEntryDto[] = [
  {
    id: "default-uzs",
    name: "So'm",
    code: "UZS",
    sort_order: 1,
    active: true,
    is_default: true
  }
];

function simpleHash36(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function stringArrayFromUnknown(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

export function normalizeCurrencyCode(raw: string): string | null {
  const u = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (u.length >= 2 && u.length <= 20) return u;
  return null;
}

export function parseCurrencyEntry(item: unknown): CurrencyEntryDto | null {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const codeRaw = typeof row.code === "string" ? row.code.trim() : "";
  const code = normalizeCurrencyCode(codeRaw);
  if (!id || !name || !code) return null;
  const sort_order =
    typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
  const active = typeof row.active === "boolean" ? row.active : true;
  const is_default = typeof row.is_default === "boolean" ? row.is_default : false;
  return { id, name, code, sort_order, active, is_default };
}

export function currenciesFromUnknown(v: unknown): CurrencyEntryDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseCurrencyEntry).filter((x): x is CurrencyEntryDto => x != null);
}

function sortCurrencies(a: CurrencyEntryDto, b: CurrencyEntryDto): number {
  const ao = a.sort_order ?? 1_000_000;
  const bo = b.sort_order ?? 1_000_000;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name, "uz");
}

/** Bitta default valyuta; birinchi yozuv default bo‘lmasa — birinchisini default qilamiz. */
export function normalizeCurrencyDefaults(entries: CurrencyEntryDto[]): CurrencyEntryDto[] {
  if (entries.length === 0) return [];
  const activeOnes = entries.filter((e) => e.active !== false);
  const pool = activeOnes.length > 0 ? activeOnes : entries;
  let defIdx = pool.findIndex((e) => e.is_default);
  if (defIdx < 0) defIdx = 0;
  const defaultId = pool[defIdx]!.id;
  return [...entries]
    .map((e) => ({ ...e, is_default: e.id === defaultId }))
    .sort(sortCurrencies);
}

export function resolveCurrencyEntries(ref: Record<string, unknown>): CurrencyEntryDto[] {
  const parsed = currenciesFromUnknown(ref.currency_entries);
  if (parsed.length > 0) return normalizeCurrencyDefaults(parsed);
  return normalizeCurrencyDefaults(DEFAULT_CURRENCY_ENTRIES.map((e) => ({ ...e })));
}

export function defaultCurrencyCodeFromEntries(entries: CurrencyEntryDto[]): string {
  const d = entries.find((c) => c.is_default && c.active !== false);
  return d?.code ?? entries[0]?.code ?? "UZS";
}

function paymentMethodEntryIdFromUnknown(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export function parsePaymentMethodEntry(item: unknown): PaymentMethodEntryDto | null {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = paymentMethodEntryIdFromUnknown(row.id);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name) return null;
  const codeRaw = typeof row.code === "string" ? row.code.trim().toLowerCase() : "";
  const code = codeRaw && /^[a-z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 30) : null;
  const curRaw = typeof row.currency_code === "string" ? row.currency_code.trim() : "";
  const currency_code = normalizeCurrencyCode(curRaw) ?? "UZS";
  const sort_order =
    typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  const colorRaw = typeof row.color === "string" ? row.color.trim() : "";
  const color = colorRaw ? colorRaw.slice(0, 32) : null;
  const active = typeof row.active === "boolean" ? row.active : true;
  return {
    id,
    name,
    code,
    currency_code,
    sort_order,
    comment: comment || null,
    color,
    active
  };
}

export function paymentMethodsFromUnknown(v: unknown): PaymentMethodEntryDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parsePaymentMethodEntry).filter((x): x is PaymentMethodEntryDto => x != null);
}

/**
 * `client_payments.payment_type` va filtrlarda ishlatiladigan qiymat: kod bo‘lsa kod, aks holda nom.
 * Frontend «Способ оплаты» tanlovi shu qiymatni yuboradi.
 */
export function paymentMethodStorageKey(e: Pick<PaymentMethodEntryDto, "code" | "name">): string {
  const c = e.code?.trim();
  if (c) return c.slice(0, 64);
  return e.name.trim().slice(0, 64);
}

/** Faol usullar bo‘yicha saqlash kalitlari (takrorlarsiz, tartiblangan). */
export function paymentTypeStorageKeysFromMethodEntries(entries: PaymentMethodEntryDto[]): string[] {
  const keys = entries
    .filter((e) => e.active !== false)
    .map((e) => paymentMethodStorageKey(e))
    .filter((k) => k.length > 0);
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b, "uz"));
}

function sortPaymentMethods(a: PaymentMethodEntryDto, b: PaymentMethodEntryDto): number {
  const ao = a.sort_order ?? 1_000_000;
  const bo = b.sort_order ?? 1_000_000;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name, "uz");
}

export function legacyPaymentMethodsFromStrings(
  strings: string[],
  defaultCurrencyCode: string
): PaymentMethodEntryDto[] {
  return strings.map((s, i) => ({
    id: `legacy-pay-${i}-${simpleHash36(s)}`,
    name: s,
    code: null,
    currency_code: defaultCurrencyCode,
    sort_order: i + 1,
    comment: null,
    color: null,
    active: true
  }));
}

export function resolvePaymentMethodEntries(
  ref: Record<string, unknown>,
  currencyEntries: CurrencyEntryDto[]
): PaymentMethodEntryDto[] {
  const parsed = paymentMethodsFromUnknown(ref.payment_method_entries);
  if (parsed.length > 0) return [...parsed].sort(sortPaymentMethods);
  const legacy = stringArrayFromUnknown(ref.payment_types);
  const def = defaultCurrencyCodeFromEntries(currencyEntries);
  return legacyPaymentMethodsFromStrings(legacy, def).sort(sortPaymentMethods);
}

/** Bonus / buyurtma modullari uchun: faol to‘lov usullari nomlari. */
export function paymentTypesFromMethodEntries(entries: PaymentMethodEntryDto[]): string[] {
  const names = entries.filter((e) => e.active !== false).map((e) => e.name.trim()).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "uz"));
}

/**
 * `orders.payment_method_ref` — odatda `payment_method_entries[].id`; to‘lovlar — `payment_type` (kod yoki nom).
 * Vedoma / hisobotda ko‘rsatish uchun katalog bo‘yicha o‘qiladigan nom.
 */
export function resolvePaymentMethodRefToLabel(
  refRaw: string | null | undefined,
  entries: PaymentMethodEntryDto[]
): string | null {
  const ref = (refRaw ?? "").trim();
  if (!ref) return null;
  const active = entries.filter((e) => e.active !== false);
  const byIdActive = active.find((e) => e.id === ref);
  if (byIdActive) return byIdActive.name.trim();
  const byIdAny = entries.find((e) => e.id === ref);
  if (byIdAny) return byIdAny.name.trim();
  const byKeyActive = active.find((e) => paymentMethodStorageKey(e) === ref);
  if (byKeyActive) return byKeyActive.name.trim();
  const byKeyAny = entries.find((e) => paymentMethodStorageKey(e) === ref);
  if (byKeyAny) return byKeyAny.name.trim();
  return ref;
}

export function parsePriceTypeEntry(item: unknown): PriceTypeEntryDto | null {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const payment_method_id = typeof row.payment_method_id === "string" ? row.payment_method_id.trim() : "";
  if (!id || !name || !payment_method_id) return null;
  const codeRaw = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  const code =
    codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : codeRaw ? codeRaw.slice(0, 20) : null;
  const kindRaw = typeof row.kind === "string" ? row.kind.trim().toLowerCase() : "sale";
  const kind: "sale" | "purchase" = kindRaw === "purchase" ? "purchase" : "sale";
  const sort_order =
    typeof row.sort_order === "number" && Number.isInteger(row.sort_order) ? row.sort_order : null;
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  const active = typeof row.active === "boolean" ? row.active : true;
  const manual = typeof row.manual === "boolean" ? row.manual : false;
  const attached_clients_only =
    typeof row.attached_clients_only === "boolean" ? row.attached_clients_only : false;
  return {
    id,
    name,
    code,
    payment_method_id,
    kind,
    sort_order,
    comment: comment || null,
    active,
    manual,
    attached_clients_only
  };
}

export function priceTypeEntriesFromUnknown(v: unknown): PriceTypeEntryDto[] {
  if (!Array.isArray(v)) return [];
  return v.map(parsePriceTypeEntry).filter((x): x is PriceTypeEntryDto => x != null);
}

/** product_prices.price_type bilan mos kalit: kod bo‘lsa kod, aks holda nom. */
export function priceTypeKey(e: Pick<PriceTypeEntryDto, "name" | "code">): string {
  const c = e.code?.trim();
  if (c) return c;
  return e.name.trim();
}

export function uniqueSortedPriceTypeKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "uz")
  );
}
