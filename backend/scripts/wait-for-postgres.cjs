#!/usr/bin/env node
/**
 * Docker Postgres konteyneri «starting up» holatida bo‘lganda `migrate deploy` yiqiladi.
 * `SELECT 1` muvaffaqiyatli bo‘lguncha qayta-qayta urinadi (taxminan 45 s gacha).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const maxAttempts = 45;
const delayMs = 1000;

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

for (let i = 0; i < maxAttempts; i++) {
  try {
    execSync("npx prisma db execute --stdin --schema prisma/schema.prisma", {
      cwd: root,
      input: "SELECT 1;\n",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: process.env
    });
    if (i > 0) {
      console.log("[wait-for-postgres] Baza tayyor.");
    }
    process.exit(0);
  } catch {
    if (i === 0) {
      console.log(
        "[wait-for-postgres] PostgreSQL kutilmoqda (Docker «starting up» — bir necha soniya)..."
      );
    }
    sleepSync(delayMs);
  }
}

console.error(
  "[wait-for-postgres] " +
    maxAttempts +
    " s kutildi, ulanib bo‘lmadi. `docker compose ps`, `DATABASE_URL` va docker-compose.yml dagi Postgres host portini tekshiring."
);
process.exit(1);
