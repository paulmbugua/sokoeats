// apps/backend/scripts/seedOpenStaxPdf.mjs
import { v2 as cloudinary } from 'cloudinary';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─────────────────────────────────────────────────────────
 * Load .env early
 * ───────────────────────────────────────────────────────── */
async function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '../../.env'), // apps/backend/.env
    path.resolve(__dirname, '../../../.env'), // repo root .env
    path.resolve(__dirname, '../.env'), // scripts/../.env
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      dotenv.config({ path: p });
      console.log(`Loaded env from ${p}`);
      return;
    } catch {}
  }
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
  path.resolve(__dirname, '../uploads/Workplace_Software_and_Skills.pdf'),
);
const title = getFlag('title', 'OpenStax: Calculus Volume 1 (2e)');

const provider = getFlag('provider', 'openstax');
const folder = getFlag('folder', `oer/${provider}`);
const publicId = getFlag('public-id', slugify(title || 'oer-book')); // NO extension
const key = getFlag('key', `oer_pdf_${slugify(title || 'book')}_url`);
const license = getFlag('license', 'CC BY 4.0');
const licenseUrl = getFlag(
  'license-url',
  'https://creativecommons.org/licenses/by/4.0/',
);
const createTbl = hasFlag('create-table');
const skipDb = hasFlag('no-db');
const onlySettings = hasFlag('settings-only');

function slugify(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ─────────────────────────────────────────────────────────
 * DB helpers (lazy import)
 * ───────────────────────────────────────────────────────── */
let pool = null;
async function getPool() {
  if (skipDb) return null;
  try {
    const mod = await import('../config/db.js');
    return mod.default || mod;
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

async function upsertSetting(db, table, k, v) {
  const sql = `
    INSERT INTO ${table} (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await db.query(sql, [k, v]);
}

async function ensureOerBooksTable(db) {
  const q = await db.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema='public' AND table_name='oer_books'`,
  );
  if (q.rowCount) return true;
  if (!createTbl) return false;

  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS oer_books (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider     text NOT NULL,
      slug         text NOT NULL,
      title        text NOT NULL,
      pdf_url      text NOT NULL,
      license      text,
      license_url  text,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_oer_books_provider_lower_title
      ON oer_books(provider, lower(title));
  `);
  return true;
}

async function upsertOerBook(db, row) {
  const sql = `
    INSERT INTO oer_books (provider, slug, title, pdf_url, license, license_url)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (provider, lower(title))
    DO UPDATE SET
      slug        = EXCLUDED.slug,
      pdf_url     = EXCLUDED.pdf_url,
      license     = EXCLUDED.license,
      license_url = EXCLUDED.license_url,
      updated_at  = now()
    RETURNING id
  `;
  const { rows } = await db.query(sql, [
    row.provider,
    row.slug,
    row.title,
    row.pdf_url,
    row.license,
    row.license_url,
  ]);
  return rows[0]?.id || null;
}

/* ─────────────────────────────────────────────────────────
 * Cloudinary helpers (Option A)
 * ───────────────────────────────────────────────────────── */

async function verifyAndPublicizeUploadAsset(fullPublicId) {
  // Check the 'upload' type variant of the RAW asset
  const info = await cloudinary.api
    .resource(fullPublicId, {
      resource_type: 'raw',
      type: 'upload',
    })
    .catch((e) => {
      console.warn(
        'Admin API probe failed (upload type):',
        e?.http_code || e?.message,
      );
      return null;
    });

  if (!info) return;

  const needsPublic =
    info.access_mode !== 'public' ||
    (info.access_control && info.access_control.length > 0);

  if (needsPublic) {
    console.log('Adjusting access to public for upload asset…');
    await cloudinary.api
      .update(fullPublicId, {
        resource_type: 'raw',
        type: 'upload',
        access_mode: 'public',
        access_control: null,
      })
      .catch((e) => {
        console.warn('access_mode update failed:', e?.http_code || e?.message);
      });
  }

  // Log final state
  const after = await cloudinary.api
    .resource(fullPublicId, {
      resource_type: 'raw',
      type: 'upload',
    })
    .catch(() => null);

  if (after) {
    console.log('Upload asset (final):', {
      type: after.type,
      access_mode: after.access_mode,
      has_access_control: !!(
        after.access_control && after.access_control.length
      ),
      url_sample: after.secure_url?.slice(0, 120) + '…',
    });
  }
}

/* ─────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────── */
async function main() {
  if (!filePath) throw new Error('Missing --file path to PDF');
  if (!title) throw new Error('Missing --title (book title)');

  await fs.access(filePath).catch(() => {
    throw new Error(`PDF not found: ${filePath}`);
  });

  console.log(`Uploading PDF to Cloudinary as PUBLIC… (${filePath})`);

  // Important: public delivery (Option A)
  // - resource_type: 'raw'
  // - type: 'upload'        → public delivery type
  // - access_mode: 'public' → be explicit
  // - invalidate: true      → purge any previous caches
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        resource_type: 'raw',
        folder, // e.g. 'oer/openstax'
        public_id: publicId, // e.g. 'openstax-calculus-volume-1-2e' (no .pdf)
        type: 'upload',
        access_mode: 'public',
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
        format: 'pdf',
        chunk_size: 6_000_000, // ~6MB chunks
      },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
  });

  const pdfUrl = result.secure_url || result.url;
  if (!pdfUrl) {
    console.error('Cloudinary raw result:', result);
    throw new Error('Cloudinary returned no URL (secure_url/url missing).');
  }

  const fullPublicId = `${folder}/${publicId}`; // same structure used by folder+public_id
  console.log(`✅ Uploaded (public): ${pdfUrl}`);

  // Extra safety: ensure the 'upload' asset is public & not access-controlled
  await verifyAndPublicizeUploadAsset(fullPublicId);

  if (skipDb) {
    console.log('ℹ️ --no-db: skipping DB write.');
    console.log(
      `Use this PUBLIC URL in your app: ${pdfUrl} (append #page=NN if you like)`,
    );
    return;
  }

  const db = await getPool();

  // Prefer a proper table if available/created, otherwise fall back to settings.
  const hasBooksTable = await ensureOerBooksTable(db);

  if (hasBooksTable && !onlySettings) {
    const row = {
      provider,
      slug: slugify(title),
      title,
      pdf_url: pdfUrl, // <-- public, versioned, cacheable URL
      license,
      license_url: licenseUrl,
    };

    const id = await upsertOerBook(db, row);
    console.log(`✅ Saved in oer_books (id=${id})`);
    console.log('Embed with:', `${pdfUrl}#page=1`);
  } else {
    const table = await detectSettingsTable(db);
    if (!table) {
      console.warn(
        '⚠️ No settings table found (looked for app_settings/site_settings/settings).',
      );
      console.warn(
        '   Re-run with --create-table to use "oer_books" or export env:',
      );
      console.warn(`   OER_PDF_${slugify(title).toUpperCase()}_URL=${pdfUrl}`);
      return;
    }
    await upsertSetting(db, table, key, pdfUrl);
    console.log(`✅ Saved to ${table}.${key}`);
    console.log('Embed with:', `${pdfUrl}#page=1`);
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
