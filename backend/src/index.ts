/** `env` avval yuklansin — `app` → Prisma `DATABASE_URL` ni `process.env` dan oladi. */
import { env } from "./config/env";
import { buildApp } from "./app";
import { closeOrderEventBusRedis, initOrderEventBusRedis } from "./lib/order-event-bus";

async function main() {
  const app = buildApp();
  await initOrderEventBusRedis(env.REDIS_URL, app.log);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Server listening on port ${env.PORT}`);

  const shutdown = async () => {
    await app.close();
    await closeOrderEventBusRedis();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
