import pool from '../config/db.js';
import slugify from 'slugify';
import * as cheerio from 'cheerio';

/* ------------------------------- constants -------------------------------- */
const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/* ------------------------- URL normalize + absolute ------------------------ */
function normalizeOpenStax(input) {
  try {
    const u = new URL(input);
    const m = u.pathname.match(/\/(?:(?:details\/)?books)\/([^/?#]+)/i);
    if (!m) return null;
    const slug = m[1];
    return {
      slug,
      detailsUrl: `https://openstax.org/details/books/${slug}`,
      bookRoot: `https://openstax.org/books/${slug}`,
    };
  } catch {
    return null;
  }
}
const abs = (href) => {
  if (!href) return '';
  try {
    return new URL(href, 'https://openstax.org').toString();
  } catch {
    return '';
  }
};

/* -------------------- cover <meta property="og:image"> --------------------- */
export async function discoverCoverFromOpenStax(webUrl) {
  const res = await fetch(webUrl, { headers: UA_HEADERS, redirect: 'follow' });
  const html = await res.text();
  const m = html.match(
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
  );
  return m ? m[1] : null;
}

/* ---------------- harvest links from anchors + embedded JSON --------------- */
function harvestLinksFromHtml(html, slug) {
  const $ = cheerio.load(html);
  const out = [];

  // 1) Anchors (if any)
  $(`a[href*="/books/${slug}/pages/"]`).each((_, a) => {
    const href = $(a).attr('href');
    const text = $(a).text().trim().replace(/\s+/g, ' ');
    if (href) out.push({ title: text || '', url: abs(href) });
  });

  // 2) Try to mine __NEXT_DATA__ JSON (full SPA nav lives here)
  const nextDataMatch = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const bag = [];
      const visit = (node) => {
        if (!node) return;
        if (typeof node === 'string') {
          if (node.includes(`/books/${slug}/pages/`)) bag.push(abs(node));
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (typeof node === 'object') {
          Object.values(node).forEach(visit);
        }
      };
      visit(data);
      for (const u of bag) out.push({ title: '', url: u });
    } catch {
      /* ignore */
    }
  }

  // 3) Regex all strings that look like page URLs (fallback)
  const patterns = [
    new RegExp(
      String.raw`https?:\/\/openstax\.org\/books\/${slug}\/pages\/[^"'\\\s<]+`,
      'ig',
    ),
    new RegExp(String.raw`\/books\/${slug}\/pages\/[^"'\\\s<]+`, 'ig'),
  ];
  for (const rx of patterns) {
    let m;
    while ((m = rx.exec(html))) out.push({ title: '', url: abs(m[0]) });
  }

  // de-dupe
  const seen = new Set();
  return out
    .filter((x) => x.url && (seen.has(x.url) ? false : (seen.add(x.url), true)))
    .sort((a, b) => a.url.localeCompare(b.url));
}

/* ------------------------------ find "Next" -------------------------------- */
function findNextInHtml(html, slug) {
  const $ = cheerio.load(html);
  const href =
    $('a[rel="next"]').attr('href') ||
    $('a[aria-label="Next"]').attr('href') ||
    $('a:contains("Next")').attr('href') ||
    $('a:contains("NEXT")').attr('href') ||
    '';

  if (href && href.includes(`/books/${slug}/pages/`)) return abs(href);

  // JSON hints
  const m = html.match(
    new RegExp(
      String.raw`"rel"\s*:\s*"next"[^}]*?"href"\s*:\s*"([^"]*?/books/${slug}/pages/[^"]+)`,
      'i',
    ),
  );
  if (m) return abs(m[1]);

  const m2 = html.match(
    new RegExp(
      String.raw`"next"\s*:\s*{[^}]*"href"\s*:\s*"([^"]*?/books/${slug}/pages/[^"]+)`,
      'i',
    ),
  );
  if (m2) return abs(m2[1]);

  return '';
}

/* -------------------------- sequential crawl ------------------------------- */
async function crawlSequential(startUrl, slug, maxHops = 1000) {
  const visited = new Set();
  const pages = [];

  let url = startUrl;
  for (let hops = 0; hops < maxHops && url && !visited.has(url); hops++) {
    visited.add(url);

    const res = await fetch(url, { redirect: 'follow', headers: UA_HEADERS });
    if (!res.ok) break;
    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $('main h1').first().text().trim() ||
      $('article h1').first().text().trim() ||
      $('title').text().trim() ||
      `Page ${pages.length + 1}`;

    pages.push({ title, url });

    let next = findNextInHtml(html, slug);
    if (!next) {
      const all = harvestLinksFromHtml(html, slug).map((x) => x.url);
      const curSeg = url.split('/pages/')[1] || '';
      const candidate = all.find(
        (u) =>
          u !== url &&
          u.includes(`/books/${slug}/pages/`) &&
          (u.split('/pages/')[1] || '') > curSeg,
      );
      if (candidate) next = candidate;
    }

    url = next && next.includes(`/books/${slug}/pages/`) ? next : '';
  }

  const seen = new Set();
  return pages.filter((p) =>
    seen.has(p.url) ? false : (seen.add(p.url), true),
  );
}

/* ===================== helpers for Next.js data ===================== */
function pickBuildIdFromHtml(html) {
  // Prefer parsing __NEXT_DATA__ JSON; fallback to "buildId":"..."
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      if (data && typeof data.buildId === 'string') return data.buildId;
    } catch {}
  }
  const m2 = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  return m2 ? m2[1] : '';
}

