/**
 * Finans → «Способ оплаты» (`payment_method_entries`) bilan to‘lov formalarini bog‘lash.
 * DB dagi `payment_type` odatda kod (naqd, terminal, …) yoki kod bo‘lmasa nom.
 */

export type ProfilePaymentMethodEntry = {
  id: string;
  name: string;
  code: string | null;
  active?: boolean;
  sort_order?: number | null;
};

export function paymentMethodDbValue(e: ProfilePaymentMethodEntry): string {
  const c = e.code?.trim();
  if (c) return c.slice(0, 64);
  return e.name.trim().slice(0, 64);
}

export function activePaymentMethodEntries(
  refs: { payment_method_entries?: ProfilePaymentMethodEntry[] } | undefined
): ProfilePaymentMethodEntry[] {
  const raw = refs?.payment_method_entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.id === "string" && e.id.trim() && e.active !== false)
    .slice()
    .sort((a, b) => {
      const ao = a.sort_order ?? 1_000_000;
      const bo = b.sort_order ?? 1_000_000;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "uz");
    });
}

export type PaymentMethodSelectOption = { value: string; label: string };

const FALLBACK_OPTIONS: PaymentMethodSelectOption[] = [
  { value: "naqd", label: "Naqd" },
  { value: "plastik", label: "Plastik" },
  { value: "o‘tkazma", label: "O‘tkazma" },
  { value: "boshqa", label: "Boshqa" }
];

/**
 * Tanlov: label — katalogdagi nom, value — serverga yuboriladigan `payment_type`.
 */
export function paymentMethodSelectOptions(
  refs: { payment_method_entries?: ProfilePaymentMethodEntry[] } | undefined,
  /** Profil `payment_types` (kodlar ro‘yxati) — katalog bo‘lmasa */
  legacyTypeKeys?: string[] | null
): PaymentMethodSelectOption[] {
  const entries = activePaymentMethodEntries(refs);
  if (entries.length > 0) {
    return entries.map((e) => ({
      value: paymentMethodDbValue(e),
      label: e.name.trim()
    }));
  }
  const legacy = legacyTypeKeys?.map((t) => t.trim()).filter(Boolean) ?? [];
  if (legacy.length > 0) {
    const seen = new Set<string>();
    const out: PaymentMethodSelectOption[] = [];
    for (const s of legacy) {
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ value: s, label: s });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "uz"));
  }
  return [...FALLBACK_OPTIONS];
}

/** Joriy `payment_type` ro‘yxatda yo‘q bo‘lsa, bitta qator qo‘shiladi. */
export function paymentMethodSelectOptionsWithCurrent(
  refs: { payment_method_entries?: ProfilePaymentMethodEntry[] } | undefined,
  legacyTypeKeys: string[] | null | undefined,
  currentPaymentType: string | null | undefined
): PaymentMethodSelectOption[] {
  const base = paymentMethodSelectOptions(refs, legacyTypeKeys);
  const cur = currentPaymentType?.trim();
  if (!cur) return base;
  if (base.some((o) => o.value === cur)) return base;
  return [{ value: cur, label: cur }, ...base];
}

export function defaultPaymentTypeValue(opts: PaymentMethodSelectOption[]): string {
  return opts[0]?.value ?? "naqd";
}
