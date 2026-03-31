import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";

export type OrderStreamPayload = {
  type: "order.updated";
  tenant_id: number;
  order_id: number;
};

const CHANNEL = "order-events";

const bus = new EventEmitter();
bus.setMaxListeners(500);

let pub: Redis | null = null;
let sub: Redis | null = null;
let useRedis = false;

function emitLocal(payload: OrderStreamPayload): void {
  bus.emit("order", payload);
}

/**
 * Redis mavjud bo‘lsa: `emit` faqat `PUBLISH` (barcha instanslar `SUBSCRIBE` orqali lokal busga ulashadi).
 * Redis yo‘q yoki ulanish xato bo‘lsa: faqat jarayon ichidagi EventEmitter.
 */
export async function initOrderEventBusRedis(
  redisUrl: string,
  log?: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void }
): Promise<void> {
  try {
    const { default: IORedis } = await import("ioredis");
    const opts = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: (): null => null
    };
    pub = new IORedis(redisUrl, opts);
    sub = new IORedis(redisUrl, opts);
    const swallow = (): void => {};
    pub.on("error", swallow);
    sub.on("error", swallow);
    await Promise.all([pub.ping(), sub.ping()]);
    pub.off("error", swallow);
    sub.off("error", swallow);
    await sub.subscribe(CHANNEL);
    sub.on("message", (_ch, message) => {
      try {
        const payload = JSON.parse(message) as OrderStreamPayload;
        if (
          payload?.type === "order.updated" &&
          typeof payload.tenant_id === "number" &&
          typeof payload.order_id === "number"
        ) {
          emitLocal(payload);
        }
      } catch {
        /* ignore */
      }
    });
    useRedis = true;
    log?.info({}, "Order event bus: Redis pub/sub enabled");
  } catch (e) {
    log?.warn({ err: e }, "Order event bus: Redis unavailable, in-process only");
    useRedis = false;
    if (pub) {
      try {
        pub.removeAllListeners("error");
      } catch {
        /* ignore */
      }
      pub.disconnect();
      pub = null;
    }
    if (sub) {
      try {
        sub.removeAllListeners("error");
      } catch {
        /* ignore */
      }
      sub.disconnect();
      sub = null;
    }
  }
}

export async function closeOrderEventBusRedis(): Promise<void> {
  useRedis = false;
  const tasks: Promise<unknown>[] = [];
  if (pub) {
    tasks.push(pub.quit().catch(() => pub!.disconnect()));
    pub = null;
  }
  if (sub) {
    tasks.push(sub.quit().catch(() => sub!.disconnect()));
    sub = null;
  }
  await Promise.all(tasks);
}

export function emitOrderUpdated(tenantId: number, orderId: number): void {
  const payload: OrderStreamPayload = {
    type: "order.updated",
    tenant_id: tenantId,
    order_id: orderId
  };
  if (useRedis && pub) {
    void pub.publish(CHANNEL, JSON.stringify(payload)).catch(() => {
      emitLocal(payload);
    });
  } else {
    emitLocal(payload);
  }
}

export function subscribeOrderEvents(listener: (p: OrderStreamPayload) => void): () => void {
  bus.on("order", listener);
  return () => {
    bus.off("order", listener);
  };
}

export function isOrderEventBusRedisEnabled(): boolean {
  return useRedis;
}
