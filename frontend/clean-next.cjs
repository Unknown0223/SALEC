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
