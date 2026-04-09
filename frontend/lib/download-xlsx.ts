export type DownloadXlsxOptions = {
  /** Ustun kengligi (belgilar taxmini, Excel `wch`) */
  colWidths?: number[];
};

function normalizeCell(cell: string | number | boolean | null | undefined): string | number | boolean {
  if (cell == null) return "";
  if (typeof cell === "boolean") return cell ? "1" : "0";
  if (typeof cell === "number") return cell;
  return String(cell).normalize("NFC");
}

/**
 * Excel (.xlsx) — OOXML ichida UTF-8; o‘zbek/kirill matnlari Excelda to‘g‘ri ochiladi.
 * Matnlar Unicode NFC normalizatsiyasidan o‘tadi.
 * `xlsx` paketi faqat chaqirilganda yuklanadi (bosh sahifa bundle kichrayadi).
 */
export function downloadXlsxSheet(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  options?: DownloadXlsxOptions
): void {
  const safeName = sheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet1";
  const aoa: (string | number | boolean)[][] = [
    headers.map((h) => normalizeCell(h) as string),
    ...rows.map((line) => line.map((cell) => normalizeCell(cell))),
  ];
  void (async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (options?.colWidths?.length) {
      ws["!cols"] = options.colWidths.map((wch) => ({ wch: Math.min(Math.max(wch, 6), 60) }));
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, safeName);
    const out = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, out, { bookType: "xlsx", compression: true });
  })();
}
