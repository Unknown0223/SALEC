import IORedis from "ioredis";
import { Queue } from "bullmq";
import { env } from "../config/env";
import { BACKGROUND_QUEUE_NAME } from "./constants";

let queue: Queue | null = null;
let connection: IORedis | null = null;

export function getBackgroundQueue(): Queue {
  if (!queue) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(BACKGROUND_QUEUE_NAME, { connection });
  }
  return queue;
}
