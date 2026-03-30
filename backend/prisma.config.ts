import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma CLI `prisma.config.ts` ni vaqtinchalik papkadan ham ishga tushirishi mumkin — `__dirname` ishonchsiz.
// cwd: `backend` yoki monorepo ildizi bo‘lishi mumkin (`npm run db:deploy --prefix backend` ikkalasida ham to‘g‘ri).
const cwd = process.cwd();
const cwdIsBackend = existsSync(path.join(cwd, "prisma", "schema.prisma"));
const envPaths = cwdIsBackend
  ? [path.join(cwd, "..", ".env"), path.join(cwd, ".env")]
  : [path.join(cwd, ".env"), path.join(cwd, "backend", ".env")];
for (const p of envPaths) {
  loadEnv({ path: p, override: true });
}

let databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  delete process.env.DATABASE_URL;
  const backendDir = cwdIsBackend ? cwd : path.join(cwd, "backend");
  const examplePath = path.join(backendDir, ".env.example");
  if (existsSync(examplePath)) {
    loadEnv({ path: examplePath, override: false });
    databaseUrl = process.env.DATABASE_URL?.trim();
  }
}

if (!databaseUrl) {
  throw new Error(
    [
      "DATABASE_URL topilmadi.",
      "• backend/.env yarating: Windows da «copy .env.example .env» yoki DATABASE_URL=... qo‘shing.",
      "• Agar siz backend papkasidasiz: faqat «npm run db:deploy» (--prefix backend qo‘shmang).",
      "• Loyiha ildizidan: «npm run db:deploy» (skript backend papkasiga yo‘naltiriladi).",
      `cwd: ${cwd}`,
      `Tekshirilgan .env: ${envPaths.join(", ")}`
    ].join("\n")
  );
}

export default defineConfig({
  engine: "classic",
  datasource: {
    url: databaseUrl
  },
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts"
  }
});
