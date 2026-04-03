import * as XLSX from "xlsx";

/** Excel (.xlsx) fayl — TSV/CSV o‘rniga bir xil format barcha spravochnik jadvallarida */
export function downloadXlsxSheet(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const safeName = sheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet1";
  const aoa: (string | number | boolean)[][] = [
    headers,
    ...rows.map((line) =>
      line.map((cell) => {
        if (cell == null) return "";
        if (typeof cell === "boolean") return cell ? "1" : "0";
        return cell;
      })
    )
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName);
  const out = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}
