// apps/backend/controllers/youtubeIngestController.js
import pool from '../config/db.js';
import slugify from 'slugify';

/* ----------------------- helpers: safe parsing ----------------------- */
function toStringSafe(v) {
  return v == null ? '' : String(v);
}

/** Accepts array or string of URLs.
 *  If string, split by commas/newlines/spaces. Returns a clean array. */
function normalizeUrlList(input) {
  if (Array.isArray(input)) {
    return input
      .map(toStringSafe)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const asText = toStringSafe(input);
  return asText
    .split(/[,\n\r\t ]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract a YouTube video id from many formats (watch, youtu.be, embed, shorts). */
function extractYouTubeId(input) {
  const s = toStringSafe(input).trim();
  if (!s) return null;

  // https://youtu.be/<id>
  let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  // watch?v=<id>  (&list=... etc)
  m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  // /embed/<id>
  m = s.match(/\/embed\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  // /shorts/<id>
  m = s.match(/\/shorts\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];

  // If a raw ID was pasted
  if (/^[A-Za-z0-9_-]{6,}$/.test(s)) return s;

  return null;
}

/** Build catalog rows from URLs; skip anything that doesn't yield an id */
function buildYouTubeItems(urls, collSlug, subject = null) {
  let idx = 1;
  const out = [];
  const seen = new Set();

  for (const raw of urls) {
    const id = extractYouTubeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const slug = `yt-${collSlug}-${id}`.slice(0, 96); // safe length for uniqueness
    out.push({
      slug,
      title: `Video #${String(idx).padStart(2, '0')}`,
      subject: subject || null,
      thumbnail_url: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      source_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube.com/embed/${id}`,
      idx: idx++,
    });
  }
  return out;
}

/* ============================== MAIN ============================== */
/**
 * POST /api/oer/ingest/youtube
 * body: {
 *   collection: { title: string, description?: string, subject?: string, thumbnail_url?: string },
 *   urls?: string | string[]     // comma/newline/space separated, or array of urls/ids
 * }
 * Returns: { ok: true, collectionId, items }
 */
export async function ingestYouTube(req, res) {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const collection = body.collection || {};

    // Defensive string coercions (prevents .replace on undefined)
    const title = toStringSafe(collection.title).trim();
    const description = toStringSafe(collection.description).trim() || null;
    const subject = toStringSafe(collection.subject).trim() || null;
    const cover = toStringSafe(collection.thumbnail_url).trim() || null;

    // Hard requirements
    if (!title) {
      return res.status(400).json({ error: 'collection.title is required' });
    }

    // Normalize incoming URLs list; supports urls / urlsText / url
    const urls = normalizeUrlList(body.urls ?? body.urlsText ?? body.url ?? '');
    if (!urls.length) {
      return res
        .status(400)
        .json({ error: 'Provide at least one YouTube URL or ID in urls' });
    }

    // Collection slug seed
    const collSlug = slugify(title || 'youtube-collection', {
      lower: true,
      strict: true,
    }).slice(0, 60);

    // Build item rows
    const items = buildYouTubeItems(urls, collSlug, subject);
    if (!items.length) {
      return res
        .status(400)
        .json({ error: 'No valid YouTube video IDs found.' });
    }

    await client.query('BEGIN');

    // Ensure unique indexes for idempotent upserts/links
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_tpc_provider_slug ON third_party_catalog(provider, slug)`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_cci_collection_slug ON catalog_collection_items(collection_id, catalog_slug)`,
    );

    // 1) Upsert collection by case-insensitive title
    const existing = await client.query(
      `SELECT id FROM catalog_collection WHERE LOWER(title)=LOWER($1) LIMIT 1`,
      [title],
    );
    let collectionId;
    if (existing.rowCount) {
      collectionId = existing.rows[0].id;
      await client.query(
        `UPDATE catalog_collection
           SET description   = COALESCE($2, description),
               subject       = COALESCE($3, subject),
               thumbnail_url = COALESCE($4, thumbnail_url),
               updated_at    = NOW()
         WHERE id = $1`,
        [collectionId, description, subject, cover],
      );
    } else {
      const ins = await client.query(
        `INSERT INTO catalog_collection (id, title, description, subject, thumbnail_url, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         RETURNING id`,
        [title, description, subject, cover],
      );
      collectionId = ins.rows[0].id;
    }

    // 2) Upsert each video into third_party_catalog + link to collection
    for (const v of items) {
      await client.query(
        `INSERT INTO third_party_catalog
           (provider, slug, title, type, subject, grade_level,
            thumbnail_url, source_url, embed_url,
            commercial_allowed, license, license_url, attribution_html, created_at)
         VALUES
           ('youtube', $1, $2, 'video', $3, NULL,
            $4, $5, $6,
            FALSE, NULL, NULL, '<p>© Content on YouTube — see video page for license/terms.</p>', NOW())
         ON CONFLICT (provider, slug) DO UPDATE SET
           title         = EXCLUDED.title,
           thumbnail_url = EXCLUDED.thumbnail_url,
           source_url    = EXCLUDED.source_url,
           embed_url     = EXCLUDED.embed_url`,
        [
          v.slug,
          v.title,
          v.subject,
          v.thumbnail_url,
          v.source_url,
          v.embed_url,
        ],
      );

      await client.query(
        `INSERT INTO catalog_collection_items (collection_id, catalog_slug)
         VALUES ($1, $2)
         ON CONFLICT (collection_id, catalog_slug) DO NOTHING`,
        [collectionId, v.slug],
      );
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      collectionId,
      items: items.length,
    });
  } catch (e) {
    try {
      await pool.query('ROLLBACK');
    } catch {}
    console.error('[oer][ingest] youtube', e);
    return res.status(500).json({ error: 'failed to ingest youtube videos' });
  } finally {
    client.release();
  }
}

/* ======================= NEW: list + delete ======================= */

/**
 * GET /api/oer/youtube
 * Lists YouTube-backed catalog collections for the admin UI.
 */
export async function listYouTube(req, res) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `
      SELECT
        cc.id AS "collectionId",
        cc.title AS "title",
        cc.subject AS "subject",
        cc.description AS "description",
        cc.thumbnail_url AS "thumbnailUrl",
        cc.created_at AS "createdAt",
        (
          SELECT COUNT(*)
          FROM catalog_collection_items ci
          JOIN third_party_catalog t
            ON t.slug = ci.catalog_slug
          WHERE ci.collection_id = cc.id
            AND t.provider = 'youtube'
        ) AS "items"
      FROM catalog_collection cc
      WHERE EXISTS (
        SELECT 1
        FROM catalog_collection_items ci
        JOIN third_party_catalog t
          ON t.slug = ci.catalog_slug
        WHERE ci.collection_id = cc.id
          AND t.provider = 'youtube'
      )
      ORDER BY cc.created_at DESC
      LIMIT 100
      `,
    );

    return res.json({ ok: true, items: r.rows });
  } catch (e) {
    console.error('[oer][list] youtube', e);
    return res
      .status(500)
      .json({ error: 'failed to list youtube collections' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/oer/youtube/:collectionId
 * Removes the DayBreak-side collection + links.
 * It **does not** touch YouTube or the base third_party_catalog entries.
 */
export async function deleteYouTube(req, res) {
  const client = await pool.connect();
  const { collectionId } = req.params || {};

  if (!collectionId) {
    return res.status(400).json({ error: 'collectionId is required' });
  }

  try {
    await client.query('BEGIN');

    // Make sure this collection is actually a YouTube-backed one
    const exists = await client.query(
      `
      SELECT cc.id, cc.title
      FROM catalog_collection cc
      WHERE cc.id = $1
        AND EXISTS (
          SELECT 1
          FROM catalog_collection_items ci
          JOIN third_party_catalog t
            ON t.slug = ci.catalog_slug
          WHERE ci.collection_id = cc.id
            AND t.provider = 'youtube'
        )
      LIMIT 1
      `,
      [collectionId],
    );

    if (!exists.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'YouTube collection not found' });
    }

    // Drop item links for this collection
    await client.query(
      `DELETE FROM catalog_collection_items WHERE collection_id = $1`,
      [collectionId],
    );

    // Delete the catalog_collection row itself
    await client.query(`DELETE FROM catalog_collection WHERE id = $1`, [
      collectionId,
    ]);

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[oer][delete] youtube', e);
    return res
      .status(500)
      .json({ error: 'failed to delete youtube collection' });
  } finally {
    client.release();
  }
}
