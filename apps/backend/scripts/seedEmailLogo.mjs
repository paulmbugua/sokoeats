// apps/backend/scripts/seedEmailLogo.mjs
import { v2 as cloudinary } from 'cloudinary';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─────────────────────────────────────────────────────────
 * Load .env from common locations before touching DB
 * ───────────────────────────────────────────────────────── */
async function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '../../.env'), // apps/backend/.env
    path.resolve(__dirname, '../../../.env'), // repo root .env
    path.resolve(__dirname, '../.env'), // scripts/../.env (fallback)
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      dotenv.config({ path: p });
      console.log(`Loaded env from ${p}`);
      return;
    } catch {}
  }
  // As a last resort, load default .env in CWD (may be scripts/)
  dotenv.config();
  console.warn('No explicit .env found; relying on process env / CWD .env');
}
await loadEnv();

/* ─────────────────────────────────────────────────────────
 * Cloudinary config
 * ───────────────────────────────────────────────────────── */
const CLOUDINARY_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET_KEY;

function ensureCloudinaryEnv() {
  const missing = [];
  if (!CLOUDINARY_NAME)
    missing.push('CLOUDINARY_CLOUD_NAME (or CLOUDINARY_NAME)');
  if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');
  if (missing.length)
    throw new Error(`Missing Cloudinary env vars: ${missing.join(', ')}`);
}
ensureCloudinaryEnv();

cloudinary.config({
  cloud_name: CLOUDINARY_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

/* ─────────────────────────────────────────────────────────
 * CLI flags
 * ───────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const getFlag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const filePath = getFlag(
  'file',
  path.resolve(__dirname, '../uploads/logo.png'),
);
const folder = getFlag('folder', 'branding');
const publicId = getFlag('public-id', 'email_logo');
const settingKey = getFlag('key', 'email_logo_url');
const skipDb = hasFlag('no-db');

/* ─────────────────────────────────────────────────────────
 * DB helpers (lazy import)
 * ───────────────────────────────────────────────────────── */
let pool = null;
async function getPool() {
  if (skipDb) return null;
  try {
    const mod = await import('../config/db.js'); // import AFTER env is loaded
    return mod.default || mod; // support both default/named export patterns
  } catch (err) {
    console.error('DB import/connection failed:', err.message);
    console.error(
      'Tip: set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE, or run with --no-db',
    );
    throw err;
  }
}

async function detectSettingsTable(db) {
  const candidates = ['app_settings', 'site_settings', 'settings'];
  const { rows } = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1)`,
    [candidates],
  );
  const names = rows.map((r) => r.table_name);
  return candidates.find((c) => names.includes(c)) || null;
}

async function upsertSetting(db, table, key, value) {
  const sql = `
    INSERT INTO ${table} (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await db.query(sql, [key, value]);
}

/* ─────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────── */
async function main() {
  await fs.access(filePath).catch(() => {
    throw new Error(`Logo file not found: ${filePath}`);
  });

  console.log('Uploading logo to Cloudinary…');
  const { secure_url } = await cloudinary.uploader.upload(filePath, {
    folder,
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    use_filename: false,
    unique_filename: false,
    type: 'upload',
  });
  console.log(`✅ Uploaded: ${secure_url}`);

  if (skipDb) {
    console.log('ℹ️ --no-db: skipping DB write.');
    console.log(`Set EMAIL_LOGO_URL=${secure_url}`);
    return;
  }

  // Connect DB only now
  const db = await getPool();
  const table = await detectSettingsTable(db);
  if (table) {
    await upsertSetting(db, table, settingKey, secure_url);
    console.log(`✅ Saved to ${table}.${settingKey}`);
  } else {
    console.warn(
      '⚠️ No settings table found (looked for app_settings/site_settings/settings).',
    );
    console.warn(`   Use env instead: EMAIL_LOGO_URL=${secure_url}`);
  }
}

main()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
