/**
 * PostgreSQL + Prisma: barcha ma’lumotlarni o‘chirib, migratsiyalarni qayta qo‘llaydi.
 *
 * ⚠️  QAYTARILMAYDI — barcha tenant / zakaz / to‘lov / qoldiqlar yo‘qoladi.
 *
 * PowerShell (backend papkasida):
 *   $env:CONFIRM_DB_ZERO_RESET="yes"
 *   $env:DATABASE_URL="postgresql://postgres:0223@localhost:15432/savdo_db"
 *   npx tsx scripts/db-zero-reset.ts
 *
 * Seedni O‘TKAZIB yuborish (bo‘sh jadvalar, keyin o‘zingiz tenant + import):
 *   $env:DB_ZERO_SKIP_SEED="1"
 *
 * Production: $env:ALLOW_PROD_DB_ZERO="true" majburiy
 *
 * Keyingi qadamlar (seed o‘tkazilgan bo‘lsa test1/demo tayyor):
 *   - Kirish: slug test1 yoki demo, login admin, parol seed.ts dagi (odatda secret123)
 *
 * Seed o‘tkazilmagan bo‘lsa:
 *   npm run provision:admin
 *   $env:IMPORT_TENANT_SLUG="sizning_slug"; npm run import:once
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import "dotenv/config";

const root = path.resolve(__dirname, "..");

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function main() {
  if (process.env.CONFIRM_DB_ZERO_RESET !== "yes") {
    console.error(
      "[db-zero-reset] To‘xtatildi. Bazani tozalash uchun muhit o‘zgaruvchisini qo‘ying:\n" +
        "  CONFIRM_DB_ZERO_RESET=yes"
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !truthy(process.env.ALLOW_PROD_DB_ZERO)) {
    console.error("[db-zero-reset] Production: ALLOW_PROD_DB_ZERO=true qo‘shing.");
    process.exit(1);
  }

  const skipSeed = truthy(process.env.DB_ZERO_SKIP_SEED);
  const args = ["prisma", "migrate", "reset", "--force"];
  if (skipSeed) args.push("--skip-seed");

  console.log(
    `[db-zero-reset] cwd=${root}\n` +
      `  DATABASE_URL=${process.env.DATABASE_URL ? "(bor)" : "YO‘Q — .env tekshiring"}\n` +
      `  skip-seed: ${skipSeed}\n`
  );

  const r = spawnSync("npx", args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });

  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }

  console.log(
    "\n[db-zero-reset] Tayyor.\n" +
      (skipSeed
        ? "Keyingi qadamlar:\n" +
          "  1) IMPORT_TENANT_SLUG va ADMIN_PASSWORD bilan: npm run provision:admin\n" +
          "  2) npm run import:once  (spravochniklar + ixtiyoriy CSV/JSON)\n" +
          "  3) yoki: npm run import:bundle  (JSON shablon)\n" +
          "  4) Excel: npm run import:excel-bundle\n"
        : "Seed ishga tushdi — test1/demo va admin foydalanuvchilar prisma/seed.ts bo‘yicha yaratildi.\n")
  );
}

main();
