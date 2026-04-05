/* Next.js dev ishlayotganda .next ni qo‘lda o‘chirmang — 404/ENOENT. Avval dev ni to‘xtating yoki `npm run repair:next`. */
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, ".next");
try {
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write("frontend/.next o‘chirildi.\n");
} catch (e) {
  if (e && e.code === "ENOENT") return;
  throw e;
}