async function resolveOerTutorId(client) {
  // 1) env override
  const envId = Number(process.env.OER_TUTOR_ID);
  if (Number.isFinite(envId) && envId > 0) return envId;

  // 2) try tutors table
  try {
    const r = await client.query(
      `SELECT id FROM tutors ORDER BY created_at ASC LIMIT 1`,
    );
    if (r.rowCount) return r.rows[0].id;
  } catch {}

  // 3) try users table with admin/superadmin
  try {
    const r = await client.query(
      `SELECT id FROM users WHERE role IN ('admin','superadmin','tutor')
       ORDER BY created_at ASC LIMIT 1`,
    );
    if (r.rowCount) return r.rows[0].id;
  } catch {}

  // 4) give up → null (works only if column is nullable)
  return null;
}

async function fetchNextDataJson(base, buildId, path) {
  // path should start with '/'; Next data sits under /_next/data/<buildId>/<path>.json
  const safePath = path.replace(/^https?:\/\/[^/]+/, ''); // strip origin if present
  const url = new URL(
    `/_next/data/${buildId}${safePath}.json`,
    base,
  ).toString();
  const r = await fetch(url, { headers: UA_HEADERS, redirect: 'follow' });
  if (!r.ok) throw new Error(`next-data ${r.status} for ${url}`);
  return r.json();
}

function harvestLinksFromAnyJson(obj, slug) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (node.includes(`/books/${slug}/pages/`)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') {
      Object.values(node).forEach(visit);
    }
  };
  visit(obj);
  // uniq + normalize to absolute
  const seen = new Set();
  return out
    .map((u) => abs(u))
    .filter((u) => u && (seen.has(u) ? false : (seen.add(u), true)))
    .sort();
}

