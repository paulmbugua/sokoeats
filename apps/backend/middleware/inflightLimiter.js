// apps/backend/middleware/inflightLimiter.js
import { redis } from '../utils/redisCache.js';

export function inflightLimiter({
  keyFn,
  max = Number(process.env.AI_MAX_INFLIGHT || 2),
  ttlSec = 120, // safety TTL if a request never finishes
} = {}) {
  if (redis) {
    return async (req, res, next) => {
      const key = `inflight:${keyFn(req)}`;
      try {
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, ttlSec);
        if (n > max) {
          await redis.decr(key).catch(() => {});
          return res.status(429).json({
            message: 'Too many concurrent requests. Please wait a moment.',
          });
        }
        const dec = () => redis.decr(key).catch(() => {});
        res.on('finish', dec);
        res.on('close', dec);
        next();
      } catch {
        next(); // degrade gracefully
      }
    };
  }

  // In-memory fallback
  const counters = new Map(); // key -> number
  return (req, res, next) => {
    const key = keyFn(req);
    const current = (counters.get(key) || 0) + 1;
    if (current > max) {
      return res.status(429).json({
        message: 'Too many concurrent requests. Please wait a moment.',
      });
    }
    counters.set(key, current);
    const dec = () =>
      counters.set(key, Math.max(0, (counters.get(key) || 1) - 1));
    res.on('finish', dec);
    res.on('close', dec);
    next();
  };
}
