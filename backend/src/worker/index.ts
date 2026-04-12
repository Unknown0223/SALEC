import IORedis from "ioredis";
import { Worker } from "bullmq";
import { env } from "../config/env";
import { BACKGROUND_QUEUE_NAME } from "../jobs/constants";
import { processBackgroundJob } from "../jobs/process-background-job";

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

/**
 * Fon ishlar: `ping`, `order_status_notify`, importlar (`import_clients_xlsx`, `import_stock_xlsx`, `import_products_*`), …
 */
const worker = new Worker(BACKGROUND_QUEUE_NAME, (job) => processBackgroundJob(job), { connection });

worker.on("completed", (job) => {
  process.stdout.write(`[worker] job ${job.id} (${job.name}) bajarildi\n`);
});

worker.on("failed", (job, err) => {
  process.stderr.write(`[worker] job ${job?.id} xato: ${err.message}\n`);
});

const safeRedisUrl = env.REDIS_URL.includes("@")
  ? env.REDIS_URL.replace(/\/\/[^@]+\//, "//***@/")
  : env.REDIS_URL;
process.stdout.write(
  `[worker] BullMQ tinglayapti: queue=${BACKGROUND_QUEUE_NAME} redis=${safeRedisUrl}\n`
);

function shutdown(signal: string): void {
  process.stdout.write(`[worker] ${signal}, yopilmoqda...\n`);
  void worker
    .close()
    .then(() => connection.quit())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
