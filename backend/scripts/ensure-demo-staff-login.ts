/**
 * CLI: demo_* parollari. Mantiq: `lib/ensure-demo-login.ts`
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runEnsureDemoStaffLogin } from "./lib/ensure-demo-login";

async function main() {
  const prisma = new PrismaClient();
  try {
    await runEnsureDemoStaffLogin(prisma, {
      tenantSlug: process.env.IMPORT_TENANT_SLUG || "test1"
    });
    console.log("\nKirish: slug + login + parol (env yoki Parol123!).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
