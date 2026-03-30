/**
 * Mahsulot birligi — katalogda tanlanadigan standart qiymatlar (DB `products.unit` string).
 * "Boshqa" tanlansa bepul matn kiritiladi (maxsus birliklar uchun).
 */
export const PRODUCT_UNIT_CUSTOM = "__custom__";

export const PRODUCT_UNIT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "dona", label: "dona" },
  { value: "quti", label: "quti" },
  { value: "blok", label: "blok" },
  { value: "paket", label: "paket" },
  { value: "karobka", label: "karobka" },
  { value: "pachka", label: "pachka" },
  { value: "rulon", label: "rulon" },
  { value: "komplekt", label: "komplekt" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "tonna", label: "tonna" },
  { value: "litr", label: "litr" },
  { value: "ml", label: "ml" },
  { value: "m", label: "m" },
  { value: "m2", label: "m²" },
  { value: "m3", label: "m³" },
  { value: "qadoq", label: "qadoq" },
  { value: "bo‘lak", label: "bo‘lak" },
  { value: PRODUCT_UNIT_CUSTOM, label: "Boshqa (o‘zi yozish)…" }
];

const STANDARD_VALUES = new Set(
  PRODUCT_UNIT_OPTIONS.filter((o) => o.value !== PRODUCT_UNIT_CUSTOM).map((o) => o.value)
);

export function isStandardProductUnit(unit: string): boolean {
  return STANDARD_VALUES.has(unit.trim());
}

export function splitUnitForForm(stored: string): { select: string; custom: string } {
  const u = stored.trim();
  if (!u) return { select: "dona", custom: "" };
  if (isStandardProductUnit(u)) return { select: u, custom: "" };
  return { select: PRODUCT_UNIT_CUSTOM, custom: u };
}

export function resolveUnitFromForm(select: string, custom: string): string {
  if (select === PRODUCT_UNIT_CUSTOM) return custom.trim() || "dona";
  return select;
}
