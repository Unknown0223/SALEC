/**
 * Client import faylini DBsiz parse qilib vaqt o‘lchaydi (xavfsiz smoke test).
 * Usage: npx tsx scripts/benchmark-client-xlsx-parse.ts "<path.xlsx>"
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/benchmark-client-xlsx-parse.ts "<path.xlsx>"');
  process.exit(1);
}

const raw = readFileSync(file);
const readStarted = Date.now();
const wb = XLSX.read(raw, {
  type: "buffer",
  cellDates: true,
  dense: false,
  bookVBA: false,
  cellFormula: false,
  cellHTML: false,
  cellText: false
});
const readMs = Date.now() - readStarted;

let matrixRows = 0;
const matrixStarted = Date.now();
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  if (!ws) continue;
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true
  }) as unknown[][];
  matrixRows += rows.length;
}
const matrixMs = Date.now() - matrixStarted;

console.log(
  JSON.stringify(
    {
      file,
      bytes: raw.length,
      sheets: wb.SheetNames.length,
      sheetNames: wb.SheetNames,
      readMs,
      matrixMs,
      matrixRowArrays: matrixRows,
      totalMs: readMs + matrixMs
    },
    null,
    2
  )
);
