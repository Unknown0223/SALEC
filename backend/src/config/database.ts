import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

// `index.ts` imports `./app` before `./config/env`; auth loads prisma early. Load `.env` here so DATABASE_URL is set before PrismaClient is constructed.
config({ path: resolve(__dirname, "../../.env") });

declare global {
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
