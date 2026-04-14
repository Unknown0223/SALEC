/**
 * Windows: `prisma generate` ba'zan query_engine DLL ni rename qilishda EPERM beradi
 * (Defender, boshqa Node jarayoni). Qayta urinish va vaqtincha artefaktlarni tozalash.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const clientDir = path.join(backendRoot, "node_modules", ".prisma", "client");

function sleepSeconds(sec) {
  if (process.platform === "win32") {
    spawnSync("powershell", ["-NoProfile", "-Command", `Start-Sleep -Seconds ${sec}`], {
      stdio: "ignore"
    });
  } else {
    spawnSync("sleep", [String(sec)], { stdio: "ignore" });
  }
}

function tryCleanupArtifacts() {
  if (!fs.existsSync(clientDir)) return;
  let names;
  try {
    names = fs.readdirSync(clientDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.includes("query_engine")) continue;
    if (name.includes(".tmp") || name.endsWith(".tmp")) {
      try {
        fs.unlinkSync(path.join(clientDir, name));
      } catch {
        /* locked */
      }
    }
  }
  const engine = path.join(clientDir, "query_engine-windows.dll.node");
  try {
    if (fs.existsSync(engine)) fs.unlinkSync(engine);
  } catch {
    /* locked */
  }
}

const attempts = Math.max(1, Number.parseInt(process.env.PRISMA_GENERATE_RETRIES || "12", 10));
const gapSec = Math.max(1, Number.parseInt(process.env.PRISMA_GENERATE_RETRY_SEC || "3", 10));

for (let i = 1; i <= attempts; i++) {
  tryCleanupArtifacts();
  const r = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    cwd: backendRoot,
    shell: true,
    env: { ...process.env }
  });
  if (r.status === 0) {
    process.exit(0);
  }
  console.error(`[prisma-generate-retry] ${i}/${attempts} muvaffaqiyatsiz, ${gapSec}s kutamiz...`);
  if (i < attempts) sleepSeconds(gapSec);
}

console.error("[prisma-generate-retry] Barcha urinishlar tugadi.");
process.exit(1);
