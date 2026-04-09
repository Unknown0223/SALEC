/**
 * Excel import: sarlavha qatoridan ustun indeksini topish (RU/EN sinonimlar).
 * ExcelJS asosiy; ba’zi fayllar (buzilgan ZIP, eksport xatosi) uchun SheetJS (xlsx) fallback.
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

export function normHeader(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

/** Bir nechta sinonimdan birinchi mos kelgan ustun indeksi (1-based Excel) yoki -1 */
export function colIndex(headers: string[], aliases: string[]): number {
  const h = headers.map(normHeader);
  for (const a of aliases) {
    const n = normHeader(a);
    const i = h.findIndex((x) => x === n || x.includes(n) || n.includes(x));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * ExcelJS Worksheet yoki SheetJS dan olingan matrix — import skriptlari ikkalasini ham `getRow` / `rowCount` orqali ishlatadi.
 */
export type ImportWorksheet = ExcelJS.Worksheet | MatrixSheetImpl;

/** SheetJS `sheet_to_json` natijasi; Excel qatorlari bilan mos */
export class MatrixSheetImpl {
  readonly rowCount: number;
  private readonly rows: unknown[][];

  constructor(aoa: unknown[][]) {
    let maxCol = 0;
    for (const row of aoa) {
      if (Array.isArray(row)) maxCol = Math.max(maxCol, row.length);
    }
    this.rows = aoa.map((row) => {
      const r = Array.isArray(row) ? [...row] : [];
      while (r.length < maxCol) r.push(null);
      return r;
    });
    this.rowCount = this.rows.length;
  }

  getRow(r: number) {
    const line = this.rows[r - 1] ?? [];
    const cellCount = Math.max(line.length, 1);
    return {
      cellCount,
      getCell: (c: number) => ({ value: line[c - 1] ?? null })
    };
  }
}

function loadFirstSheetViaSheetJS(filePath: string): MatrixSheetImpl {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("Varaq yo‘q");
  const sh = wb.Sheets[name];
  if (!sh) throw new Error("Varaq yo‘q");
  const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: false }) as unknown[][];
  if (!aoa.length) throw new Error("Bo‘sh jadval");
  return new MatrixSheetImpl(aoa);
}

export async function loadFirstSheet(path: string): Promise<ImportWorksheet> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error(`Excel: varaq yo‘q — ${path}`);
    return ws;
  } catch (e1) {
    const m1 = e1 instanceof Error ? e1.message : String(e1);
    try {
      console.warn(
        `ExcelJS o‘qimadi — SheetJS (xlsx) bilan qayta urinilmoqda: ${path}\n  (${m1.slice(0, 160)}${m1.length > 160 ? "…" : ""})`
      );
      return loadFirstSheetViaSheetJS(path);
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(
        `Excel o‘qilmadi: ${path}\n` +
          `  ExcelJS: ${m1}\n` +
          `  xlsx: ${m2}\n` +
          `Ko‘pincha sabab: fayl to‘liq emas, .xlsx emas yoki buzilgan. Excel’da ochib «Сохранить как» → .xlsx qiling.`
      );
    }
  }
}

/** 1-qatorni matn massiviga (0-based) */
export function sheetHeaderRow(ws: ImportWorksheet): string[] {
  const row = ws.getRow(1);
  const max = row.cellCount || 50;
  const out: string[] = [];
  for (let c = 1; c <= max; c++) {
    const v = row.getCell(c).value;
    if (v == null) {
      out.push("");
      continue;
    }
    if (typeof v === "object" && v !== null && "text" in v && typeof (v as { text: string }).text === "string") {
      out.push((v as { text: string }).text);
      continue;
    }
    if (typeof v === "object" && v !== null && "richText" in v) {
      const rt = (v as { richText?: { text: string }[] }).richText;
      out.push(rt?.map((t) => t.text).join("") ?? "");
      continue;
    }
    if (v instanceof Date) {
      out.push(v.toISOString());
      continue;
    }
    out.push(String(v));
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

export function cellStr(ws: ImportWorksheet, row: number, col0: number): string {
  if (col0 < 0) return "";
  const v = ws.getRow(row).getCell(col0 + 1).value;
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: string }).text ?? "");
  if (typeof v === "object" && v !== null && "richText" in v) {
    const rt = (v as { richText?: { text: string }[] }).richText;
    return rt?.map((t) => t.text).join("") ?? "";
  }
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function cellNum(ws: ImportWorksheet, row: number, col0: number): number | null {
  const s = cellStr(ws, row, col0).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
