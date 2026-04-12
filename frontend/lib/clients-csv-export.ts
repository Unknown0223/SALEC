import type { ClientRow } from "@/lib/client-types";

function cell(v: string): string {
  const t = v.replace(/\r?\n/g, " ").replace(/"/g, '""');
  if (/[";\n]/.test(t)) return `"${t}"`;
  return t;
}

const COLS: { h: string; v: (r: ClientRow) => string }[] = [
  { h: "ID", v: (r) => String(r.id) },
  { h: "Название", v: (r) => r.name ?? "" },
  { h: "Фирма", v: (r) => r.legal_name ?? "" },
  { h: "Телефон", v: (r) => r.phone ?? "" },
  { h: "ИНН", v: (r) => r.inn ?? "" },
  { h: "Область", v: (r) => r.region ?? "" },
  { h: "Район", v: (r) => r.district ?? "" },
  { h: "Зона", v: (r) => r.zone ?? "" },
  { h: "Категория", v: (r) => r.category ?? "" },
  { h: "Тип", v: (r) => r.client_type_code ?? "" },
  { h: "Формат", v: (r) => r.client_format ?? "" },
  { h: "Канал продаж", v: (r) => r.sales_channel ?? "" },
  { h: "Активный", v: (r) => (r.is_active ? "да" : "нет") },
  { h: "Создан", v: (r) => (r.created_at ? r.created_at.slice(0, 10) : "") }
];

/** Строки текущей страницы — разделитель `;` для Excel, UTF-8 BOM. */
export function downloadClientsCsvPage(rows: ClientRow[], filename = "clients_page.csv"): void {
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
