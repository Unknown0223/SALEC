/**
 * Barcha ma'lumotlarni tozalash (schema o'zgarmaydi):
 * - public sxemadagi barcha jadvallar TRUNCATE qilinadi
 * - identity (autoincrement) reset bo'ladi
 * - FK bog'lanishlar uchun CASCADE ishlatiladi
 *
 * Eslatma: `_prisma_migrations` saqlab qolinadi.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_DB_WIPE_ALL !== "yes") {
    console.error(
      "[db-truncate-all-once] To'xtatildi. Tasdiqlash uchun CONFIRM_DB_WIPE_ALL=yes qo'ying."
    );
    process.exit(1);
  }

  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  if (rows.length === 0) {
    console.log("[db-truncate-all-once] Jadval topilmadi.");
    await prisma.$disconnect();
    return;
  }

  const tables = rows.map((r) => `"public"."${r.tablename.replace(/"/g, "\"\"")}"`).join(", ");
  const sql = `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`;

  console.log(`[db-truncate-all-once] Tozalanadigan jadvallar: ${rows.length}`);
  await prisma.$executeRawUnsafe(sql);
  console.log("[db-truncate-all-once] Tayyor. Barcha ma'lumotlar o'chirildi.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
