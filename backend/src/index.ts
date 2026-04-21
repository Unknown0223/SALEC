/** `env` avval yuklansin — `app` → Prisma `DATABASE_URL` ni `process.env` dan oladi. */
import { env } from "./config/env";
import { buildApp } from "./app";
import { prisma } from "./config/database";
import { logger } from "./config/logger";
import { closeOrderEventBusRedis, initOrderEventBusRedis } from "./lib/order-event-bus";
import { disableAutoClose, enableAutoClose } from "./lib/order-auto-cron";

async function main() {
  await prisma.$connect();
  const app = buildApp();
  await initOrderEventBusRedis(env.REDIS_URL, app.log);

  /** Dev/test: `0.0.0.0` ba’zi Windows portlarida EACCES beradi; lokalda 127.0.0.1 yetarli. */
  const listenHost = env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
  await app.listen({ port: env.PORT, host: listenHost });
  app.log.info({ port: env.PORT, host: listenHost }, "Server listening");

  enableAutoClose();
  app.log.info("Auto-status cron worker enabled.");

  const shutdown = async () => {
    disableAutoClose();
    await app.close();
    await closeOrderEventBusRedis();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal startup error");
  process.exit(1);
});
