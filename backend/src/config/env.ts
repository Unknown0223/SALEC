import { config } from "dotenv";
import { resolve } from "path";
import { z } from "zod";

// cwd ga bog‘liq emas: `backend/.env` va loyiha ildizidagi `.env` (masalan monorepo)
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:0223@localhost:5432/savdo_db"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  /** Excel import va boshqa multipart fayllar (baytlarda). */
  MULTIPART_MAX_FILE_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  JWT_ACCESS_SECRET: z.string().min(32).default("access-secret-key-min-32-characters-123"),
  JWT_REFRESH_SECRET: z.string().min(32).default("refresh-secret-key-min-32-characters-123")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;

if (env.NODE_ENV === "production") {
  const badProdDefaults: string[] = [];
  if (env.DATABASE_URL === "postgresql://postgres:0223@localhost:5432/savdo_db") {
    badProdDefaults.push("DATABASE_URL");
  }
  if (env.REDIS_URL === "redis://localhost:6379") {
    badProdDefaults.push("REDIS_URL");
  }
  if (env.JWT_ACCESS_SECRET === "access-secret-key-min-32-characters-123") {
    badProdDefaults.push("JWT_ACCESS_SECRET");
  }
  if (env.JWT_REFRESH_SECRET === "refresh-secret-key-min-32-characters-123") {
    badProdDefaults.push("JWT_REFRESH_SECRET");
  }
  if (badProdDefaults.length > 0) {
    throw new Error(
      `Unsafe production environment defaults detected: ${badProdDefaults.join(", ")}`
    );
  }
}

/** Prisma `schema.prisma` to‘g‘ridan-to‘g‘ri `process.env.DATABASE_URL` ni o‘qiydi; zod default faqat `env` obyektida bo‘lib qolmasin. */
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.REDIS_URL = env.REDIS_URL;
