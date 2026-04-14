/**
 * Bir buyruq bilan DB ni to'liq tozalash.
 *
 * Ishlatish:
 *   npm run db:wipe:all-once
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const env = {
  ...process.env,
  CONFIRM_DB_WIPE_ALL: process.env.CONFIRM_DB_WIPE_ALL || "yes"
};

const r = spawnSync("npx", ["tsx", "scripts/db-truncate-all-once.ts"], {
  cwd: backendRoot,
  stdio: "inherit",
  env,
  shell: process.platform === "win32"
});

process.exit(r.status ?? 1);
