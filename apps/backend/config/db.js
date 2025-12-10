// apps/backend/config/db.js
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

/* ───────── 1) Object-based configuration (safer than raw URL) ───────── */
const cfg = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
    };

          
  const wantSsl =
  process.env.PGSSL === 'require' ||
  (isProd && !!process.env.DATABASE_URL);

const pool = new Pool({
  ...cfg,
  ssl: wantSsl ? { rejectUnauthorized: false } : false,

  // Pool sizing & timeouts
  max: Number(process.env.DB_MAX_CONNECTIONS) || (isProd ? 25 : 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 300_000, // 5m
  connectionTimeoutMillis: Number(process.env.DB_CONN_TIMEOUT_MS) || 10_000,

  // TCP keepalives
  keepAlive: true,
  keepAliveInitialDelayMillis: Number(process.env.DB_KEEPALIVE_DELAY_MS) || 10_000,

  // Helpful label in pg_stat_activity
  application_name: process.env.PGAPPNAME || 'daybreak-backend',
});



// Safe preview log (no passwords)
(function safeLogConfig() {
  if (cfg.connectionString) {
    const masked = cfg.connectionString.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:*****@');
    console.log('Using Postgres connection (URL):', masked);
  } else {
    const { user, host, port, database } = cfg;
    console.log(`Using Postgres connection (obj): postgres://${user || 'user'}:*****@${host}:${port}/${database}`);
  }
})();

/* ───────── 2) Throttled idle-error logging (noise gate) ───────── */
const seenErrors = new Map(); // key -> timestamp
function shouldLogOnce(key, windowMs = 5000) {
  const now = Date.now();
  const prev = seenErrors.get(key) || 0;
  if (now - prev < windowMs) return false;
  seenErrors.set(key, now);
  return true;
}

pool.on('connect', () => {
  console.log('✅ PostgreSQL client connected');
});

pool.on('remove', () => {
  // A client left the pool — normal when recycling/closing.
});

pool.on('error', (err) => {
  // Errors on *idle* clients — pool will discard & replace automatically.
  const key = `${err.code || err.name}:${(err.message || '').slice(0, 80)}`;
  if (shouldLogOnce(key)) {
    console.warn('⚠️ PG idle client error:', err.code || err.name, '-', err.message);
  }
});

/* ───────── Robust startup probe (dev/containers) ───────── */
async function waitForPg({
  tries = Number(process.env.DB_STARTUP_TRIES) || 12,
  backoffMs = Number(process.env.DB_STARTUP_BACKOFF_MS) || 1000,
} = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('🔍 Startup test query succeeded.');
      return;
    } catch (err) {
      const last = i === tries - 1;
      console.warn(`⏳ Waiting for Postgres (attempt ${i + 1}/${tries}) — ${err.code || err.message}`);
      if (last) {
        console.error('🚨 Startup test query failed. Exiting.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, backoffMs * Math.min(8, 2 ** i)));
    }
  }
}
waitForPg().catch((e) => {
  console.error('🚨 PG init failed:', e);
  process.exit(1);
});

/* ───────── 3) queryWithRetry helper (use this instead of pool.query) ───────── */

// DB-down / transient conditions we want to detect and (usually) retry
const DB_DOWN_CODES = new Set([
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now (often "in recovery mode")
  '53300', // too_many_connections
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
]);

const RETRYABLE_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);

function markDbDown(err) {
  const code = err?.code || err?.original?.code || '';
  const msg = String(err?.message || err?.original?.message || '').toLowerCase();

  const dbDown =
    DB_DOWN_CODES.has(code) ||
    /in recovery mode/.test(msg) ||
    /the database system is starting up/.test(msg) ||
    /connection terminated unexpectedly/.test(msg);

  if (dbDown) {
    err._dbDown = true;        // for controllers/services to map to 503
    err._serverBusy = true;    // optional: reuse your "busy" path
  }
  return err;
}

/**
 * queryWithRetry(text, params?, opts?)
 * Retries on transient connection errors a couple times with backoff.
 */
export async function queryWithRetry(text, params = [], opts = {}) {
  const {
    retries = Number(process.env.DB_QUERY_RETRIES) || 2,
    minDelayMs = 150,
    maxDelayMs = 1200,
    // slightly longer backoff when DB is in recovery/too many connections
    dbDownMinDelayMs = 400,
    dbDownMaxDelayMs = 2000,
  } = opts;

  let attempt = 0;

  while (true) {
    try {
      return await pool.query(text, params);
    } catch (rawErr) {
      const err = markDbDown(rawErr);
      const msg = String(err?.message || '');
      const code = err?.code;

      const retryable =
        DB_DOWN_CODES.has(code) ||
        RETRYABLE_NODE_CODES.has(code) ||
        /Connection terminated unexpectedly/i.test(msg);

      if (!retryable || attempt >= retries) {
        // bubble up with _dbDown/_serverBusy flags set (if applicable)
        throw err;
      }

      // exponential backoff with a touch more patience when DB is down
      const baseMin = err._dbDown ? dbDownMinDelayMs : minDelayMs;
      const baseMax = err._dbDown ? dbDownMaxDelayMs : maxDelayMs;
      const sleep = Math.min(baseMax, baseMin * 2 ** attempt);

      attempt += 1;
      console.warn(
        `[pg:retry] ${code || err.name || 'error'} — retry ${attempt}/${retries} in ${sleep}ms`
      );
      await new Promise((r) => setTimeout(r, sleep));
    }
  }
}

/* ───────── Optional keep-alive ping ───────── */
const pingEveryMs = Number(process.env.DB_PING_INTERVAL_MS) || 0;
if (pingEveryMs > 0) {
  setInterval(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      console.warn('[pg:ping] failed:', e.code || e.message);
    }
  }, pingEveryMs).unref();
}

/* ───────── Graceful shutdown ───────── */
for (const sig of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
  process.on(sig, async () => {
    try {
      await pool.end();
      console.log('🧹 PG pool closed');
    } catch (e) {
      console.warn('PG pool close error:', e?.message);
    } finally {
      process.exit(0);
    }
  });
}

export default pool;


