// apps/backend/middleware/middleware.js
import morgan from 'morgan';
import helmet from 'helmet';
import winston, { format, transports } from 'winston';
import { redis } from '../utils/redisCache.js';

/* ────────────────────────────────────────────────────────
 * HTTP logging
 * ──────────────────────────────────────────────────────── */
export const morganMiddleware = morgan('combined');

/* ────────────────────────────────────────────────────────
 * Security headers
 * ──────────────────────────────────────────────────────── */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  dnsPrefetchControl: { allow: true },
});

/* ────────────────────────────────────────────────────────
 * Rate limiting (Redis sliding window, in-memory fallback)
 * Dev default: OFF unless RATE_LIMIT_ENABLED="true"
 * Prod default: ON
 * ──────────────────────────────────────────────────────── */
const isDev = process.env.NODE_ENV !== 'production';

// Default OFF in dev, ON in prod
const rateLimitEnv = process.env.RATE_LIMIT_ENABLED ?? (isDev ? 'false' : 'true');
const rateLimitEnabled = rateLimitEnv === 'true';

function shouldBypass(req) {
  if (!rateLimitEnabled) return true;
  if (req.method === 'OPTIONS') return true;
  if (req.path === '/healthz') return true;

  // Don’t globally rate-limit admin GETs
  if (req.method === 'GET' && req.path.startsWith('/api/admin')) return true;

  // NEW: do NOT rate-limit read-only ops at all
  const m = (req.method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;

  return false;
}



function defaultKeyFn(req) {
  const user = req.user || {};
  const uid = user.id || user.user_id || null;
  // NOTE: ensure in your server bootstrap you have: app.set('trust proxy', 1)
  // so req.ip is the real client IP behind a proxy/load balancer.
  return uid ? `u:${uid}` : `ip:${req.ip}`;
}

/* ────────────────────────────────────────────────────────
 * Response header helper (standards + legacy)
 * - RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset (delta-seconds)
 * - X-RateLimit-* (GitHub-style, reset as unix secs)
 * ──────────────────────────────────────────────────────── */
function setRateHeaders(res, { limit, remaining, resetMs }) {
  const resetDeltaSec = Math.max(0, Math.ceil(resetMs / 1000));
  const resetUnixSec = Math.ceil((Date.now() + resetMs) / 1000);

  // IETF draft headers (widely supported)
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('RateLimit-Reset', String(resetDeltaSec));

  // Legacy GitHub-style for broader client compatibility
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(resetUnixSec));
}

/* ────────────────────────────────────────────────────────
 * In-memory fixed window fallback
 * (now with periodic cleanup to avoid memory growth)
 * ──────────────────────────────────────────────────────── */
const memBuckets = new Map(); // key -> { count, resetAt }
let memCleanupStarted = false;

function startMemCleanup() {
  if (memCleanupStarted) return;
  memCleanupStarted = true;
  // Purge expired buckets every 60s
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of memBuckets) {
      if (now >= b.resetAt) memBuckets.delete(key);
    }
  }, 60_000);
  // Don’t keep the process alive because of this timer
  if (typeof timer.unref === 'function') timer.unref();
}

function memoryLimiter({ windowMs, limit, message = 'Too many requests, try again later.', keyFn = defaultKeyFn }) {
  startMemCleanup();
  return (req, res, next) => {
    if (shouldBypass(req)) return next();

    const key = keyFn(req);
    const now = Date.now();
    let bucket = memBuckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    memBuckets.set(key, bucket);

    const remaining = Math.max(0, limit - bucket.count);
    setRateHeaders(res, { limit, remaining, resetMs: Math.max(0, bucket.resetAt - now) });

    if (bucket.count > limit) {
      const secs = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(secs));
      return res.status(429).json({ message });
    }
    next();
  };
}

/* ────────────────────────────────────────────────────────
 * Redis sliding window limiter (sorted set per key)
 * Uses MULTI/EXEC and PTTL for accurate headers
 * ──────────────────────────────────────────────────────── */