/* =========================== main scraper =========================== */
// accepts details/books url; optional seed first page
async function scrapeOpenStaxToc(bookUrl, startPageOverride) {
  const norm = normalizeOpenStax(bookUrl);
  if (!norm) throw new Error('Not an OpenStax book URL');

  // 0) Try details + bookRoot HTML, mine anchors + __NEXT_DATA__ + regex
  let detailsHtml = '',
    bookHtml = '';
  try {
    const [dRes, bRes] = await Promise.allSettled([
      fetch(norm.detailsUrl, { redirect: 'follow', headers: UA_HEADERS }),
      fetch(norm.bookRoot, { redirect: 'follow', headers: UA_HEADERS }),
    ]);
    if (dRes.status === 'fulfilled' && dRes.value.ok)
      detailsHtml = await dRes.value.text();
    if (bRes.status === 'fulfilled' && bRes.value.ok)
      bookHtml = await bRes.value.text();
  } catch {}

  let bag = [];
  if (detailsHtml)
    bag = bag.concat(harvestLinksFromHtml(detailsHtml, norm.slug));
  if (bookHtml) bag = bag.concat(harvestLinksFromHtml(bookHtml, norm.slug));

  // 0a) If we already have a decent set, return it
  if (bag.length >= 2) {
    const seen = new Set();
    return bag.filter((x) =>
      seen.has(x.url) ? false : (seen.add(x.url), true),
    );
  }

  // 1) Next.js data route fallback — use buildId from whichever html we got
  const htmlForBuild = bookHtml || detailsHtml;
  const buildId = htmlForBuild ? pickBuildIdFromHtml(htmlForBuild) : '';
  if (buildId) {
    try {
      // Try the JSON for the book root first
      const data = await fetchNextDataJson(
        'https://openstax.org',
        buildId,
        `/books/${norm.slug}`,
      );
      let urls = harvestLinksFromAnyJson(data, norm.slug);

      // If thin, also pull the details page JSON (sometimes contains catalog data with links)
      if (urls.length < 2) {
        const djson = await fetchNextDataJson(
          'https://openstax.org',
          buildId,
          `/details/books/${norm.slug}`,
        );
        urls = urls.concat(harvestLinksFromAnyJson(djson, norm.slug));
      }

      // If still thin and we have/guess a first page, chain via JSON pages
      if (urls.length < 2) {
        const seeds = [];
        if (startPageOverride) seeds.push(startPageOverride);
        seeds.push(
          `${norm.bookRoot}/pages/preface`,
          `${norm.bookRoot}/pages/introduction`,
          `${norm.bookRoot}/pages/1-introduction`,
          `${norm.bookRoot}/pages/1-1`,
        );

        const seen = new Set();
        const chain = [];
        for (const s of seeds) {
          try {
            const path = new URL(s).pathname;
            const j = await fetchNextDataJson(
              'https://openstax.org',
              buildId,
              path,
            );
            // harvest any page links from this JSON
            const found = harvestLinksFromAnyJson(j, norm.slug);
            for (const u of found)
              if (!seen.has(u)) {
                seen.add(u);
                chain.push(u);
              }
            if (chain.length >= 2) break;
          } catch {
            /* try next seed */
          }
        }
        urls = urls.concat(chain);
      }

      // Finalize if we have at least 2 (relax threshold; we can paginate later)
      if (urls.length >= 2) {
        const uniq = Array.from(new Set(urls))
          .map((u) => ({ title: '', url: u }))
          .sort((a, b) => a.url.localeCompare(b.url));
        return uniq;
      }
    } catch {
      /* fall through */
    }
  }

  // 2) Old-school crawl: try common first pages, then follow "Next" in HTML
  const firstCandidates = [];
  if (startPageOverride) firstCandidates.push(startPageOverride);
  firstCandidates.push(
    ...[
      'front-matter',
      'frontmatter',
      'preface',
      'introduction',
      'toc',
      'table-of-contents',
      'chapter-1',
      'chapter1',
      'ch-1',
      'c1',
      '1',
      '1-1',
      '1-introduction',
      '1-functions',
      '1-linear-equations',
    ].map((seg) => `${norm.bookRoot}/pages/${seg}`),
  );

  for (const u of firstCandidates) {
    try {
      const r = await fetch(u, { redirect: 'follow', headers: UA_HEADERS });
      if (!r.ok) continue;
      const html = await r.text();

      const sidebar = harvestLinksFromHtml(html, norm.slug);
      if (sidebar.length >= 2) return sidebar;

      const chain = await crawlSequential(u, norm.slug, 1000);
      if (chain.length >= 2) return chain;
    } catch {}
  }

  throw new Error('Could not locate TOC links on the OpenStax page.');
}

/* ----------------------------------------------------------------------------
 * POST /api/oer/ingest/openstax
 * body: {
 *   collection: { title, description?, subject?, thumbnail_url? },
 *   license?: { text?: string; url?: string }
 *   chapters?: [{ title, url, grade_level? }, ...]
 *   bookUrl?: string  // optional: we'll scrape ToC when chapters[] is empty
 * }
 * Returns: { ok: true, collectionId, items, courseId }
 * ---------------------------------------------------------------------------- */
