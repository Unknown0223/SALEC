/**
 * Downloads papkasidan ma'lum Excel fayllarni scripts/data ga nusxalaydi (UTF-8 nomlar).
 * Ishlatish: node scripts/sync-staff-xlsx-from-downloads.cjs
 */
const fs = require("fs");
const path = require("path");

const downloads = path.join(process.env.USERPROFILE || "", "Downloads");
const dataDir = path.join(__dirname, "data");

const pairs = [
  ["Активные агенты (2).xlsx", "Активные агенты (2).xlsx"],
  ["Активные Активные экспедиторы (2).xlsx", "Активные Активные экспедиторы (2).xlsx"],
  ["Супервайзеры (1).xlsx", "Супервайзеры (1).xlsx"]
];

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let ok = 0;
for (const [name, destName] of pairs) {
  const src = path.join(downloads, name);
  const dest = path.join(dataDir, destName);
  if (!fs.existsSync(src)) {
    console.warn("[skip] yo'q:", src);
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log("[ok]", dest);
  ok++;
}
console.log("Nusxalandi:", ok, "/", pairs.length);
process.exit(ok === 0 ? 1 : 0);