function redisSlidingWindowLimiter({
  windowMs,
  limit,
  message = 'Too many requests, try again later.',
  keyFn = defaultKeyFn,
}) {
  return async (req, res, next) => {
    if (shouldBypass(req)) return next();

    if (!redis) return memoryLimiter({ windowMs, limit, message, keyFn })(req, res, next);

    const key = `rl:${keyFn(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Unique-ish member so multiple hits in the same ms still count separately
      const member = `${now}-${Math.random().toString(36).slice(2)}`;

      // Pipeline: trim old, add current, get count, set TTL, and read TTL for accurate headers
      const pipeline = redis.multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .pttl(key);

      const results = await pipeline.exec();

      // ioredis: results is [[null, res], [null, res], ...]
      // node-redis v4: results is [res, res, ...]
      const get = (i) => Array.isArray(results?.[i]) ? results[i][1] : results?.[i];

      const count = Number(get(2) ?? 0);
      let ttl = Number(get(4));
      if (Number.isNaN(ttl) || ttl < 0) ttl = windowMs; // fallback if TTL missing

      const remaining = Math.max(0, limit - count);
      setRateHeaders(res, { limit, remaining, resetMs: ttl });

      if (count > limit) {
        const secs = Math.max(1, Math.ceil(ttl / 1000));
        res.setHeader('Retry-After', String(secs));
        return res.status(429).json({ message });
      }

      next();
    } catch (e) {
      console.warn('[rate-limit] Redis error, falling back to memory:', e?.message || e);
      return memoryLimiter({ windowMs, limit, message, keyFn })(req, res, next);
    }
  };
}

function makeLimiter(opts) {
  return redisSlidingWindowLimiter(opts);
}

/* ────────────────────────────────────────────────────────
 * Enhanced keying for AI endpoints
 * ──────────────────────────────────────────────────────── */
// Extract a best-effort user id from Authorization: Bearer <jwt> without verifying
function extractUidFromAuth(req) {
  try {
    const h = req.headers?.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1];
    const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload.sub || payload.uid || payload.user_id || payload.id || null;
  } catch {
    return null;
  }
}

// Smarter AI limiter key: per route-bucket + per user (fallback IP)
function aiKeyFn(req) {
  const path = String(req.path || '');
  let bucket = 'ai';
  if (path.includes('outline')) bucket = 'ai:outline';
  else if (path.includes('lesson') || path.includes('ssml')) bucket = 'ai:lesson';
  else if (path.includes('quiz')) bucket = 'ai:quiz';
  else if (path.includes('ttsAvatar')) bucket = 'ai:tts';

  const uid = (req.user && (req.user.id || req.user.user_id)) || extractUidFromAuth(req);
  const id = uid ? `u:${uid}` : `ip:${req.ip}`;
  return `${bucket}:${id}`;
}

/* ────────────────────────────────────────────────────────
 * Exports (same names) + strict AI limiter
 * ──────────────────────────────────────────────────────── */
export const userLimiter = makeLimiter({
  windowMs: 60_000,
  limit: isDev ? 5000 : 600,  // 600 /api/user writes per minute
  message: 'Too many /api/user requests, slow down a bit.',
});
export const progressLimiter     = makeLimiter({ windowMs: 30_000, limit: isDev ? 1000 : 300 });
export const certificatesLimiter = makeLimiter({ windowMs: 30_000, limit: isDev ? 1000 : 200 });
export const reviewsLimiter      = makeLimiter({ windowMs: 60_000, limit: isDev ? 2000 : 300 });

// Mild global guard

export const limiter = makeLimiter({
  windowMs: 60_000,               // 1 minute
  limit: isDev ? 10_000 : 1000,   // 1000 write-ops per IP/min in prod
  message: 'Too many requests from this client, please try again after a short while.',
});


// Legacy simple AI limiter (kept for backward compatibility if anything else imports it)
export const aiLimiter = makeLimiter({ windowMs: 60_000, limit: isDev ? 200 : 10 });

// New: STRICT (but fair) per-user, per-bucket AI limiter
export const aiLimiterStrict = makeLimiter({
  windowMs: 60_000,
  limit: isDev ? 200 : 120,  // 120 AI calls/min/user
  keyFn: aiKeyFn,
  message: 'Too many AI requests, slow down briefly.',
});


// ────────────────────────────────────────────────────────
// Login limiter: per ip|origin|email, skip successful attempts
// ────────────────────────────────────────────────────────
function loginKeyFn(req) {
  const ip = req.ip || '';
  const origin = (req.headers?.origin || '').toString();
  const email =
    (req.body?.email || req.body?.username || '').toString().toLowerCase();
  return `login:${ip}|${origin}|${email}`;
}

/**
 * Limits POST login endpoints only.
 * - window: 15m
 * - limit: 5 attempts
 * - skips successful requests (2xx/3xx)
 */
export function loginLimiterFactory({ windowMs = 15 * 60_000, limit = 5 } = {}) {
  return async function loginLimiter(req, res, next) {
    if (shouldBypass(req)) return next();

    // enforce only on POST login paths
    const m = (req.method || 'GET').toUpperCase();
    const url = req.originalUrl || req.url || req.path || '';

    const isLoginPath =
      m === 'POST' &&
      (
        url.endsWith('/api/auth/login') ||
        url.endsWith('/api/admin/login') ||
        url.endsWith('/api/auth/admin-env-login') ||
        url.endsWith('/api/institutions/auth/login')
      );

    if (!isLoginPath) return next();

    // If no Redis, fallback to in-memory (does not skip success, but ok for dev)
    if (!redis) {
      return memoryLimiter({
        windowMs,
        limit,
        message: 'Too many login attempts. Try again later.',
        keyFn: loginKeyFn,
      })(req, res, next);
    }

    const key = `rl:${loginKeyFn(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}-${Math.random().toString(36).slice(2)}`;

    try {
      // trim, add, count, set TTL, read TTL
      const pipeline = redis.multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .pttl(key);

      const results = await pipeline.exec();
      const get = (i) => Array.isArray(results?.[i]) ? results[i][1] : results?.[i];

      const count = Number(get(2) ?? 0);
      let ttl = Number(get(4));
      if (Number.isNaN(ttl) || ttl < 0) ttl = windowMs;

      const remaining = Math.max(0, limit - count);
      setRateHeaders(res, { limit, remaining, resetMs: ttl });

      if (count > limit) {
        const secs = Math.max(1, Math.ceil(ttl / 1000));
        res.setHeader('Retry-After', String(secs));
        return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
      }

      // If login succeeds (2xx/3xx), remove the just-counted member
      res.on('finish', async () => {
        try {
          if (res.statusCode < 400) {
            await redis.zrem(key, member);
          }
        } catch {}
      });

      return next();
    } catch (e) {
      console.warn('[login-limit] Redis error, falling back to memory:', e?.message || e);
      return memoryLimiter({
        windowMs,
        limit,
        message: 'Too many login attempts. Try again later.',
        keyFn: loginKeyFn,
      })(req, res, next);
    }
  };
}

/* ────────────────────────────────────────────────────────
 * Winston logger
 * ──────────────────────────────────────────────────────── */
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({ format: format.combine(format.colorize(), format.simple()) }));
}

/* ────────────────────────────────────────────────────────
 * Error logger middleware
 * ──────────────────────────────────────────────────────── */
export { aiKeyFn };

export const errorLogger = (err, _req, _res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  next(err);
};
