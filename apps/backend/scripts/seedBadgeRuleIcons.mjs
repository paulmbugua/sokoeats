// apps/backend/scripts/seedBadgeRuleIcons.mjs
import 'dotenv/config'; // ensure .env is loaded for this one-off script
import cloudinary from '../services/cloudinaryShim.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../config/db.js'; // your db (already logs connection)

const ICONS = [
  { code: 'COURSE_STARTED', file: 'course_started.svg' },
  { code: 'FIRST_WEEK_DONE', file: 'first_week_done.svg' },
  { code: 'HALFWAY_THERE', file: 'halfway_there.svg' },
  { code: 'COURSE_COMPLETED', file: 'course_completed.svg' },
];

// --- Cloudinary config (accept both common naming variants) ---
const CLOUDINARY_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET_KEY; // fallback if you used *_SECRET_KEY

function ensureEnv() {
  const missing = [];
  if (!CLOUDINARY_NAME)
    missing.push('CLOUDINARY_CLOUD_NAME (or CLOUDINARY_NAME)');
  if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}

ensureEnv();

cloudinary.config({
  cloud_name: CLOUDINARY_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

// --- DB upsert ---
async function upsertRuleIcon(code, iconUrl) {
  await pool.query(
    `INSERT INTO badge_rules (code, title, icon_url, active)
     VALUES ($1, INITCAP(REPLACE($1, '_',' ')), $2, TRUE)
     ON CONFLICT (code)
     DO UPDATE SET icon_url = EXCLUDED.icon_url, active = TRUE`,
    [code, iconUrl],
  );
}

// --- Main ---
async function main() {
  // resolve relative to repo root or script; tweak if needed
  const base = path.resolve('scripts/icons'); // e.g. apps/backend/scripts/icons/*.svg

  for (const it of ICONS) {
    const file = path.join(base, it.file);
    await fs.access(file); // throws if missing

    // Use either 'folder' + simple public_id OR embed folder in public_id (not both)
    const { secure_url } = await cloudinary.uploader.upload(file, {
      folder: 'achievements',
      public_id: it.code.toLowerCase(), // results in achievements/<code>
      overwrite: true,
      resource_type: 'image',
      use_filename: false,
      unique_filename: false,
      type: 'upload',
    });

    await upsertRuleIcon(it.code, secure_url);
    console.log(`Seeded ${it.code}: ${secure_url}`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
