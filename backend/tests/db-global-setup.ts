import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

export default async function globalSetup() {
  const marker = join(__dirname, ".db-integration-ready");
  let ready = "0";
  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$disconnect();
    ready = "1";
  } catch {
    ready = "0";
  }
  writeFileSync(marker, ready, "utf8");
}
