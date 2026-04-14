import { readFile } from "fs/promises";
import { importClientsFromXlsx } from "../src/modules/clients/clients.service";

async function main() {
  const xlsxPath = process.argv[2];
  const tenantIdRaw = process.argv[3] ?? "1";
  const tenantId = Number.parseInt(tenantIdRaw, 10);
  if (!xlsxPath) {
    throw new Error("Usage: tsx scripts/debug-clients-import.ts <xlsxPath> [tenantId]");
  }
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    throw new Error(`Invalid tenantId: ${tenantIdRaw}`);
  }

  const started = Date.now();
  const buf = await readFile(xlsxPath);
  const result = await importClientsFromXlsx(tenantId, buf);
  const elapsedMs = Date.now() - started;

  console.log(
    JSON.stringify(
      {
        tenantId,
        elapsedMs,
        created: result.created,
        updated: result.updated,
        errorsCount: result.errors.length,
        errorsPreview: result.errors.slice(0, 20)
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[debug-clients-import] failed:", err);
  process.exit(1);
});
