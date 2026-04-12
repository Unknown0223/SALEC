import type { Redis } from "ioredis";
import { env } from "../config/env";

/**
 * Umumiy maqsaddagi Redis client — Dashboard cache, narxlar cache, stock cache va h.k.
 * `order-event-bus.ts` o'zining pub/sub connectionlarini ishlatadi.
 */

let appRedis: Redis | null = null;

export async function getRedisForApp(): Promise<Redis> {
  if (appRedis && appRedis.status === "ready") {
    return appRedis;
  }

  try {
    const IORedis = (await import("ioredis")).default;
    appRedis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return times > 5 ? null : Math.min(times * 50, 2000);
      },
      lazyConnect: true
    });

    await appRedis.connect();
    return appRedis;
  } catch {
    // Redis mavjud emas — in-memory fallback
    return createInMemoryRedis();
  }
}

// ---- In-memory fallback (Redis yo‘q bo‘lsa) ----

type CacheEntry = { value: string; expiresAt: number | null };
const memoryStore = new Map<string, CacheEntry>();

function createInMemoryRedis(): Redis {
  // Minimal mock — `get`, `set`, `del` ishlaydi
  const mockRedis: any = {};
  mockRedis.status = "ready";
  mockRedis.get = async (key: string) => {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  };
  mockRedis.set = async (key: string, value: string, ...args: string[]) => {
    let ttl: number | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i].toUpperCase() === "EX" && args[i + 1]) {
        ttl = Number(args[i + 1]) * 1000;
        i++;
      }
    }
    memoryStore.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl : null
    });
    return "OK";
  };
  mockRedis.del = async (key: string) => {
    return memoryStore.delete(key) ? 1 : 0;
  };
  mockRedis.disconnect = () => Promise.resolve();
  mockRedis.quit = async () => Promise.resolve();
  return mockRedis as Redis;
}

/** Barcha tenant dashboard cache kalitlarini o'chirish */
export async function invalidateDashboard(tenantId: number): Promise<void> {
  try {
    const redis = await getRedisForApp();
    await redis.del(`tenant:${tenantId}:dashboard`);
  } catch {
    // ignore — in-memory fallback'da ham o'chirish mumkin
  }
}

/** Narxlar cache invalidatsiya */
export async function invalidatePrices(tenantId: number): Promise<void> {
  try {
    const redis = await getRedisForApp();
    await redis.del(`tenant:${tenantId}:prices`);
  } catch {
    /* ignore */
  }
  await invalidatePriceTypesCache(tenantId);
}

/** `listDistinctPriceTypesForTenant` Redis kalitlari */
export async function invalidatePriceTypesCache(tenantId: number): Promise<void> {
  try {
    const redis = await getRedisForApp();
    await Promise.all([
      redis.del(`tenant:${tenantId}:price_types:sale`),
      redis.del(`tenant:${tenantId}:price_types:purchase`),
      redis.del(`tenant:${tenantId}:price_types:all`)
    ]);
  } catch {
    /* ignore */
  }
}

/** Stock cache invalidatsiya */
export async function invalidateStock(tenantId: number, warehouseId?: number): Promise<void> {
  try {
    const redis = await getRedisForApp();
    if (warehouseId != null) {
      await redis.del(`tenant:${tenantId}:stock:${warehouseId}`);
    }
    await redis.del(`tenant:${tenantId}:stock:all`);
  } catch {
    /* ignore */
  }
}
