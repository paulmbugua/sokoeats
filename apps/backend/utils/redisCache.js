// apps/backend/utils/redisCache.js
import crypto from 'crypto';
import {
  createRedis,
  ensureRedisConnected,
} from '../cronJobs/redisConnection.js';

export const redis = createRedis();
await ensureRedisConnected(redis).catch(() => {
  console.warn('[redis] not connected; caching disabled for this process');
});

export function sha1(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha1').update(s).digest('hex');
}

export async function cacheGetJSON(key) {
  if (!redis) return null;
  try {
    const txt = await redis.get(key);
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    console.warn('[redis] get error', e?.message);
    return null;
  }
}

export async function cacheSetJSON(key, value, ttlSec) {
  if (!redis) return false;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    return true;
  } catch (e) {
    console.warn('[redis] set error', e?.message);
    return false;
  }
}

// Safe pattern delete using SCAN (never use KEYS in prod)
export async function cacheDeleteByPattern(pattern) {
  if (!redis) return 0;
  let cursor = '0',
    total = 0;
  try {
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length) {
        total += keys.length;
        await redis.del(keys);
      }
    } while (cursor !== '0');
  } catch (e) {
    console.warn('[redis] scan/del error', e?.message);
  }
  return total;
}
