const LOCALE = "ru-RU";

/**
 * Minglik guruhlab (masalan 1 234 567,00) — `fractionDigits` kasr xonasi soni.
 */
export function formatGroupedDecimal(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return "—";
  const fd = Math.max(0, Math.min(20, Math.floor(fractionDigits)));
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd
  });
}

/** Butun son, minglik ajratuvchi */
export function formatGroupedInteger(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** `formatGroupedInteger` bilan bir xil (qisqa nom) */
export const formatIntGrouped = formatGroupedInteger;

/**
 * API string/number uchun minglik guruhlash (masalan miqdor/summa qatorlari).
 */
export function formatNumberGrouped(
  value: string | number | null | undefined,
  opts?: { minFractionDigits?: number; maxFractionDigits?: number }
): string {
  if (value == null || value === "") return "—";
  const s = typeof value === "number" ? String(value) : String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return typeof value === "string" ? value : "—";
  const min = opts?.minFractionDigits ?? 0;
  const max = opts?.maxFractionDigits ?? 20;
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: min,
    maximumFractionDigits: max
  });
}

/**
 * Telefon / ПИНФЛ: faqat raqamlarni ajratib, uzun bo‘lsa minglik guruhlaydi.
 * Qisqa yoki aralash matnni o‘zgartirmaydi.
 */
export function formatDigitsGroupedLoose(raw: string | null | undefined): string {
  if (raw == null) return "";
  const t = raw.trim();
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (digits.length < 6) return t;
  return formatNumberGrouped(digits, { maxFractionDigits: 0 });
}
