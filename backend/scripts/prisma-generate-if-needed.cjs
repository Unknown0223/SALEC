/**
 * Agar Prisma client va query engine allaqachon bo‘lsa, `generate`ni o‘tkazmaymiz.
 * Windowsda har `dev`da `prisma generate` DLL ni qayta yozishi EPERM (rename) berishi mumkin.
 *
 * Majburiy generate: `npx prisma generate` (boshqa Node jarayonlari yopilganida).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const clientDir = path.join(backendRoot, "node_modules", ".prisma", "client");
const indexJs = path.join(clientDir, "index.js");

function prismaClientLooksReady() {
  if (!fs.existsSync(indexJs) || !fs.existsSync(clientDir)) return false;
  let names;
  try {
    names = fs.readdirSync(clientDir);
  } catch {
    return false;
  }
  return names.some(
    (n) => n.includes("query_engine") && (n.endsWith(".node") || n.endsWith(".so.node"))
  );
}

if (prismaClientLooksReady()) {
  console.log("[prisma-generate-if-needed] Client mavjud — generate o‘tkazildi.");
  process.exit(0);
}

console.log("[prisma-generate-if-needed] Client to‘liq emas — generate qilinmoqda...");
const r = spawnSync("node", [path.join(__dirname, "prisma-generate-retry.cjs")], {
  stdio: "inherit",
  cwd: backendRoot,
  shell: false
});
process.exit(r.status ?? 1);
