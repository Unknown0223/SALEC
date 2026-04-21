/**
 * Foydalanuvchi Downloads dagi agent / eksport / SVR Excel — sarlavha mosligi, majburiy ustunlar,
 * ma’lumot qatorlari soni, fayl ichidagi takrorlanuvchi kodlar, SVR «Агент» ustuni tokenlari.
 *
 *   cd backend && npx tsx scripts/analyze-user-staff-xlsx.ts
 *   npm run analyze:staff-xlsx
 *
 * Boshqa yo‘llar: argv orqali 3 ta mutlaq yo‘l (agent, eksport, supervayzer).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  debugStaffImportHeaderMap,
  splitSupervisorAgentsCell,
  type StaffImportXlsxKind
} from "./lib/active-agents-xlsx-import";

function defaultDownloadsTriple(): [string, string, string] {
  const dl = path.join(os.homedir(), "Downloads");
  return [
    path.join(dl, "Активные агенты (3).xlsx"),
    path.join(dl, "Активные Активные экспедиторы (3).xlsx"),
    path.join(dl, "Супервайзеры (2).xlsx")
  ];
}

type Job = { abs: string; kind: StaffImportXlsxKind; label: string; requiredFields: string[] };

function readSheet0(abs: string): { sheetName: string; matrix: unknown[][] } {
  const wb = XLSX.readFile(abs, { cellDates: true, raw: true });
  const sheetName = wb.SheetNames[0] || "Sheet1";
  const sheet = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return { sheetName, matrix };
}

function cell(row: unknown[], i: number): string {
  if (i < 0 || i >= row.length) return "";
  const v = row[i];
  if (v == null) return "";
  return String(v).trim();
}

function isRowEmpty(row: unknown[]): boolean {
  return !row || row.every((c) => c === "" || c == null);
}

function normCodeKey(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").trim();
}

function main() {
  const argv = process.argv.slice(2).filter(Boolean);
  const triple =
    argv.length >= 3 ? ([argv[0]!, argv[1]!, argv[2]!] as [string, string, string]) : defaultDownloadsTriple();

  const jobs: Job[] = [
    { abs: triple[0], kind: "agent", label: "Agentlar", requiredFields: ["fio", "code"] },
    { abs: triple[1], kind: "expeditor", label: "Eksportlar", requiredFields: ["fio", "code"] },
    { abs: triple[2], kind: "supervisor", label: "Supervayzerlar", requiredFields: ["fio"] }
  ];

  let anyFatal = false;

  for (const j of jobs) {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log(`${j.label}  |  kind=${j.kind}`);
    console.log(`Fayl: ${j.abs}`);
    if (!fs.existsSync(j.abs)) {
      console.log("❌ Fayl topilmadi.");
      continue;
    }
    const { sheetName, matrix } = readSheet0(j.abs);
    console.log(`List: ${sheetName}  |  qatorlar: ${matrix.length}`);
    const headerRow = (matrix[0] as unknown[]) || [];
    const { fieldToColumnIndex: m, normalizedCells } = debugStaffImportHeaderMap(headerRow, j.kind);

    console.log("\n--- Normalizatsiyalangan sarlavhalar (indeks: matn) ---");
    normalizedCells.forEach((h, i) => {
      if (h) console.log(`  [${i}] ${JSON.stringify(h)}`);
    });

    console.log("\n--- Import maydon → ustun indeksi ---");
    for (const [k, idx] of Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${k} → ${idx}`);
    }

    const missing = j.requiredFields.filter((f) => m[f] === undefined);
    if (missing.length) {
      console.log(`\n❌ Majburiy maydon yo‘q: ${missing.join(", ")} — import xato yoki to‘xtaydi.`);
      anyFatal = true;
    } else {
      console.log("\n✓ Majburiy ustunlar topildi.");
    }

    if (j.kind === "supervisor" && m.agentsCol === undefined) {
      console.log(
        "\n⚠ SVR «agentlar» ustuni (agentsCol) aniqlanmadi — supervisor_user_id bog‘lanmaydi. Sarlavha aliaslarini kengaytiring."
      );
    }

    let dataRows = 0;
    const codeDup = new Map<string, number[]>();
    if (m.code !== undefined && !missing.includes("code")) {
      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r] as unknown[];
        if (isRowEmpty(row)) continue;
        dataRows++;
        const ck = normCodeKey(cell(row, m.code));
        if (!ck) continue;
        const prev = codeDup.get(ck) ?? [];
        prev.push(r + 1);
        codeDup.set(ck, prev);
      }
    } else {
      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r] as unknown[];
        if (!isRowEmpty(row)) dataRows++;
      }
    }

    console.log(`\n--- Ma’lumot qatorlari (birinchi qator sarlavha emas) ---`);
    console.log(`  Bo‘sh bo‘lmagan qatorlar: ${dataRows} (jami qatorlar jadvalda: ${Math.max(0, matrix.length - 1)})`);

    if (m.code !== undefined && codeDup.size > 0) {
      const dups = [...codeDup.entries()].filter(([, lines]) => lines.length > 1);
      if (dups.length > 0) {
        console.log(`\n⚠ Bir xil «Код» takrorlari (importda oxirgi yozuv ustunlik qiladi):`);
        for (const [k, lines] of dups.slice(0, 15)) {
          console.log(`  ${k} → qatorlar: ${lines.join(", ")}`);
        }
        if (dups.length > 15) console.log(`  … va yana ${dups.length - 15} ta takrorlanuvchi kod.`);
      } else {
        console.log("\n✓ Fayl ichida takrorlanuvchi kod yo‘q.");
      }
    }

    console.log("\n--- 1–3-data qatori (qisqa) ---");
    for (let r = 1; r < Math.min(4, matrix.length); r++) {
      const row = matrix[r] as unknown[];
      if (!row || row.every((c) => c === "" || c == null)) {
        console.log(`  (qator ${r + 1} bo‘sh)`);
        continue;
      }
      const parts: string[] = [];
      if (m.code !== undefined) parts.push(`code=${cell(row, m.code).slice(0, 24)}`);
      if (m.fio !== undefined) parts.push(`fio=${cell(row, m.fio).slice(0, 60)}`);
      if (m.agentsCol !== undefined) {
        const ac = cell(row, m.agentsCol);
        const tok = splitSupervisorAgentsCell(ac);
        parts.push(`agents(${tok.length} tok)=${ac.slice(0, 80)}`);
      }
      if (j.kind === "supervisor") {
        if (m.login !== undefined) parts.push(`login=${cell(row, m.login).slice(0, 32)}`);
      }
      console.log(`  qator ${r + 1}: ${parts.join(" | ") || "(maydon indekslari bo‘sh)"}`);
    }
  }
  console.log("\n");
  if (anyFatal) {
    console.error("Yuqoridagi ❌ bo‘lsa, importdan oldin Excel sarlavha/ustunlarini tuzating.\n");
    process.exit(1);
  }
}

main();
