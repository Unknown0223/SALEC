/**
 * Downloads papkasidan staff Excel fayllarini scripts/data ga nusxalaydi.
 * Bir nechta mumkin bo‘lgan fayl nomlarini ketma-ket sinaydi.
 *
 * Ishlatish: npm run sync:staff-xlsx   (backend papkasidan)
 */
const fs = require("fs");
const path = require("path");

const downloads = path.join(process.env.USERPROFILE || "", "Downloads");
const dataDir = path.join(__dirname, "data");

/** [mumkin manbalar], destNom, (ixtiyoriy) import uchun ASCII nusxa */
const tripleSets = [
  {
    dest: "Активные агенты (3).xlsx",
    portable: "staff-agents.xlsx",
    sources: ["Активные агенты (3).xlsx", "Активные агенты (2).xlsx", "Активные агенты (1).xlsx", "Активные агенты.xlsx"]
  },
  {
    dest: "Активные Активные экспедиторы (3).xlsx",
    portable: "staff-expeditors.xlsx",
    sources: [
      "Активные Активные экспедиторы (3).xlsx",
      "Активные Активные экспедиторы (2).xlsx",
      "Активные Активные экспедиторы (1).xlsx",
      "Активные экспедиторы (2).xlsx",
      "Активные экспедиторы (1).xlsx",
      "Активные экспедиторы.xlsx"
    ]
  },
  {
    dest: "Супервайзеры (4).xlsx",
    portable: "staff-supervisors.xlsx",
    sources: ["Супервайзеры (4).xlsx", "Супервайзеры (3).xlsx", "Супервайзеры (1).xlsx", "Супервайзеры (2).xlsx", "Супервайзеры.xlsx"]
  }
];

function copyFirstExisting(sources, destName) {
  for (const name of sources) {
    const src = path.join(downloads, name);
    if (fs.existsSync(src)) {
      const dest = path.join(dataDir, destName);
      fs.copyFileSync(src, dest);
      return { ok: true, src, dest };
    }
  }
  return { ok: false, tried: sources.map((n) => path.join(downloads, n)) };
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let ok = 0;
for (const set of tripleSets) {
  const r = copyFirstExisting(set.sources, set.dest);
  if (r.ok) {
    console.log("[ok]", r.dest);
    if (set.portable) {
      const p = path.join(dataDir, set.portable);
      fs.copyFileSync(r.src, p);
      console.log("[ok]", set.portable, "(git / boshqa PC uchun qulay nom)");
    }
    ok++;
  } else {
    console.warn("[skip] yo'q:", set.dest, "←", set.sources.join(" | "));
  }
}
console.log("Nusxalandi:", ok, "/", tripleSets.length);
process.exit(ok === 0 ? 1 : 0);
