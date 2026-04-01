import type { ClientRow } from "@/lib/client-types";

function cell(v: string): string {
  const t = v.replace(/\r?\n/g, " ").replace(/"/g, '""');
  if (/[";\n]/.test(t)) return `"${t}"`;
  return t;
}

const COLS: { h: string; v: (r: ClientRow) => string }[] = [
  { h: "ID", v: (r) => String(r.id) },
  { h: "Nomi", v: (r) => r.name ?? "" },
  { h: "Firma", v: (r) => r.legal_name ?? "" },
  { h: "Telefon", v: (r) => r.phone ?? "" },
  { h: "INN", v: (r) => r.inn ?? "" },
  { h: "Viloyat", v: (r) => r.region ?? "" },
  { h: "Tuman", v: (r) => r.district ?? "" },
  { h: "Zona", v: (r) => r.zone ?? "" },
  { h: "Toifa", v: (r) => r.category ?? "" },
  { h: "Tur", v: (r) => r.client_type_code ?? "" },
  { h: "Format", v: (r) => r.client_format ?? "" },
  { h: "Savdo kanali", v: (r) => r.sales_channel ?? "" },
  { h: "Faol", v: (r) => (r.is_active ? "ha" : "yo‘q") },
  { h: "Yaratilgan", v: (r) => (r.created_at ? r.created_at.slice(0, 10) : "") }
];

/** Joriy sahifa qatorlari — Excel uchun `;` ajratuvchi, UTF-8 BOM. */
export function downloadClientsCsvPage(rows: ClientRow[], filename = "mijozlar_sahifa.csv"): void {
  if (rows.length === 0) return;
  const sep = ";";
  const head = COLS.map((c) => cell(c.h)).join(sep);
  const lines = rows.map((r) => COLS.map((c) => cell(c.v(r))).join(sep));
  const text = `\ufeff${head}\n${lines.join("\n")}`;
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
