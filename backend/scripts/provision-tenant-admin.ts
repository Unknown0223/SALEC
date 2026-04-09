/**
 * Tenant + admin foydalanuvchini idempotent qilib yaratadi / parolini yangilaydi.
 * Production: ALLOW_ADMIN_BOOTSTRAP=true majburiy.
 *
 * Misol:
 *   ALLOW_ADMIN_BOOTSTRAP=true ADMIN_PASSWORD=secret123 npx tsx scripts/provision-tenant-admin.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const login = (process.env.ADMIN_LOGIN || "admin").trim();
  const password = (process.env.ADMIN_PASSWORD || "secret123").trim();

  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD kamida 6 belgi bo‘lishi kerak.");
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
    throw new Error("Production: ALLOW_ADMIN_BOOTSTRAP=true qo‘ying.");
  }

  const hash = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { is_active: true },
    create: {
      slug,
      name: slug === "test1" ? "Test Tenant 1" : `Tenant ${slug}`,
      plan: "basic",
      is_active: true
    }
  });

  await prisma.user.upsert({
    where: { tenant_id_login: { tenant_id: tenant.id, login } },
    update: {
      password_hash: hash,
      is_active: true,
      can_authorize: true,
      app_access: true,
      role: "admin"
    },
    create: {
      tenant_id: tenant.id,
      name: "Admin",
      login,
      password_hash: hash,
      role: "admin",
      is_active: true,
      can_authorize: true,
      app_access: true
    }
  });

  console.log(`OK: tenant slug="${slug}" login="${login}" (parol yangilandi).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