export async function ingestOpenStax(req, res) {
  const client = await pool.connect();
  try {
    const { collection, license, bookUrl, startPageUrl } = req.body || {};
    let { chapters = [] } = req.body || {};

    // ✅ resolve an integer tutor id early
    const tutorId = await resolveOerTutorId(client);
    if (tutorId == null) {
      // If courses.tutor_id is NOT NULL, fail fast with a helpful error.
      throw new Error(
        'No tutorId available for OER course. Set OER_TUTOR_ID env or ensure a tutor/admin user exists.',
      );
    }

    // If no thumbnail was provided, try to discover from details page (og:image)
    let resolvedThumb = collection?.thumbnail_url || null;
    if (!resolvedThumb && bookUrl) {
      try {
        const norm = normalizeOpenStax(bookUrl);
        const details = norm ? norm.detailsUrl : bookUrl;
        resolvedThumb = await discoverCoverFromOpenStax(details);
      } catch {}
    }

    // Build chapters from HTML pages (no PDFs) if admin only provided bookUrl
    if ((!Array.isArray(chapters) || chapters.length === 0) && bookUrl) {
      chapters = await scrapeOpenStaxToc(bookUrl, startPageUrl);
    }

    if (!collection?.title || !Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({
        error: 'collection.title and chapters[] (or bookUrl) required',
      });
    }

    await client.query('BEGIN');

    /* 1) Upsert catalog_collection by title (case-insensitive) */
    const existingColl = await client.query(
      `SELECT id FROM catalog_collection WHERE LOWER(title)=LOWER($1) LIMIT 1`,
      [collection.title],
    );

    let collectionId;
    if (existingColl.rowCount) {
      collectionId = existingColl.rows[0].id;
      await client.query(
        `UPDATE catalog_collection
            SET description   = COALESCE($2, description),
                subject       = COALESCE($3, subject),
                thumbnail_url = COALESCE($4, thumbnail_url),
                updated_at    = now()
          WHERE id = $1`,
        [
          collectionId,
          collection.description || null,
          collection.subject || null,
          resolvedThumb || null,
        ],
      );
    } else {
      const cRow = await client.query(
        `INSERT INTO catalog_collection (id, title, description, subject, thumbnail_url, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
         RETURNING id`,
        [
          collection.title,
          collection.description || null,
          collection.subject || null,
          resolvedThumb || null,
        ],
      );
      collectionId = cRow.rows[0].id;
    }

    /* 2) Insert each chapter into third_party_catalog and link to collection */
    for (const ch of chapters) {
      const slug = `openstax-${slugify(ch.title, { lower: true, strict: true }).slice(0, 80)}`;

      await client.query(
        `INSERT INTO third_party_catalog
           (provider, slug, title, type, subject, grade_level, thumbnail_url, source_url,
            commercial_allowed, license, license_url, attribution_html, created_at)
         VALUES ('openstax',$1,$2,'text',$3,$4,$5,$6,true,$7,$8,$9,now())
         ON CONFLICT (provider, slug) DO NOTHING`,
        [
          slug, // $1
          ch.title, // $2
          collection.subject || null, // $3
          ch.grade_level || null, // $4
          resolvedThumb || null, // $5
          ch.url, // $6
          license?.text || 'CC BY 4.0', // $7
          license?.url || 'https://creativecommons.org/licenses/by/4.0/', // $8
          `<p>OpenStax content used under Creative Commons. See source page for details.</p>`, // $9
        ],
      );

      await client.query(
        `INSERT INTO catalog_collection_items (collection_id, catalog_slug)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [collectionId, slug],
      );
    }

    /* 2b) OPTIONAL: reflect the book in oer_books (HTML-only) */
    if (bookUrl) {
      const norm = normalizeOpenStax(bookUrl);
      const bookSlug =
        norm?.slug || slugify(collection.title, { lower: true, strict: true }).slice(0, 80);

      await client.query(
        `INSERT INTO oer_books (id, slug, title, provider, web_url, cover_url, license, license_url, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'OpenStax', $3, $4, $5, $6, now(), now())
         ON CONFLICT (slug) DO UPDATE SET
           web_url     = EXCLUDED.web_url,
           cover_url   = COALESCE(EXCLUDED.cover_url, oer_books.cover_url),
           license     = EXCLUDED.license,
           license_url = EXCLUDED.license_url,
           updated_at  = now()`,
        [
          bookSlug,
          collection.title,
          norm ? norm.detailsUrl : bookUrl,
          resolvedThumb || null,
          license?.text || 'CC BY 4.0',
          license?.url || 'https://creativecommons.org/licenses/by/4.0/',
        ],
      );
    }

    /* 3) Build syllabus directly from (ordered) chapters array */
    const syllabus = chapters.map((row, i) => ({
      week: i + 1,
      topic: row.title || `Chapter ${i + 1}`,
      notesUrl: row.url,
      notesUrls: [row.url],
    }));

    /* 4) Upsert a FREE OER course for this collection (provider='openstax') */
    const existingCourse = await client.query(
      `SELECT id FROM courses WHERE provider='openstax' AND LOWER(title)=LOWER($1) LIMIT 1`,
      [collection.title],
    );

    let courseId;
    if (existingCourse.rowCount) {
      courseId = existingCourse.rows[0].id;

      // ✅ UPDATED: stamp OER flags so it never mixes with tutor-created courses
      await client.query(
        `UPDATE courses
            SET description   = COALESCE($2, description),
                subject       = COALESCE($3, subject),
                thumbnail_url = COALESCE($4, thumbnail_url),
                level         = COALESCE(level, 'All Levels'),
                price         = 0,
                price_label   = 'Free',
                syllabus      = $5,
                source_kind   = 'oer',
                content_kind  = 'doc',
                is_oer        = TRUE,
                updated_at    = now()
          WHERE id = $1`,
        [
          courseId,
          collection.description || '',
          collection.subject || null,
          resolvedThumb || null,
          JSON.stringify(syllabus),
        ],
      );
    } else {
      // ✅ UPDATED: include source_kind/content_kind/is_oer on insert
      const cr = await client.query(
        `INSERT INTO courses
          (id, title, description, subject, thumbnail_url,
           level, price, price_label, provider,
           tutor_id, created_at, syllabus,
           source_kind, content_kind, is_oer)
         VALUES (gen_random_uuid(), $1, $2, $3, $4,
                 'All Levels', 0, 'Free', 'openstax',
                 $5, now(), $6,
                 'oer', 'doc', TRUE)
         RETURNING id`,
        [
          collection.title,
          collection.description || '',
          collection.subject || null,
          resolvedThumb || null,
          tutorId, // $5
          JSON.stringify(syllabus), // $6
        ],
      );
      courseId = cr.rows[0].id;
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      collectionId,
      items: chapters.length,
      courseId,
    });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[oer][ingest] openstax', e);
    return res.status(500).json({ error: 'failed to ingest openstax book' });
  } finally {
    client.release();
  }
}


// At top of the file you already have:
// import pool from '../config/db.js';
// (keep that)

export async function listOpenStax(req, res) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `
      SELECT
        c.id                                AS "courseId",
        c.title                             AS "title",
        c.subject                           AS "subject",
        c.description                       AS "description",
        c.thumbnail_url                     AS "thumbnailUrl",
        c.created_at                        AS "createdAt",
        cc.id                               AS "collectionId",
        -- count items in this collection that belong to OpenStax
        (
          SELECT COUNT(*)
          FROM catalog_collection_items ci
          JOIN third_party_catalog t
            ON t.slug = ci.catalog_slug
          WHERE ci.collection_id = cc.id
            AND t.provider = 'openstax'
        )                                   AS "items",
        b.web_url                           AS "bookUrl",
        b.license                           AS "licenseText",
        b.license_url                       AS "licenseUrl"
      FROM courses c
      LEFT JOIN catalog_collection cc
        ON LOWER(cc.title) = LOWER(c.title)
      LEFT JOIN oer_books b
        ON LOWER(b.title) = LOWER(c.title)
      WHERE c.provider = 'openstax'
      ORDER BY c.created_at DESC
      LIMIT 100
      `,
    );

    return res.json({ ok: true, items: r.rows });
  } catch (e) {
    console.error('[oer][list] openstax', e);
    return res.status(500).json({ error: 'failed to list openstax uploads' });
  } finally {
    client.release();
  }
}

export async function deleteOpenStax(req, res) {
  const client = await pool.connect();
  const { courseId } = req.params || {};

  if (!courseId) {
    return res.status(400).json({ error: 'courseId is required' });
  }

  try {
    await client.query('BEGIN');

    const courseRes = await client.query(
      `SELECT id, title FROM courses WHERE id = $1 AND provider = 'openstax' LIMIT 1`,
      [courseId],
    );
    if (!courseRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'OpenStax course not found' });
    }
    const { title } = courseRes.rows[0];

    // Best-effort: remove the collection and its item links
    const collRes = await client.query(
      `SELECT id FROM catalog_collection WHERE LOWER(title) = LOWER($1) LIMIT 1`,
      [title],
    );

    if (collRes.rowCount) {
      const collId = collRes.rows[0].id;

      await client.query(
        `DELETE FROM catalog_collection_items WHERE collection_id = $1`,
        [collId],
      );

      await client.query(`DELETE FROM catalog_collection WHERE id = $1`, [
        collId,
      ]);
    }

    // Keep third_party_catalog pages and oer_books row, but "tag" the book as deleted by
    // mutating the slug to avoid future conflicts (best-effort, ignore errors)
    try {
      await client.query(
        `
        UPDATE oer_books
           SET updated_at = now(),
               slug = slug || '-deleted-' || to_char(now(), 'YYYYMMDDHH24MISS')
         WHERE LOWER(title) = LOWER($1)
        `,
        [title],
      );
    } catch (e) {
      console.warn(
        '[oer][delete] openstax: could not mark oer_books deleted',
        e.message,
      );
    }

    // Finally remove the course itself
    await client.query(
      `DELETE FROM courses WHERE id = $1 AND provider = 'openstax'`,
      [courseId],
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[oer][delete] openstax', e);
    return res.status(500).json({ error: 'failed to delete openstax course' });
  } finally {
    client.release();
  }
}
